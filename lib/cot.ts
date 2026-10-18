import { trimFloats } from "./precision";
import { formatDay, rankLatest, signed, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * E-mini S&P 500 positioning from the CFTC's Traders in Financial Futures
 * report, futures only.
 *
 * Served by the CFTC's own Socrata API, dataset gpe5-46if ("TFF - Futures
 * Only"), no key. Contract 13874A has 1,062 weekly reports back to 2006-06-13,
 * confirmed 2026-10-17. Each report is Tuesday's positions, published the
 * following Friday at 3:30pm ET.
 *
 * Positions are shown net as a share of open interest rather than as contract
 * counts: open interest swings with each quarterly roll and has grown over
 * twenty years, and a share of it is comparable across both.
 */
const API =
  "https://publicreporting.cftc.gov/resource/gpe5-46if.json" +
  "?cftc_contract_market_code=13874A" +
  "&$select=report_date_as_yyyy_mm_dd,open_interest_all," +
  "asset_mgr_positions_long,asset_mgr_positions_short," +
  "lev_money_positions_long,lev_money_positions_short," +
  "dealer_positions_long_all,dealer_positions_short_all" +
  "&$order=report_date_as_yyyy_mm_dd%20ASC&$limit=5000";

const SPARK_WEEKS = 156;

type Raw = Record<string, string | undefined>;

const GROUPS = [
  {
    id: "asset",
    label: "Asset managers, net",
    long: "asset_mgr_positions_long",
    short: "asset_mgr_positions_short",
    read: "Pensions, insurers and funds. A high reading means real money is already fully long, so there is less of it left to buy.",
  },
  {
    id: "lev",
    label: "Leveraged funds, net",
    long: "lev_money_positions_long",
    short: "lev_money_positions_short",
    read: "Hedge funds and CTAs. Structurally net short because of the cash-futures basis trade, so read the percentile, not the sign.",
  },
  {
    id: "dealer",
    label: "Dealers, net",
    long: "dealer_positions_long_all",
    short: "dealer_positions_short_all",
    read: "Banks' books, mostly the other side of the two groups above.",
  },
] as const;

export async function fetchCot(): Promise<PositioningSource> {
  let raw: Raw[];
  try {
    const res = await fetch(API, { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.error(`[cot] HTTP ${res.status}`);
      return UNAVAILABLE;
    }
    raw = await res.json();
  } catch (e) {
    console.error("[cot] threw:", e);
    return UNAVAILABLE;
  }

  const weeks = raw
    .map((r) => ({ date: (r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10), r, oi: Number(r.open_interest_all) }))
    .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date) && w.oi > 0);
  if (weeks.length < SPARK_WEEKS) return UNAVAILABLE;

  const readings = GROUPS.map((g) => {
    const series = weeks
      .map((w) => ({ date: w.date, value: ((Number(w.r[g.long]) - Number(w.r[g.short])) / w.oi) * 100 }))
      .filter((p) => Number.isFinite(p.value));
    const last = series[series.length - 1].value;
    const prev = series[series.length - 2].value;
    return {
      id: g.id,
      label: g.label,
      value: `${signed(last)}%`,
      detail: `${signed(last - prev)}pp on the week · % of open interest`,
      ...rankLatest(series),
      history: series.slice(-SPARK_WEEKS).map((p) => p.value),
      read: g.read,
    };
  });

  return trimFloats({
    asOf: `positions ${formatDay(weeks[weeks.length - 1].date)}`,
    unavailable: false,
    readings,
  });
}
