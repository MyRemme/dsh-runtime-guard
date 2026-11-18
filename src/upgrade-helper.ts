import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isSeq, parseDocument } from 'yaml';
import { detectHostVersion } from './host-version.js';
import type { HostContext } from './types.js';
import { Updater, type Manager } from './updater.js';
import { prepareUpgradeEnvironment, withUpgradeProfileLock } from './upgrade-environment.js';
import { PROFILE_DIR, writeProfileFile } from './profile-file.js';
export { prepareUpgradeEnvironment } from './upgrade-environment.js';
export { Updater } from './updater.js';

const HELPER_START = '# BEGIN runtime-guard unified upgrade helper';
const HELPER_END = '# END runtime-guard unified upgrade helper';

async function syncHelperPatch(directory: string, enable: boolean): Promise<void> {
  const helper = join(directory, PROFILE_DIR, 'upgrade-helper.mjs');
  await withUpgradeProfileLock(directory, async () => {
    const patch = join(directory, 'cordis.patch.yml');
    const before = await readFile(patch, 'utf8');
    let next = before;
    const from = before.indexOf(HELPER_START), to = before.indexOf(HELPER_END);
    if ((from < 0) !== (to < 0) || (from >= 0 && (to < from || before.indexOf(HELPER_START, from + HELPER_START.length) >= 0))) {
      throw new Error('Ambiguous helper entry; profile not modified');
    }
    if (from >= 0) {
      const originalEmpty = /# Original empty patch: ([A-Za-z\d+/=]+)/.exec(before.slice(from, to));
      next = originalEmpty ? Buffer.from(originalEmpty[1]!, 'base64').toString('utf8')
        : before.slice(0, from) + before.slice(to + HELPER_END.length).replace(/^\r?\n/, '');
    }
    if (enable) {
      const parsed = parseDocument(next, { uniqueKeys: true });
      if (parsed.errors.length || !isSeq(parsed.contents)) throw new Error('Profile patch must be a YAML array; profile not modified');
      let emptyPrefix = '';
      if (parsed.contents.items.length === 0) {
        // Preserve a flow-style empty root exactly so disabling restores it byte-for-byte.
        emptyPrefix = `# Original empty patch: ${Buffer.from(next).toString('base64')}\n`;
        next = '';
      } else if (parsed.contents.flow) throw new Error('Expand the flow-style patch array before enabling the helper; profile not modified');
      await mkdir(join(directory, PROFILE_DIR), { recursive: true });
      if (resolve(fileURLToPath(import.meta.url)) !== resolve(helper)) await copyFile(fileURLToPath(import.meta.url), helper);
      const block = `${HELPER_START}\n${emptyPrefix}- insert:\n    - id: runtime-guard-unified-upgrade-helper\n      name: ${JSON.stringify(pathToFileURL(helper).href)}\n${HELPER_END}\n`;
      next = (next ? next.replace(/\s*$/, '\n') : '') + block;
    } else {
      await unlink(helper).catch(() => {});
    }
    if (next !== before) {
      await mkdir(join(directory, PROFILE_DIR), { recursive: true });
      const initialBackup = join(directory, PROFILE_DIR, 'cordis.patch.before-helper.yml');
      const existing = await readFile(initialBackup, 'utf8').catch(() => undefined);
      if (existing === undefined) await writeProfileFile(initialBackup, before);
      await writeProfileFile(join(directory, PROFILE_DIR, 'cordis.patch.last-helper.yml'), before);
      await writeProfileFile(patch, next);
    }
  });
}

/** Optional bridge for installed legacy releases; uses the current updater unchanged. */
export const name = 'runtime-guard-upgrade-helper';
export const inject = ['pluginManager', 'profileContext', 'runtimeGuard', 'agents'];
export function apply(ctx: HostContext): void {
  const profile = ctx.get?.('profileContext') as { dir: string; installAnchor: string };
  const manager = ctx.get?.('pluginManager') as Manager;
  const guard = ctx.get?.('runtimeGuard') as { status(): { activeRequests: number } };
  const hmr = ctx.get?.('hmr') as { executing?: { exit<T>(run: () => T): T } } | undefined;
  const idle = () => {
    const agents = ctx.agents?.list?.();
    return !!agents && agents.every(agent => agent.status === 'idle' && !agent.inbox?.nextStep.length && !agent.inbox?.nextTurn.length)
      && guard.status().activeRequests === 0;
  };
  let updater: Updater | undefined;
  let closed = false;
  ctx.effect(() => () => { closed = true; updater?.dispose(); });
  void (async () => {
    const pkg = JSON.parse(await readFile(join(profile.dir, 'node_modules/dsh-runtime-guard/package.json'), 'utf8')) as { version: string; runtimeGuardUpdater?: number };
    if (closed) return;
    if (pkg.runtimeGuardUpdater === 1) {
      const patchText = await readFile(join(profile.dir, 'cordis.patch.yml'), 'utf8').catch(() => '');
      if (patchText.includes(HELPER_START)) await syncHelperPatch(profile.dir, false).catch(() => {});
      return;
    }
    updater = new Updater({ directory: profile.dir, currentVersion: pkg.version, repairCurrent: true, requireUnified: true,
      hostVersion: detectHostVersion(profile.installAnchor) ?? '', idle, manager: {
        installBundle: (spec, options) => hmr?.executing ? hmr.executing.exit(() => manager.installBundle(spec, options)) : manager.installBundle(spec, options),
      } });
    await updater.start();
    if (closed) return;
    await updater.check();
    if (!closed) updater.install();
  })().catch(() => ctx.logger?.warn('runtime-guard: upgrade helper could not start; existing plugin remains installed'));
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    profile: { type: 'string' }, 'repair-only': { type: 'boolean' },
    enable: { type: 'boolean' }, disable: { type: 'boolean' },
  } });
  if (!values.profile || [values.enable, values.disable, values['repair-only']].filter(Boolean).length !== 1) {
    throw new Error('Usage: node upgrade-helper.mjs --profile <profile-directory> --enable|--disable|--repair-only');
  }
  const directory = resolve(values.profile);
  const pkg = JSON.parse(await readFile(join(directory, 'node_modules/dsh-runtime-guard/package.json'), 'utf8')) as { name: string; version: string };
  if (pkg.name !== 'dsh-runtime-guard') throw new Error('No Runtime Guard installation in this profile');
  await prepareUpgradeEnvironment(directory);
  if (values['repair-only']) { console.log('Existing pnpm store restored. Retry updating in DSH.'); return; }
  await syncHelperPatch(directory, Boolean(values.enable));
  console.log(values.enable ? 'Unified upgrade helper enabled. Start DSH; it upgrades only after all conversations are idle.' : 'Unified upgrade helper disabled.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
