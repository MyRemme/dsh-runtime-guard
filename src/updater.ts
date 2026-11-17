import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import type { HostContext } from './types.js';
import { PROFILE_DIR, SerializedQueue, writeProfileFile } from './profile-file.js';
import { gtVersion, satisfiesRange, validVersion } from './semver.js';
import { parseTar } from './tar.js';
import { prepareUpgradeEnvironment, UpgradeEnvironmentError } from './upgrade-environment.js';

export const REPOSITORY = 'https://github.com/MyRemme/dsh-runtime-guard';
const API = 'https://api.github.com/repos/MyRemme/dsh-runtime-guard';
declare const UPGRADE_MANIFEST: { name: string; version: string } | undefined;
const manifest = typeof UPGRADE_MANIFEST === 'undefined'
  ? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { name: string; version: string }
  : UPGRADE_MANIFEST;
const MAX_ARCHIVE = 32 * 1024 * 1024;
const INTERVAL = 6 * 60 * 60 * 1000;
const CHECK_CACHE = 60 * 1000;
const PUBLIC_MANIFEST = 'https://raw.githubusercontent.com/MyRemme/dsh-runtime-guard/main/updates/stable.json';
const RETRYABLE_NETWORK_ERRORS = new Set(['github-auth-or-release', 'github-denied', 'github-network']);

export interface UpdateStatus {
  repository: string; currentVersion: string; available: boolean; automatic: boolean;
  phase: 'unavailable' | 'idle' | 'checking' | 'current' | 'available' | 'waiting-idle' | 'downloading' | 'installing' | 'restart-required' | 'error';
  latestVersion: string | null; checkedAt: string | null; updatedAt: string | null;
  error: string | null;
}
export interface UpdateAPI {
  status(): UpdateStatus;
  check(): Promise<UpdateStatus>;
  setAutomatic(enabled: boolean): Promise<UpdateStatus>;
  install(): UpdateStatus;
}
export interface Manager {
  installBundle(spec: string, options?: { enabled?: boolean; requestId?: string }): Promise<{
    application: string; version?: string; stage?: string;
    error?: { code: string };
    packageResult?: { output: string; kind?: string };
  }>;
}
interface Asset { id?: number; name: string; size: number; digest?: string }
interface Candidate { version: string; asset: Asset; checksum: Asset | undefined; source: 'api' | 'public' }
type InstallSource = 'manual' | 'automatic';
interface InstallTask { source: InstallSource; abort: AbortController; submitted: boolean }
class UpdateFailure extends Error {}
const failure = (code: string): never => { throw new UpdateFailure(code); };

function hostInstallFailure(result: Awaited<ReturnType<Manager['installBundle']>>): string {
  const output = result.packageResult?.output ?? '';
  if (/\bERR_PNPM_UNEXPECTED_STORE\b/.test(output)) return 'host-store-mismatch';
  if (/\bERR_PNPM_GIT_FETCH_FAILED\b/.test(output)) return 'host-dependency-network';
  const kind = result.packageResult?.kind;
  if (kind && ['network', 'timeout', 'permission', 'disk-full', 'pnpm-missing', 'build-blocked', 'integrity'].includes(kind)) return `host-${kind}`;
  if (result.error?.code === 'already-installed') return 'host-already-installed';
  return 'host-install-failed';
}

export function releaseCandidate(value: unknown, current: string): Candidate | null {
  const release = value as { draft?: boolean; prerelease?: boolean; tag_name?: string; assets?: Asset[] };
  if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return failure('invalid-release');
  const version = release.tag_name.replace(/^v/, '');
  if (!validVersion(version) || version.includes('-')) return failure('invalid-release');
  if (!gtVersion(version, current)) return null;
  const asset = release.assets.find(asset => asset.name === `${manifest.name}-${version}.tgz`);
  const checksum = release.assets.find(asset => asset.name === 'checksums.sha256');
  for (const item of [asset, checksum].filter(Boolean) as Asset[]) {
    if (!Number.isSafeInteger(item.id) || !item.id || item.id <= 0 || !Number.isSafeInteger(item.size) || item.size <= 0 || item.size > MAX_ARCHIVE) return failure('invalid-release');
  }
  if (!asset || (!/^sha256:[a-f\d]{64}$/i.test(asset.digest ?? '') && !checksum)) return failure('missing-artifact');
  return { version, asset, checksum, source: 'api' };
}

/** Public Release metadata uses fixed repository URLs, never supplied download URLs. */
export function manifestCandidate(value: unknown, current: string): Candidate | null {
  const data = value as { schemaVersion?: unknown; version?: unknown; name?: unknown; size?: unknown; sha256?: unknown; assetId?: unknown } | null;
  if (!data || data.schemaVersion !== 1 || typeof data.version !== 'string' || !validVersion(data.version) || data.version.includes('-')
    || data.name !== `${manifest.name}-${data.version}.tgz` || !Number.isSafeInteger(data.size) || (data.size as number) <= 0
    || (data.size as number) > MAX_ARCHIVE || typeof data.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(data.sha256)
    || (data.assetId !== undefined && (!Number.isSafeInteger(data.assetId) || (data.assetId as number) <= 0))) return failure('invalid-release');
  if (!gtVersion(data.version, current)) return null;
  return { version: data.version, source: 'public', checksum: undefined,
    asset: { name: data.name, size: data.size as number, digest: `sha256:${data.sha256}`,
      ...(data.assetId === undefined ? {} : { id: data.assetId as number }) } };
}

/** Inspect every entry before pnpm sees it; no links, traversal or install scripts. */
export async function validateArchive(file: string, version: string, hostVersion: string, requireUnified = false): Promise<void> {
  const uncompressed = gunzipSync(await readFile(file), { maxOutputLength: 64 * 1024 * 1024 });
  let entries;
  try { entries = parseTar(uncompressed); } catch { return failure('invalid-archive'); }
  if (entries.length > 3000) return failure('invalid-archive');

  const names = new Set<string>();
  let bytes = 0, manifestBytes = 0;
  let rootManifest: Buffer | undefined;
  const bundledManifests: Buffer[] = [];
  for (const entry of entries) {
    bytes += entry.size;
    if (bytes > 64 * 1024 * 1024 || entry.size > 4 * 1024 * 1024 || entry.type === 'Other'
      || !entry.path.startsWith('package/') || entry.path.includes('\\')
      || entry.path.split('/').some(part => part === '..' || part === '.') || names.has(entry.path)) {
      return failure('invalid-archive');
    }
    names.add(entry.path);
    if (entry.type === 'File' && entry.path === 'package/package.json' && entry.size <= 256 * 1024) {
      rootManifest = entry.content;
    } else if (entry.type === 'File' && /^package\/(?:.+\/)?node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(entry.path) && entry.size <= 256 * 1024) {
      manifestBytes += entry.size;
      if (manifestBytes > 4 * 1024 * 1024) return failure('invalid-archive');
      bundledManifests.push(entry.content);
    }
  }
  if (!names.has('package/dist/index.js') || !names.has('package/client/client.js') || !names.has('package/cordis.patch.yml') || !rootManifest?.length) {
    return failure('invalid-archive');
  }

  let pkg: { name: string; version: string; runtimeGuardUpdater?: number; scripts?: Record<string, unknown>; engines?: { node?: string; dsh?: string }; dependencies?: Record<string, string> };
  try { pkg = JSON.parse(rootManifest.toString()); } catch { return failure('invalid-archive'); }
  if (!pkg || pkg.name !== manifest.name || pkg.version !== version) return failure('invalid-archive');
  if (requireUnified && pkg.runtimeGuardUpdater !== 1) return failure('legacy-update-package');

  const installKeys = ['preinstall', 'install', 'postinstall', 'prepare'] as const;
  if (installKeys.some(key => pkg.scripts?.[key])) return failure('install-scripts');
  for (const buf of bundledManifests) {
    let depPkg: { scripts?: Record<string, unknown> };
    try { depPkg = JSON.parse(buf.toString()); } catch { return failure('invalid-archive'); }
    if (depPkg?.scripts && installKeys.some(key => depPkg.scripts?.[key])) return failure('install-scripts');
  }
  if (Object.values(pkg.dependencies ?? {}).some(value => !validVersion(value))) return failure('invalid-dependencies');
  if (!validVersion(hostVersion) || !pkg.engines?.dsh || !satisfiesRange(hostVersion, pkg.engines.dsh)
    || !pkg.engines.node || !satisfiesRange(process.versions.node, pkg.engines.node)) return failure('incompatible-host');
}

export class Updater implements UpdateAPI {
  private state: UpdateStatus;
  private candidate: Candidate | null = null;
  private prepared: { candidate: Candidate; file: string; hash: string } | null = null;
  private pending: InstallSource | null = null;
  private work: Promise<UpdateStatus> | null = null;
  private installing: InstallTask | null = null;
  private disposed = false;
  private abort = new AbortController();
  private timer: ReturnType<typeof setInterval> | undefined;
  private directory: string;
  private saveQueue = new SerializedQueue();
  private nextCheck = Date.now();
  private apiRetryAt = 0;
  constructor(private readonly options: {
    directory: string; hostVersion: string; manager: Manager; idle: () => boolean;
    fetch?: typeof fetch;
    currentVersion?: string; schedule?: boolean;
    repairCurrent?: boolean;
    requireUnified?: boolean;
  }) {
    this.directory = join(options.directory, PROFILE_DIR, 'updates');
    this.state = { repository: REPOSITORY, currentVersion: options.currentVersion ?? manifest.version, available: true, automatic: false,
      phase: 'idle', latestVersion: null, checkedAt: null, updatedAt: null, error: null };
  }
  async start(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8')) as Partial<UpdateStatus>;
      this.state.automatic = saved.automatic === true;
      this.state.updatedAt = typeof saved.updatedAt === 'string' ? saved.updatedAt : null;
      if (saved.phase === 'restart-required' && saved.latestVersion && validVersion(saved.latestVersion) && gtVersion(saved.latestVersion, this.state.currentVersion)) {
        this.state.phase = 'restart-required'; this.state.latestVersion = saved.latestVersion;
      } else if (['installing', 'restart-required'].includes(saved.phase ?? '') && saved.latestVersion === this.state.currentVersion) {
        // A self-update can dispose the old updater before its install promise resolves.
        // The new process confirms activation from its own package version, not the old promise.
        this.state.phase = 'current'; this.state.latestVersion = saved.latestVersion;
        this.state.checkedAt = typeof saved.checkedAt === 'string' ? saved.checkedAt : null;
        this.state.updatedAt = new Date().toISOString();
        await this.save();
      }
    } catch { /* First installation or invalid state starts with automatic updates off. */ }
    if (this.disposed || this.options.schedule === false) return;
    this.timer = setInterval(() => {
      if (this.pending && this.options.idle()) this.startInstall(this.pending);
      else if (this.state.automatic && this.state.phase !== 'restart-required' && Date.now() >= this.nextCheck && !this.work && !this.installing) {
        void this.check();
      }
    }, 15000);
    this.timer.unref();
  }
  status(): UpdateStatus { return { ...this.state }; }
  private save(next: UpdateStatus = this.state): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const snapshot = JSON.stringify(next, null, 2) + '\n';
    return this.saveQueue.run(async () => {
      if (this.disposed) return;
      await writeProfileFile(join(this.directory, 'state.json'), snapshot);
    });
  }
  async setAutomatic(enabled: boolean): Promise<UpdateStatus> {
    this.state.automatic = enabled;
    if (!enabled) this.revokeAutomatic();
    // If a cancelled task is still unwinding, enabling again schedules a fresh
    // check on the next tick rather than reviving the cancelled task.
    if (enabled) this.nextCheck = Date.now();
    try { await this.save(); } catch { this.state.automatic = false; this.revokeAutomatic(); this.state.phase = 'error'; this.state.error = 'storage-failed'; }
    if (enabled && this.state.automatic) void this.check();
    return this.status();
  }
  private revokeAutomatic(): void {
    if (this.pending === 'automatic') {
      this.pending = null;
      if (this.state.phase === 'waiting-idle') this.state.phase = 'available';
    }
    if (this.installing?.source === 'automatic' && !this.installing.submitted) this.installing.abort.abort();
  }
  private async request(url: string, limit: number, binary = false, cancellation?: AbortSignal): Promise<Buffer> {
    const transport = this.options.fetch ?? fetch;
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(30000), ...(cancellation ? [cancellation] : [])]);
    signal.throwIfAborted();
    const api = url.startsWith(API + '/');
    let result = await transport(url, { redirect: 'manual', signal, headers: {
      Accept: binary ? 'application/octet-stream' : api ? 'application/vnd.github+json' : 'application/json', 'User-Agent': manifest.name,
      ...(api ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
    } });
    for (let redirects = 0; [301, 302, 303, 307, 308].includes(result.status); redirects++) {
      const location = result.headers.get('location');
      await result.body?.cancel();
      if (!location || redirects >= 3 || (api && !binary)) return failure('invalid-redirect');
      let target: URL;
      try { target = new URL(location, url); } catch { return failure('invalid-redirect'); }
      const repositoryAsset = !api && target.origin === 'https://github.com'
        && target.pathname.startsWith('/MyRemme/dsh-runtime-guard/releases/download/');
      const signedAsset = ['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'].includes(target.hostname);
      if (target.protocol !== 'https:' || target.port || target.username || target.password || (!repositoryAsset && !signedAsset)) return failure('invalid-redirect');
      // Redirects never forward request headers or credentials.
      result = await transport(target, { redirect: 'manual', signal });
      url = target.href;
    }
    if (api && [403, 429].includes(result.status)) {
      const reset = Number(result.headers.get('x-ratelimit-reset')) * 1000;
      const retry = Number(result.headers.get('retry-after')) * 1000;
      this.apiRetryAt = Math.max(Date.now() + CHECK_CACHE, Number.isFinite(reset) ? reset : 0, Number.isFinite(retry) ? Date.now() + retry : 0);
    }
    if ([401, 403, 404, 429].includes(result.status)) { await result.body?.cancel(); return failure([403, 429].includes(result.status) ? 'github-denied' : 'github-auth-or-release'); }
    if (!result.ok || !result.body) { await result.body?.cancel(); return failure('github-network'); }
    const parts: Buffer[] = []; let size = 0;
    const reader = result.body.getReader();
    try {
      for (;;) {
        signal.throwIfAborted();
        const chunk = await reader.read(); signal.throwIfAborted(); if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit) return failure('download-too-large');
        parts.push(Buffer.from(chunk.value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(parts);
  }
  private async latest(): Promise<{ candidate: Candidate | null; version: string }> {
    const current = (version: string) => this.options.repairCurrent && validVersion(version) === validVersion(this.state.currentVersion)
      ? '0.0.0' : this.state.currentVersion;
    // The published stable feed is independent of the REST API's shared IP quota.
    // Keep the API for old releases and networks that cannot reach github.com.
    try {
      const body = await this.request(PUBLIC_MANIFEST, 16 * 1024);
      const data = JSON.parse(body.toString());
      return { candidate: manifestCandidate(data, current(data.version)), version: data.version };
    } catch (error) {
      if (this.abort.signal.aborted) throw error;
      if (error instanceof UpdateFailure && !RETRYABLE_NETWORK_ERRORS.has(error.message)) throw error;
      if (error instanceof SyntaxError) return failure('invalid-release');
    }
    if (Date.now() < this.apiRetryAt) return failure('github-denied');
    const body = await this.request(`${API}/releases/latest`, 1024 * 1024);
    let data: { tag_name?: string };
    try { data = JSON.parse(body.toString()); } catch { return failure('invalid-release'); }
    const candidate = releaseCandidate(data, current(data.tag_name?.replace(/^v/, '') ?? ''));
    return { candidate, version: data.tag_name!.replace(/^v/, '') };
  }
  check(): Promise<UpdateStatus> {
    if (this.work) return this.work;
    if (this.disposed || this.installing || this.state.phase === 'restart-required') return Promise.resolve(this.status());
    // A manual request pins the release the user chose. Neither a background
    // check nor the automatic preference may replace or discard that job.
    if (this.pending === 'manual') return Promise.resolve(this.status());
    if (['current', 'available'].includes(this.state.phase) && this.state.checkedAt
      && Date.now() - Date.parse(this.state.checkedAt) < CHECK_CACHE) {
      if (this.state.automatic && this.candidate) this.startInstall('automatic');
      return Promise.resolve(this.status());
    }
    this.work = (async () => {
      this.nextCheck = Date.now() + INTERVAL;
      this.pending = null; this.candidate = null; this.prepared = null;
      this.state.phase = 'checking'; this.state.error = null;
      try {
        const latest = await this.latest();
        this.candidate = latest.candidate;
        this.state.checkedAt = new Date().toISOString();
        this.state.latestVersion = latest.version;
        this.state.phase = this.candidate ? 'available' : 'current';
        if (this.state.automatic && this.candidate) this.pending = 'automatic';
        await this.save();
      } catch (error) { if (!this.disposed) { this.state.phase = 'error'; this.state.error = error instanceof UpdateFailure ? error.message : 'update-check-failed'; } }
      return this.status();
    })().finally(() => { this.work = null; if (this.pending && !this.disposed) this.startInstall(this.pending); });
    return this.work;
  }
  install(): UpdateStatus {
    return this.startInstall('manual');
  }
  private startInstall(source: InstallSource): UpdateStatus {
    if (!this.disposed && source === 'manual' && this.installing && !this.installing.submitted
      && (this.installing.abort.signal.aborted || this.pending)) {
      this.pending = 'manual'; return this.status();
    }
    if (this.disposed || this.installing || this.work || !this.candidate || this.state.phase === 'restart-required') return this.status();
    if (source === 'automatic' && !this.state.automatic) return this.status();
    if (!this.options.idle()) {
      void this.waitForIdle(source).catch(() => {
        if (this.pending === source && this.state.phase === 'waiting-idle') {
          this.pending = null; this.state.phase = 'error'; this.state.error = 'storage-failed';
        }
      });
      return this.status();
    }
    const candidate = this.candidate;
    const task: InstallTask = { source, abort: new AbortController(), submitted: false };
    this.pending = null; this.installing = task; this.state.phase = 'downloading'; this.state.error = null;
    // Start outside the owner RPC/HMR call; replacing this plugin disposes its old scope.
    setTimeout(() => { void this.performInstall(candidate, task).finally(() => {
      if (this.installing === task) this.installing = null;
      if (!this.installing && !this.disposed && this.pending === 'manual') this.startInstall('manual');
    }); }, 0).unref();
    return this.status();
  }
  private async waitForIdle(source: InstallSource): Promise<void> {
    this.pending = this.pending === 'manual' ? 'manual' : source; this.state.phase = 'waiting-idle';
    await this.save().catch(() => failure('storage-failed'));
  }
  private async prepareArchive(candidate: Candidate, task: InstallTask, active: () => void): Promise<string> {
    active();
    const cached = this.prepared;
    if (cached?.candidate === candidate) {
      const info = await stat(cached.file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (info && info.size !== candidate.asset.size) { this.prepared = null; return failure('checksum-failed'); }
      const archive = info ? await readFile(cached.file) : null;
      active();
      if (archive) {
        if (archive.length !== candidate.asset.size || createHash('sha256').update(archive).digest('hex') !== cached.hash) {
          this.prepared = null; return failure('checksum-failed');
        }
        return cached.file;
      }
      this.prepared = null;
    }
    let archive: Buffer;
    try {
      archive = await this.request(candidate.source === 'public'
        ? `${REPOSITORY}/releases/download/v${candidate.version}/${candidate.asset.name}`
        : `${API}/releases/assets/${candidate.asset.id}`, MAX_ARCHIVE, true, task.abort.signal);
    } catch (error) {
      active();
      if (candidate.source !== 'public' || !candidate.asset.id || Date.now() < this.apiRetryAt
        || (error instanceof UpdateFailure && !RETRYABLE_NETWORK_ERRORS.has(error.message))) throw error;
      archive = await this.request(`${API}/releases/assets/${candidate.asset.id}`, MAX_ARCHIVE, true, task.abort.signal);
    }
    active();
    let hash = candidate.asset.digest?.match(/^sha256:([a-f\d]{64})$/i)?.[1]?.toLowerCase();
    if (!hash && candidate.checksum) {
      const sums = (await this.request(`${API}/releases/assets/${candidate.checksum.id}`, 64 * 1024, true, task.abort.signal)).toString();
      active();
      hash = sums.split(/\r?\n/).map(line => /^([a-f\d]{64})\s+\*?(\S+)$/.exec(line)).find(match => match?.[2] === candidate.asset.name)?.[1];
    }
    if (!hash || createHash('sha256').update(archive).digest('hex') !== hash) return failure('checksum-failed');
    if (archive.length !== candidate.asset.size) return failure('size-mismatch');
    await mkdir(this.directory, { recursive: true }); active();
    const file = join(this.directory, `${manifest.name}-${candidate.version}-${hash.slice(0, 12)}.tgz`);
    await writeFile(file, archive, { mode: 0o600 }); active();
    await validateArchive(file, candidate.version, this.options.hostVersion, this.options.requireUnified); active();
    this.prepared = { candidate, file, hash };
    return file;
  }
  private async performInstall(candidate: Candidate, task: InstallTask): Promise<void> {
    const active = () => { this.abort.signal.throwIfAborted(); task.abort.signal.throwIfAborted(); };
    const yieldIfBusy = async (): Promise<boolean> => {
      active();
      if (this.options.idle()) return false;
      await this.waitForIdle(task.source);
      active();
      return true;
    };
    try {
      const file = await this.prepareArchive(candidate, task, active);
      if (await yieldIfBusy()) return;
      this.state.phase = 'installing'; await this.save();
      await prepareUpgradeEnvironment(this.options.directory, AbortSignal.any([this.abort.signal, task.abort.signal]));
      if (await yieldIfBusy()) return;
      // Cancellation is effective until this synchronous handoff. The host owns
      // an installation already submitted, including plugin disposal during HMR.
      task.submitted = true;
      let result: Awaited<ReturnType<Manager['installBundle']>>;
      for (let attempt = 0; ; attempt++) {
        result = await this.options.manager.installBundle(file, { enabled: true, requestId: `${manifest.name}-${randomUUID()}` });
        const transientRename = process.platform === 'win32' && result.application === 'failed' && result.stage === 'install'
          && /\bEPERM\b/.test(result.packageResult?.output ?? '') && /\brename\b[^\n]*package\.json/i.test(result.packageResult?.output ?? '');
        if (!transientRename || attempt >= 2 || this.disposed) break;
        // Native DSH has restored its manifest/lockfile after this failed run.
        // Retry only a Windows rename lock, with the same verified archive and idle gate.
        await delay(250 * (attempt + 1), undefined, { signal: this.abort.signal });
        if (await yieldIfBusy()) return;
        await this.prepareArchive(candidate, task, active);
      }
      if (!['applied', 'restart-required'].includes(result.application)) return failure(hostInstallFailure(result));
      if (result.version !== candidate.version) return failure('host-version-mismatch');
      const finished: UpdateStatus = {
        ...this.state,
        phase: result.application === 'restart-required' ? 'restart-required' : 'current',
        currentVersion: result.application === 'applied' ? candidate.version : this.state.currentVersion,
        updatedAt: new Date().toISOString(),
        error: null,
      };
      this.prepared = null;
      await this.save(finished);
      Object.assign(this.state, finished);
    } catch (error) {
      if (this.disposed && !task.submitted) return;
      if (this.installing === task) this.installing = null;
      if (task.abort.signal.aborted && !task.submitted) {
        if (this.state.error !== 'storage-failed') { this.state.phase = 'available'; this.state.error = null; }
      } else { this.pending = null; this.state.phase = 'error'; this.state.error = error instanceof UpdateFailure || error instanceof UpgradeEnvironmentError ? error.message : 'update-install-failed'; }
      await this.save().catch(() => {});
    }
  }
  dispose(): void { this.disposed = true; this.pending = null; clearInterval(this.timer); this.abort.abort(); }
}

export function registerUpdater(ctx: HostContext, hostVersion: string, idle: () => boolean): UpdateAPI {
  let updater: Updater | undefined;
  const unavailable = (): UpdateStatus => ({ repository: REPOSITORY, currentVersion: manifest.version, available: false, automatic: false,
    phase: 'unavailable', latestVersion: null, checkedAt: null, updatedAt: null, error: null });
  ctx.inject?.(['pluginManager', 'profileContext'], child => {
    const manager = child.get?.('pluginManager') as Manager | undefined;
    const profile = child.get?.('profileContext') as { dir?: string } | undefined;
    if (!manager?.installBundle || !profile?.dir) return;
    const hmr = child.get?.('hmr') as { executing?: { exit<T>(callback: () => T): T } } | undefined;
    const own = new Updater({ directory: profile.dir, hostVersion, requireUnified: true, manager: {
      installBundle: (spec, options) => hmr?.executing ? hmr.executing.exit(() => manager.installBundle(spec, options)) : manager.installBundle(spec, options),
    }, idle });
    updater = own;
    void own.start();
    child.effect(() => () => { own.dispose(); if (updater === own) updater = undefined; });
  });
  return { status: () => updater?.status() ?? unavailable(), check: () => updater?.check() ?? Promise.resolve(unavailable()),
    setAutomatic: enabled => updater?.setAutomatic(enabled) ?? Promise.resolve(unavailable()), install: () => updater?.install() ?? unavailable() };
}
