/**
 * The index strip's quotes, extracted from the old components/MarketBanner.tsx
 * when the shell replaced it.
 *
 * Moved rather than copied on purpose: the banner and the Console preview's
 * tape show the same seven indices, and a second implementation would let the
 * two disagree about a price with nothing to catch it. The fetches, the
 * revalidate window and the failure behaviour below are the banner's, unchanged.
 */

export const INDICES = [
  { label: "SPY", ticker: "SPY" },
  { label: "QQQ", ticker: "QQQ" },
  { label: "DOW", ticker: "DIA" },
  { label: "Russell 2K", ticker: "IWM" },
  { label: "Gold", ticker: "GLD" },
  { label: "Oil", ticker: "USO" },
  { label: "Copper", ticker: "CPER" },
];

export interface IndexQuote {
  price: number | null;
  changePct: number | null;
  /** When the quote's last trade printed, epoch seconds. */
  time: number | null;
}

export interface IndexRow {
  label: string;
  ticker: string;
  price: number | null;
  changePct: number | null;
  time: number | null;
  /** Set when the row is not the ticker's own quote, to say what it is instead. */
  title?: string;
}

export async function fetchIndexQuote(ticker: string): Promise<IndexQuote> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { price: null, changePct: null, time: null };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return {
      price: typeof data.c === "number" && data.c !== 0 ? data.c : null,
      changePct: typeof data.dp === "number" && data.c !== 0 ? data.dp : null,
      time: typeof data.t === "number" && data.t > 0 ? data.t : null,
    };
  } catch {
    return { price: null, changePct: null, time: null };
  }
}

/** Every index, settled. A failed leg becomes nulls rather than rejecting. */
export async function fetchIndexRows(): Promise<IndexRow[]> {
  const results = await Promise.allSettled(INDICES.map((idx) => fetchIndexQuote(idx.ticker)));
  return INDICES.map((idx, i) => {
    const quote =
      results[i].status === "fulfilled"
        ? (results[i] as PromiseFulfilledResult<IndexQuote>).value
        : { price: null, changePct: null, time: null };
    return { ...idx, price: quote.price, changePct: quote.changePct, time: quote.time };
  });
}

/** SPY's quote counts as current while its last trade is younger than this. */
const SPY_FRESH_SECONDS = 20 * 60;

/**
 * Swaps the SPY row for the Hyperliquid S&P 500 perp whenever SPY's last
 * trade is older than 20 minutes: after the close, overnight, at weekends and
 * on holidays, with no market calendar to maintain. Finnhub's quote time is
 * the last trade's, so it stops moving exactly when the market does.
 */
export function withFresherSp(
  rows: IndexRow[],
  perp: { price: number | null; changePct: number | null },
  nowSeconds: number
): IndexRow[] {
  return rows.map((row) => {
    if (row.ticker !== "SPY" || perp.price === null) return row;
    if (row.time !== null && nowSeconds - row.time < SPY_FRESH_SECONDS) return row;
    return {
      label: "S&P·HL",
      ticker: "xyz:SP500",
      price: perp.price,
      changePct: perp.changePct,
      time: nowSeconds,
      title:
        "Hyperliquid S&P 500 perpetual (trade.xyz), which trades 24/7. Shown while SPY's quote is more than 20 minutes old; the change is since the last official S&P 500 close.",
    };
  });
}
