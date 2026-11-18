import { copyFile, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isMap, parseDocument } from 'yaml';
import { PROFILE_DIR, writeProfileFile } from './profile-file.js';

export class UpgradeEnvironmentError extends Error {}

const STALE_LOCK_MS = 60_000;

async function optionalText(file: string, limit: number): Promise<string | undefined> {
  try {
    if ((await stat(file)).size > limit) throw new UpgradeEnvironmentError('host-store-config');
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function tryClearStaleLock(lockFile: string): Promise<boolean> {
  try {
    const info = await stat(lockFile);
    const text = await readFile(lockFile, 'utf8').catch(() => '');
    const pid = Number(text.trim());
    const deadOwner = Number.isSafeInteger(pid) && pid > 0 && pid !== process.pid && !isProcessAlive(pid);
    const expiredMalformed = (!Number.isSafeInteger(pid) || pid <= 0) && Date.now() - info.mtimeMs >= STALE_LOCK_MS;
    if (!deadOwner && !expiredMalformed) return false;
    await unlink(lockFile).catch(() => {});
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

/** Both native DSH and the compatibility helper serialize writes with this lock. */
export async function withUpgradeProfileLock<T>(directory: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const lockFile = join(directory, 'package.json.lock');
  const deadline = Date.now() + 15000;
  let lock;
  for (;;) {
    signal?.throwIfAborted();
    try { lock = await open(lockFile, 'wx', 0o600); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!['EEXIST', 'EPERM'].includes(code)) throw error;
      if (code === 'EEXIST' && await tryClearStaleLock(lockFile)) continue;
      if (Date.now() >= deadline) throw new UpgradeEnvironmentError('host-profile-busy');
      await delay(100, undefined, signal ? { signal } : undefined);
    }
  }
  try { await lock.writeFile(`${process.pid}\n`); signal?.throwIfAborted(); return await run(); }
  finally { await lock.close().catch(() => {}); await unlink(lockFile).catch(() => {}); }
}

function document(text: string) {
  const value = parseDocument(text, { uniqueKeys: true });
  if (value.errors.length || (value.contents !== null && !isMap(value.contents))) throw new UpgradeEnvironmentError('host-store-config');
  return value;
}

/** Use the installed dependency store, rather than pnpm's changing default. */
export async function prepareUpgradeEnvironment(directory: string, signal?: AbortSignal): Promise<void> {
  try { await prepare(directory, signal); }
  catch (error) {
    if (error instanceof UpgradeEnvironmentError || signal?.aborted) throw error;
    throw new UpgradeEnvironmentError('host-store-config');
  }
}

async function prepare(directory: string, signal?: AbortSignal): Promise<void> {
  const modulesFile = join(directory, 'node_modules', '.modules.yaml');
  if (await optionalText(modulesFile, 8 * 1024 * 1024) === undefined) return;
  await withUpgradeProfileLock(directory, async () => {
    signal?.throwIfAborted();
    const modulesText = await optionalText(modulesFile, 8 * 1024 * 1024);
    if (modulesText === undefined) return;
    const store = document(modulesText).get('storeDir');
    if (typeof store !== 'string' || !isAbsolute(store) || /[\0\r\n]/.test(store) || !/^v\d+$/.test(basename(store))) {
      throw new UpgradeEnvironmentError('host-store-config');
    }
    if (!(await stat(store)).isDirectory()) throw new UpgradeEnvironmentError('host-store-config');
    const root = dirname(store);
    const workspace = join(directory, 'pnpm-workspace.yaml');
    const before = await optionalText(workspace, 1024 * 1024);
    const config = document(before ?? '');
    const configured = config.get('storeDir');
    if (typeof configured === 'string' && isAbsolute(configured) && normalize(configured) === normalize(root)) return;
    config.set('storeDir', root.replaceAll('\\', '/'));
    signal?.throwIfAborted();
    if (before !== undefined) {
      const backups = join(directory, PROFILE_DIR, 'upgrade-backups');
      await mkdir(backups, { recursive: true });
      const initialBackup = join(backups, 'pnpm-workspace.before-guard.yaml');
      if (await optionalText(initialBackup, 1024 * 1024) === undefined) await copyFile(workspace, initialBackup);
      await copyFile(workspace, join(backups, 'pnpm-workspace.last-repair.yaml'));
    }
    // Cooperate with native package writers and refuse an unrelated concurrent edit.
    if (await optionalText(workspace, 1024 * 1024) !== before) throw new UpgradeEnvironmentError('host-profile-busy');
    await writeProfileFile(workspace, config.toString());
  }, signal);
}
