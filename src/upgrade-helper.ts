import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isSeq, parseDocument } from 'yaml';
import type { HostContext } from './types.js';
import { Updater, type Manager } from './updater.js';
import { prepareUpgradeEnvironment, withUpgradeProfileLock } from './upgrade-environment.js';
import { writeProfileFile } from './profile-file.js';
export { prepareUpgradeEnvironment } from './upgrade-environment.js';
export { Updater } from './updater.js';

function hostVersion(anchor: string): string {
  const require = createRequire(anchor);
  const versions = ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools'].map(name => {
    try { return (JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as { version: string }).version; }
    catch { return undefined; }
  });
  return versions.every(version => version && version === versions[0]) ? versions[0]! : '';
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
    if (closed || pkg.runtimeGuardUpdater === 1) return;
    updater = new Updater({ directory: profile.dir, currentVersion: pkg.version, repairCurrent: true, requireUnified: true,
      hostVersion: hostVersion(profile.installAnchor), idle, manager: {
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
  const start = '# BEGIN runtime-guard unified upgrade helper';
  const end = '# END runtime-guard unified upgrade helper';
  await withUpgradeProfileLock(directory, async () => {
    const patch = join(directory, 'cordis.patch.yml');
    const before = await readFile(patch, 'utf8');
    let next = before;
    const from = before.indexOf(start), to = before.indexOf(end);
    if ((from < 0) !== (to < 0) || (from >= 0 && (to < from || before.indexOf(start, from + start.length) >= 0))) throw new Error('Ambiguous helper entry; profile not modified');
    if (from >= 0) {
      const originalEmpty = /# Original empty patch: ([A-Za-z\d+/=]+)/.exec(before.slice(from, to));
      next = originalEmpty ? Buffer.from(originalEmpty[1]!, 'base64').toString('utf8')
        : before.slice(0, from) + before.slice(to + end.length).replace(/^\r?\n/, '');
    }
    if (values.enable) {
      const parsed = parseDocument(next, { uniqueKeys: true });
      if (parsed.errors.length || !isSeq(parsed.contents)) throw new Error('Profile patch must be a YAML array; profile not modified');
      let emptyPrefix = '';
      if (parsed.contents.items.length === 0) {
        // Preserve a flow-style empty root exactly so disabling restores it byte-for-byte.
        emptyPrefix = `# Original empty patch: ${Buffer.from(next).toString('base64')}\n`;
        next = '';
      } else if (parsed.contents.flow) throw new Error('Expand the flow-style patch array before enabling the helper; profile not modified');
      const helper = join(directory, '.runtime-guard/upgrade-helper.mjs');
      await mkdir(join(directory, '.runtime-guard'), { recursive: true });
      if (resolve(fileURLToPath(import.meta.url)) !== resolve(helper)) await copyFile(fileURLToPath(import.meta.url), helper);
      const block = `${start}\n${emptyPrefix}- insert:\n    - id: runtime-guard-unified-upgrade-helper\n      name: ${JSON.stringify(pathToFileURL(helper).href)}\n${end}\n`;
      next = (next ? next.replace(/\s*$/, '\n') : '') + block;
    }
    if (next !== before) {
      await writeProfileFile(join(directory, '.runtime-guard', `cordis.patch.before-helper-${Date.now()}.yml`), before);
      await writeProfileFile(patch, next);
    }
  });
  console.log(values.enable ? 'Unified upgrade helper enabled. Start DSH; it upgrades only after all conversations are idle.' : 'Unified upgrade helper disabled.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
