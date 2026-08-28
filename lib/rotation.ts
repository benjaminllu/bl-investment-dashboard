/**
 * Sector rotation: what is leading, what is turning, and whether the market is
 * in a regime where that question has an answer worth acting on.
 *
 * The returns table in `lib/sectors.ts` answers "who is up". Everything here
 * answers the harder question underneath it — who is *changing*, relative to
 * whom, and how much of the movement is signal rather than the whole index
 * moving at once. All of it is price-derived. Nothing here uses share volume,
 * deliberately: raw volume on a sector ETF tracks creation/redemption mechanics
 * and index rebalancing far more than it tracks conviction, and the flows data
 * that would actually measure money moving between sectors is not free.
 *
 *
 * THE FOUR THINGS THIS FILE COMPUTES
 *
 * 1. RELATIVE STRENGTH AND ITS MOMENTUM (the RRG). A sector's price divided by
 *    the benchmark's, measured against its own six-month trend, then plotted
 *    against the rate of change of that measure. Four quadrants: leading,
 *    weakening, lagging, improving.
 *
 * 2. CROSS-SECTIONAL MOMENTUM. Rank the eleven by trailing relative return over
 *    several lookbacks and combine them. This is the mechanical version of the
 *    same idea — no picture, just an ordering — and it is what the momentum
 *    literature (Jegadeesh & Titman 1993, and the 12-1 convention Fama-French
 *    use for UMD) actually specifies.
 *
 * 3. REGIME. Dispersion, correlation, breadth. Rotation only means something
 *    when sectors are moving apart from each other; when everything moves with
 *    the index, ranking the sectors is ranking noise.
 *
 * 4. WHETHER ANY OF IT WORKED. See `computeEfficacy` — the same signals, scored
 *    against their own forward returns on the history we already downloaded.
 *
 *
 * CROSS-SECTIONAL NORMALISATION, AND WHY IT IS THE RIGHT CHOICE HERE
 *
 * Every score below is standardised across the group at each date rather than
 * against its own history. Two reasons, one practical and one structural.
 *
 * The practical one: the axes have to be comparable between eleven series
 * plotted on one chart. Normalising each sector against its own past would put
 * a placid utility fund and a semiconductor fund on the same scale despite
 * wildly different natural volatility, and the graph would mostly display that
 * difference.
 *
 * The structural one is what makes it honest rather than merely convenient: the
 * eleven Select Sector SPDRs partition the S&P 500. Their cap-weighted relative
 * return against SPY sums to roughly zero by construction, so "above the
 * cross-sectional mean" is a real statement about a closed system — one sector
 * can only lead because another is lagging. That is precisely the claim
 * rotation makes. The industry funds do not partition anything, so they are
 * normalised within their own group and never mixed into the sector cross
 * section; see the two-tier note in `lib/sectors.ts`.
 *
 * The cost of the choice, stated plainly: these are all *relative* readings. A
 * sector can sit in the leading quadrant through a bear market. Nothing on this
 * page says anything about direction — the returns table does that.
 */

import { alignBars, type Aligned, type Universe } from "./marketBars";
import { trimFloats } from "./precision";
import {
  BENCHMARK,
  SECTOR_DEFS,
  type SectorTier,
} from "./sectors";
import {
  crossSectionalZ,
  diff,
  mean,
  pearson,
  percentileRank,
  returns,
  sma,
  stdevSample,
  toMonthly,
  toWeekly,
} from "./series";

/* ------------------------------------------------------------------ *
 * Universe
 * ------------------------------------------------------------------ */

/**
 * Ratio pairs. Each is a spread that answers one question the sector grid
 * cannot, because the thing being measured cuts across sectors rather than
 * sitting inside one.
 *
 * `up` and `down` are written out per pair rather than derived, because the
 * direction is not always obvious from the tickers — HYG over IEF rising means
 * credit is being *bought*, which is risk-on, and that reads backwards to
 * anyone who thinks of high yield as the risky one.
 */
export interface PairDef {
  id: string;
  label: string;
  numerator: string;
  denominator: string;
  up: string;
  down: string;
}

export const PAIR_DEFS: PairDef[] = [
  {
    id: "size",
    label: "Small vs large",
    numerator: "IWM",
    denominator: "SPY",
    up: "Small caps leading",
    down: "Mega caps leading",
  },
  {
    id: "style",
    label: "Growth vs value",
    numerator: "IWF",
    denominator: "IWD",
    up: "Growth leading",
    down: "Value leading",
  },
  {
    id: "breadth",
    label: "Equal vs cap weight",
    numerator: "RSP",
    denominator: "SPY",
    up: "Gains broadening out",
    down: "Index carried by its largest names",
  },
  {
    id: "appetite",
    label: "Discretionary vs staples",
    numerator: "XLY",
    denominator: "XLP",
    up: "Risk appetite rising",
    down: "Rotating into defensives",
  },
  {
    id: "credit",
    label: "High yield vs treasuries",
    numerator: "HYG",
    denominator: "IEF",
    up: "Credit risk being bought",
    down: "Credit stress building",
  },
  {
    id: "semis",
    label: "Semis vs market",
    numerator: "SOXX",
    denominator: "SPY",
    up: "The cycle's usual leader is leading",
    down: "Semis rolling over",
  },
  {
    id: "momentum",
    label: "Momentum factor",
    numerator: "MTUM",
    denominator: "SPY",
    up: "Trends persisting — crowding building",
    down: "Momentum unwinding",
  },
  {
    id: "duration",
    label: "Long treasuries vs market",
    numerator: "TLT",
    denominator: "SPY",
    up: "Bid for duration — growth scare or cuts priced",
    down: "Equities preferred to bonds",
  },
];

const PAIR_TICKERS = Array.from(
  new Set(PAIR_DEFS.flatMap((p) => [p.numerator, p.denominator])),
);

/** Everything the page needs from Yahoo, in one list. */
export const ROTATION_UNIVERSE = Array.from(
  new Set([BENCHMARK, ...SECTOR_DEFS.map((d) => d.ticker), ...PAIR_TICKERS]),
);

const SECTOR_TICKERS = SECTOR_DEFS.filter((d) => d.tier === "sector").map((d) => d.ticker);
const INDUSTRY_TICKERS = SECTOR_DEFS.filter((d) => d.tier === "industry").map((d) => d.ticker);
const LABEL = Object.fromEntries(SECTOR_DEFS.map((d) => [d.ticker, d.label]));

/* ------------------------------------------------------------------ *
 * Relative Rotation Graph
 * ------------------------------------------------------------------ */

export type Quadrant = "leading" | "weakening" | "lagging" | "improving";

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  leading: "Leading",
  weakening: "Weakening",
  lagging: "Lagging",
  improving: "Improving",
};

export interface RrgPoint {
  /** Week-ending date of the observation. */
  date: string;
  /** RS-Ratio: relative strength against its own trend, in cross-sectional standard deviations. */
  x: number;
  /** RS-Momentum: the four-week change in that, in cross-sectional standard deviations. */
  y: number;
}

export interface RrgSeries {
  ticker: string;
  label: string;
  /** Oldest first; the last point is the current position. */
  tail: RrgPoint[];
  quadrant: Quadrant;
}

export interface RrgGroup {
  id: SectorTier;
  label: string;
  note: string;
  series: RrgSeries[];
  /** Week-ending dates covered by the longest available tail, oldest first. */
  dates: string[];
}

/**
 * RRG parameters, in weekly bars.
 *
 * The published JdK RS-Ratio / RS-Momentum formulas are proprietary — de
 * Kempenaer has never released them, and StockCharts does not document the
 * smoothing constants. What follows is a reconstruction of the documented
 * *behaviour*, not a copy of the original, and it will not agree with a
 * StockCharts RRG point for point. It is built from the two things the method
 * is publicly described as doing: measure relative strength against its own
 * trend, then plot that against its rate of change.
 *
 * The constants were chosen by measuring, not by taste. Against the eleven
 * SPDRs over the five years to 2026-08-21:
 *
 *   FAST=4, SLOW=26, MOMENTUM=4  →  mean angular step −0.126 rad/week
 *
 * Negative is clockwise, which is the rotation the method is famous for; that
 * rate implies a full circuit in roughly 50 weeks, in the right neighbourhood
 * for a sector cycle. Smoothing the momentum axis as well (a 3-week average)
 * cut the clockwise tendency to −0.092 rad/week and added three weeks of lag
 * for a barely visible reduction in jitter, so it is not applied.
 */
const RRG_FAST = 4;
const RRG_SLOW = 26;
const RRG_MOMENTUM = 4;

/** Weeks of tail the client can display. The graph defaults to the middle one. */
export const RRG_TAILS = [5, 10, 20] as const;
const MAX_TAIL = Math.max(...RRG_TAILS);

function quadrantOf(x: number, y: number): Quadrant {
  if (x >= 0) return y >= 0 ? "leading" : "weakening";
  return y >= 0 ? "improving" : "lagging";
}

function buildRrgGroup(
  id: SectorTier,
  label: string,
  note: string,
  tickers: string[],
  weeklyCloses: Record<string, number[]>,
  weeklyDates: string[],
  benchmark: number[],
): RrgGroup | null {
  const n = benchmark.length;
  if (n < RRG_SLOW + RRG_MOMENTUM + MAX_TAIL) return null;

  // Relative strength measured against its own trend. The fast average takes
  // the week-to-week noise out of the numerator; without it the ratio jitters
  // enough that the momentum axis is mostly measuring last week's close.
  const rel: Record<string, (number | null)[]> = {};
  const mom: Record<string, (number | null)[]> = {};
  for (const t of tickers) {
    const rs = weeklyCloses[t].map((c, i) => c / benchmark[i]);
    const fast = sma(rs, RRG_FAST);
    const slow = sma(rs, RRG_SLOW);
    const r = rs.map((_, i) =>
      fast[i] === null || slow[i] === null ? null : (fast[i] as number) / (slow[i] as number) - 1,
    );
    rel[t] = r;
    mom[t] = diff(r, RRG_MOMENTUM);
  }

  const points: Record<string, RrgPoint[]> = Object.fromEntries(tickers.map((t) => [t, []]));
  const dates: string[] = [];
  for (let i = n - MAX_TAIL; i < n; i++) {
    const zx = crossSectionalZ(Object.fromEntries(tickers.map((t) => [t, rel[t][i]])));
    const zy = crossSectionalZ(Object.fromEntries(tickers.map((t) => [t, mom[t][i]])));
    if (!zx || !zy) continue;
    dates.push(weeklyDates[i]);
    for (const t of tickers) {
      points[t].push({ date: weeklyDates[i], x: zx[t], y: zy[t] });
    }
  }
  if (dates.length === 0) return null;

  return {
    id,
    label,
    note,
    dates,
    series: tickers.map((t) => {
      const tail = points[t];
      const last = tail[tail.length - 1];
      return {
        ticker: t,
        label: LABEL[t] ?? t,
        tail,
        quadrant: quadrantOf(last.x, last.y),
      };
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Cross-sectional momentum
 * ------------------------------------------------------------------ */

/** Trading days. 21 to a month, 252 to a year — the usual approximations. */
const DAYS = { "1M": 21, "3M": 63, "6M": 126, "12M": 252 } as const;

export type Lookback = "1M" | "3M" | "6M" | "12-1M";
export const LOOKBACKS: Lookback[] = ["1M", "3M", "6M", "12-1M"];

/**
 * The lookbacks that feed the composite score.
 *
 * 1M is displayed but excluded. Short-horizon returns reverse rather than
 * persist — Jegadeesh (1990) is the standard citation, and it is why the
 * academic momentum definition skips the most recent month ("12-1"). Including
 * it here would put a reversal signal and three momentum signals into the same
 * average and net out part of both.
 */
const COMPOSITE_LOOKBACKS: Lookback[] = ["3M", "6M", "12-1M"];

export interface MomentumRow {
  ticker: string;
  label: string;
  tier: SectorTier;
  /** Total return over the lookback, percent. */
  absolute: Record<Lookback, number | null>;
  /** Total return minus the benchmark's, percentage points. */
  excess: Record<Lookback, number | null>;
  /** Mean of the cross-sectional z-scores of the composite lookbacks. */
  score: number | null;
  rank: number | null;
  /** Rank a month ago, on the same construction — the rotation actually in progress. */
  rankPrior: number | null;
  /** Percent above (or below) the ETF's own 50- and 200-day moving averages. */
  vs50: number | null;
  vs200: number | null;
  /** Weekly relative-strength line against the benchmark, last year, rebased to 100. */
  rsLine: number[];
  quadrant: Quadrant | null;
}

/** Relative return over `lag` trading days ending at `end`, as percentage points. */
function excessOver(
  own: number[],
  bench: number[],
  end: number,
  lag: number,
  skip = 0,
): number | null {
  const stop = end - skip;
  const start = stop - lag;
  if (start < 0 || stop < 0) return null;
  return ((own[stop] / own[start] - 1) - (bench[stop] / bench[start] - 1)) * 100;
}

function absoluteOver(own: number[], end: number, lag: number, skip = 0): number | null {
  const stop = end - skip;
  const start = stop - lag;
  if (start < 0 || stop < 0) return null;
  return (own[stop] / own[start] - 1) * 100;
}

function lookbackArgs(lb: Lookback): { lag: number; skip: number } {
  switch (lb) {
    case "1M":
      return { lag: DAYS["1M"], skip: 0 };
    case "3M":
      return { lag: DAYS["3M"], skip: 0 };
    case "6M":
      return { lag: DAYS["6M"], skip: 0 };
    case "12-1M":
      // A year of return, with the most recent month cut off both ends of the
      // window rather than merely shortened — the skip is the whole point.
      return { lag: DAYS["12M"] - DAYS["1M"], skip: DAYS["1M"] };
  }
}

/** Composite scores for one group at one index, keyed by ticker. Null when unavailable. */
function compositeScores(
  tickers: string[],
  closes: Record<string, number[]>,
  bench: number[],
  end: number,
): Record<string, number> | null {
  const zByLookback: Record<string, number>[] = [];
  for (const lb of COMPOSITE_LOOKBACKS) {
    const { lag, skip } = lookbackArgs(lb);
    const slice = Object.fromEntries(
      tickers.map((t) => [t, excessOver(closes[t], bench, end, lag, skip)]),
    );
    const z = crossSectionalZ(slice);
    if (!z) return null;
    zByLookback.push(z);
  }
  return Object.fromEntries(
    tickers.map((t) => [t, mean(zByLookback.map((z) => z[t]))]),
  );
}

function rankMap(scores: Record<string, number>): Record<string, number> {
  const order = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(order.map(([t], i) => [t, i + 1]));
}

/* ------------------------------------------------------------------ *
 * Regime
 * ------------------------------------------------------------------ */

export interface RegimeMetric {
  id: string;
  label: string;
  /** Formatted by the caller; the raw number so the client can format once. */
  value: number | null;
  unit: string;
  decimals: number;
  /** Where the current value sits in the whole aligned history, 0–100. */
  percentile: number | null;
  /** Weekly-sampled history for the sparkline, oldest first. */
  history: number[];
  /** What a high reading means, in one clause. */
  high: string;
  /** What a low reading means. */
  low: string;
  description: string;
}

export interface Regime {
  metrics: RegimeMetric[];
  /**
   * First date the percentiles and sparklines cover.
   *
   * Reported rather than described as "ten years", which is what the fetch
   * asks for and not what the sector grid gets: XLC launched in June 2018 and
   * `alignBars` intersects the calendars, so the cross-sectional history is
   * bounded by the youngest fund in it. Stating the window as longer than it
   * is would inflate every percentile claim on the band.
   */
  from: string;
  /**
   * 0–100. High means sectors are moving apart from each other — the condition
   * under which everything else on this page is worth reading.
   */
  rotationScore: number | null;
  verdict: string;
}

const CORRELATION_WINDOW = 63;
const DISPERSION_WINDOW = 21;

/**
 * Thin a daily series to roughly `TARGET` points for a sparkline.
 *
 * A sparkline is about 120 device pixels wide. Serialising 2,500 daily closes
 * into the RSC payload to draw it would be four times the data for no visible
 * difference — and it is four sparklines, so it compounds.
 */
const SPARKLINE_TARGET = 250;

function sparkline(values: (number | null)[]): number[] {
  const clean = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const step = Math.max(1, Math.ceil(clean.length / SPARKLINE_TARGET));
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += step) out.push(clean[i]);
  // The latest point is what the tile's headline number reports; dropping it to
  // a rounding of the stride would put the line and the number out of step.
  if (clean.length > 0 && out[out.length - 1] !== clean[clean.length - 1]) {
    out.push(clean[clean.length - 1]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Signal efficacy
 * ------------------------------------------------------------------ */

export interface EfficacyCell {
  /** Mean forward relative return, in percentage points against the equal-weighted sector average. */
  mean: number;
  /** Share of observations that beat that average, 0–100. */
  hitRate: number;
  count: number;
}

export interface EfficacyRow {
  bucket: string;
  cells: Record<string, EfficacyCell | null>;
}

export interface Efficacy {
  horizons: string[];
  quadrants: EfficacyRow[];
  momentum: EfficacyRow[];
  /** First and last dates of the test window, so the sample is stated rather than implied. */
  from: string;
  to: string;
  observations: number;
}

const EFFICACY_HORIZONS: { key: string; weeks: number }[] = [
  { key: "4w", weeks: 4 },
  { key: "13w", weeks: 13 },
  { key: "26w", weeks: 26 },
];

/* ------------------------------------------------------------------ *
 * Leadership history
 * ------------------------------------------------------------------ */

export interface HeatmapMonth {
  /** YYYY-MM. */
  month: string;
  /** True for the month still in progress. */
  partial: boolean;
  /** Ticker → relative return that month, percentage points. */
  values: Record<string, number | null>;
}

/* ------------------------------------------------------------------ *
 * Pairs
 * ------------------------------------------------------------------ */

export interface PairRow extends PairDef {
  ret: Record<"1M" | "3M" | "6M" | "12M", number | null>;
  /** Percent above or below the ratio's own 50-day average — is the spread trending? */
  vs50: number | null;
  history: number[];
}

/* ------------------------------------------------------------------ *
 * Assembled result
 * ------------------------------------------------------------------ */

export interface RotationData {
  asOf: string | null;
  rrg: RrgGroup[];
  momentum: MomentumRow[];
  regime: Regime | null;
  heatmap: HeatmapMonth[];
  heatmapTickers: string[];
  pairs: PairRow[];
  efficacy: Efficacy | null;
  /** True when the sector grid could not be aligned — nothing below the header is computable. */
  unavailable: boolean;
}

const EMPTY: RotationData = {
  asOf: null,
  rrg: [],
  momentum: [],
  regime: null,
  heatmap: [],
  heatmapTickers: [],
  pairs: [],
  efficacy: null,
  unavailable: true,
};

export function computeRotation(universe: Universe): RotationData {
  const core = alignBars(universe, [BENCHMARK, ...SECTOR_TICKERS]);
  if (!core) return EMPTY;

  const { dates, closes } = core;
  const bench = closes[BENCHMARK];
  const n = dates.length;
  const last = n - 1;

  /* --- RRG ------------------------------------------------------- */

  const weeklyBars = toWeekly(dates.map((date, i) => ({ date, i })));
  const weeklyDates = weeklyBars.map((b) => b.date);
  const weeklyIndex = weeklyBars.map((b) => b.i);
  const weeklyClose = (t: string) => weeklyIndex.map((i) => closes[t][i]);

  const rrg: RrgGroup[] = [];
  const sectorGroup = buildRrgGroup(
    "sector",
    "Sectors",
    "The eleven SPDRs partition the index, so one can only lead because another lags.",
    SECTOR_TICKERS,
    Object.fromEntries(SECTOR_TICKERS.map((t) => [t, weeklyClose(t)])),
    weeklyDates,
    weeklyClose(BENCHMARK),
  );
  if (sectorGroup) rrg.push(sectorGroup);

  const industryAligned = alignBars(universe, [BENCHMARK, ...INDUSTRY_TICKERS]);
  if (industryAligned) {
    const iWeekly = toWeekly(industryAligned.dates.map((date, i) => ({ date, i })));
    const iIdx = iWeekly.map((b) => b.i);
    const industryGroup = buildRrgGroup(
      "industry",
      "Industries",
      "Overlapping and normalised only against each other — never against the sector grid above.",
      INDUSTRY_TICKERS,
      Object.fromEntries(
        INDUSTRY_TICKERS.map((t) => [t, iIdx.map((i) => industryAligned.closes[t][i])]),
      ),
      iWeekly.map((b) => b.date),
      iIdx.map((i) => industryAligned.closes[BENCHMARK][i]),
    );
    if (industryGroup) rrg.push(industryGroup);
  }

  const quadrantByTicker: Record<string, Quadrant> = {};
  for (const group of rrg) {
    for (const s of group.series) quadrantByTicker[s.ticker] = s.quadrant;
  }

  /* --- Momentum -------------------------------------------------- */

  function momentumRows(tickers: string[], tier: SectorTier, src: Aligned): MomentumRow[] {
    const c = src.closes;
    const b = c[BENCHMARK];
    const end = src.dates.length - 1;
    const now = compositeScores(tickers, c, b, end);
    const prior = compositeScores(tickers, c, b, end - DAYS["1M"]);
    const nowRank = now ? rankMap(now) : null;
    const priorRank = prior ? rankMap(prior) : null;

    const weekly = toWeekly(src.dates.map((date, i) => ({ date, i }))).map((x) => x.i);
    const lastYearWeeks = weekly.slice(-53);

    return tickers.map((t) => {
      const own = c[t];
      const absolute = {} as Record<Lookback, number | null>;
      const excess = {} as Record<Lookback, number | null>;
      for (const lb of LOOKBACKS) {
        const { lag, skip } = lookbackArgs(lb);
        absolute[lb] = absoluteOver(own, end, lag, skip);
        excess[lb] = excessOver(own, b, end, lag, skip);
      }
      const ma50 = sma(own, 50);
      const ma200 = sma(own, 200);
      const rs = lastYearWeeks.map((i) => own[i] / b[i]);
      const rsLine = rs.length > 0 ? rs.map((v) => (v / rs[0]) * 100) : [];

      return {
        ticker: t,
        label: LABEL[t] ?? t,
        tier,
        absolute,
        excess,
        score: now ? now[t] : null,
        rank: nowRank ? nowRank[t] : null,
        rankPrior: priorRank ? priorRank[t] : null,
        vs50: ma50[end] === null ? null : (own[end] / (ma50[end] as number) - 1) * 100,
        vs200: ma200[end] === null ? null : (own[end] / (ma200[end] as number) - 1) * 100,
        rsLine,
        quadrant: quadrantByTicker[t] ?? null,
      };
    });
  }

  const momentum = [
    ...momentumRows(SECTOR_TICKERS, "sector", core),
    ...(industryAligned ? momentumRows(INDUSTRY_TICKERS, "industry", industryAligned) : []),
  ];

  /* --- Regime ---------------------------------------------------- */

  const sectorReturns = Object.fromEntries(SECTOR_TICKERS.map((t) => [t, returns(closes[t])]));

  // Dispersion: how far apart the sectors moved on an average day this month.
  // Two percent a day and they are trading as eleven different assets; half a
  // percent and they are trading as one.
  const dailyDispersion: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const day = SECTOR_TICKERS.map((t) => sectorReturns[t][i] as number);
    dailyDispersion[i] = stdevSample(day) * 100;
  }
  const dispersion = sma(dailyDispersion, DISPERSION_WINDOW);

  // Average pairwise correlation across the fifty-five sector pairs, on a
  // rolling quarter. This is the direct measure of whether money is
  // discriminating between sectors or moving in and out of equities wholesale.
  const correlation: (number | null)[] = new Array(n).fill(null);
  for (let i = CORRELATION_WINDOW; i < n; i++) {
    const windows = SECTOR_TICKERS.map(
      (t) => sectorReturns[t].slice(i - CORRELATION_WINDOW + 1, i + 1) as number[],
    );
    let sum = 0;
    let pairs = 0;
    for (let a = 0; a < windows.length; a++) {
      for (let b2 = a + 1; b2 < windows.length; b2++) {
        sum += pearson(windows[a], windows[b2]);
        pairs++;
      }
    }
    correlation[i] = sum / pairs;
  }

  // Breadth of trend: how many of the eleven are above their own 200-day line.
  const ma200ByTicker = Object.fromEntries(SECTOR_TICKERS.map((t) => [t, sma(closes[t], 200)]));
  const breadth: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let known = 0;
    let above = 0;
    for (const t of SECTOR_TICKERS) {
      const ma = ma200ByTicker[t][i];
      if (ma === null) continue;
      known++;
      if (closes[t][i] > ma) above++;
    }
    if (known === SECTOR_TICKERS.length) breadth[i] = (above / known) * 100;
  }

  // Leadership spread: best minus worst quarterly relative return. Dispersion
  // says the daily moves differ; this says the differences compounded into a
  // gap large enough to matter to a position.
  const spread: (number | null)[] = new Array(n).fill(null);
  for (let i = DAYS["3M"]; i < n; i++) {
    const rel = SECTOR_TICKERS.map(
      (t) => (closes[t][i] / closes[t][i - DAYS["3M"]] - 1) - (bench[i] / bench[i - DAYS["3M"]] - 1),
    );
    spread[i] = (Math.max(...rel) - Math.min(...rel)) * 100;
  }

  function metric(
    id: string,
    label: string,
    series: (number | null)[],
    unit: string,
    decimals: number,
    high: string,
    low: string,
    description: string,
  ): RegimeMetric {
    const value = series[last];
    return {
      id,
      label,
      value,
      unit,
      decimals,
      percentile: value === null ? null : percentileRank(series, value),
      history: sparkline(series),
      high,
      low,
      description,
    };
  }

  const dispersionMetric = metric(
    "dispersion",
    "Dispersion",
    dispersion,
    "%",
    2,
    "sectors trading more like separate assets than one",
    "sectors trading close to as one",
    "Standard deviation across the eleven sectors' returns on an average day this month. It is the raw material of rotation: without it there is nothing to rotate between.",
  );
  const correlationMetric = metric(
    "correlation",
    "Avg. correlation",
    correlation,
    "",
    2,
    "money moving in and out of equities wholesale",
    "money discriminating between sectors",
    "Mean correlation across all fifty-five sector pairs over the last quarter. Falling correlation is what a rotation regime looks like from the inside.",
  );
  const breadthMetric = metric(
    "breadth",
    "Sectors above 200d",
    breadth,
    "%",
    0,
    "most of the index is trending up",
    "leadership has narrowed",
    "How many of the eleven sit above their own 200-day average. A count, not a weight — six small sectors leading and five large ones lagging still reads as 55%.",
  );
  const spreadMetric = metric(
    "spread",
    "Leadership spread",
    spread,
    "pp",
    1,
    "a wide gap between the best and worst sector",
    "little reward for picking the right sector",
    "Best minus worst sector on three-month relative return. This is the prize on offer for getting the ranking right.",
  );

  const dispersionPct = dispersionMetric.percentile;
  const correlationPct = correlationMetric.percentile;
  const rotationScore =
    dispersionPct === null || correlationPct === null
      ? null
      : (dispersionPct + (100 - correlationPct)) / 2;

  const regime: Regime = {
    metrics: [dispersionMetric, correlationMetric, breadthMetric, spreadMetric],
    from: dates[0],
    rotationScore,
    verdict:
      rotationScore === null
        ? "Not enough history to place the current reading."
        : rotationScore >= 70
          ? "Sectors are moving apart. Rankings on this page are describing real separation rather than noise."
          : rotationScore >= 40
            ? "Mixed. Some separation between sectors, but not a market that is obviously discriminating."
            : "Sectors are moving together. Treat the rankings below as close to noise — there is little to rotate between.",
  };

  /* --- Leadership heatmap ---------------------------------------- */

  const benchMonthly = toMonthly(dates, bench);
  const monthlyByTicker = Object.fromEntries(
    SECTOR_TICKERS.map((t) => [t, toMonthly(dates, closes[t])]),
  );
  const monthCount = 15;
  const startMonth = Math.max(1, benchMonthly.length - monthCount);
  const currentMonth = dates[last].slice(0, 7);
  const heatmap: HeatmapMonth[] = [];
  for (let m = startMonth; m < benchMonthly.length; m++) {
    const benchRet = benchMonthly[m].close / benchMonthly[m - 1].close - 1;
    const values: Record<string, number | null> = {};
    for (const t of SECTOR_TICKERS) {
      const series = monthlyByTicker[t];
      values[t] = (series[m].close / series[m - 1].close - 1 - benchRet) * 100;
    }
    heatmap.push({
      month: benchMonthly[m].month,
      partial: benchMonthly[m].month === currentMonth,
      values,
    });
  }

  /* --- Pairs ----------------------------------------------------- */

  const pairs: PairRow[] = [];
  for (const def of PAIR_DEFS) {
    const aligned = alignBars(universe, [def.numerator, def.denominator]);
    if (!aligned) continue;
    const num = aligned.closes[def.numerator];
    const den = aligned.closes[def.denominator];
    const ratio = num.map((v, i) => v / den[i]);
    const end = ratio.length - 1;
    const ma50 = sma(ratio, 50);
    pairs.push({
      ...def,
      ret: {
        "1M": absoluteOver(ratio, end, DAYS["1M"]),
        "3M": absoluteOver(ratio, end, DAYS["3M"]),
        "6M": absoluteOver(ratio, end, DAYS["6M"]),
        "12M": absoluteOver(ratio, end, DAYS["12M"]),
      },
      vs50: ma50[end] === null ? null : (ratio[end] / (ma50[end] as number) - 1) * 100,
      // Two years of ratio, weekly — enough to see the trend the numbers describe
      // without shipping five years of daily points per pair.
      history: toWeekly(aligned.dates.map((date, i) => ({ date, i })))
        .slice(-104)
        .map(({ i }) => ratio[i]),
    });
  }

  /* --- Efficacy -------------------------------------------------- */

  const efficacy = computeEfficacy(dates, closes, bench, weeklyIndex, weeklyDates);

  // Trimmed on the way out, not on the way in: every number above is still
  // computed at full precision, and only the finished object — which exists to
  // be serialised into the page — is rounded. See lib/precision.ts.
  return trimFloats({
    asOf: dates[last],
    rrg,
    momentum,
    regime,
    heatmap,
    heatmapTickers: SECTOR_TICKERS,
    pairs,
    efficacy,
    unavailable: false,
  });
}

/**
 * Did any of this predict anything?
 *
 * For every week in the sample, each sector is placed in an RRG quadrant and
 * into a momentum tercile, and its forward relative return is recorded — then
 * demeaned across the eleven sectors at that date.
 *
 * The demeaning is not a refinement, it is what makes the number readable. The
 * eleven sectors are equally weighted here but SPY is not, so in a stretch
 * where the largest sector leads, every sector's *equal-weighted* excess return
 * against SPY is negative and all four quadrant averages come out below zero
 * whether the signal worked or not. Against the cross-sectional mean, the
 * question is the one actually being asked: given two sectors, did the quadrant
 * tell you which to hold?
 *
 * WHAT THIS IS NOT. It is in-sample, it is five years, and overlapping windows
 * across eleven correlated sectors mean the observation counts are far larger
 * than the number of independent observations behind them — a 26-week horizon
 * over five years is roughly nine non-overlapping periods. No significance test
 * is reported because none of them would survive one. It is here to keep the
 * rest of the page honest, not to justify a trade.
 */
function computeEfficacy(
  dates: string[],
  closes: Record<string, number[]>,
  bench: number[],
  weeklyIndex: number[],
  weeklyDates: string[],
): Efficacy | null {
  const n = weeklyIndex.length;
  if (n < RRG_SLOW + RRG_MOMENTUM + 30) return null;

  const weeklyClose = Object.fromEntries(
    SECTOR_TICKERS.map((t) => [t, weeklyIndex.map((i) => closes[t][i])]),
  );
  const weeklyBench = weeklyIndex.map((i) => bench[i]);

  // Same construction as the live graph, run over the whole history.
  const rel: Record<string, (number | null)[]> = {};
  const mom: Record<string, (number | null)[]> = {};
  for (const t of SECTOR_TICKERS) {
    const rs = weeklyClose[t].map((c, i) => c / weeklyBench[i]);
    const fast = sma(rs, RRG_FAST);
    const slow = sma(rs, RRG_SLOW);
    const r = rs.map((_, i) =>
      fast[i] === null || slow[i] === null ? null : (fast[i] as number) / (slow[i] as number) - 1,
    );
    rel[t] = r;
    mom[t] = diff(r, RRG_MOMENTUM);
  }

  // Momentum score on weekly bars: 12-1 and 6M and 3M, in weeks.
  const WEEKS = { "3M": 13, "6M": 26, "12M": 52, "1M": 4 };
  const scoreAt = (i: number): Record<string, number> | null => {
    const parts: Record<string, number>[] = [];
    for (const [lag, skip] of [
      [WEEKS["3M"], 0],
      [WEEKS["6M"], 0],
      [WEEKS["12M"] - WEEKS["1M"], WEEKS["1M"]],
    ] as const) {
      const stop = i - skip;
      const start = stop - lag;
      if (start < 0) return null;
      const z = crossSectionalZ(
        Object.fromEntries(
          SECTOR_TICKERS.map((t) => [
            t,
            (weeklyClose[t][stop] / weeklyClose[t][start] - 1) -
              (weeklyBench[stop] / weeklyBench[start] - 1),
          ]),
        ),
      );
      if (!z) return null;
      parts.push(z);
    }
    return Object.fromEntries(
      SECTOR_TICKERS.map((t) => [t, mean(parts.map((p) => p[t]))]),
    );
  };

  type Acc = { sum: number; hits: number; count: number };
  const blank = (): Acc => ({ sum: 0, hits: 0, count: 0 });
  const quadAcc: Record<string, Record<string, Acc>> = {};
  const momAcc: Record<string, Record<string, Acc>> = {};
  for (const q of ["leading", "weakening", "lagging", "improving"]) {
    quadAcc[q] = Object.fromEntries(EFFICACY_HORIZONS.map((h) => [h.key, blank()]));
  }
  for (const b of ["top", "middle", "bottom"]) {
    momAcc[b] = Object.fromEntries(EFFICACY_HORIZONS.map((h) => [h.key, blank()]));
  }

  const maxHorizon = Math.max(...EFFICACY_HORIZONS.map((h) => h.weeks));
  let observations = 0;
  let firstIndex: number | null = null;

  for (let i = 0; i < n - maxHorizon; i++) {
    const zx = crossSectionalZ(Object.fromEntries(SECTOR_TICKERS.map((t) => [t, rel[t][i]])));
    const zy = crossSectionalZ(Object.fromEntries(SECTOR_TICKERS.map((t) => [t, mom[t][i]])));
    const scores = scoreAt(i);
    if (!zx || !zy || !scores) continue;
    if (firstIndex === null) firstIndex = i;
    observations++;

    const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const bucketOf: Record<string, string> = {};
    ordered.forEach(([t], k) => {
      bucketOf[t] = k < 3 ? "top" : k >= ordered.length - 3 ? "bottom" : "middle";
    });

    for (const h of EFFICACY_HORIZONS) {
      const fwd = Object.fromEntries(
        SECTOR_TICKERS.map((t) => [
          t,
          (weeklyClose[t][i + h.weeks] / weeklyClose[t][i] - 1) * 100,
        ]),
      );
      const mu = mean(SECTOR_TICKERS.map((t) => fwd[t]));
      for (const t of SECTOR_TICKERS) {
        const edge = fwd[t] - mu;
        const q = quadAcc[quadrantOf(zx[t], zy[t])][h.key];
        q.sum += edge;
        q.hits += edge > 0 ? 1 : 0;
        q.count++;
        const m = momAcc[bucketOf[t]][h.key];
        m.sum += edge;
        m.hits += edge > 0 ? 1 : 0;
        m.count++;
      }
    }
  }

  if (observations < 30 || firstIndex === null) return null;

  const toRow = (bucket: string, acc: Record<string, Acc>): EfficacyRow => ({
    bucket,
    cells: Object.fromEntries(
      EFFICACY_HORIZONS.map((h) => {
        const a = acc[h.key];
        return [
          h.key,
          a.count === 0
            ? null
            : { mean: a.sum / a.count, hitRate: (a.hits / a.count) * 100, count: a.count },
        ];
      }),
    ),
  });

  return {
    horizons: EFFICACY_HORIZONS.map((h) => h.key),
    quadrants: (["leading", "weakening", "improving", "lagging"] as Quadrant[]).map((q) =>
      toRow(QUADRANT_LABEL[q], quadAcc[q]),
    ),
    momentum: [
      toRow("Top 3 by score", momAcc.top),
      toRow("Middle 5", momAcc.middle),
      toRow("Bottom 3 by score", momAcc.bottom),
    ],
    from: weeklyDates[firstIndex],
    to: dates[dates.length - 1],
    observations,
  };
}
