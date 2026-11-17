import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { list } from 'tar';
import { parseDocument } from 'yaml';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const [hostPath, pnpmPath, archivePath, ...sourcePaths] = process.argv.slice(2);
assert.ok(hostPath && pnpmPath && archivePath && sourcePaths.length,
  'Usage: node scripts/test-upgrades.mjs <DSH-source-root> <pnpm.mjs> <target.tgz> <source.tgz> ...');
const host = resolve(hostPath), targetArchive = resolve(archivePath);
const { boot, initProfile, readProfilePatches, loadProfileDirectory } = await import(pathToFileURL(join(host, 'packages/boot/app-boot/lib/index.js')).href);
const { default: PluginManager } = await import(pathToFileURL(join(host, 'packages/boot/plugin-manager/lib/index.js')).href);
const { runProfilePnpm } = await import(pathToFileURL(join(host, 'packages/boot/plugin-manager/lib/types/operations.js')).href);
const { withFileLock } = await import(pathToFileURL(createRequire(join(host, 'packages/boot/plugin-manager/package.json')).resolve('@deepseek-ai/dsh-atomic-write')).href);
const { default: Hmr } = await import(pathToFileURL(join(host, 'packages/boot/hmr/lib/index.js')).href);
const { default: Timer } = await import(pathToFileURL(createRequire(join(host, 'packages/boot/plugin-manager/package.json')).resolve('@deepseek-ai/cordis-plugin-timer')).href);
const { prepareUpgradeEnvironment, Updater } = await import('../dist/upgrade-helper.mjs');
assert.equal(typeof prepareUpgradeEnvironment, 'function');
const root = await mkdtemp(resolve('artifacts/upgrade-matrix-'));
const exec = promisify(execFile);
const anchor = join(root, 'package.json');
await writeFile(anchor, JSON.stringify({ name: 'upgrade-matrix-installation', dependencies: {} }));
const results = [];
const hash = data => createHash('sha256').update(data).digest('hex');
const historySession = hash('upgrade-fixture-session').slice(0, 16);
const packageVersion = async file => {
  let pkg;
  await list({ file, onReadEntry: entry => {
    if (entry.path !== 'package/package.json') return;
    const chunks = []; entry.on('data', value => chunks.push(value));
    entry.on('end', () => { pkg = JSON.parse(Buffer.concat(chunks).toString()); });
  } });
  assert.equal(pkg?.name, 'dsh-runtime-guard');
  return pkg.version;
};
const targetVersion = await packageVersion(targetArchive);
for (const { sourcePath, mode } of sourcePaths.flatMap(sourcePath => ['startup', 'hmr'].map(mode => ({ sourcePath, mode })))) {
  const source = resolve(sourcePath), version = await packageVersion(source);
  const dir = join(root, 'profiles', `${version}-${mode}`);
  let ctx;
  try {
    initProfile(dir, []);
    await writeFile(join(dir, 'cordis.yml'), '[]\n');
    const workspace = join(dir, 'pnpm-workspace.yaml');
    await writeFile(workspace, '# Upgrade regression fixture\npackages:\n  - .\nnodeLinker: hoisted\nautoInstallPeers: false\n');
    const context = { profile: version, dir, installAnchor: anchor, cwd: dir, home: root };
    const packageManager = { command: process.execPath, args: [resolve(pnpmPath)], env: { PATH: process.env.PATH } };
    const options = { ...packageManager, execution: 'service', outputBytes: 16384, idleTimeoutMs: 30000 };
    const install = args => withFileLock(join(dir, 'package.json'), () => runProfilePnpm(context, args, options), { waitMs: 30000 });
    const initial = await install(['add', source, '--store-dir', join(root, 'old-store'), '--ignore-scripts']);
    assert.equal(initial.exitCode, 0, initial.output);
    const installedPkg = join(dir, 'node_modules/dsh-runtime-guard/package.json');
    assert.equal(JSON.parse(await readFile(installedPkg, 'utf8')).version, version);
    const originalConfig = '- insert:\n    - id: preserved-user-config\n      name: cordis:preserved\n      disabled: true\n';
    await writeFile(join(dir, 'cordis.patch.yml'), originalConfig);
    const settings = {
      'mode.json': '{"mode":"guard"}\n',
      'logging.json': '{"enabled":true}\n',
      'model-scope.json': '{"scope":"all","selections":[]}\n',
      'operation-safety.json': '{"enabled":true}\n',
      'logs/history.json': JSON.stringify({ schemaVersion: 1,
        totals: { monitoredRequests: 7, finishedRequests: 7, lastMonitoredAt: '2026-11-16T01:00:00.000Z' },
        counts: { 'stream-repeat': 2 }, confirmed: 2, recoverySubmitted: 0,
        events: [{ time: '2026-11-16T01:00:00.000Z', kind: 'stream-repeat', session: historySession,
          score: 98, confirmed: true, chars: 4000, action: 'observed' }], sessions: [] }) + '\n',
    };
    await mkdir(join(dir, '.runtime-guard/logs'), { recursive: true });
    for (const [name, text] of Object.entries(settings)) await writeFile(join(dir, '.runtime-guard', name), text);
    const sourceManifest = await readFile(join(dir, 'package.json'), 'utf8');
    // The same real pnpm invocation must fail before repair, proving the regression exists.
    const failed = await install(['add', targetArchive, '--ignore-scripts']);
    assert.notEqual(failed.exitCode, 0);
    assert.match(failed.output, /ERR_PNPM_UNEXPECTED_STORE/);
    assert.equal(await readFile(join(dir, 'package.json'), 'utf8'), sourceManifest);
    const profile = { name: version, dir, installAnchor: anchor, cwd: dir, home: root,
      startedBundles: loadProfileDirectory('test', dir, anchor).layers.map(layer => layer.packageName),
      overlays: [], patchPath: join(dir, 'cordis.patch.yml'), packageManager };
    // Start the real DSH loader and manager. No registry or package operation is mocked.
    ctx = await boot('upgrade-matrix', join(dir, 'cordis.yml'), readProfilePatches('test', profile), child => {
      child.provide('profileContext', profile);
      child.provide('appReady', { onReady(listener) { listener(); return () => {}; } });
      child.provide('agents', { list: () => [], get: () => undefined });
      child.provide('llm', {});
      child.provide('tools', {});
    });
    await ctx.plugin(PluginManager, { fallbackRegistries: [], idleTimeoutMs: 30000 });
    assert.ok(ctx.runtimeGuard, 'source plugin actually activated');
    if (mode === 'hmr') {
      await ctx.plugin(Timer);
      await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 });
      await ctx.hmr.runExclusive(async () => {});
    }
    const archiveBytes = await readFile(targetArchive);
    const metadata = { schemaVersion: 1, version: targetVersion, name: `dsh-runtime-guard-${targetVersion}.tgz`,
      size: archiveBytes.length, sha256: hash(archiveBytes) };
    let result;
    // The standalone legacy helper must install the repaired protocol even when the semantic version is unchanged.
    const updater = new Updater({ directory: dir, currentVersion: version, repairCurrent: true, requireUnified: true, hostVersion: '0.2.1-rc.2', idle: () => true, schedule: false,
      fetch: async url => String(url).endsWith('/stable.json') ? new Response(JSON.stringify(metadata)) : new Response(archiveBytes),
      manager: { installBundle: async file => { result = await ctx.pluginManager.installBundle(file, { enabled: false }); return result; } } });
    await updater.start();
    try {
      const checked = await updater.check();
      assert.equal(checked.phase, 'available');
      updater.install();
      const deadline = Date.now() + 45000;
      while (['downloading', 'installing'].includes(updater.status().phase) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(['current', 'restart-required'].includes(updater.status().phase), JSON.stringify({ status: updater.status(), result }));
    } finally { updater.dispose(); }
    const repaired = parseDocument(await readFile(workspace, 'utf8'));
    assert.equal(repaired.get('storeDir'), join(root, 'old-store').replaceAll('\\', '/'));
    assert.ok(['applied', 'restart-required'].includes(result.application), JSON.stringify(result));
    assert.equal(result.version, targetVersion);
    assert.equal(JSON.parse(await readFile(installedPkg, 'utf8')).version, targetVersion);
    if (mode === 'hmr') {
      assert.ok(ctx.runtimeGuard, 'new plugin actually activated');
      assert.equal(ctx.runtimeGuard.status().monitoredRequests, 7);
      assert.ok(ctx.runtimeGuard.status().events.some(event => event.kind === 'stream-repeat' && event.session === historySession));
    }
    assert.equal(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'), originalConfig);
    const helper = resolve('dist/upgrade-helper.mjs');
    await exec(process.execPath, [helper, '--profile', dir, '--enable'], { windowsHide: true });
    const enabled = await readFile(join(dir, 'cordis.patch.yml'), 'utf8');
    assert.equal((enabled.match(/id: runtime-guard-unified-upgrade-helper/g) ?? []).length, 1);
    await exec(process.execPath, [helper, '--profile', dir, '--enable'], { windowsHide: true });
    assert.equal(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'), enabled);
    await exec(process.execPath, [helper, '--profile', dir, '--disable'], { windowsHide: true });
    assert.equal(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'), originalConfig);
    const emptyConfig = '# Default profile\n[]\n';
    await writeFile(join(dir, 'cordis.patch.yml'), emptyConfig);
    await exec(process.execPath, [helper, '--profile', dir, '--enable'], { windowsHide: true });
    assert.equal(parseDocument(await readFile(join(dir, 'cordis.patch.yml'), 'utf8')).errors.length, 0);
    await exec(process.execPath, [helper, '--profile', dir, '--disable'], { windowsHide: true });
    assert.equal(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'), emptyConfig);
    await writeFile(join(dir, 'cordis.patch.yml'), originalConfig);
    for (const [name, text] of Object.entries(settings)) {
      const content = await readFile(join(dir, '.runtime-guard', name));
      if (name === 'logs/history.json') {
        const history = JSON.parse(content);
        assert.equal(history.totals.monitoredRequests, 7);
        assert.equal(history.confirmed, 2);
        assert.ok(history.events.some(event => event.session === historySession));
      } else assert.equal(hash(content), hash(text), name);
    }
    results.push({ from: version, to: targetVersion, mode, status: 'passed', storeConflictReproduced: true,
      nativeManager: true, unifiedUpdater: true, helperRegistration: true, settingsPreserved: true,
      pluginActivated: mode === 'hmr', application: result.application,
      sourceSha256: hash(await readFile(source)), targetSha256: hash(await readFile(targetArchive)) });
    console.log(`PASS ${version} -> ${targetVersion} (${mode}): unified updater, native manager, settings preserved`);
  } catch (error) {
    results.push({ from: version, to: targetVersion, mode, status: 'failed', error: String(error).slice(-4000) });
    console.error(`FAIL ${version} (${mode}): ${String(error).slice(-2000)}`);
  } finally { await ctx?.fiber.dispose(); }
}
await writeFile(join(root, 'results.json'), JSON.stringify({ testedAt: new Date().toISOString(), targetVersion,
  targetSha256: hash(await readFile(targetArchive)), helperSha256: hash(await readFile(resolve('dist/upgrade-helper.mjs'))),
  hostVersion: '0.2.1-rc.2', network: 'deterministic-release-responses-real-native-installer', results }, null, 2) + '\n');
console.log(`UPGRADE_MATRIX ${join(root, 'results.json')}`);
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
