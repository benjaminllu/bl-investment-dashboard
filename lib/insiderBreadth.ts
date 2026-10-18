import { unstable_cache } from "next/cache";
import { trimFloats } from "./precision";
import { fetchAllRows } from "./supabasePaged";
import { formatDay, rankLatest, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * Market-wide insider buying and selling from `insider_breadth`, written by
 * scripts/update-insider-breadth.js: per Form 4 filing date, the number of
 * distinct companies with an open-market insider purchase and with a sale.
 *
 * Summed over twenty filing days, about a month. Daily counts swing with
 * earnings-season blackout windows, when insiders at most companies cannot
 * trade at all.
 */
const WINDOW = 20;
const SPARK_DAYS = 252;

interface Row {
  filing_date: string;
  buy_issuers: number;
  sell_issuers: number;
}

const loadRows = unstable_cache(
  () => fetchAllRows<Row>("insider_breadth", "filing_date, buy_issuers, sell_issuers", "filing_date"),
  ["insider-breadth"],
  { revalidate: 3600 },
);

export async function fetchInsiderBreadth(): Promise<PositioningSource> {
  const rows = await loadRows();
  if (!rows || rows.length < SPARK_DAYS) return UNAVAILABLE;

  const sums = rows.slice(WINDOW - 1).map((r, i) => {
    const window = rows.slice(i, i + WINDOW);
    return {
      date: r.filing_date,
      buys: window.reduce((a, w) => a + w.buy_issuers, 0),
      sells: window.reduce((a, w) => a + w.sell_issuers, 0),
    };
  });
  const ratio = sums.filter((s) => s.sells > 0).map((s) => ({ date: s.date, value: s.buys / s.sells }));
  const buyers = sums.map((s) => ({ date: s.date, value: s.buys }));
  const last = sums[sums.length - 1];

  return trimFloats({
    asOf: `filed to ${formatDay(last.date)}`,
    unavailable: false,
    readings: [
      {
        id: "insider-ratio",
        label: "Insider buyers per seller, 20 days",
        value: ratio[ratio.length - 1].value.toFixed(2),
        detail: `${last.buys} company-days with buying · ${last.sells} with selling`,
        ...rankLatest(ratio),
        history: ratio.slice(-SPARK_DAYS).map((o) => o.value),
        read: "Companies with open-market insider purchases per company with sales. Always below 1, because insiders sell for many reasons and buy for one; clusters of buying after selloffs are the signal.",
      },
      {
        id: "insider-buyers",
        label: "Companies with insider buying, 20 days",
        value: String(last.buys),
        detail: "summed daily counts of distinct issuers",
        ...rankLatest(buyers),
        history: buyers.slice(-SPARK_DAYS).map((o) => o.value),
        read: "The raw count of insider buying. Broad buying across many companies has tended to come near lows.",
      },
    ],
  });
}
