import { trimFloats } from "./precision";
import { fetchFredSeries, type Obs } from "./fredSeries";
import { quarterLabel } from "./allocationSupply";
import { rankLatest, signed, UNAVAILABLE, type PositioningSource } from "./positioning";

/**
 * Two flow gauges from FRED, both confirmed 2026-10-17:
 *
 *  - Foreign net purchases of US equities, Treasury TIC data
 *    (FORLTEQTYNET99996, "Grand Total", $m, monthly since 1985, NSA).
 *  - Money-market fund assets against the market value of US nonfinancial
 *    stock (MMMFFAQ027S over NCBEILQ027S, both Fed Z.1, quarterly), the
 *    "cash on the sidelines" ratio.
 *
 * ICI's weekly fund-flow series is not here: it is not on FRED, and this
 * panel only uses sources with a stable public API.
 */
const TIC = "FORLTEQTYNET99996";
const MMF = "MMMFFAQ027S";
const EQUITY_VALUE = "NCBEILQ027S";

function monthLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function fetchFundFlows(): Promise<PositioningSource> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return UNAVAILABLE;

  let tic: Obs[], mmf: Obs[], equity: Obs[];
  try {
    [tic, mmf, equity] = await Promise.all([TIC, MMF, EQUITY_VALUE].map((id) => fetchFredSeries(id, apiKey)));
  } catch (e) {
    console.error("[fund flows] fetch failed:", e);
    return UNAVAILABLE;
  }
  if (tic.length < 24 || mmf.length < 20 || equity.length < 20) return UNAVAILABLE;

  // Twelve-month sum: single months swing on one large cross-border deal. Kept
  // in dollars rather than scaled, so the percentile leans recent; the label
  // says so.
  const trailing = tic.slice(11).map((o, i) => ({
    date: o.date,
    value: tic.slice(i, i + 12).reduce((a, m) => a + m.value, 0) / 1000,
  }));
  const tLast = trailing[trailing.length - 1];
  const monthLast = tic[tic.length - 1];

  const equityByDate = new Map(equity.map((o) => [o.date, o.value]));
  // FRED carries the series back to 1945 as zeros; money funds only began in the 1970s.
  const cashRatio = mmf
    .filter((o) => o.value > 0 && (equityByDate.get(o.date) ?? 0) > 0)
    .map((o) => ({ date: o.date, value: (o.value / (equityByDate.get(o.date) as number)) * 100 }));
  const cLast = cashRatio[cashRatio.length - 1];

  return trimFloats({
    asOf: `TIC ${monthLabel(monthLast.date)} · Z.1 ${quarterLabel(cLast.date)}`,
    unavailable: false,
    readings: [
      {
        id: "foreign",
        label: "Foreign net buying of US stocks",
        value: `${tLast.value < 0 ? "−" : ""}$${Math.round(Math.abs(tLast.value)).toLocaleString("en-US")}bn`,
        detail: `trailing 12 months · latest month ${signed(monthLast.value / 1000, 1)}bn`,
        ...rankLatest(trailing),
        history: trailing.slice(-120).map((o) => o.value),
        read: "Overseas investors' purchases minus sales of US equities. In nominal dollars, so recent years rank high partly because markets are bigger.",
      },
      {
        id: "cash",
        label: "Money funds vs stocks",
        value: `${cLast.value.toFixed(1)}%`,
        detail: "money-market fund assets ÷ nonfinancial equity market value",
        ...rankLatest(cashRatio),
        history: cashRatio.slice(-120).map((o) => o.value),
        read: "Cash parked in money funds relative to the stock market. Low means little dry powder left on the sidelines; high means plenty that could rotate in.",
      },
    ],
  });
}
