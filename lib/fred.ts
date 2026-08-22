export interface FredMetric {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  previousValue: number | null;
  date: string | null;
}

export interface FredSeriesDef {
  id: string;
  label: string;
  unit: string;
  // FRED's "units" transform param — "lin" (level) or "pc1" (% change from a year ago),
  // computed server-side by FRED so we don't need a second lookback call.
  transform: "lin" | "pc1";
}

export type FredRange = "1Y" | "5Y" | "10Y" | "MAX";
export const FRED_RANGES: FredRange[] = ["1Y", "5Y", "10Y", "MAX"];

export interface FredObservation {
  date: string;
  value: number;
}

export const FRED_SERIES: FredSeriesDef[] = [
  { id: "DFEDTARU", label: "Fed Funds Target Rate (Upper Limit)", unit: "%", transform: "lin" },
  { id: "BAMLH0A0HYM2", label: "High-Yield Credit Spread (ICE BofA OAS)", unit: "%", transform: "lin" },
  { id: "DGS10", label: "10-Year Treasury Yield", unit: "%", transform: "lin" },
  { id: "T10Y2Y", label: "10Y–2Y Treasury Spread", unit: "%", transform: "lin" },
  { id: "CPIAUCSL", label: "CPI Inflation (YoY)", unit: "%", transform: "pc1" },
  { id: "PCEPILFE", label: "Core PCE Inflation (YoY)", unit: "%", transform: "pc1" },
  { id: "UNRATE", label: "Unemployment Rate", unit: "%", transform: "lin" },
  { id: "GDPC1", label: "Real GDP Growth (YoY)", unit: "%", transform: "pc1" },
  { id: "VIXCLS", label: "VIX (Volatility Index)", unit: "", transform: "lin" },
  { id: "DTWEXBGS", label: "Trade-Weighted US Dollar Index", unit: "", transform: "lin" },
  { id: "ICSA", label: "Initial Jobless Claims (Weekly)", unit: "", transform: "lin" },
  { id: "M2SL", label: "M2 Money Supply (YoY)", unit: "%", transform: "pc1" },
  { id: "WALCL", label: "Fed Balance Sheet (Total Assets, $M)", unit: "", transform: "lin" },
  { id: "RRPONTSYD", label: "Reverse Repo Facility Usage ($B)", unit: "", transform: "lin" },
  { id: "NFCI", label: "Chicago Fed Financial Conditions Index", unit: "", transform: "lin" },
  { id: "STLFSI4", label: "St. Louis Fed Financial Stress Index", unit: "", transform: "lin" },
  // Quarterly survey (not weekly/monthly like most series here) — date will lag further behind "today" than its neighbors.
  { id: "DRTSCILM", label: "Senior Loan Officers Tightening C&I Standards", unit: "%", transform: "lin" },
  { id: "INDPRO", label: "Industrial Production (YoY)", unit: "%", transform: "pc1" },
  { id: "PERMIT", label: "Building Permits (YoY)", unit: "%", transform: "pc1" },
  { id: "UMCSENT", label: "U. Michigan Consumer Sentiment", unit: "", transform: "lin" },
];

function parseValue(raw: string | undefined): number | null {
  if (raw === undefined || raw === ".") return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

async function fetchSeries(def: FredSeriesDef, apiKey: string): Promise<FredMetric> {
  const empty: FredMetric = { id: def.id, label: def.label, unit: def.unit, value: null, previousValue: null, date: null };
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${def.id}&api_key=${apiKey}&file_type=json` +
      `&units=${def.transform}&sort_order=desc&limit=2`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[fred] ${def.id} failed: HTTP ${res.status} ${await res.text()}`);
      return empty;
    }
    const data = await res.json();
    const obs: { date: string; value: string }[] = data.observations ?? [];
    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      value: parseValue(obs[0]?.value),
      previousValue: parseValue(obs[1]?.value),
      date: obs[0]?.date ?? null,
    };
  } catch (e) {
    console.error(`[fred] ${def.id} threw:`, e);
    return empty;
  }
}

export async function fetchFredMetrics(): Promise<FredMetric[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return FRED_SERIES.map((def) => ({ id: def.id, label: def.label, unit: def.unit, value: null, previousValue: null, date: null }));
  return Promise.all(FRED_SERIES.map((def) => fetchSeries(def, apiKey)));
}

function rangeStartDate(range: FredRange): string | undefined {
  if (range === "MAX") return undefined;
  const years = { "1Y": 1, "5Y": 5, "10Y": 10 }[range];
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export async function fetchFredHistory(seriesId: string, range: FredRange): Promise<FredObservation[]> {
  const def = FRED_SERIES.find((s) => s.id === seriesId);
  const apiKey = process.env.FRED_API_KEY;
  if (!def || !apiKey) return [];

  const start = rangeStartDate(range);
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${def.id}&api_key=${apiKey}&file_type=json` +
    `&units=${def.transform}&sort_order=asc${start ? `&observation_start=${start}` : ""}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[fred] ${seriesId} history failed: HTTP ${res.status} ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    const obs: { date: string; value: string }[] = data.observations ?? [];
    return obs.reduce<FredObservation[]>((acc, o) => {
      const value = parseValue(o.value);
      if (value !== null) acc.push({ date: o.date, value });
      return acc;
    }, []);
  } catch (e) {
    console.error(`[fred] ${seriesId} history threw:`, e);
    return [];
  }
}

/**
 * 2Y and 10Y Treasury yields for the sticky header, with the day's change.
 *
 * These used to come from treasury.gov's daily-yield-curve CSV, parsed inside
 * MarketBanner. That endpoint is correct but pathologically slow: measured at
 * 18.2s / 19.5s / 18.4s time-to-first-byte across three consecutive runs, for
 * 13KB of CSV — it is generating the whole year's file per request. Because the
 * banner lives in the root layout, that 18s sat in front of every static
 * regeneration in the app. FRED answers the same question in ~0.30s, and the
 * key is already configured for the twenty series above.
 *
 * The trade is publication lag: treasury.gov posts the curve same-day around
 * 16:15 ET, FRED mirrors it a little later. For a two-decimal header reading
 * this is not a difference worth 18 seconds.
 *
 * DGS2/DGS10 are deliberately fetched directly rather than added to
 * FRED_SERIES, which drives the /macro metric grid — adding them there would
 * silently add two rows to that page.
 */
export interface TreasuryYields {
  twoYear: number | null;
  tenYear: number | null;
  twoYearBps: number | null;
  tenYearBps: number | null;
}

/**
 * Latest two *published* observations, newest first.
 *
 * Over-fetches and filters rather than asking for `limit=2`, because FRED
 * returns "." for market holidays and keeps the row. On the day after
 * Thanksgiving a limit=2 request can come back as [".", "4.12"] — one usable
 * number and no prior to difference it against, so the bps change would vanish
 * on exactly the days someone is most likely to be checking it. Five rows
 * covers any real holiday run.
 */
async function fetchLatestPair(seriesId: string, apiKey: string): Promise<number[]> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${seriesId}&api_key=${apiKey}&file_type=json` +
    `&sort_order=desc&limit=5`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[fred] ${seriesId} yields failed: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const obs: { date: string; value: string }[] = data.observations ?? [];
    return obs
      .map((o) => parseValue(o.value))
      .filter((v): v is number => v !== null)
      .slice(0, 2);
  } catch (e) {
    console.error(`[fred] ${seriesId} yields threw:`, e);
    return [];
  }
}

export async function fetchTreasuryYields(): Promise<TreasuryYields> {
  const empty: TreasuryYields = {
    twoYear: null,
    tenYear: null,
    twoYearBps: null,
    tenYearBps: null,
  };
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return empty;

  const [two, ten] = await Promise.all([
    fetchLatestPair("DGS2", apiKey),
    fetchLatestPair("DGS10", apiKey),
  ]);

  // Rounded because the difference of two two-decimal percentages carries
  // float noise — 4.12 - 4.09 is 0.030000000000000247 before rounding.
  const bps = (pair: number[]) =>
    pair.length >= 2 ? Math.round((pair[0] - pair[1]) * 100) : null;

  return {
    twoYear: two[0] ?? null,
    tenYear: ten[0] ?? null,
    twoYearBps: bps(two),
    tenYearBps: bps(ten),
  };
}
