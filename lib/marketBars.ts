/**
 * Daily adjusted closes, fetched once and shared.
 *
 * This started life inside `lib/sectors.ts`, serving one table. The rotation
 * work on the same page needs the same bars for the same tickers, and fetching
 * them twice would double the Yahoo calls for a page that already makes
 * twenty-six of them. So the fetch lives here, the page pulls the universe
 * once, and every computation downstream is pure — which also means all of it
 * can be replayed against a saved JSON dump by a script, the way METRICS.md
 * describes for the portfolio analytics.
 *
 *
 * WHY TEN YEARS AND NOT TWO
 *
 * The returns table only ever needed a year plus slack. The rotation metrics
 * need considerably more:
 *
 *  - the regime tiles are reported as percentiles ("dispersion is at the 92nd
 *    percentile"), and a percentile against two years of history is barely a
 *    claim at all;
 *  - the efficacy panel scores signals against forward returns out to six
 *    months, after a year of warm-up, so each year of history buys only about
 *    six months of testable observations. At five years it had 183 weekly
 *    observations; at ten it has roughly double that, which is the difference
 *    between a suggestive number and a slightly less suggestive one.
 *
 * Ten is also the practical ceiling for a different reason: XLC did not exist
 * until June 2018, and `alignBars` intersects the calendars, so the sector grid
 * starts there regardless of what is requested. Asking for twenty years would
 * cost four times the bytes and add nothing to the eleven-sector cross section.
 *
 * Cost measured 2026-08-22: twenty-seven tickers at 10y/1d, fetched in
 * parallel, 1.9s wall-clock for 7.4MB — against 229ms and 0.8MB at 5y. That is
 * a real increase, and it is affordable here because it happens once an hour on
 * a background revalidation of one route rather than on a user's request. It is
 * not the pattern to copy into the root layout; see PERFORMANCE.md for what
 * happened the last time something slow lived there.
 */

/** Daily bar: an ISO date and an adjusted close. */
export interface Bar {
  date: string;
  close: number;
}

/** Ticker → bars, oldest first. A ticker that failed maps to an empty array. */
export type Universe = Record<string, Bar[]>;

const RANGE = "10y";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export async function fetchBars(ticker: string): Promise<Bar[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${RANGE}&interval=1d`,
      { headers: YAHOO_HEADERS, next: { revalidate: 3600 } },
    );
    if (!res.ok) {
      console.error(`[bars] ${ticker} failed: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const stamps: number[] | undefined = result?.timestamp;
    // Adjusted closes carry the dividends; the unadjusted `quote[0].close` is
    // only a fallback for the rare symbol Yahoo serves without an adjclose
    // block, and a fallback row is still better than an empty one.
    const closes: (number | null)[] | undefined =
      result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close;
    if (!stamps || !closes) return [];

    const bars: Bar[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const close = closes[i];
      if (typeof close !== "number" || !Number.isFinite(close)) continue;
      bars.push({ date: new Date(stamps[i] * 1000).toISOString().slice(0, 10), close });
    }
    return bars;
  } catch (e) {
    console.error(`[bars] ${ticker} threw:`, e);
    return [];
  }
}

/** Every ticker in parallel. Duplicates in the list are fetched once. */
export async function fetchUniverse(tickers: string[]): Promise<Universe> {
  const unique = Array.from(new Set(tickers));
  const results = await Promise.all(unique.map(fetchBars));
  return Object.fromEntries(unique.map((t, i) => [t, results[i]]));
}

/** A rectangular price grid: one date axis, one close series per ticker. */
export interface Aligned {
  dates: string[];
  closes: Record<string, number[]>;
}

/**
 * Bars trimmed to the dates every listed ticker actually has.
 *
 * Everything cross-sectional below — the z-scores, the correlation matrix, the
 * dispersion series — indexes several tickers by the same integer and assumes
 * position `i` is the same calendar day in all of them. Yahoo does return
 * matching grids for US-listed ETFs in practice, but "in practice" is not a
 * thing to build a correlation matrix on: one halted session in one fund would
 * silently shift a series by a day and quietly corrupt every number after it.
 *
 * Returns null when any ticker is missing or the common grid is too short to
 * mean anything, so callers fail visibly rather than on bad numbers.
 */
export function alignBars(
  universe: Universe,
  tickers: string[],
  minBars = 260,
): Aligned | null {
  const series = tickers.map((t) => universe[t]);
  if (series.some((s) => !s || s.length === 0)) return null;

  const dateSets = series.map((s) => new Set(s.map((b) => b.date)));
  const dates = series[0]
    .map((b) => b.date)
    .filter((d) => dateSets.every((set) => set.has(d)));
  if (dates.length < minBars) return null;

  const closes: Record<string, number[]> = {};
  for (let i = 0; i < tickers.length; i++) {
    const byDate = new Map(series[i].map((b) => [b.date, b.close]));
    closes[tickers[i]] = dates.map((d) => byDate.get(d) as number);
  }
  return { dates, closes };
}
