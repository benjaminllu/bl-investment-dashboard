import { unstable_cache } from "next/cache";
import { trimFloats } from "./precision";
import { fetchAllRows } from "./supabasePaged";
import { formatDay, rankLatest, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * Cboe put/call ratios from `cboe_put_call`, written nightly by
 * scripts/update-put-call.js. Cboe-listed volume only, which is what Cboe
 * publishes; the ratio is the conventional one to watch even though most
 * options volume trades elsewhere.
 *
 * Ten-day ratios of sums, not averages of daily ratios: a quiet day's ratio
 * should not weigh as much as a busy day's.
 */
const WINDOW = 10;
const SPARK_DAYS = 252;

interface Row {
  trade_date: string;
  equity_call: number;
  equity_put: number;
  spx_call: number | null;
  spx_put: number | null;
}

function rolling(rows: Row[], call: (r: Row) => number | null, put: (r: Row) => number | null) {
  const usable = rows.filter((r) => (call(r) ?? 0) > 0 && put(r) !== null);
  return usable.slice(WINDOW - 1).map((r, i) => {
    const window = usable.slice(i, i + WINDOW);
    const puts = window.reduce((a, w) => a + (put(w) as number), 0);
    const calls = window.reduce((a, w) => a + (call(w) as number), 0);
    return { date: r.trade_date, value: puts / calls };
  });
}

// Cached for an hour, like the portfolio page's price history: the table
// changes once a day and the page around it rebuilds every five minutes. A
// failed or not-yet-backfilled read throws instead of returning, because
// unstable_cache never caches a throw; returning it would pin "unavailable"
// for the whole hour.
const loadRows = unstable_cache(
  async () => {
    const rows = await fetchAllRows<Row>("cboe_put_call", "trade_date, equity_call, equity_put, spx_call, spx_put", "trade_date");
    if (!rows || rows.length < SPARK_DAYS) throw new Error(`cboe_put_call: ${rows?.length ?? "no"} rows`);
    return rows;
  },
  ["cboe-put-call"],
  { revalidate: 3600 },
);

export async function fetchPutCall(): Promise<PositioningSource> {
  let rows: Row[];
  try {
    rows = await loadRows();
  } catch (e) {
    console.error("[cboe-put-call]", e);
    return UNAVAILABLE;
  }

  const equity = rolling(rows, (r) => r.equity_call, (r) => r.equity_put);
  const spx = rolling(rows, (r) => r.spx_call, (r) => r.spx_put);
  const last = rows[rows.length - 1];

  return trimFloats({
    asOf: formatDay(last.trade_date),
    unavailable: false,
    readings: [
      {
        id: "equity-pc",
        label: "Equity put/call, 10-day",
        value: equity[equity.length - 1].value.toFixed(2),
        detail: `today ${(last.equity_put / last.equity_call).toFixed(2)}`,
        ...rankLatest(equity),
        history: equity.slice(-SPARK_DAYS).map((o) => o.value),
        read: "Single-stock options, where retail trades. Low means call buying and complacency; high means fear. Contrarian at the extremes.",
      },
      {
        id: "spx-pc",
        label: "SPX put/call, 10-day",
        value: spx[spx.length - 1].value.toFixed(2),
        detail: last.spx_call ? `today ${((last.spx_put as number) / last.spx_call).toFixed(2)}` : null,
        ...rankLatest(spx),
        history: spx.slice(-SPARK_DAYS).map((o) => o.value),
        read: "Index options are mostly institutional hedging, so this sits well above 1. A low reading means hedges are being lifted.",
      },
    ],
  });
}
