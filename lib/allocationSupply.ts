import { trimFloats } from "./precision";
import { fetchFredSeries as fetchSeries, type Obs } from "./fredSeries";
import { rankLatest, signed, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * The slow side of positioning, from the Fed's Financial Accounts (Z.1) via
 * FRED: how much of household wealth is already in stocks, and whether
 * companies are adding to the supply of stock or retiring it.
 *
 * Quarterly, published roughly ten weeks after the quarter ends. All three
 * series confirmed on FRED 2026-10-17, history from 1945–46 through Q2 2026.
 */
const HOUSEHOLD_EQUITY = "BOGZ1FL153064486Q"; // percent of financial assets, NSA
const NET_ISSUANCE = "NCBCEBQ027S"; // nonfinancial corporate equities, transactions, $m SAAR
const MARKET_VALUE = "NCBEILQ027S"; // nonfinancial corporate equities, level, $m

/** FRED dates a quarter by its first day; "2026-04-01" is Q2 2026. */
export function quarterLabel(iso: string): string {
  return `Q${Math.floor(Number(iso.slice(5, 7)) / 3) + 1} ${iso.slice(0, 4)}`;
}

export async function fetchAllocationSupply(): Promise<PositioningSource> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return UNAVAILABLE;

  let household: Obs[], issuance: Obs[], marketValue: Obs[];
  try {
    [household, issuance, marketValue] = await Promise.all(
      [HOUSEHOLD_EQUITY, NET_ISSUANCE, MARKET_VALUE].map((id) => fetchSeries(id, apiKey)),
    );
  } catch (e) {
    console.error("[allocation] fetch failed:", e);
    return UNAVAILABLE;
  }
  if (household.length < 20 || issuance.length < 20 || marketValue.length < 20) return UNAVAILABLE;

  // Issuance as a share of the stock's own market value, so 1950 and 2026 are
  // on one scale. The flow is already an annual rate, so this is %/yr.
  const valueByDate = new Map(marketValue.map((o) => [o.date, o.value]));
  const quarterly = issuance
    .filter((o) => (valueByDate.get(o.date) ?? 0) > 0)
    .map((o) => ({ date: o.date, value: (o.value / (valueByDate.get(o.date) as number)) * 100 }));
  // Trailing four quarters: a single quarter is dominated by whichever large
  // merger or buyback happened to close in it.
  const smoothed = quarterly.slice(3).map((o, i) => ({
    date: o.date,
    value: quarterly.slice(i, i + 4).reduce((a, q) => a + q.value, 0) / 4,
  }));

  const hLast = household[household.length - 1];
  const hYearAgo = household[household.length - 5];
  const sLast = smoothed[smoothed.length - 1];
  const qLast = quarterly[quarterly.length - 1];

  return trimFloats({
    asOf: quarterLabel(hLast.date),
    unavailable: false,
    readings: [
      {
        id: "household",
        label: "Household equity allocation",
        value: `${hLast.value.toFixed(1)}%`,
        detail: `of financial assets · ${signed(hLast.value - hYearAgo.value, 1)}pp on the year`,
        ...rankLatest(household),
        history: household.slice(-120).map((o) => o.value),
        read: "Stocks held directly and through funds, as a share of household financial assets. High readings have preceded weak long-run returns; it is a regime gauge, not a timing tool.",
      },
      {
        id: "issuance",
        label: "Net equity issuance",
        value: `${signed(sLast.value, 2)}%`,
        detail: `of market value per year, trailing 4Q · latest quarter ${signed(qLast.value, 2)}%`,
        ...rankLatest(smoothed),
        history: smoothed.slice(-120).map((o) => o.value),
        read: "Nonfinancial companies' new stock minus buybacks and cash takeovers. Negative means supply is shrinking; issuance waves have tended to come late in a cycle.",
      },
    ],
  });
}
