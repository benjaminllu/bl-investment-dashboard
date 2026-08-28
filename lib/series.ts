/**
 * Numeric helpers for time series. Pure, no I/O, no domain knowledge.
 *
 * The convention throughout: a series is a dense array where index `i` is the
 * i-th observation, and a value that cannot be computed yet — the first 199
 * points of a 200-day average, say — is `null` rather than 0 or the partial
 * average. Warm-up periods that quietly return a partial window are the classic
 * way an indicator ends up plotting a number that means something different
 * from the rest of the line.
 */

/** Simple moving average over `window` observations. Null until the window fills. */
export function sma(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) {
      // A hole resets the accumulator rather than being skipped: averaging
      // across a gap would silently mix a shorter window into a longer one.
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > window) {
      const drop = values[i - window];
      sum -= drop as number;
      count--;
    }
    if (count === window) out[i] = sum / window;
  }
  return out;
}

/** Percent change of `values` over `lag` observations, as a fraction. */
export function change(values: (number | null)[], lag: number): (number | null)[] {
  return values.map((v, i) => {
    if (v === null || i < lag) return null;
    const base = values[i - lag];
    if (base === null || base === 0) return null;
    return v / base - 1;
  });
}

/** Difference of `values` over `lag` observations (for series already in ratio units). */
export function diff(values: (number | null)[], lag: number): (number | null)[] {
  return values.map((v, i) => {
    if (v === null || i < lag) return null;
    const base = values[i - lag];
    return base === null ? null : v - base;
  });
}

/** Simple period-over-period returns as fractions. Index 0 is null. */
export function returns(closes: number[]): (number | null)[] {
  return closes.map((c, i) => (i === 0 ? null : c / closes[i - 1] - 1));
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation — the cross-section here is the whole universe, not a sample of it. */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

/** Sample standard deviation, for time-series volatility where the observations are a sample. */
export function stdevSample(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

export function pearson(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

/**
 * Z-scores across a cross-section, keyed by whatever the caller keyed the input.
 *
 * Returns null when any member is missing. A z-score is a statement about a
 * group, and computing one over eight of eleven sectors while presenting it as
 * "against its peers" would be a different, quieter claim.
 */
export function crossSectionalZ(
  slice: Record<string, number | null>,
): Record<string, number> | null {
  const keys = Object.keys(slice);
  const values: number[] = [];
  for (const k of keys) {
    const v = slice[k];
    if (v === null || !Number.isFinite(v)) return null;
    values.push(v);
  }
  if (values.length < 3) return null;
  const m = mean(values);
  const sd = stdev(values);
  // A flat cross-section has no ranking to express; zero for everyone is the
  // honest answer, and it keeps the caller from dividing by zero.
  if (sd === 0) return Object.fromEntries(keys.map((k) => [k, 0]));
  return Object.fromEntries(keys.map((k, i) => [k, (values[i] - m) / sd]));
}

/** Where `value` sits in `history`, 0–100. Ties count as below, so 100 means "highest ever seen". */
export function percentileRank(history: (number | null)[], value: number): number | null {
  const clean = history.filter((v): v is number => v !== null && Number.isFinite(v));
  if (clean.length < 20) return null;
  const below = clean.filter((v) => v < value).length;
  return (below / clean.length) * 100;
}

/**
 * The last bar of each calendar week.
 *
 * Weekly is the timeframe RRG is conventionally read on, and the reason is not
 * aesthetic: a daily relative-strength series spends most of its movement on
 * noise that reverses within the week, which shows up on the graph as tails
 * that scribble rather than rotate. Weeks are keyed by their Monday so a
 * holiday-shortened week still collapses to one bar — its own last trading day,
 * which may be a Thursday.
 */
export function toWeekly<T extends { date: string }>(bars: T[]): T[] {
  const out: T[] = [];
  let currentWeek: string | null = null;
  for (const bar of bars) {
    const d = new Date(`${bar.date}T00:00:00Z`);
    const offsetToMonday = (d.getUTCDay() + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - offsetToMonday);
    const key = monday.toISOString().slice(0, 10);
    if (key === currentWeek) out[out.length - 1] = bar;
    else {
      out.push(bar);
      currentWeek = key;
    }
  }
  return out;
}

/** The last close of each calendar month, paired with the month key (YYYY-MM). */
export function toMonthly(dates: string[], closes: number[]): { month: string; close: number }[] {
  const out: { month: string; close: number }[] = [];
  let current: string | null = null;
  for (let i = 0; i < dates.length; i++) {
    const month = dates[i].slice(0, 7);
    if (month === current) out[out.length - 1] = { month, close: closes[i] };
    else {
      out.push({ month, close: closes[i] });
      current = month;
    }
  }
  return out;
}
