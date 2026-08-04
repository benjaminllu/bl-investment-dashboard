/**
 * Turns stored price history into the aligned daily return series that
 * lib/riskMetrics.ts consumes.
 *
 * Two sources, and the difference between them matters more than any formula
 * downstream:
 *
 *   RECONSTRUCTED — today's share counts valued over past prices. Available
 *   immediately and back as far as the data goes, but it is a backtest of the
 *   current book, not a track record: every position since sold is missing, so
 *   it inherits hindsight. Legitimate for describing the RISK of what is held
 *   now (volatility, beta, correlation, drawdown shape); not legitimate as a
 *   claim about what was earned.
 *
 *   SNAPSHOTTED — portfolio_snapshots, one row per day, accumulated forward and
 *   never backfilled. Genuinely the track record, and starts empty.
 *
 * Callers must label which one they are showing. Nothing here does that for
 * them, so the type carries `kind` to make it awkward to forget.
 */

// Relative, not "@/lib/...": tsc's path alias is compile-time only, so a value
// import through it survives into the emitted JS and breaks the standalone
// verify build. Matches how lib/riskNarrative imports its siblings.
import { toReturns } from "./riskMetrics";

export type PriceRow = {
  ticker: string;
  date: string;
  close: number;
  volume: number | null;
};

export type HoldingQuantity = {
  ticker: string;
  quantity: number;
  /** Market value today, used only to report how much of the book is covered. */
  marketValue: number;
};

export type EquitySeries = {
  kind: "reconstructed" | "snapshotted";
  dates: string[];
  /** Portfolio level per date — dollars, not normalised. */
  values: number[];
  /** Holdings with a complete history over the window. */
  covered: number;
  total: number;
  /** Share of today's market value carried by the covered holdings. */
  coveragePct: number;
};

/** Index price rows by ticker → date → close, for O(1) lookup while aligning. */
function indexPrices(rows: PriceRow[]): Map<string, Map<string, number>> {
  const byTicker = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!Number.isFinite(r.close) || r.close <= 0) continue;
    let m = byTicker.get(r.ticker);
    if (!m) {
      m = new Map();
      byTicker.set(r.ticker, m);
    }
    m.set(r.date, r.close);
  }
  return byTicker;
}

/**
 * Buy-and-hold reconstruction: value today's share counts at each past close.
 *
 * Deliberately NOT constant-weight rebalancing. Holding a fixed number of
 * shares is what actually happened to the positions still open, so weights
 * drift exactly as they really would — a rebalanced series would quietly add
 * a trading strategy nobody followed.
 *
 * Only holdings priced on EVERY date in the window are included: mixing a name
 * that starts halfway through would show its arrival as a portfolio-wide jump
 * in value, which reads as a return that never happened.
 */
export function reconstructSeries(
  priceRows: PriceRow[],
  holdings: HoldingQuantity[],
  windowDays: number,
  /** Trading dates to build over, ascending. Usually the benchmark's dates. */
  calendar: string[]
): EquitySeries {
  const dates = calendar.slice(-windowDays);
  const prices = indexPrices(priceRows);
  const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);

  const usable = holdings.filter((h) => {
    const series = prices.get(h.ticker);
    if (!series) return false;
    return dates.every((d) => series.has(d));
  });

  const values = dates.map((d) =>
    usable.reduce((sum, h) => sum + h.quantity * (prices.get(h.ticker)!.get(d) as number), 0)
  );

  const coveredValue = usable.reduce((s, h) => s + h.marketValue, 0);

  return {
    kind: "reconstructed",
    dates,
    values,
    covered: usable.length,
    total: holdings.length,
    coveragePct: totalValue > 0 ? (coveredValue / totalValue) * 100 : 0,
  };
}

export function snapshotSeries(
  rows: { date: string; total_value: number }[]
): EquitySeries {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    kind: "snapshotted",
    dates: sorted.map((r) => r.date),
    values: sorted.map((r) => r.total_value),
    covered: sorted.length,
    total: sorted.length,
    coveragePct: 100,
  };
}

export type AlignedWindow = {
  portfolio: number[];
  benchmark: number[];
  riskFree: number[];
  dates: string[];
};

/**
 * Intersects the portfolio series with the benchmark and the risk-free rate on
 * date, then differences each to daily returns.
 *
 * Intersecting rather than assuming a shared calendar is the point: an OTC
 * listing can miss a session the benchmark trades, and silently pairing index i
 * of two ragged series computes a beta against the wrong days.
 */
export function alignWindow(
  equity: EquitySeries,
  benchmarkByDate: Map<string, number>,
  riskFreeByDate: Map<string, number>
): AlignedWindow | null {
  const dates: string[] = [];
  const pLevels: number[] = [];
  const bLevels: number[] = [];

  for (let i = 0; i < equity.dates.length; i++) {
    const d = equity.dates[i];
    const b = benchmarkByDate.get(d);
    if (b === undefined || !Number.isFinite(equity.values[i]) || equity.values[i] <= 0) continue;
    dates.push(d);
    pLevels.push(equity.values[i]);
    bLevels.push(b);
  }

  if (pLevels.length < 2) return null;

  const portfolio = toReturns(pLevels);
  const benchmark = toReturns(bLevels);

  // Returns are differences, so they belong to the SECOND date of each pair.
  const returnDates = dates.slice(1);

  // A missing rate carries the previous one forward: DTB3 has holiday gaps, and
  // the alternative — dropping the day — would silently shorten the window.
  let lastRate = 0;
  const riskFree = returnDates.map((d) => {
    const r = riskFreeByDate.get(d);
    if (r !== undefined) lastRate = r;
    return lastRate;
  });

  return { portfolio, benchmark, riskFree, dates: returnDates };
}
