import type { Settings } from './config.js';

export interface RepeatEvidence { method?: 'periodic' | 'phrase'; uncertainty?: 'changing-numbered-units' | 'changing-units'; period: number; repeats: number; coverage: number; novelty: number; score: number; confirmed: boolean; chars: number }

const LETTER_RE = /\p{L}/u;
const LETTERS_RE = /\p{L}/gu;
const SINGLE_LETTER_RE = /^\p{L}$/u;
const NUMBER_RE = /\p{N}/u;
const ALNUM_RE = /[\p{L}\p{N}]/u;
const FENCE_LINE_RE = /^ {0,3}(?:`{3,}[^`\r\n]*|~{3,}[^\r\n]*)\r?$/m;

/** Repeated short units can alternate with changing remarks, defeating exact periods. */
export function phraseRepetition(text: string, minRepeats: number, maxUnitLength = 24) {
  // Keep decimals/thousands (1,000), paths, extensions, versions and timestamps (12:30) intact.
  const normalized = text.replace(/\.(?=\s|$)|(?<=\s)\/(?=\s)|(?<![0-9]),|,(?![0-9])|:(?=\s|$)/gu, '\n');
  const units = [...normalized.matchAll(/[^。！？!?;；，、：\n\r()（）]+/gu)].map(match => ({
    value: match[0].trim().toLowerCase(), start: match.index!,
  })).filter(unit => unit.value.length > 0);
  const counts = new Map<string, number>();
  for (const { value } of units) {
    if (value.length <= maxUnitLength && LETTER_RE.test(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const common = [...counts].filter(([, count]) => count >= minRepeats).sort((a, b) => b[1] * b[0].length - a[1] * a[0].length).slice(0, 4);
  const values = new Set(common.map(([value]) => value));
  const letters = new Set(common.map(([value]) => value).join('').match(LETTERS_RE));
  const singleLetter = letters.size === 1 && common.every(([value]) => SINGLE_LETTER_RE.test(value));
  if (!letters.size || (letters.size < 2 && !singleLetter)) return;
  const repeated = units.filter(unit => values.has(unit.value));
  const chars = units.reduce((sum, unit) => sum + unit.value.replace(/\s/gu, '').length, 0);
  const repeatedChars = repeated.reduce((sum, unit) => sum + unit.value.replace(/\s/gu, '').length, 0);
  const coverage = repeated.length / Math.max(units.length, 1);
  // Require the repeated units throughout the window, not a quotation in one corner.
  const minUnits = maxUnitLength > 24 ? Math.max(minRepeats, 12) : 24;
  const minPerThird = maxUnitLength > 24 ? 2 : 3;
  const distributed = [0, 1, 2].every(third => repeated.filter(unit => unit.start >= text.length * third / 3 && unit.start < text.length * (third + 1) / 3).length >= minPerThird);
  if (repeated.length < minUnits || repeatedChars < (maxUnitLength > 24 ? 240 : 80) || repeatedChars / Math.max(chars, 1) < 0.35 || coverage < 0.7 || !distributed) return;
  const numbered = units.filter(unit => !values.has(unit.value) && NUMBER_RE.test(unit.value));
  const distinctNumbered = new Set(numbered.map(unit => unit.value)).size;
  const highRepeatCharShare = repeatedChars / Math.max(chars, 1) >= 0.88;
  const changingNumberedUnits = !highRepeatCharShare && (distinctNumbered >= 3 && numbered.length / units.length >= 0.15
    || distinctNumbered >= 6 && numbered.length / units.length >= 0.1 && distinctNumbered / numbered.length >= 0.7);
  const changing = units.filter(unit => !values.has(unit.value) && ALNUM_RE.test(unit.value));
  const distinct = new Set(changing.map(unit => unit.value)).size;
  const changingUnits = !highRepeatCharShare && (distinct >= 3 && changing.length / units.length >= 0.15 && distinct / changing.length >= 0.5
    || distinct >= 6 && changing.length / units.length >= 0.1 && distinct / changing.length >= 0.7);
  return { period: 0, repeats: repeated.length, coverage, changingNumberedUnits, changingUnits, singleLetter };
}

/** Exact suffix periodicity plus window overlap. Scores are heuristics, not probabilities. */
export function periodicSuffix(text: string, minPeriod: number, maxPeriod: number, minRepeats: number) {
  let best = { period: 0, repeats: 0, coverage: 0 };
  const end = text.length, limit = Math.min(maxPeriod, Math.floor(end / minRepeats));
  if (limit < minPeriod) return best;
  let lastLetter = '', lastIndex = -1, distinctIndex = -1;
  for (const match of text.slice(end - limit).matchAll(LETTERS_RE)) {
    if (match[0] !== lastLetter) distinctIndex = lastIndex;
    lastLetter = match[0]; lastIndex = match.index;
  }
  if (distinctIndex < 0) return best;
  for (let period = Math.max(minPeriod, limit - distinctIndex); period <= limit; period++) {
    let matched = period;
    while (matched < end && text.charCodeAt(end - 1 - matched) === text.charCodeAt(end - 1 - matched + period)) matched++;
    const repeats = Math.floor(matched / period), coverage = matched / text.length;
    if (repeats >= minRepeats && coverage > best.coverage) best = { period, repeats, coverage };
    if (best.coverage === 1) break;
  }
  return best;
}
export function grams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 4 <= text.length; i++) set.add(text.slice(i, i + 4));
  return set;
}
export function codeLike(text: string): boolean {
  return FENCE_LINE_RE.test(text) || ((text.match(/[{};=<>]/g)?.length ?? 0) / Math.max(text.length, 1) > 0.08);
}
function canRunReasoningPhrase(tail: string, minPeriod: number, maxPeriod: number, minRepeats: number): boolean {
  if (!codeLike(tail)) return true;
  if (FENCE_LINE_RE.test(tail) || /[{}]/.test(tail)) return false;
  return periodicSuffix(tail, minPeriod, maxPeriod, minRepeats).coverage < 0.85;
}
function fnv1aHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
/** Detects identical/near-identical short reasoning blocks repeated across consecutive steps in one turn. */
export class StepLoopTracker {
  private lastGrams: Set<number> | null = null;
  private lastLength = 0;
  private streak = 0;
  clear(): void {
    this.lastGrams = null;
    this.lastLength = 0;
    this.streak = 0;
  }
  observe(reasoningText: string, minConsecutiveSteps = 3): RepeatEvidence | undefined {
    const normalized = reasoningText.replace(/\s+/gu, ' ').trim().toLowerCase();
    const compactLength = normalized.replace(/\s/gu, '').length;
    if (compactLength < 60 || codeLike(reasoningText)) {
      this.clear();
      return undefined;
    }
    const slice = normalized.slice(-2048);
    const nextGrams = new Set<number>();
    for (let i = 0; i + 4 <= slice.length; i++) nextGrams.add(fnv1aHash(slice.slice(i, i + 4)));
    if (nextGrams.size < 30) {
      this.clear();
      return undefined;
    }
    if (!this.lastGrams) {
      this.lastGrams = nextGrams;
      this.lastLength = slice.length;
      this.streak = 1;
      return undefined;
    }
    let intersection = 0;
    for (const hash of nextGrams) if (this.lastGrams.has(hash)) intersection++;
    const union = this.lastGrams.size + nextGrams.size - intersection;
    const similarity = union > 0 ? intersection / union : 0;
    const lengthRatio = Math.min(this.lastLength, slice.length) / Math.max(this.lastLength, slice.length, 1);
    this.lastGrams = nextGrams;
    this.lastLength = slice.length;
    if (similarity >= 0.88 && lengthRatio >= 0.85) {
      this.streak++;
    } else {
      this.streak = 1;
      return undefined;
    }
    const confirmed = this.streak >= minConsecutiveSteps;
    if (!confirmed && this.streak < 2) return undefined;
    return {
      method: 'phrase', period: 0, repeats: this.streak, coverage: similarity,
      novelty: 1 - similarity, score: confirmed ? 92 : 76, confirmed, chars: compactLength,
    };
  }
}

function gramNovelty(current: Set<string>, previous: Set<string>): number {
  if (!previous.size) return 1;
  let fresh = 0;
  for (const gram of current) if (!previous.has(gram)) fresh++;
  return fresh / Math.max(current.size, 1);
}

export class RepeatDetector {
  private buffer = '';
  private total = 0;
  private sinceCheck = 0;
  private previous = new Set<string>();
  private previousPhrase = new Set<string>();
  private consecutive = 0;
  private lastConfirmedPeriod = 0;
  private phraseConsecutive = 0;
  private checks = 0;
  private readonly minChars: number;
  private readonly checkEveryChars: number;
  stats() { return { chars: this.total, checks: this.checks }; }
  constructor(private readonly config: Settings, private readonly reasoning = false) {
    this.minChars = reasoning ? Math.min(512, config.minChars) : config.minChars;
    this.checkEveryChars = reasoning ? Math.min(128, config.checkEveryChars) : config.checkEveryChars;
  }
  push(text: string): RepeatEvidence | undefined {
    this.total += text.length;
    this.sinceCheck += text.length;
    this.buffer = (this.buffer + text).slice(-this.config.windowChars);
    if (this.total < this.minChars || this.sinceCheck < this.checkEveryChars) return;
    this.sinceCheck = 0;
    this.checks++;
    const tail1024 = this.buffer.slice(-1024);
    const current = grams(tail1024);
    const novelty = gramNovelty(current, this.previous);
    this.previous = current;

    let phraseNovelty = 1;
    if (this.reasoning) {
      const phraseGrams = grams(this.buffer.slice(-512));
      phraseNovelty = gramNovelty(phraseGrams, this.previousPhrase);
      this.previousPhrase = phraseGrams;
    }

    const repeat = this.total >= this.config.minChars ? periodicSuffix(this.buffer, this.config.minPeriod, this.config.maxPeriod, this.config.minRepeats) : { period: 0, repeats: 0, coverage: 0 };
    const fenced = FENCE_LINE_RE.test(this.buffer);
    const strong = repeat.coverage >= 0.85 && (!codeLike(this.buffer) || (this.reasoning && !fenced && repeat.coverage >= 0.9 && repeat.repeats >= 12));
    const compatiblePeriod = this.lastConfirmedPeriod === 0 || repeat.period % this.lastConfirmedPeriod === 0 || this.lastConfirmedPeriod % Math.max(repeat.period, 1) === 0;
    const stable = strong && novelty <= 0.15;
    this.consecutive = stable && compatiblePeriod ? this.consecutive + 1 : stable ? 1 : 0;
    this.lastConfirmedPeriod = stable ? repeat.period : 0;

    const tail512 = this.buffer.slice(-512);
    const phrase = this.reasoning && canRunReasoningPhrase(tail512, this.config.minPeriod, this.config.maxPeriod, this.config.minRepeats)
      ? phraseRepetition(tail512, this.config.minRepeats)
        ?? (this.total >= this.config.minChars && !strong && canRunReasoningPhrase(tail1024, this.config.minPeriod, this.config.maxPeriod, this.config.minRepeats)
          ? phraseRepetition(tail1024, this.config.minRepeats, 64)
          : undefined)
      : undefined;
    const uncertainty = phrase?.changingNumberedUnits ? 'changing-numbered-units' : phrase?.changingUnits ? 'changing-units' : undefined;
    const phraseStable = !!phrase && !uncertainty && phrase.coverage >= (phrase.singleLetter ? 0.9 : 0.75) && phraseNovelty <= (phrase.singleLetter ? 0.15 : 0.45);
    this.phraseConsecutive = phraseStable ? this.phraseConsecutive + 1 : 0;
    if (phrase && (uncertainty || !strong || this.phraseConsecutive >= this.config.confirmations)) return {
      period: phrase.period, repeats: phrase.repeats, coverage: phrase.coverage,
      method: 'phrase', ...(uncertainty ? { uncertainty } : {}), novelty: phraseNovelty, score: phraseStable ? 96 : 75,
      confirmed: this.phraseConsecutive >= this.config.confirmations, chars: this.total,
    };
    if (repeat.repeats === 0) return;
    const score = strong ? (novelty <= 0.15 ? 98 : 85) : Math.round(40 + 35 * repeat.coverage);
    return { ...repeat, method: 'periodic', novelty, score, confirmed: strong && novelty <= 0.15 && this.consecutive >= this.config.confirmations, chars: this.total };
  }
}
