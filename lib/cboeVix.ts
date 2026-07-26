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

// Both CSVs are DATE-first, chronologically ascending, with the value we
// want at a fixed column index (VIX: DATE,OPEN,HIGH,LOW,CLOSE; VIXEQ: DATE,VIXEQ).
async function fetchVixCsv(url: string, valueIndex: number): Promise<VixMetric> {
  const empty: VixMetric = { value: null, previousValue: null, date: null };
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

    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const value = parseFloat(last[valueIndex]);
    const previousValue = parseFloat(prev[valueIndex]);

    return {
      value: Number.isNaN(value) ? null : value,
      previousValue: Number.isNaN(previousValue) ? null : previousValue,
      date: last[0] ?? null,
    };
  } catch (e) {
    console.error(`[cboeVix] ${url} threw:`, e);
    return empty;
  }
}

export async function fetchVixSpread(): Promise<VixSpreadData> {
  const [vix, vixEq] = await Promise.all([
    fetchVixCsv(VIX_URL, 4),
    fetchVixCsv(VIXEQ_URL, 1),
  ]);

  const spread =
    vix.value !== null && vixEq.value !== null ? vixEq.value - vix.value : null;
  const previousSpread =
    vix.previousValue !== null && vixEq.previousValue !== null
      ? vixEq.previousValue - vix.previousValue
      : null;

  return { vix, vixEq, spread, previousSpread };
}
