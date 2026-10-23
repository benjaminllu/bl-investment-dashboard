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
}

export interface IndexRow {
  label: string;
  ticker: string;
  price: number | null;
  changePct: number | null;
}

export async function fetchIndexQuote(ticker: string): Promise<IndexQuote> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { price: null, changePct: null };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return {
      price: typeof data.c === "number" && data.c !== 0 ? data.c : null,
      changePct: typeof data.dp === "number" && data.c !== 0 ? data.dp : null,
    };
  } catch {
    return { price: null, changePct: null };
  }
}

/** Every index, settled. A failed leg becomes nulls rather than rejecting. */
export async function fetchIndexRows(): Promise<IndexRow[]> {
  const results = await Promise.allSettled(INDICES.map((idx) => fetchIndexQuote(idx.ticker)));
  return INDICES.map((idx, i) => {
    const quote =
      results[i].status === "fulfilled"
        ? (results[i] as PromiseFulfilledResult<IndexQuote>).value
        : { price: null, changePct: null };
    return { ...idx, price: quote.price, changePct: quote.changePct };
  });
}
