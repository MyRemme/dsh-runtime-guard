interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: (number | string)[];
  raw: string;
}

const SEMVER_RE = /^[=v\s]*(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?\s*$/;
const PARTIAL_RE = /^(?:[<>]=?|=|\^|~)?\s*[v=]*(\d+|x|X|\*)(?:\.(\d+|x|X|\*)(?:\.(\d+|x|X|\*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?)?)?$/;

function parseSemver(value: unknown): ParsedSemver | null {
  if (typeof value !== 'string') return null;
  const match = SEMVER_RE.exec(value);
  if (!match) return null;
  const [, ma, mi, pa, preStr] = match;
  if ([ma, mi, pa].some(p => p!.length > 1 && p!.startsWith('0'))) return null;
  const pre: (number | string)[] = [];
  if (preStr) {
    for (const part of preStr.split('.')) {
      if (!part) return null;
      if (/^\d+$/.test(part)) {
        if (part.length > 1 && part.startsWith('0')) return null;
        pre.push(Number(part));
      } else {
        pre.push(part);
      }
    }
  }
  const major = Number(ma), minor = Number(mi), patch = Number(pa);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) return null;
  return { major, minor, patch, pre, raw: `${major}.${minor}.${patch}${preStr ? `-${preStr}` : ''}` };
}

export function validVersion(value: unknown): string | null {
  return parseSemver(value)?.raw ?? null;
}

function compareParsed(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  const len = Math.min(a.pre.length, b.pre.length);
  for (let i = 0; i < len; i++) {
    const x = a.pre[i]!, y = b.pre[i]!;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return a.pre.length === b.pre.length ? 0 : a.pre.length < b.pre.length ? -1 : 1;
}

export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) throw new TypeError(`Invalid semver comparison: ${a} vs ${b}`);
  return compareParsed(pa, pb);
}

export function gtVersion(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

interface Comparator { op: '<' | '<=' | '>' | '>=' | '='; ver: ParsedSemver }

function expandToken(token: string): Comparator[] | null {
  const opMatch = /^([<>]=?|=|\^|~)/.exec(token);
  const op = opMatch ? opMatch[1]! : '';
  const m = PARTIAL_RE.exec(token);
  if (!m) return null;
  const isWild = (s?: string) => !s || s === 'x' || s === 'X' || s === '*';
  const [, rawMa, rawMi, rawPa, preStr] = m;
  const ma = isWild(rawMa) ? null : Number(rawMa);
  const mi = isWild(rawMi) ? null : Number(rawMi);
  const pa = isWild(rawPa) ? null : Number(rawPa);
  if (ma === null) return [{ op: '>=', ver: parseSemver('0.0.0')! }];
  const parsed = (M: number, m2: number, p: number, pre = ''): ParsedSemver => parseSemver(`${M}.${m2}.${p}${pre ? `-${pre}` : ''}`)!;
  if (op === '~') {
    const lo = parsed(ma, mi ?? 0, pa ?? 0, mi !== null && pa !== null ? preStr : '');
    const hi = mi === null ? parsed(ma + 1, 0, 0) : parsed(ma, mi + 1, 0);
    return [{ op: '>=', ver: lo }, { op: '<', ver: hi }];
  }
  if (op === '^') {
    const lo = parsed(ma, mi ?? 0, pa ?? 0, mi !== null && pa !== null ? preStr : '');
    let hi: ParsedSemver;
    if (ma > 0 || mi === null) hi = parsed(ma + 1, 0, 0);
    else if (mi > 0 || pa === null) hi = parsed(0, mi + 1, 0);
    else hi = parsed(0, 0, pa + 1);
    return [{ op: '>=', ver: lo }, { op: '<', ver: hi }];
  }
  if (mi === null || pa === null) {
    const lo = parsed(ma, mi ?? 0, 0);
    const hi = mi === null ? parsed(ma + 1, 0, 0) : parsed(ma, mi + 1, 0);
    if (!op || op === '=') return [{ op: '>=', ver: lo }, { op: '<', ver: hi }];
    if (op === '>') return [{ op: '>=', ver: hi }];
    if (op === '<=') return [{ op: '<', ver: hi }];
    return [{ op: op as '<' | '>=', ver: lo }];
  }
  const exact = parsed(ma, mi, pa, preStr);
  return [{ op: (op || '=') as Comparator['op'], ver: exact }];
}

function testComparators(v: ParsedSemver, comps: Comparator[]): boolean {
  for (const c of comps) {
    const cmp = compareParsed(v, c.ver);
    if (c.op === '=' && cmp !== 0) return false;
    if (c.op === '>' && cmp <= 0) return false;
    if (c.op === '>=' && cmp < 0) return false;
    if (c.op === '<' && cmp >= 0) return false;
    if (c.op === '<=' && cmp > 0) return false;
  }
  if (v.pre.length > 0) {
    const allowed = comps.some(c => c.ver.pre.length > 0
      && c.ver.major === v.major && c.ver.minor === v.minor && c.ver.patch === v.patch);
    if (!allowed) return false;
  }
  return true;
}

export function satisfiesRange(version: string, range: string): boolean {
  const v = parseSemver(version);
  if (!v || typeof range !== 'string') return false;
  for (const clause of range.split('||')) {
    const trimmed = clause.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const comps: Comparator[] = [];
    let validClause = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i + 1] === '-' && parts[i + 2]) {
        const lo = expandToken(`>=${parts[i]}`), hi = expandToken(`<=${parts[i + 2]}`);
        if (!lo || !hi) { validClause = false; break; }
        comps.push(...lo, ...hi);
        i += 2;
      } else {
        const expanded = expandToken(parts[i]!);
        if (!expanded) { validClause = false; break; }
        comps.push(...expanded);
      }
    }
    if (validClause && comps.length && testComparators(v, comps)) return true;
  }
  return false;
}
