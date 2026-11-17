import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { apply, type RuntimeGuardAPI } from '../src/index.js';
import { MetricsStore, sessionKey } from '../src/metrics.js';
import { FakeHost, chunks, makeAgent, repeated, stream } from './helpers.js';

const roots: string[] = [], hosts: FakeHost[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  vi.useRealTimers();
});
async function directory() { const root = await mkdtemp(join(tmpdir(), 'runtime-guard-history-')); roots.push(root); return root; }
function load(dir: string) {
  const host = new FakeHost(); hosts.push(host); host.values.set('profileContext', { dir });
  apply(host, { hostVersion: '0.1.0-rc.7' });
  return { host, api: host.values.get('runtimeGuard') as RuntimeGuardAPI };
}
async function stop(host: FakeHost) { await host.close(); hosts.splice(hosts.indexOf(host), 1); }

it('persists normal and warning conversations, restores history without active requests, and continues totals', async () => {
  const dir = await directory(), first = load(dir);
  expect(first.api.diskLogging()).toMatchObject({ enabled: false, available: true, persistent: true });
  // Enabling also saves requests monitored before the switch was turned on.
  await stream(first.host, makeAgent('private-normal'), chunks('独立的普通输出。'), false);
  await first.api.setDiskLogging(true);
  await stream(first.host, makeAgent('private-warning'), chunks(repeated), false);
  await stop(first.host);
  const file = join(dir, '.runtime-guard', 'logs', 'history.json'), text = await readFile(file, 'utf8');
  expect(text).not.toMatch(/private-normal|private-warning|独立的普通输出|需要继续检查问题/);
  const second = load(dir);
  expect(second.api.diskLogging()).toMatchObject({ enabled: true, healthy: true, restored: 2 });
  expect(second.api.status()).toMatchObject({ monitoredRequests: 2, finishedRequests: 2, activeRequests: 0, confirmed: 1 });
  const rows = second.api.conversations();
  expect(rows).toHaveLength(2);
  expect(rows.every(row => !row.tracked && row.sessionId === '' && row.live === null && row.activeRequests === 0)).toBe(true);
  expect(rows.find(row => row.sessionKey === sessionKey('private-normal'))).toMatchObject({ counterScope: 'history', monitoredRequests: 1, confirmed: 0 });
  expect(second.api.sessionStatus('private-warning')).toMatchObject({ monitoredRequests: 1, confirmed: 1, live: null });
  await stream(second.host, makeAgent('private-normal'), chunks('下一次正常请求。'), false);
  expect(second.api.sessionStatus('private-normal')).toMatchObject({ monitoredRequests: 2, activeRequests: 0 });
  expect(second.api.conversations().find(row => row.sessionKey === sessionKey('private-normal'))).toMatchObject({ tracked: true, sessionId: 'private-normal' });
  expect(JSON.stringify(second.api.status())).not.toContain(dir);
});

it('saves during operation, bounds summaries, and leaves existing files intact when disabled', async () => {
  vi.useFakeTimers();
  const dir = await directory(), metrics = new MetricsStore('', 4096, () => {}, { profileDirectory: dir, sessionLimit: 2 });
  await metrics.setEnabled(true);
  for (const id of ['a', 'b', 'c']) {
    const time = new Date().toISOString(); metrics.requestStarted(time); metrics.requestFinished();
    metrics.remember(id, { monitoredRequests: 1, confirmed: 0, toolWarnings: 0, recoverySubmitted: 0, cancelRequested: 0, lastMonitoredAt: time, turn: 1, step: 1, toolResults: 0, lastToolAt: null });
  }
  await vi.advanceTimersByTimeAsync(300);
  const file = join(dir, '.runtime-guard', 'logs', 'history.json');
  await metrics.setEnabled(false); // Wait for an in-flight atomic save before checking its contents.
  const before = await readFile(file, 'utf8');
  expect(JSON.parse(before).sessions.map((item: { key: string }) => item.key)).toEqual([sessionKey('b'), sessionKey('c')]);
  metrics.record({ kind: 'tool-repeat', session: 'private-disabled', score: 70, confirmed: false, chars: 0 });
  await metrics.close();
  expect(await readFile(file, 'utf8')).toBe(before);
  const restored = new MetricsStore('', 4096, () => {}, { profileDirectory: dir, sessionLimit: 2 });
  expect(restored.loggingSettings().enabled).toBe(false);
  expect(restored.requestTotals()).toMatchObject({ monitoredRequests: 3, finishedRequests: 3 });
  expect(restored.snapshot().events).not.toContainEqual(expect.objectContaining({ session: sessionKey('private-disabled') }));
  await restored.close();
});

it('recovers bounded legacy JSONL and skips corrupt or untrusted fields without hashing twice', async () => {
  const dir = await directory(), key = sessionKey('old-private-id');
  const event = { time: new Date().toISOString(), kind: 'stream-repeat', session: key, confirmed: true, score: 90, chars: 2000, raw: 'secret', action: 'unsafe command text' };
  await writeFile(join(dir, 'events.previous.jsonl'), JSON.stringify(event) + '\n');
  await writeFile(join(dir, 'events.jsonl'), '{broken line\n' + JSON.stringify({ ...event, session: 'raw-session-id' }) + '\n');
  const metrics = new MetricsStore(dir, 4096, () => {});
  expect(metrics.forSession('old-private-id')).toEqual([expect.objectContaining({ session: key, confirmed: true })]);
  expect(metrics.snapshot().logging).toMatchObject({ restoreError: true, healthy: true });
  expect(JSON.stringify(metrics.snapshot())).not.toMatch(/secret|unsafe command|raw-session-id/);
  metrics.requestStarted(new Date().toISOString()); await metrics.close();
  expect(await readFile(join(dir, 'history.json'), 'utf8')).not.toMatch(/secret|unsafe command|old-private-id/);
});

it('falls back after corrupt or oversized snapshots and does not crash monitoring', async () => {
  const dir = await directory(), logs = join(dir, '.runtime-guard', 'logs'); await mkdir(logs, { recursive: true });
  for (const text of ['{incomplete', ' '.repeat(2_097_153)]) {
    await writeFile(join(logs, 'history.json'), text);
    const { host, api } = load(dir);
    expect(api.status().logging.restoreError).toBe(true);
    await stream(host, makeAgent(), chunks('继续正常输出。'), false);
    expect(api.status().monitoredRequests).toBe(1);
    await stop(host);
  }
});

it('preserves the prior switch on settings failure and serializes rapid changes', async () => {
  const dir = await directory(), parent = join(dir, '.runtime-guard'); await mkdir(join(parent, 'logging.json'), { recursive: true });
  const metrics = new MetricsStore('', 4096, () => {}, { profileDirectory: dir });
  await expect(metrics.setEnabled(true)).rejects.toThrow();
  expect(metrics.snapshot().logging.enabled).toBe(false);
  expect((await readdir(parent)).some(name => name.endsWith('.tmp'))).toBe(false);
  await rm(join(parent, 'logging.json'), { recursive: true });
  await Promise.all([metrics.setEnabled(true), metrics.setEnabled(false), metrics.setEnabled(true)]);
  expect(metrics.snapshot().logging.enabled).toBe(true);
  expect(JSON.parse(await readFile(join(parent, 'logging.json'), 'utf8'))).toEqual({ enabled: true });
  await metrics.close();
});
