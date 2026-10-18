import { trimFloats } from "./precision";
import { formatDay, rankLatest, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * SPX gamma exposure (GEX) and the dark index (DIX), from SqueezeMetrics.
 *
 * Their daily signal is a paid product, but the full history back to May 2011
 * is published as a free CSV (date, price, dix, gex) that is updated each
 * session. Confirmed live on 2026-10-17 through the 2026-10-16 close: 3,889
 * rows, 223KB, no key.
 *
 * GEX is in dollars. Its median since 2011 is about $2.6bn, it has run from
 * −$7.5bn to +$24bn, and it was negative on 347 of those days.
 */
const CSV_URL = "https://squeezemetrics.com/monitor/static/DIX.csv";

/**
 * GEX is ranked against three years, not its whole history. It is a dollar
 * amount that grows with the index and the options market, so a 2026 reading
 * against 2011 would sit near the top for that reason alone. DIX is a ratio,
 * so its full history is a fair comparison.
 */
const GEX_WINDOW_DAYS = 756;
const SPARK_DAYS = 252;

interface Row {
  date: string;
  dix: number;
  gex: number;
}

function parse(csv: string): Row[] {
  const rows: Row[] = [];
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [date, , dix, gex] = line.split(",");
    const d = Number(dix);
    const g = Number(gex);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(d) && Number.isFinite(g)) {
      rows.push({ date, dix: d, gex: g });
    }
  }
  return rows;
}

export async function fetchGammaExposure(): Promise<PositioningSource> {
  let rows: Row[];
  try {
    const res = await fetch(CSV_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.error(`[gex] HTTP ${res.status}`);
      return UNAVAILABLE;
    }
    rows = parse(await res.text());
  } catch (e) {
    console.error("[gex] threw:", e);
    return UNAVAILABLE;
  }
  if (rows.length < SPARK_DAYS) return UNAVAILABLE;

  const last = rows[rows.length - 1];
  const gexSeries = rows.slice(-GEX_WINDOW_DAYS).map((r) => ({ date: r.date, value: r.gex }));
  const dixSeries = rows.map((r) => ({ date: r.date, value: r.dix }));
  const recent = rows.slice(-SPARK_DAYS);
  const dix20 = rows.slice(-20).reduce((a, r) => a + r.dix, 0) / 20;
  const positive = last.gex >= 0;

  return trimFloats({
    asOf: formatDay(last.date),
    unavailable: false,
    readings: [
      {
        id: "gex",
        label: "Gamma exposure",
        value: `${last.gex < 0 ? "−" : ""}$${Math.abs(last.gex / 1e9).toFixed(1)}bn`,
        detail: positive ? "Positive gamma" : "Negative gamma",
        ...rankLatest(gexSeries),
        history: recent.map((r) => r.gex / 1e9),
        read: positive
          ? "Dealers are long gamma: their hedging sells rallies and buys dips, which damps moves. Near zero, that cushion is thin."
          : "Dealers are short gamma: their hedging chases the move, so swings tend to run further.",
      },
      {
        id: "dix",
        label: "Dark index (DIX)",
        value: `${(last.dix * 100).toFixed(1)}%`,
        detail: `20-day average ${(dix20 * 100).toFixed(1)}%`,
        ...rankLatest(dixSeries),
        history: recent.map((r) => r.dix * 100),
        read: "Short sales as a share of dark-pool volume. SqueezeMetrics reads high values as buying, since market makers short to fill buyers there.",
      },
    ],
  });
}
