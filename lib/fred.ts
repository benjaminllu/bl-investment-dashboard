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
