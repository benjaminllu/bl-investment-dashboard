// Pure statistics over a daily time series. No fetching and no I/O here so the
// same functions can be exercised directly by scripts/verifyRiskNarrative.ts.
//
// Everything is computed from history the risk-tab fetchers already download
// (Cboe's full CSVs, CNN's graphdata payload), so adding these stats costs no
// extra network requests.

export interface SeriesPoint {
  /** ISO yyyy-mm-dd. Series must be sorted ascending by date. */
  date: string;
  value: number;
}

export interface Distribution {
  n: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  p05: number;
  p25: number;
  p75: number;
  p95: number;
}

/** Roughly one year of trading days — the window used for all "past year" stats. */
export const YEAR_WINDOW = 252;

export interface SeriesStats {
  current: number;
  previous: number | null;
  dayChange: number | null;
  latestDate: string;
  firstDate: string;
  /** Calendar years spanned by the full series, e.g. 36.6 for VIX. */
  yearsCovered: number;

  /** Distribution over the entire available history. */
  full: Distribution;
  /** Distribution over the trailing YEAR_WINDOW observations. */
  year: Distribution;

  /** Percentile rank of `current` within each window, 0–100. */
  pctRankFull: number;
  pctRankYear: number;
  /** Standard deviations `current` sits from each window's mean. */
  zFull: number;
  zYear: number;

  change5d: number | null;
  change21d: number | null;
  change63d: number | null;
  /** OLS slope per day over the trailing 21 observations. */
  slope21d: number | null;
  /** change21d expressed in trailing-year standard deviations. */
  trendStrength: number;
  /** Realized sd of the trailing 21 observations, vs the year's sd. */
  recentSd: number;
  /** Consecutive sessions the series has moved in one direction (signed). */
  streak: number;

  isYearHigh: boolean;
  isYearLow: boolean;
  isFullHigh: boolean;
  isFullLow: boolean;
  /** Sessions since the series last printed above/below the current level. */
  sessionsSinceHigher: number | null;
  sessionsSinceLower: number | null;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function describeDistribution(values: number[]): Distribution {
  const n = values.length;
  if (n === 0) {
    return { n: 0, mean: NaN, median: NaN, sd: NaN, min: NaN, max: NaN, p05: NaN, p25: NaN, p75: NaN, p95: NaN };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((acc, v) => acc + v, 0) / n;
  // Population sd — we hold the whole series, not a sample of it.
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    n,
    mean,
    median: quantile(sorted, 0.5),
    sd: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[n - 1],
    p05: quantile(sorted, 0.05),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
  };
}

/**
 * Fraction of observations below `value`, counting ties at half weight, as 0–100.
 * Half-weighting ties keeps a series pinned at one repeated level from reading
 * as either the 0th or 100th percentile.
 */
export function percentileRank(values: number[], value: number): number {
  if (values.length === 0) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + equal / 2) / values.length) * 100;
}

/** OLS slope per index step. Returns null with fewer than 3 points. */
function slope(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((acc, v) => acc + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? null : num / den;
}

function changeOver(values: number[], lookback: number): number | null {
  if (values.length <= lookback) return null;
  return values[values.length - 1] - values[values.length - 1 - lookback];
}

/** Signed count of consecutive same-direction sessions ending at the latest point. */
function trailingStreak(values: number[]): number {
  if (values.length < 2) return 0;
  const last = values[values.length - 1] - values[values.length - 2];
  if (last === 0) return 0;
  const sign = Math.sign(last);
  let count = 0;
  for (let i = values.length - 1; i > 0; i--) {
    const diff = values[i] - values[i - 1];
    if (Math.sign(diff) !== sign || diff === 0) break;
    count++;
  }
  return count * sign;
}

/** Sessions since the series last printed strictly above (or below) `value`. */
function sessionsSince(values: number[], value: number, above: boolean): number | null {
  for (let i = values.length - 2; i >= 0; i--) {
    if (above ? values[i] > value : values[i] < value) {
      return values.length - 1 - i;
    }
  }
  return null;
}

function yearFraction(firstDate: string, lastDate: string): number {
  const a = Date.parse(firstDate);
  const b = Date.parse(lastDate);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return (b - a) / (365.2425 * 24 * 60 * 60 * 1000);
}

/**
 * Build the full stat bundle. Requires at least 2 points; returns null below
 * that so callers can fall back to rendering no interpretation at all rather
 * than an interpretation built on nothing.
 */
export function computeSeriesStats(series: SeriesPoint[]): SeriesStats | null {
  const clean = series.filter((p) => Number.isFinite(p.value));
  if (clean.length < 2) return null;

  const values = clean.map((p) => p.value);
  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const yearValues = values.slice(-YEAR_WINDOW);
  const recentValues = values.slice(-21);

  const full = describeDistribution(values);
  const year = describeDistribution(yearValues);
  const change21d = changeOver(values, 21);
  const recent = describeDistribution(recentValues);

  return {
    current,
    previous,
    dayChange: current - previous,
    latestDate: clean[clean.length - 1].date,
    firstDate: clean[0].date,
    yearsCovered: yearFraction(clean[0].date, clean[clean.length - 1].date),

    full,
    year,

    pctRankFull: percentileRank(values, current),
    pctRankYear: percentileRank(yearValues, current),
    zFull: full.sd > 0 ? (current - full.mean) / full.sd : 0,
    zYear: year.sd > 0 ? (current - year.mean) / year.sd : 0,

    change5d: changeOver(values, 5),
    change21d,
    change63d: changeOver(values, 63),
    slope21d: slope(recentValues),
    trendStrength: change21d !== null && year.sd > 0 ? change21d / year.sd : 0,
    recentSd: recent.sd,
    streak: trailingStreak(values),

    isYearHigh: current >= year.max,
    isYearLow: current <= year.min,
    isFullHigh: current >= full.max,
    isFullLow: current <= full.min,
    sessionsSinceHigher: sessionsSince(values, current, true),
    sessionsSinceLower: sessionsSince(values, current, false),
  };
}
