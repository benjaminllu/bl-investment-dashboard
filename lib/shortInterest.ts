import { trimFloats } from "./precision";
import { formatDay, rankLatest, signed, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * Short interest in the three broad index ETFs, from FINRA's public Query API
 * (consolidatedShortInterest, no key). SPY has 211 twice-monthly settlement
 * dates back to 2017-12-29, confirmed 2026-10-17.
 *
 * The API refuses a sort unless the request pins settlementDate, so each ETF's
 * whole history is pulled unsorted (a couple of hundred rows) and sorted here.
 *
 * ETF short interest is partly market makers hedging creation and redemption,
 * so it is a hedging-demand gauge more than a count of bears.
 */
const API = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest";
const ETFS = ["SPY", "QQQ", "IWM"] as const;

const READS: Record<(typeof ETFS)[number], string> = {
  SPY: "Shares short divided by average daily volume. Rising means more hedging demand against the index; very low means little protection in place.",
  QQQ: "The same measure for the Nasdaq-100, where hedges against large-cap tech concentrate.",
  IWM: "The same measure for the Russell 2000. Small caps are the usual short hedge, so this runs higher than SPY.",
};

interface Row {
  settlementDate: string;
  currentShortPositionQuantity: number;
  daysToCoverQuantity: number;
}

async function fetchEtf(symbol: string): Promise<Row[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      limit: 5000,
      compareFilters: [{ compareType: "EQUAL", fieldName: "symbolCode", fieldValue: symbol }],
      fields: ["settlementDate", "currentShortPositionQuantity", "daysToCoverQuantity"],
    }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const rows: Row[] = await res.json();
  return rows
    .filter((r) => r.settlementDate && Number.isFinite(r.daysToCoverQuantity))
    .sort((a, b) => a.settlementDate.localeCompare(b.settlementDate));
}

export async function fetchShortInterest(): Promise<PositioningSource> {
  let all: Row[][];
  try {
    all = await Promise.all(ETFS.map(fetchEtf));
  } catch (e) {
    console.error("[short interest] fetch failed:", e);
    return UNAVAILABLE;
  }
  if (all.some((rows) => rows.length < 24)) return UNAVAILABLE;

  const readings = ETFS.map((symbol, i) => {
    const rows = all[i];
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const change = (last.currentShortPositionQuantity / prev.currentShortPositionQuantity - 1) * 100;
    return {
      id: symbol,
      label: `${symbol} days to cover`,
      value: last.daysToCoverQuantity.toFixed(2),
      detail: `${(last.currentShortPositionQuantity / 1e6).toFixed(0)}m shares short · ${signed(change)}% since prior report`,
      ...rankLatest(rows.map((r) => ({ date: r.settlementDate, value: r.daysToCoverQuantity }))),
      history: rows.slice(-48).map((r) => r.daysToCoverQuantity),
      read: READS[symbol],
    };
  });

  return trimFloats({
    asOf: `settled ${formatDay(all[0][all[0].length - 1].settlementDate)}`,
    unavailable: false,
    readings,
  });
}
