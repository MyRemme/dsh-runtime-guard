import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isMap, parseDocument } from 'yaml';
import { PROFILE_DIR, writeProfileFile } from './profile-file.js';

export class UpgradeEnvironmentError extends Error {}

async function optionalText(file: string, limit: number): Promise<string | undefined> {
  try {
    if ((await stat(file)).size > limit) throw new UpgradeEnvironmentError('host-store-config');
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
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
      if (!['EEXIST', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      if (Date.now() >= deadline) throw new UpgradeEnvironmentError('host-profile-busy');
      await delay(100, undefined, signal ? { signal } : undefined);
    }
  }
  try { await lock.writeFile(`${process.pid}\n`); signal?.throwIfAborted(); return await run(); }
  finally { await lock.close(); await unlink(lockFile); }
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
      await copyFile(workspace, join(backups, `pnpm-workspace-${randomUUID()}.yaml`));
    }
    // Cooperate with native package writers and refuse an unrelated concurrent edit.
    if (await optionalText(workspace, 1024 * 1024) !== before) throw new UpgradeEnvironmentError('host-profile-busy');
    await writeProfileFile(workspace, config.toString());
  }, signal);
}
