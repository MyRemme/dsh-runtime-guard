import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Context } from '@deepseek-ai/cordis';
import { afterEach, expect, it, vi } from 'vitest';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { apply, inject } from '../src/upgrade-helper.js';
import type { HostContext } from '../src/types.js';

const exec = promisify(execFile);

afterEach(() => vi.unstubAllGlobals());

it('starts the legacy helper in real Cordis and queues installation while an agent is busy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guard-legacy-helper-'));
  const ctx = new Context();
  const installBundle = vi.fn();
  const list = vi.fn(() => [{ status: 'running', inbox: { nextStep: [], nextTurn: [] } }]);
  try {
    await mkdir(join(directory, 'node_modules/dsh-runtime-guard'), { recursive: true });
    await writeFile(join(directory, 'node_modules/dsh-runtime-guard/package.json'), JSON.stringify({ name: 'dsh-runtime-guard', version: '0.2.6' }));
    await writeFile(join(directory, 'package.json'), '{}');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, version: '0.2.7',
      name: 'dsh-runtime-guard-0.2.7.tgz', size: 100, sha256: 'a'.repeat(64) }))));
    await ctx.plugin(c => {
      c.provide('profileContext', { dir: directory, installAnchor: join(directory, 'package.json') });
      c.provide('pluginManager', { installBundle });
      c.provide('runtimeGuard', { status: () => ({ activeRequests: 0 }) });
      c.provide('agents', { list });
    });
    await ctx.plugin({ inject, apply: c => apply(c as unknown as HostContext) });
    await vi.waitFor(async () => expect(JSON.parse(await readFile(join(directory, '.runtime-guard/updates/state.json'), 'utf8')))
      .toMatchObject({ currentVersion: '0.2.6', latestVersion: '0.2.7', phase: 'waiting-idle' }));
    expect(list).toHaveBeenCalled();
    expect(installBundle).not.toHaveBeenCalled();
  } finally {
    await ctx.fiber.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
it('runs standalone outside the repo, disables cleanly, and auto-cleans once unified 0.2.7+ is active', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guard-helper-standalone-'));
  const standalone = join(root, 'upgrade-helper.mjs');
  const profile = join(root, 'profile');
  const ctx = new Context();
  try {
    await copyFile(resolve('dist/upgrade-helper.mjs'), standalone);
    await mkdir(join(profile, 'node_modules/dsh-runtime-guard'), { recursive: true });
    await writeFile(join(profile, 'node_modules/dsh-runtime-guard/package.json'), JSON.stringify({ name: 'dsh-runtime-guard', version: '0.2.6' }));
    await writeFile(join(profile, 'cordis.patch.yml'), '[]\n');
    await exec(process.execPath, [standalone, '--profile', profile, '--enable'], { windowsHide: true });
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toContain('runtime-guard-unified-upgrade-helper');
    await exec(process.execPath, [standalone, '--profile', profile, '--disable'], { windowsHide: true });
    expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe('[]\n');
    await expect(readFile(join(profile, '.runtime-guard/upgrade-helper.mjs'))).rejects.toMatchObject({ code: 'ENOENT' });

    await exec(process.execPath, [standalone, '--profile', profile, '--enable'], { windowsHide: true });
    await writeFile(join(profile, 'node_modules/dsh-runtime-guard/package.json'), JSON.stringify({ name: 'dsh-runtime-guard', version: '0.2.7', runtimeGuardUpdater: 1 }));
    await writeFile(join(profile, 'package.json'), '{}');
    await ctx.plugin(c => {
      c.provide('profileContext', { dir: profile, installAnchor: join(profile, 'package.json') });
      c.provide('pluginManager', { installBundle: vi.fn() });
      c.provide('runtimeGuard', { status: () => ({ activeRequests: 0 }) });
      c.provide('agents', { list: () => [] });
    });
    await ctx.plugin({ inject, apply: c => apply(c as unknown as HostContext) });
    await vi.waitFor(async () => expect(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')).toBe('[]\n'));
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
