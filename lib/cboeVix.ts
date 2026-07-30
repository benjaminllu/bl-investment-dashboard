import type { SeriesPoint } from "@/lib/riskStats";

export interface VixMetric {
  value: number | null;
  previousValue: number | null;
  date: string | null;
}

export interface VixSpreadData {
  vix: VixMetric;
  vixEq: VixMetric;
  spread: number | null;
  previousSpread: number | null;
  /** Full daily VIX close history, ascending, ISO dates. Powers the risk-tab stats. */
  vixHistory: SeriesPoint[];
  /** VIXEQ − VIX on every date both series have a close for, ascending. */
  spreadHistory: SeriesPoint[];
}

// Cboe's own CDN, serving the same daily CSVs its public index dashboards
// read from. No API key, but a browser-like User-Agent is required.
const VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";
const VIXEQ_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIXEQ_History.csv";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseCsvRows(csv: string): string[][] {
  return csv
    .trim()
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.replace(/"/g, "").trim()));
}

/** Cboe serves MM/DD/YYYY; riskStats wants sortable ISO dates. */
function toIsoDate(mmddyyyy: string): string | null {
  const [month, day, year] = mmddyyyy.split("/");
  if (!month || !day || !year) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

interface CboeSeries {
  metric: VixMetric;
  /** Keyed by MM/DD/YYYY so the two series can be joined on Cboe's own dates. */
  byDate: Map<string, number>;
  points: SeriesPoint[];
}

const EMPTY_METRIC: VixMetric = { value: null, previousValue: null, date: null };

// Both CSVs are DATE-first, chronologically ascending, with the value we
// want at a fixed column index (VIX: DATE,OPEN,HIGH,LOW,CLOSE; VIXEQ: DATE,VIXEQ).
// The full file is parsed rather than just the last two rows: it is the source
// of the all-time distribution the risk-tab interpretations are built on, and it
// costs no extra request.
async function fetchVixCsv(url: string, valueIndex: number): Promise<CboeSeries> {
  const empty: CboeSeries = { metric: EMPTY_METRIC, byDate: new Map(), points: [] };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error(`[cboeVix] ${url} failed: HTTP ${res.status} ${await res.text()}`);
      return empty;
    }
    const csv = await res.text();
    const rows = parseCsvRows(csv).slice(1); // drop header row
    if (rows.length < 2) return empty;

    const byDate = new Map<string, number>();
    const points: SeriesPoint[] = [];
    for (const row of rows) {
      const value = parseFloat(row[valueIndex]);
      const rawDate = row[0];
      if (!rawDate || Number.isNaN(value)) continue;
      byDate.set(rawDate, value);
      const iso = toIsoDate(rawDate);
      if (iso) points.push({ date: iso, value });
    }

    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const value = parseFloat(last[valueIndex]);
    const previousValue = parseFloat(prev[valueIndex]);

    return {
      metric: {
        value: Number.isNaN(value) ? null : value,
        previousValue: Number.isNaN(previousValue) ? null : previousValue,
        date: last[0] ?? null,
      },
      byDate,
      points,
    };
  } catch (e) {
    console.error(`[cboeVix] ${url} threw:`, e);
    return empty;
  }
}

export async function fetchVixSpread(): Promise<VixSpreadData> {
  const [vixSeries, vixEqSeries] = await Promise.all([
    fetchVixCsv(VIX_URL, 4),
    fetchVixCsv(VIXEQ_URL, 1),
  ]);

  const vix = vixSeries.metric;
  const vixEq = vixEqSeries.metric;

  const spread = vix.value !== null && vixEq.value !== null ? vixEq.value - vix.value : null;
  const previousSpread =
    vix.previousValue !== null && vixEq.previousValue !== null
      ? vixEq.previousValue - vix.previousValue
      : null;

  // Joined on Cboe's own dates so a missing session in either file drops out
  // rather than pairing mismatched days. VIXEQ history is the shorter of the
  // two, so it bounds the spread series.
  const spreadHistory: SeriesPoint[] = [];
  for (const [rawDate, vixValue] of vixSeries.byDate) {
    const eqValue = vixEqSeries.byDate.get(rawDate);
    if (eqValue === undefined) continue;
    const iso = toIsoDate(rawDate);
    if (iso) spreadHistory.push({ date: iso, value: eqValue - vixValue });
  }
  spreadHistory.sort((a, b) => a.date.localeCompare(b.date));

  return {
    vix,
    vixEq,
    spread,
    previousSpread,
    vixHistory: vixSeries.points,
    spreadHistory,
  };
}
