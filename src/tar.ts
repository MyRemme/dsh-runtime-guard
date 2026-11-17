export interface TarEntry {
  path: string;
  type: 'File' | 'Directory' | 'Other';
  size: number;
  content: Buffer;
}

function readAscii(buf: Buffer, start: number, end: number): string {
  const zero = buf.indexOf(0, start);
  const limit = zero >= start && zero < end ? zero : end;
  return buf.subarray(start, limit).toString('utf8');
}

function parseSize(buf: Buffer): number {
  if ((buf[124]! & 0x80) !== 0) {
    let value = 0;
    for (let i = 125; i < 136; i++) value = value * 256 + buf[i]!;
    return Number.isSafeInteger(value) ? value : -1;
  }
  const raw = readAscii(buf, 124, 136).trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) return -1;
  const parsed = Number.parseInt(raw, 8);
  return Number.isSafeInteger(parsed) ? parsed : -1;
}

function verifyChecksum(header: Buffer): boolean {
  const expected = parseInt(readAscii(header, 148, 156).trim(), 8);
  if (!Number.isSafeInteger(expected)) return false;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i]!;
  return sum === expected;
}

function parsePax(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < buf.length) {
    const space = buf.indexOf(32, pos);
    if (space < 0) break;
    const len = Number(buf.subarray(pos, space).toString('ascii'));
    if (!Number.isSafeInteger(len) || len <= 0 || pos + len > buf.length) break;
    const record = buf.subarray(space + 1, pos + len - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    pos += len;
  }
  return out;
}

/** Parse an uncompressed USTAR/PAX tar buffer without external dependencies. */
export function parseTar(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pax: Record<string, string> = {};
  let gnuLongName: string | undefined;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) break;
    if (!verifyChecksum(header)) throw new Error('invalid tar header');
    const size = parseSize(header);
    if (size < 0) throw new Error('invalid tar size');
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw new Error('truncated tar entry');
    const flag = header[156] === 0 ? '0' : String.fromCharCode(header[156]!);
    const data = buffer.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (flag === 'x') {
      pax = { ...pax, ...parsePax(data) };
      continue;
    }
    if (flag === 'g') {
      // Global PAX headers apply across subsequent records; ignored except clearing nothing.
      continue;
    }
    if (flag === 'L') {
      gnuLongName = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    if (flag === 'K') continue;
    const name = readAscii(header, 0, 100);
    const prefix = readAscii(header, 345, 500);
    const rawPath = pax.path ?? gnuLongName ?? (prefix ? `${prefix}/${name}` : name);
    const entrySize = pax.size ? Number(pax.size) : size;
    pax = {};
    gnuLongName = undefined;
    if (!Number.isSafeInteger(entrySize) || entrySize < 0) throw new Error('invalid pax size');
    const type: TarEntry['type'] = flag === '0' ? 'File' : flag === '5' ? 'Directory' : 'Other';
    entries.push({ path: rawPath, type, size: entrySize, content: type === 'File' ? data : Buffer.alloc(0) });
  }
  return entries;
}
