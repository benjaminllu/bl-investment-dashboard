/**
 * Sector and industry performance, measured against the S&P 500.
 *
 * ETFs stand in for the sectors themselves. There is no free source of true
 * GICS index data, and an ETF is arguably the better proxy anyway: it is what
 * you could actually own, so a relative return here is a decision rather than a
 * statistic.
 *
 *
 * TWO TIERS, NEVER ONE LIST
 *
 * The eleven Select Sector SPDRs PARTITION the S&P 500 — every constituent sits
 * in exactly one, and the weights sum to the index. That is what makes "which
 * sector is leading" a well-posed question and makes rotation between them
 * real: money leaving one has to arrive somewhere.
 *
 * The industry funds do not partition anything. Semiconductors sit INSIDE
 * technology, so ranking SOXX against XLK compares a part with its whole; the
 * part is nearly always more extreme in both directions, and that is an
 * artifact rather than a signal. They are kept in a separate tier and read as
 * an explanation of the first — what is driving the sector — never as a
 * ranking against it.
 *
 *
 * TOTAL RETURN, NOT PRICE RETURN
 *
 * Closes are adjusted (`adjclose`), which folds dividends back in. This is not
 * a detail on this page: sector yields differ enough to reorder the table.
 * Measured on real data, XLU's trailing-year price return was -0.58% against a
 * total return of +2.19% — a 2.77pp gap. Ranking on price return would quietly
 * penalise utilities, staples, real estate and energy in favour of technology,
 * every single day, in the one comparison this page exists to make.
 */

import { fetchUniverse, type Bar, type Universe } from "./marketBars";
import { trimFloats } from "./precision";

export const BENCHMARK = "SPY";

export type SectorTier = "sector" | "industry";

export interface SectorDef {
  ticker: string;
  label: string;
  tier: SectorTier;
}

/**
 * The eleven Select Sector SPDRs, in GICS order, then the industry funds.
 *
 * Deliberately excluded: narrow or newly-launched thematics. Roundhill's memory
 * fund (DRAM) was considered and dropped — it returned 98 daily bars against
 * 251 for everything here, so its YTD and 1Y cells would be empty at best and,
 * if the window guard below were ever loosened, a short-window number sitting
 * silently beside full-year ones. Small thematics also carry wide spreads and
 * can drift from what they claim to track. Worth revisiting once one has a year
 * of history behind it.
 */
export const SECTOR_DEFS: SectorDef[] = [
  { ticker: "XLK", label: "Technology", tier: "sector" },
  { ticker: "XLC", label: "Communications", tier: "sector" },
  { ticker: "XLY", label: "Cons. Discretionary", tier: "sector" },
  { ticker: "XLP", label: "Cons. Staples", tier: "sector" },
  { ticker: "XLE", label: "Energy", tier: "sector" },
  { ticker: "XLF", label: "Financials", tier: "sector" },
  { ticker: "XLV", label: "Health Care", tier: "sector" },
  { ticker: "XLI", label: "Industrials", tier: "sector" },
  { ticker: "XLB", label: "Materials", tier: "sector" },
  { ticker: "XLRE", label: "Real Estate", tier: "sector" },
  { ticker: "XLU", label: "Utilities", tier: "sector" },

  { ticker: "SOXX", label: "Semiconductors", tier: "industry" },
  { ticker: "IGV", label: "Software", tier: "industry" },
  { ticker: "XBI", label: "Biotech", tier: "industry" },
  { ticker: "KRE", label: "Regional Banks", tier: "industry" },
  { ticker: "ITA", label: "Aero / Defense", tier: "industry" },
  { ticker: "XOP", label: "Oil & Gas E&P", tier: "industry" },
  { ticker: "XME", label: "Metals & Mining", tier: "industry" },
];

export type SectorWindow = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y";
export const SECTOR_WINDOWS: SectorWindow[] = ["1D", "1W", "1M", "3M", "YTD", "1Y"];

export interface SectorRow {
  ticker: string;
  label: string;
  tier: SectorTier;
  /** Total return, percent, per window. Null where history does not reach back. */
  absolute: Record<SectorWindow, number | null>;
  /** Total return minus the benchmark's over the same window, percentage points. */
  relative: Record<SectorWindow, number | null>;
}

export interface SectorsData {
  rows: SectorRow[];
  /** The benchmark's own return per window, so the page can state what it is relative TO. */
  benchmark: Record<SectorWindow, number | null>;
  /** Date of the latest close used. */
  asOf: string | null;
  /** True when the benchmark itself could not be fetched — nothing is relative to anything. */
  unavailable: boolean;
}

/** The calendar date each window measures back to, given the latest close. */
function anchorDate(latest: string, window: SectorWindow): string {
  const d = new Date(`${latest}T00:00:00Z`);
  switch (window) {
    case "1D":
      d.setUTCDate(d.getUTCDate() - 1);
      break;
    case "1W":
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case "1M":
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case "3M":
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case "1Y":
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
    case "YTD":
      // The last close of the previous year, so the window starts where the
      // year did rather than on the first trading day of January.
      return `${d.getUTCFullYear() - 1}-12-31`;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Return over one window, or null when the series does not reach back far enough.
 *
 * The null is the important half. Silently measuring from the oldest bar
 * available would turn "this fund is four months old" into a YTD number that
 * looks like everyone else's and is not comparable to any of them — which is
 * precisely how a short-history thematic poisons a ranking.
 */
function returnOver(bars: Bar[], window: SectorWindow): number | null {
  if (bars.length < 2) return null;
  const latest = bars[bars.length - 1];

  if (window === "1D") {
    const prev = bars[bars.length - 2];
    return (latest.close / prev.close - 1) * 100;
  }

  const anchor = anchorDate(latest.date, window);
  // History must actually span the window, not merely start somewhere inside it.
  if (bars[0].date > anchor) return null;

  let base: Bar | null = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date <= anchor) {
      base = bars[i];
      break;
    }
  }
  if (!base || base.close === 0) return null;
  return (latest.close / base.close - 1) * 100;
}

function emptyWindows(): Record<SectorWindow, number | null> {
  return { "1D": null, "1W": null, "1M": null, "3M": null, YTD: null, "1Y": null };
}

/**
 * The returns table, computed from bars the caller already has.
 *
 * Split from the fetch so the sectors page can pull one universe and hand the
 * same bars to `computeRotation` as well — see `lib/marketBars.ts`.
 */
export function computeSectorTable(universe: Universe): SectorsData {
  const benchmarkBars = universe[BENCHMARK] ?? [];
  if (benchmarkBars.length < 2) {
    return { rows: [], benchmark: emptyWindows(), asOf: null, unavailable: true };
  }

  const benchmark = emptyWindows();
  for (const w of SECTOR_WINDOWS) benchmark[w] = returnOver(benchmarkBars, w);

  const rows: SectorRow[] = SECTOR_DEFS.map((def) => {
    const bars = universe[def.ticker] ?? [];
    const absolute = emptyWindows();
    const relative = emptyWindows();
    for (const w of SECTOR_WINDOWS) {
      const own = returnOver(bars, w);
      absolute[w] = own;
      const bench = benchmark[w];
      relative[w] = own !== null && bench !== null ? own - bench : null;
    }
    return { ticker: def.ticker, label: def.label, tier: def.tier, absolute, relative };
  });

  // Trimmed on the way out, like computeRotation next door — this table is
  // the other consumer of the same universe, and its rows cross into a client
  // component too. See lib/precision.ts.
  return trimFloats({
    rows,
    benchmark,
    asOf: benchmarkBars[benchmarkBars.length - 1].date,
    unavailable: false,
  });
}

export async function fetchSectors(): Promise<SectorsData> {
  return computeSectorTable(
    await fetchUniverse([BENCHMARK, ...SECTOR_DEFS.map((d) => d.ticker)]),
  );
}
