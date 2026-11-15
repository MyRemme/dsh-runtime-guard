import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const PROFILE_DIR = '.runtime-guard';
export const LEGACY_PROFILE_DIR = '.flash-stabilizer';

/** Read a bounded JSON profile file, falling back once to the legacy directory. */
export function readProfileJsonSync(directory: string, maxBytes: number, ...subpath: string[]): unknown {
  const readOne = (base: string): unknown => {
    const file = join(directory, base, ...subpath);
    if (statSync(file).size > maxBytes) throw new Error('oversized settings');
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  try {
    return readOne(PROFILE_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    return readOne(LEGACY_PROFILE_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Read a bounded JSON profile file asynchronously, with legacy directory fallback. */
export async function readProfileJson(directory: string, maxBytes: number, ...subpath: string[]): Promise<unknown> {
  for (const base of [PROFILE_DIR, LEGACY_PROFILE_DIR]) {
    try {
      const raw = await readFile(join(directory, base, ...subpath), 'utf8');
      if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('oversized settings');
      return JSON.parse(raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}

/** Keep the previous settings intact until the complete replacement is ready. */
export async function writeProfileFile(file: string, content: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  try {
    await writeFile(temporary, content, { mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, file); break; }
      catch (error) {
        // Windows readers/antivirus can briefly hold the destination open.
        if (process.platform !== 'win32' || attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await delay(15 * 2 ** attempt);
      }
    }
  } finally { await unlink(temporary).catch(() => {}); }
}
