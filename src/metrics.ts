import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PROFILE_DIR, readProfileJsonSync, writeProfileFile } from './profile-file.js';
import type { Notice } from './types.js';

export interface DiagnosticEvent extends Notice { time: string }
export const sessionKey = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 16);

export interface SessionSummary {
  monitoredRequests: number; confirmed: number; toolWarnings: number; recoverySubmitted: number; cancelRequested: number;
  lastMonitoredAt: string | null; turn: number; step: number; toolResults: number; lastToolAt: string | null;
}
const numberFields = ['monitoredRequests', 'confirmed', 'toolWarnings', 'recoverySubmitted', 'cancelRequested', 'turn', 'step', 'toolResults'] as const;
const kinds = ['stream-repeat', 'tool-repeat', 'test-repeat', 'recovery', 'compatibility', 'internal-error'] as const;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value);
function summary(value: unknown): SessionSummary | undefined {
  if (!object(value) || !numberFields.every(key => count(value[key])) || ![value.lastMonitoredAt, value.lastToolAt].every(time => time === null || timestamp(time))) return;
  return Object.fromEntries([...numberFields.map(key => [key, value[key]]), ['lastMonitoredAt', value.lastMonitoredAt], ['lastToolAt', value.lastToolAt]]) as unknown as SessionSummary;
}
function diagnostic(value: unknown): DiagnosticEvent | undefined {
  if (!object(value) || !timestamp(value.time) || !kinds.includes(value.kind as typeof kinds[number]) || !(value.session === '' || hash(value.session))
    || typeof value.confirmed !== 'boolean' || !count(value.chars) || typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > 100) return;
  const event: DiagnosticEvent = { time: value.time, kind: value.kind as Notice['kind'], session: value.session as string, score: value.score, confirmed: value.confirmed, chars: value.chars };
  for (const key of ['period', 'repeats', 'turn', 'step'] as const) if (count(value[key])) event[key] = value[key];
  for (const key of ['coverage', 'novelty'] as const) if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1) event[key] = value[key];
  if (typeof value.action === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value.action)) event.action = value.action;
  if (value.contentType === 'reasoning' || value.contentType === 'text') event.contentType = value.contentType;
  if (value.method === 'periodic' || value.method === 'phrase') event.method = value.method;
  if (value.uncertainty === 'changing-units' || value.uncertainty === 'changing-numbered-units') event.uncertainty = value.uncertainty;
  return event;
}

export class MetricsStore {
  readonly counts: Record<string, number> = Object.create(null);
  private pending: DiagnosticEvent[] = [];
  private recent: DiagnosticEvent[] = [];
  // UI navigation references stay in memory, never in snapshot/export/disk.
  private references = new Map<string, string>();
  sessionReferences() { return [...this.references].map(([sessionKey, sessionId]) => ({ sessionKey, sessionId })); }
  private confirmed = 0;
  private recoverySubmitted = 0;
  private draining: Promise<void> | undefined;
  private closed = false;
  private failed = false;
  private enabled: boolean;
  private readonly directory: string;
  private readonly settingsFile: string | undefined;
  private readonly sessionLimit: number;
  private summaries = new Map<string, SessionSummary>();
  private totals = { monitoredRequests: 0, finishedRequests: 0, lastMonitoredAt: null as string | null };
  private restored = 0;
  private restoreError = false;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | undefined;
  private settingsSaving: Promise<unknown> = Promise.resolve();
  constructor(directory: string, private readonly maxBytes: number, private readonly warn: () => void, options: { profileDirectory?: string; sessionLimit?: number } = {}) {
    this.directory = directory || (options.profileDirectory ? join(options.profileDirectory, PROFILE_DIR, 'logs') : '');
    this.enabled = Boolean(directory);
    this.sessionLimit = Math.min(1024, Math.max(1, options.sessionLimit ?? 128));
    if (options.profileDirectory) {
      this.settingsFile = join(options.profileDirectory, PROFILE_DIR, 'logging.json');
      try {
        const saved = readProfileJsonSync(options.profileDirectory, 4096, 'logging.json');
        if (object(saved) && typeof saved.enabled === 'boolean' && Object.keys(saved).length === 1) this.enabled = saved.enabled;
      } catch { this.restoreError = true; }
    }
    if (this.directory) this.restore();
  }
  loggingSettings() {
    return { ...this.snapshot().logging, available: Boolean(this.directory), persistent: Boolean(this.settingsFile), directory: this.directory, sessionLimit: this.sessionLimit };
  }
  setEnabled(enabled: boolean): Promise<ReturnType<MetricsStore['loggingSettings']>> {
    if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('expected enabled boolean'));
    const operation = this.settingsSaving.catch(() => {}).then(async () => {
      if (this.closed || !this.directory) throw new Error('logging unavailable');
      // A failed settings write must leave the current choice intact.
      if (this.settingsFile) await writeProfileFile(this.settingsFile, JSON.stringify({ enabled }) + '\n');
      this.enabled = enabled;
      if (enabled) { this.failed = false; this.changed(); await this.flush(); }
      else { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.pending.length = 0; await this.draining; await this.saving; }
      return this.loggingSettings();
    });
    this.settingsSaving = operation;
    return operation;
  }
  requestStarted(time: string) { this.totals.monitoredRequests++; this.totals.lastMonitoredAt = time; this.changed(); }
  requestFinished() { this.totals.finishedRequests++; this.changed(); }
  requestTotals() { return { ...this.totals }; }
  remember(sessionId: string, value: SessionSummary) {
    const key = sessionKey(sessionId), safe = summary(value);
    if (!safe) return;
    this.references.set(key, sessionId);
    this.summaries.delete(key); this.summaries.set(key, safe);
    if (this.summaries.size > this.sessionLimit) {
      const oldest = this.summaries.keys().next().value!;
      this.summaries.delete(oldest);
      if (!this.recent.some(event => event.session === oldest)) this.references.delete(oldest);
    }
    this.changed();
  }
  sessionSummary(key: string) { const value = this.summaries.get(key); return value ? { ...value } : undefined; }
  sessionKeys() { return [...new Set([...this.summaries.keys(), ...this.recent.map(event => event.session).filter(Boolean)])]; }
  private changed() {
    this.dirty = true;
    if (this.closed || !this.enabled || this.failed || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, 250);
    this.timer.unref?.();
  }
  private async flush(): Promise<void> {
    if (this.saving) { await this.saving; if (this.dirty && this.enabled && !this.failed) return this.flush(); return; }
    if (!this.dirty || !this.enabled || this.failed) return;
    this.dirty = false;
    const content = JSON.stringify({ schemaVersion: 1, totals: this.totals, counts: this.counts, confirmed: this.confirmed,
      recoverySubmitted: this.recoverySubmitted, events: this.recent, sessions: [...this.summaries].map(([key, value]) => ({ key, ...value })) }) + '\n';
    this.saving = writeProfileFile(join(this.directory, 'history.json'), content).catch(() => { this.ioFailed(); });
    await this.saving; this.saving = undefined;
    if (this.dirty && this.enabled && !this.failed) await this.flush();
  }
  private ioFailed() { if (!this.failed) { this.failed = true; this.warn(); } this.pending.length = 0; }
  private restore() {
    const read = (name: string, limit: number) => {
      const file = join(this.directory, name);
      try { if (statSync(file).size > limit) throw new Error('oversized history'); return readFileSync(file, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    };
    try {
      const text = read('history.json', 2_097_152);
      if (text !== undefined) {
        const data: unknown = JSON.parse(text);
        if (!object(data) || data.schemaVersion !== 1 || !object(data.totals) || !count(data.totals.monitoredRequests) || !count(data.totals.finishedRequests)
          || !(data.totals.lastMonitoredAt === null || timestamp(data.totals.lastMonitoredAt)) || !count(data.confirmed) || !count(data.recoverySubmitted)
          || !object(data.counts) || !Array.isArray(data.events) || data.events.length > 100 || !Array.isArray(data.sessions) || data.sessions.length > 1024) throw new Error('invalid history');
        this.totals = { monitoredRequests: data.totals.monitoredRequests, finishedRequests: data.totals.finishedRequests, lastMonitoredAt: data.totals.lastMonitoredAt };
        this.confirmed = data.confirmed; this.recoverySubmitted = data.recoverySubmitted;
        for (const kind of [...kinds, 'dropped']) if (count(data.counts[kind])) this.counts[kind] = data.counts[kind];
        this.recent = data.events.map(diagnostic).filter((item): item is DiagnosticEvent => !!item);
        if (this.recent.length !== data.events.length) this.restoreError = true;
        for (const item of data.sessions.slice(-this.sessionLimit)) {
          const safe = summary(item); if (object(item) && hash(item.key) && safe) this.summaries.set(item.key, safe);
          else this.restoreError = true;
        }
        this.restored = this.summaries.size || this.recent.filter(event => event.session).length;
        return;
      }
    } catch { this.restoreError = true; }
    // Older versions wrote JSONL only. Recover complete, redacted lines without rehashing identifiers.
    for (const name of ['events.previous.jsonl', 'events.jsonl']) {
      try {
        for (const line of (read(name, this.maxBytes) ?? '').split('\n')) {
          if (!line.trim()) continue;
          try { const event = diagnostic(JSON.parse(line)); if (event) { this.recent.push(event); if (this.recent.length > 100) this.recent.shift(); } else this.restoreError = true; }
          catch { this.restoreError = true; }
        }
      } catch { this.restoreError = true; }
    }
    for (const event of this.recent) {
      this.counts[event.kind] = (this.counts[event.kind] ?? 0) + 1;
      if (event.kind === 'stream-repeat' && event.confirmed) this.confirmed++;
      if (event.kind === 'recovery' && event.action === 'recovery-submitted') this.recoverySubmitted++;
    }
    this.restored = this.recent.filter(event => event.session).length;
  }
  record(event: Notice): DiagnosticEvent | undefined {
    if (this.closed) return;
    this.counts[event.kind] = (this.counts[event.kind] ?? 0) + 1;
    if (event.kind === 'stream-repeat' && event.confirmed) this.confirmed++;
    if (event.kind === 'recovery' && event.action === 'recovery-submitted') this.recoverySubmitted++;
    // Keep the same redacted, bounded records for the UI and disk. Never copy
    // arbitrary properties from a caller into diagnostics.
    const safe: DiagnosticEvent = {
      time: new Date().toISOString(), kind: event.kind,
      session: event.session ? sessionKey(event.session) : '',
      score: event.score, confirmed: event.confirmed, chars: event.chars,
      ...(event.period === undefined ? {} : { period: event.period }),
      ...(event.repeats === undefined ? {} : { repeats: event.repeats }),
      ...(event.action === undefined ? {} : { action: event.action }),
      ...(event.contentType === undefined ? {} : { contentType: event.contentType }),
      ...(event.turn === undefined ? {} : { turn: event.turn }),
      ...(event.step === undefined ? {} : { step: event.step }),
      ...(event.coverage === undefined ? {} : { coverage: event.coverage }),
      ...(event.novelty === undefined ? {} : { novelty: event.novelty }),
      ...(event.method === undefined ? {} : { method: event.method }),
      ...(event.uncertainty === undefined ? {} : { uncertainty: event.uncertainty }),
    };
    this.recent.push(safe);
    if (event.session) this.references.set(safe.session, event.session);
    if (this.recent.length > 100) {
      const removed = this.recent.shift()!;
      if (!this.summaries.has(removed.session) && !this.recent.some(item => item.session === removed.session)) this.references.delete(removed.session);
    }
    this.changed();
    if (!this.enabled || this.failed) return { ...safe };
    if (this.pending.length >= 128) { this.counts.dropped = (this.counts.dropped ?? 0) + 1; return { ...safe }; }
    // No raw content, argument, command, error text, or session id reaches disk.
    this.pending.push(safe);
    this.draining ??= this.drain();
    return { ...safe };
  }
  private async drain(): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      const file = join(this.directory, 'events.jsonl');
      let size = await stat(file).then(s => s.size, () => 0);
      while (this.enabled && this.pending.length) {
        const lines: string[] = [];
        let bytes = 0;
        while (this.pending.length && lines.length < 32) {
          const line = JSON.stringify(this.pending[0]) + '\n';
          const length = Buffer.byteLength(line);
          if (length > this.maxBytes) { this.pending.shift(); this.counts.dropped = (this.counts.dropped ?? 0) + 1; continue; }
          if (bytes + length > this.maxBytes) break;
          this.pending.shift(); lines.push(line); bytes += length;
        }
        if (!lines.length) continue;
        if (size + bytes > this.maxBytes) {
          await rename(file, join(this.directory, 'events.previous.jsonl')).catch(error => { if (error.code !== 'ENOENT') throw error; });
          size = 0;
        }
        const batch = lines.join('');
        await appendFile(file, batch, { encoding: 'utf8', mode: 0o600 });
        size += bytes;
      }
    } catch { this.ioFailed(); }
    finally { this.draining = undefined; }
  }
  snapshot() {
    return {
      confirmed: this.confirmed,
      recoverySubmitted: this.recoverySubmitted,
      events: this.recent.map(event => ({ ...event })).reverse(),
      logging: { enabled: this.enabled, healthy: !this.failed, retained: this.recent.length, limit: 100, restored: this.restored, restoreError: this.restoreError },
    };
  }
  forSession(sessionId: string): DiagnosticEvent[] {
    return this.forKey(sessionKey(sessionId));
  }
  forKey(key: string) { return this.recent.filter(event => event.session === key).map(event => ({ ...event })).reverse(); }
  async close(): Promise<void> {
    await this.settingsSaving.catch(() => {}); this.closed = true;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    await this.draining; await this.flush();
  }
}
