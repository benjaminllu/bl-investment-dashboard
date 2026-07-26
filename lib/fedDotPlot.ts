export interface FedDotYear {
  year: number;
  median: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
}

export interface FedDotPlot {
  years: FedDotYear[];
  longerRun: { median: number | null; rangeLow: number | null; rangeHigh: number | null };
}

// The near-term series (median/range) are keyed by target CALENDAR YEAR, not
// by release date -- e.g. "2026-01-01" holds whatever the latest SEP says
// the rate will be at end of 2026. Only the Fed's live projection window
// (current year + a couple more) has real values; years that have rolled
// out of that window come back as "." (FRED's null sentinel). The longer-run
// variants are the opposite: keyed by actual SEP release date, behaving like
// a normal time series.
const DOT_PLOT_SERIES = { median: "FEDTARMD", rangeHigh: "FEDTARRH", rangeLow: "FEDTARRL" };
const LONGER_RUN_SERIES = { median: "FEDTARMDLR", rangeHigh: "FEDTARRHLR", rangeLow: "FEDTARRLLR" };

// How many live projection years to show. The Fed currently publishes
// current-year + 2 more (3 total); this leaves headroom in case that ever
// widens without needing a code change.
const MAX_YEARS = 4;

function parseValue(raw: string | undefined): number | null {
  if (raw === undefined || raw === ".") return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

async function fetchObservations(
  seriesId: string,
  apiKey: string,
  limit: number
): Promise<{ date: string; value: number | null }[]> {
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[fedDotPlot] ${seriesId} failed: HTTP ${res.status} ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    const obs: { date: string; value: string }[] = data.observations ?? [];
    return obs.map((o) => ({ date: o.date, value: parseValue(o.value) }));
  } catch (e) {
    console.error(`[fedDotPlot] ${seriesId} threw:`, e);
    return [];
  }
}

export async function fetchFedDotPlot(): Promise<FedDotPlot> {
  const empty: FedDotPlot = { years: [], longerRun: { median: null, rangeLow: null, rangeHigh: null } };
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return empty;

  const [medianObs, rangeHighObs, rangeLowObs, lrMedian, lrRangeHigh, lrRangeLow] = await Promise.all([
    fetchObservations(DOT_PLOT_SERIES.median, apiKey, 10),
    fetchObservations(DOT_PLOT_SERIES.rangeHigh, apiKey, 10),
    fetchObservations(DOT_PLOT_SERIES.rangeLow, apiKey, 10),
    fetchObservations(LONGER_RUN_SERIES.median, apiKey, 1),
    fetchObservations(LONGER_RUN_SERIES.rangeHigh, apiKey, 1),
    fetchObservations(LONGER_RUN_SERIES.rangeLow, apiKey, 1),
  ]);

  // Filtering to non-null and taking the most recent N is what makes this
  // shift forward automatically whenever the Fed's live projection window
  // moves (e.g. 2026/2027/2028 -> 2027/2028/2029) -- no hardcoded years here.
  const liveDates = medianObs
    .filter((o) => o.value !== null)
    .map((o) => o.date)
    .sort()
    .slice(-MAX_YEARS);

  const rangeHighByDate = new Map(rangeHighObs.map((o) => [o.date, o.value]));
  const rangeLowByDate = new Map(rangeLowObs.map((o) => [o.date, o.value]));
  const medianByDate = new Map(medianObs.map((o) => [o.date, o.value]));

  const years: FedDotYear[] = liveDates.map((date) => ({
    year: new Date(`${date}T00:00:00`).getFullYear(),
    median: medianByDate.get(date) ?? null,
    rangeLow: rangeLowByDate.get(date) ?? null,
    rangeHigh: rangeHighByDate.get(date) ?? null,
  }));

  return {
    years,
    longerRun: {
      median: lrMedian[0]?.value ?? null,
      rangeLow: lrRangeLow[0]?.value ?? null,
      rangeHigh: lrRangeHigh[0]?.value ?? null,
    },
  };
}
