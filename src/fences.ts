type Marker = '' | '`' | '~';

function nextLineBreak(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 10 || code === 13) return i;
  }
  return -1;
}

/** Streaming fenced-code filter with bounded state, scanning line slices instead of per-char callbacks. */
export class FenceFilter {
  private fence: Marker = '';
  private fenceLength = 0;
  private phase: 'indent' | 'run' | 'info' | 'tail' | 'body' = 'indent';
  private prefix = '';
  private marker: Marker = '';
  private runLength = 0;
  private skipLF = false;
  private limited = false;
  constructor(private readonly onLimit: () => void = () => {}) {}

  private append(chunk: string): boolean {
    if (this.prefix.length + chunk.length > 65536) {
      this.prefix = ''; this.limited = true; this.onLimit(); return false;
    }
    this.prefix += chunk;
    return true;
  }

  private resetLine(): void {
    this.phase = 'indent'; this.prefix = ''; this.marker = ''; this.runLength = 0;
  }

  /** Returning false from emit abandons parsing; discard this filter afterward. */
  push(text: string, emit: (text: string) => boolean | void, boundary: () => boolean | void): void {
    if (this.limited) return;
    let i = 0;
    while (i < text.length) {
      if (this.skipLF) {
        this.skipLF = false;
        if (text.charCodeAt(i) === 10) { i++; continue; }
      }
      if (this.phase === 'body') {
        const nl = nextLineBreak(text, i);
        if (nl < 0) {
          if (!this.fence && emit(text.slice(i)) === false) return;
          return;
        }
        const isCR = text.charCodeAt(nl) === 13;
        if (this.fence) {
          if (isCR) this.skipLF = true;
          this.resetLine();
          i = nl + 1;
          continue;
        }
        const end = isCR && nl + 1 < text.length && text.charCodeAt(nl + 1) === 10 ? nl + 2 : nl + 1;
        if (emit(text.slice(i, end)) === false) return;
        this.resetLine();
        i = end;
        continue;
      }

      if (this.phase === 'info') {
        const nl = nextLineBreak(text, i);
        const tick = this.marker === '`' ? text.indexOf('`', i) : -1;
        if (tick >= 0 && (nl < 0 || tick < nl)) {
          const piece = text.slice(i, tick + 1);
          const out = this.prefix + piece;
          this.prefix = '';
          this.phase = 'body';
          i = tick + 1;
          const bodyNl = nextLineBreak(text, i);
          if (bodyNl < 0) {
            if (emit(out + text.slice(i)) === false) return;
            return;
          }
          const isCR = text.charCodeAt(bodyNl) === 13;
          const end = isCR && bodyNl + 1 < text.length && text.charCodeAt(bodyNl + 1) === 10 ? bodyNl + 2 : bodyNl + 1;
          if (emit(out + text.slice(i, end)) === false) return;
          this.resetLine();
          i = end;
          continue;
        }
        const end = nl < 0 ? text.length : nl;
        if (end > i && !this.append(text.slice(i, end))) return;
        if (nl < 0) return;
        i = nl;
      }

      const ch = text[i++]!;
      if (ch === '\n' || ch === '\r') {
        if (!this.fence) {
          if ((this.phase === 'run' && this.runLength >= 3) || this.phase === 'info') {
            this.fence = this.marker; this.fenceLength = this.runLength;
            this.skipLF = ch === '\r';
            if (boundary() === false) return;
          } else if (this.phase === 'indent' || (this.phase === 'run' && this.runLength < 3)) {
            if (emit(this.prefix + ch) === false) return;
          }
        } else if (this.marker === this.fence && this.runLength >= this.fenceLength && (this.phase === 'run' || this.phase === 'tail')) {
          this.fence = ''; this.fenceLength = 0;
          this.skipLF = ch === '\r';
          if (boundary() === false) return;
        } else if (ch === '\r') {
          this.skipLF = true;
        }
        this.resetLine();
        continue;
      }

      if (this.phase === 'indent') {
        if (ch === ' ' && this.prefix.length < 3) { this.prefix += ch; continue; }
        if ((ch === '`' || ch === '~') && (!this.fence || ch === this.fence)) {
          this.marker = ch; this.runLength = 1; this.phase = 'run';
          if (!this.fence) this.prefix += ch;
          continue;
        }
        this.phase = 'body';
        const out = this.fence ? '' : this.prefix + ch;
        this.prefix = '';
        if (!this.fence) {
          const nl = nextLineBreak(text, i);
          if (nl < 0) {
            if (emit(out + text.slice(i)) === false) return;
            return;
          }
          const isCR = text.charCodeAt(nl) === 13;
          const end = isCR && nl + 1 < text.length && text.charCodeAt(nl + 1) === 10 ? nl + 2 : nl + 1;
          if (emit(out + text.slice(i, end)) === false) return;
          this.resetLine();
          i = end;
        }
      } else if (this.phase === 'run') {
        if (ch === this.marker) {
          this.runLength++;
          if (!this.fence && !this.append(ch)) return;
        } else if (this.fence) {
          this.phase = this.runLength >= this.fenceLength && (ch === ' ' || ch === '\t') ? 'tail' : 'body';
        } else if (this.runLength >= 3) {
          this.phase = 'info';
          if (!this.append(ch)) return;
        } else {
          this.phase = 'body';
          const out = this.prefix + ch;
          this.prefix = '';
          const nl = nextLineBreak(text, i);
          if (nl < 0) {
            if (emit(out + text.slice(i)) === false) return;
            return;
          }
          const isCR = text.charCodeAt(nl) === 13;
          const end = isCR && nl + 1 < text.length && text.charCodeAt(nl + 1) === 10 ? nl + 2 : nl + 1;
          if (emit(out + text.slice(i, end)) === false) return;
          this.resetLine();
          i = end;
        }
      } else if (this.phase === 'tail') {
        if (ch !== ' ' && ch !== '\t') this.phase = 'body';
      }
    }
  }

  finish(emit: (text: string) => void): void {
    if (!this.limited && !this.fence && (this.phase === 'indent' || (this.phase === 'run' && this.runLength < 3))) emit(this.prefix);
    this.prefix = '';
  }
}
