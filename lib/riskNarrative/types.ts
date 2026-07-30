// Shared vocabulary and the deterministic selector used by all three metric
// catalogs (Fear & Greed, VIX, VIXEQ − VIX).
//
// Selection is a pure function of the computed stats: no randomness, no clock,
// no model call. Given identical inputs it always returns the identical entry,
// so a page render never has to do anything but look one up.

import type { SeriesStats } from "@/lib/riskStats";

export type TrendBucket = "sharpDown" | "down" | "flat" | "up" | "sharpUp";

/** change21d in trailing-year standard deviations, bucketed. */
export function classifyTrend(stats: SeriesStats): TrendBucket {
  const t = stats.trendStrength;
  if (t <= -1) return "sharpDown";
  if (t <= -0.35) return "down";
  if (t < 0.35) return "flat";
  if (t < 1) return "up";
  return "sharpUp";
}

/** Percentile-rank bands, used for VIX and the spread. */
export type PercentileLevel = "veryLow" | "low" | "normal" | "elevated" | "high" | "extreme";

/**
 * Level is keyed off percentile rank within the full history rather than
 * absolute values. The VIXEQ − VIX spread makes the case for this: its
 * all-time mean is 13.3 with a 34.1 maximum, so any absolute threshold picked
 * by intuition would misclassify most of the distribution.
 */
export function classifyPercentileLevel(pctRank: number): PercentileLevel {
  if (pctRank < 10) return "veryLow";
  if (pctRank < 30) return "low";
  if (pctRank < 70) return "normal";
  if (pctRank < 90) return "elevated";
  if (pctRank < 98) return "high";
  return "extreme";
}

/** Pre-formatted strings, so entry templates stay readable prose. */
export interface Vocab {
  cur: string;
  prev: string;
  day: string;
  dayAbs: string;
  dayWord: string;

  fullMean: string;
  fullMedian: string;
  fullSd: string;
  fullMin: string;
  fullMax: string;
  fullP05: string;
  fullP25: string;
  fullP75: string;
  fullP95: string;

  yrMean: string;
  yrMedian: string;
  yrSd: string;
  yrMin: string;
  yrMax: string;

  pctFull: string;
  pctYr: string;
  zFullAbs: string;
  zYrAbs: string;

  chg5: string;
  chg21: string;
  chg63: string;
  chg5Abs: string;
  chg21Abs: string;
  chg63Abs: string;
  dir21: string;

  /** Calendar year the series begins, e.g. "1990". */
  sinceYear: string;
  yearsCovered: string;
  streakAbs: string;
  obsFull: string;
}

function num(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function signed(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
}

function abs(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return Math.abs(v).toFixed(digits);
}

/** 1 -> "1st", 12 -> "12th", 63 -> "63rd". Clamped to 1–99 for readability. */
export function ordinal(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const n = Math.max(1, Math.min(99, Math.round(pct)));
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function buildVocab(stats: SeriesStats, digits = 2): Vocab {
  return {
    cur: num(stats.current, digits),
    prev: num(stats.previous, digits),
    day: signed(stats.dayChange, digits),
    dayAbs: abs(stats.dayChange, digits),
    dayWord: (stats.dayChange ?? 0) >= 0 ? "up" : "down",

    fullMean: num(stats.full.mean, digits),
    fullMedian: num(stats.full.median, digits),
    fullSd: num(stats.full.sd, digits),
    fullMin: num(stats.full.min, digits),
    fullMax: num(stats.full.max, digits),
    fullP05: num(stats.full.p05, digits),
    fullP25: num(stats.full.p25, digits),
    fullP75: num(stats.full.p75, digits),
    fullP95: num(stats.full.p95, digits),

    yrMean: num(stats.year.mean, digits),
    yrMedian: num(stats.year.median, digits),
    yrSd: num(stats.year.sd, digits),
    yrMin: num(stats.year.min, digits),
    yrMax: num(stats.year.max, digits),

    pctFull: ordinal(stats.pctRankFull),
    pctYr: ordinal(stats.pctRankYear),
    zFullAbs: abs(stats.zFull, 1),
    zYrAbs: abs(stats.zYear, 1),

    chg5: signed(stats.change5d, digits),
    chg21: signed(stats.change21d, digits),
    chg63: signed(stats.change63d, digits),
    chg5Abs: abs(stats.change5d, digits),
    chg21Abs: abs(stats.change21d, digits),
    chg63Abs: abs(stats.change63d, digits),
    dir21: (stats.change21d ?? 0) >= 0 ? "higher" : "lower",

    sinceYear: stats.firstDate.slice(0, 4),
    yearsCovered: Math.floor(stats.yearsCovered).toString(),
    streakAbs: Math.abs(stats.streak).toString(),
    obsFull: stats.full.n.toLocaleString("en-US"),
  };
}

export interface BaseContext {
  stats: SeriesStats;
  trend: TrendBucket;
  v: Vocab;
}

export interface NarrativeEntry<C extends BaseContext> {
  /** Stable id — used by the verification script and as a React key. */
  id: string;
  /**
   * Higher wins. 0 is reserved for the exhaustive level×trend base grid, which
   * guarantees every possible input matches something.
   */
  priority: number;
  when: (c: C) => boolean;
  text: (c: C) => string;
}

export interface Interpretation {
  id: string;
  text: string;
}

/**
 * Highest-priority matching entry, ties broken by catalog order. Catalogs must
 * include an exhaustive priority-0 layer; if somehow nothing matches we return
 * null and the UI omits the paragraph rather than inventing one.
 */
export function selectNarrative<C extends BaseContext>(
  catalog: NarrativeEntry<C>[],
  ctx: C,
): Interpretation | null {
  let best: NarrativeEntry<C> | null = null;
  for (const entry of catalog) {
    if (!entry.when(ctx)) continue;
    if (best === null || entry.priority > best.priority) best = entry;
  }
  return best === null ? null : { id: best.id, text: best.text(ctx) };
}
