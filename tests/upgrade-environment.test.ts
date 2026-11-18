import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { prepareUpgradeEnvironment } from '../src/upgrade-environment.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'guard-upgrade-')); roots.push(directory);
  const root = join(directory, 'original-store'), store = join(root, 'v11');
  await mkdir(store, { recursive: true }); await mkdir(join(directory, 'node_modules'));
  await writeFile(join(directory, 'node_modules/.modules.yaml'), JSON.stringify({ storeDir: store }));
  await writeFile(join(directory, 'package.json'), '{"private":true}');
  return { directory, root, store, workspace: join(directory, 'pnpm-workspace.yaml') };
}
it('pins the installed store and preserves build approvals, comments and unrelated settings', async () => {
  const { directory, root, workspace } = await fixture();
  const before = '# local settings\npackages:\n  - .\nnodeLinker: hoisted\nallowBuilds:\n  cloudflared: true\nminimumReleaseAge: 720\n';
  await writeFile(workspace, before);
  await prepareUpgradeEnvironment(directory);
  const next = await readFile(workspace, 'utf8');
  expect(next).toContain('# local settings');
  expect(parse(next)).toEqual({ ...parse(before), storeDir: root.replaceAll('\\', '/') });
  const backups = await readdir(join(directory, '.runtime-guard/upgrade-backups'));
  expect(await readFile(join(directory, '.runtime-guard/upgrade-backups', backups[0]!), 'utf8')).toBe(before);
  await prepareUpgradeEnvironment(directory);
  expect(await readdir(join(directory, '.runtime-guard/upgrade-backups'))).toEqual(backups);
  expect(await readFile(workspace, 'utf8')).toBe(next);
});
it('repairs an explicit conflicting store without touching the dependency tree or manifest', async () => {
  const { directory, root, workspace } = await fixture();
  await writeFile(workspace, 'storeDir: C:/different-store\nnodeLinker: hoisted\n');
  const before = await readFile(join(directory, 'node_modules/.modules.yaml'), 'utf8');
  await prepareUpgradeEnvironment(directory);
  expect(parse(await readFile(workspace, 'utf8')).storeDir).toBe(root.replaceAll('\\', '/'));
  expect(await readFile(join(directory, 'node_modules/.modules.yaml'), 'utf8')).toBe(before);
  expect(await readFile(join(directory, 'package.json'), 'utf8')).toBe('{"private":true}');
});
it('creates workspace configuration when an older installation has none', async () => {
  const { directory, root, workspace } = await fixture();
  await prepareUpgradeEnvironment(directory);
  expect(parse(await readFile(workspace, 'utf8'))).toEqual({ storeDir: root.replaceAll('\\', '/') });
});
it.each(['storeDir: one\nstoreDir: two\n', 'allowBuilds: [\n', '- array\n'])('refuses invalid or ambiguous YAML without changing it: %s', async text => {
  const { directory, workspace } = await fixture(); await writeFile(workspace, text);
  await expect(prepareUpgradeEnvironment(directory)).rejects.toThrow('host-store-config');
  expect(await readFile(workspace, 'utf8')).toBe(text);
  expect(await readdir(directory)).not.toContain('package.json.lock');
});
it('respects the native profile writer lock and cancellation', async () => {
  const { directory, workspace } = await fixture();
  await writeFile(join(directory, 'package.json.lock'), `${process.pid}\n`);
  const abort = new AbortController();
  const pending = prepareUpgradeEnvironment(directory, abort.signal);
  setTimeout(() => abort.abort(), 20);
  await expect(pending).rejects.toThrow();
  expect(await readFile(join(directory, 'package.json.lock'), 'utf8')).toBe(`${process.pid}\n`);
  await expect(readFile(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
});
it('clears a stale lock left by a dead process and keeps backups bounded', async () => {
  const { directory, root, workspace } = await fixture();
  await writeFile(join(directory, 'package.json.lock'), '99999999\n');
  await writeFile(workspace, 'storeDir: C:/wrong-1\n');
  await prepareUpgradeEnvironment(directory);
  expect(parse(await readFile(workspace, 'utf8')).storeDir).toBe(root.replaceAll('\\', '/'));
  await writeFile(workspace, 'storeDir: C:/wrong-2\n');
  await prepareUpgradeEnvironment(directory);
  const backups = await readdir(join(directory, '.runtime-guard/upgrade-backups'));
  expect(backups.sort()).toEqual(['pnpm-workspace.before-guard.yaml', 'pnpm-workspace.last-repair.yaml']);
  expect(await readFile(join(directory, '.runtime-guard/upgrade-backups/pnpm-workspace.before-guard.yaml'), 'utf8')).toBe('storeDir: C:/wrong-1\n');
  expect(await readFile(join(directory, '.runtime-guard/upgrade-backups/pnpm-workspace.last-repair.yaml'), 'utf8')).toBe('storeDir: C:/wrong-2\n');
});
