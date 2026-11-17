import type { Settings } from './config.js';
import { RepeatDetector, type RepeatEvidence } from './detection.js';
import type { Chunk } from './types.js';
import { FenceFilter } from './fences.js';

interface BlockState {
  type: string;
  interval: number;
  detector: RepeatDetector | undefined;
  filter: FenceFilter | undefined;
  closed: boolean;
  seen: boolean;
}

const STREAM_CHUNKS = new Set(['block-start', 'reasoning-delta', 'text-delta', 'block-end']);

/** One instance per model attempt. Provider chunks are never modified. */
export class StreamMonitor {
  private blocks = new Map<number, BlockState>();
  private reported = new Set<string>();
  private reasoningChars = 0;
  private textChars = 0;
  private analyzedChars = 0;
  private checks = 0;
  private closed = new Set<number>();
  private incomplete = false;
  private monitorError = false;
  private fenceLimit = false;
  private lastOutputAt: string | null = null;
  private lastCheckAt: string | null = null;
  private evidence: (RepeatEvidence & { contentType: 'reasoning' | 'text' }) | null = null;
  private reasoningTail = '';
  private reasoningFlushed = false;
  constructor(
    private readonly config: Settings,
    private readonly report: (e: RepeatEvidence & { contentType: 'reasoning' | 'text' }) => void,
    private readonly onReasoningComplete?: (reasoningText: string) => void,
  ) {}

  snapshot() {
    return {
      reasoningChars: this.reasoningChars, textChars: this.textChars, analyzedChars: this.analyzedChars, checks: this.checks,
      lastOutputAt: this.lastOutputAt, lastCheckAt: this.lastCheckAt,
      incomplete: this.incomplete,
      incompleteReason: this.monitorError ? 'monitor-error' as const : this.fenceLimit ? 'fence-limit' as const : this.incomplete ? 'capacity' as const : null,
      risk: this.reported.size ? 'confirmed' as const : this.evidence && this.evidence.score >= 70 ? 'suspected' as const : this.incomplete ? 'incomplete' as const : this.checks ? 'clear' as const : 'collecting' as const,
      evidence: this.evidence ? { ...this.evidence } : null,
    };
  }

  invalidate(): void { this.incomplete = true; this.monitorError = true; this.reasoningTail = ''; }

  private flushReasoning(): void {
    const sample = this.reasoningTail;
    this.reasoningTail = '';
    if (this.reasoningFlushed || !sample) return;
    this.reasoningFlushed = true;
    if (!this.reported.has('reasoning') && !this.monitorError) this.onReasoningComplete?.(sample);
  }

  private addOutput(type: string | undefined, length: number): void {
    if (!length || (type !== 'reasoning' && type !== 'text')) return;
    if (type === 'reasoning') this.reasoningChars += length;
    else this.textChars += length;
    this.lastOutputAt = new Date().toISOString();
  }

  push(chunk: Chunk): void {
    if (chunk.type === 'finish') {
      this.flushReasoning();
      this.blocks.clear();
      return;
    }
    if (!Number.isSafeInteger(chunk.index) || !STREAM_CHUNKS.has(chunk.type)) return;
    const index = chunk.index!;
    if (this.closed.has(index)) return;

    let block = this.blocks.get(index);
    const type = block?.type ?? chunk.blockType ?? chunk.block?.type ?? (chunk.type === 'reasoning-delta' ? 'reasoning' : 'text');
    if (!block) {
      if (this.blocks.size >= 32 || this.incomplete) {
        this.incomplete = true;
        return;
      }
      const active = !this.monitorError && !this.fenceLimit && !this.reported.has(type);
      block = {
        type,
        interval: type === 'reasoning' ? Math.min(128, this.config.checkEveryChars) : this.config.checkEveryChars,
        detector: active ? new RepeatDetector(this.config, type === 'reasoning') : undefined,
        filter: active ? new FenceFilter(() => { this.fenceLimit = true; this.incomplete = true; }) : undefined,
        closed: false,
        seen: false,
      };
      this.blocks.set(index, block);
    }

    if (block.closed) return;

    if (chunk.type === 'block-end') {
      if (this.closed.size < 65536) this.closed.add(index); else this.incomplete = true;
      const bodyType = chunk.block?.type;
      const body = !block.seen && typeof chunk.block?.text === 'string' ? chunk.block.text : '';
      this.addOutput(bodyType, body.length);
      block.closed = true;
      this.blocks.delete(index);

      if (this.monitorError || this.fenceLimit) return;
      if (body && (bodyType === 'text' || bodyType === 'reasoning') && block.filter && block.detector && !this.reported.has(block.type)) {
        if (block.type === 'reasoning' && this.onReasoningComplete) this.reasoningTail = (this.reasoningTail + body).slice(-4096);
        this.feed(block, body);
      }
      if (!this.reported.has(block.type) && block.filter) block.filter.finish(text => this.inspect(block!, text));
      if (block.type === 'reasoning') this.flushReasoning();
      return;
    }

    if (typeof chunk.text !== 'string' || (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta')) return;
    const deltaType = chunk.type === 'reasoning-delta' ? 'reasoning' : 'text';
    const text = chunk.text;
    if (text.length > 0) block.seen = true;
    this.addOutput(deltaType, text.length);

    if (this.monitorError || this.fenceLimit || this.reported.has(block.type) || !block.filter || !block.detector) return;
    if (block.type === 'reasoning' && this.onReasoningComplete && text.length > 0) {
      this.reasoningTail = (this.reasoningTail + text).slice(-4096);
    }
    this.feed(block, text);
  }

  private feed(block: BlockState, text: string): void {
    if (!block.filter) return;
    let plain = '';
    const flush = () => {
      if (plain && !this.fenceLimit) this.inspect(block, plain);
      plain = '';
      return !this.reported.has(block.type) && !this.fenceLimit;
    };
    block.filter.push(text, segment => {
      plain += segment;
      if (plain.length >= block.interval) return flush();
    }, flush);
    flush();
  }

  private inspect(block: BlockState, text: string): void {
    const detector = block.detector;
    if (!detector) return;
    for (let offset = 0; !this.reported.has(block.type) && offset < text.length; offset += block.interval) {
      const before = detector.stats(), part = text.slice(offset, offset + block.interval);
      const result = detector.push(part), after = detector.stats();
      this.analyzedChars += part.length;
      if (after.checks > before.checks) {
        this.checks += after.checks - before.checks; this.lastCheckAt = new Date().toISOString();
        if (!this.evidence?.confirmed || result?.confirmed) this.evidence = result ? { ...result, contentType: block.type === 'reasoning' ? 'reasoning' : 'text' } : null;
      }
      if (result && !this.reported.has(block.type)) {
        if (result.confirmed) {
          this.reported.add(block.type);
          // Release detector/filter state while keeping the BlockState entry for trailing output counts.
          for (const state of this.blocks.values()) {
            if (state.type === block.type) { state.detector = undefined; state.filter = undefined; }
          }
        }
        this.report({ ...result, contentType: block.type === 'reasoning' ? 'reasoning' : 'text' });
      }
    }
  }
}
