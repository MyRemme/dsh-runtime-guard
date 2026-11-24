import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const PROFILE_DIR = '.runtime-guard';
export const LEGACY_PROFILE_DIR = '.flash-stabilizer';

/** Read a bounded JSON profile file, falling back once to the legacy directory. */
export function readProfileJsonWithOriginSync(
  directory: string,
  maxBytes: number,
  ...subpath: string[]
): { value: unknown; fromLegacy: boolean } | undefined {
  const readOne = (base: string): unknown => {
    const file = join(directory, base, ...subpath);
    if (statSync(file).size > maxBytes) throw new Error('oversized settings');
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  try {
    return { value: readOne(PROFILE_DIR), fromLegacy: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    return { value: readOne(LEGACY_PROFILE_DIR), fromLegacy: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Read a bounded JSON profile file, falling back once to the legacy directory. */
export function readProfileJsonSync(directory: string, maxBytes: number, ...subpath: string[]): unknown {
  return readProfileJsonWithOriginSync(directory, maxBytes, ...subpath)?.value;
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

/** Serializes async file writes so concurrent toggles never overwrite newer state with older state. */
export class SerializedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<R>(task: () => Promise<R>): Promise<R> {
    const op = this.tail.catch(() => {}).then(task);
    this.tail = op;
    return op;
  }
  async drain(): Promise<void> {
    await this.tail.catch(() => {});
  }
}

export interface ProfileStoreOptions<T> {
  directory?: string | undefined;
  file?: string | undefined;
  subpath?: string[];
  maxBytes?: number;
  defaultValue: T;
  parse: (raw: unknown) => T | undefined;
  serialize?: (value: T) => string;
  onLoadError?: () => T;
  disposedMessage?: string;
}

/** Unified bounded JSON settings store with legacy migration and serialized atomic writes. */
export class ProfileJsonStore<T> {
  readonly file: string | undefined;
  readonly queue = new SerializedQueue();
  value: T;
  loadError = false;
  disposed = false;
  private readonly serialize: (value: T) => string;
  private readonly disposedMessage: string;
  private updatedByCaller = false;

  constructor(options: ProfileStoreOptions<T>) {
    this.value = options.defaultValue;
    this.serialize = options.serialize ?? (v => JSON.stringify(v, null, 2) + '\n');
    this.disposedMessage = options.disposedMessage ?? 'settings unavailable';
    if (options.file) {
      this.file = options.file;
      return;
    }
    if (!options.directory || !options.subpath) return;
    this.file = join(options.directory, PROFILE_DIR, ...options.subpath);
    try {
      const saved = readProfileJsonWithOriginSync(options.directory, options.maxBytes ?? 4096, ...options.subpath);
      if (saved !== undefined) {
        const parsed = options.parse(saved.value);
        if (parsed === undefined) throw new Error('invalid settings');
        this.value = parsed;
        if (saved.fromLegacy) {
          const target = this.file;
          const content = this.serialize(parsed);
          void this.queue.run(async () => {
            if (this.disposed || this.updatedByCaller) return;
            await writeProfileFile(target, content);
          }).catch(() => {});
        }
      }
    } catch {
      this.loadError = true;
      if (options.onLoadError) this.value = options.onLoadError();
    }
  }

  get persistent(): boolean { return Boolean(this.file); }

  update<R = T>(
    next: T,
    options?: {
      beforeWrite?: () => void;
      afterWrite?: (value: T) => Promise<R> | R;
    },
  ): Promise<R> {
    return this.transform(() => next, options);
  }

  transform<R = T>(
    fn: (current: T) => T,
    options?: {
      beforeWrite?: () => void;
      afterWrite?: (value: T) => Promise<R> | R;
    },
  ): Promise<R> {
    this.updatedByCaller = true;
    return this.queue.run(async () => {
      if (this.disposed) throw new Error(this.disposedMessage);
      options?.beforeWrite?.();
      const next = fn(this.value);
      if (this.file) await writeProfileFile(this.file, this.serialize(next));
      this.value = next;
      this.loadError = false;
      return options?.afterWrite ? await options.afterWrite(next) : (next as unknown as R);
    });
  }

  async close(): Promise<void> {
    this.disposed = true;
    await this.queue.drain();
  }
}
