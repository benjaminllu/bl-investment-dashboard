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

// Finnhub has no futures asset class at all — /futures/* endpoints don't exist
// (unlike /forex/* and /crypto/*), symbol search returns nothing for "E-mini",
// and /quote answers c:0 for every ES format. Their free S&P futures tick dataset
// is a static 2000-2019 Kaggle dump, not an API. So the front-month E-mini comes
// from Yahoo's chart endpoint instead.
//
// That endpoint is unofficial and unsupported, so every failure path returns
// nulls: callers already gate the futures line on a non-null price, meaning a
// breakage degrades to simply omitting it rather than erroring.
export async function fetchSpFutures(): Promise<IndexQuote> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/ES=F?range=1d&interval=1d",
      {
        next: { revalidate: 300 },
        // Yahoo rejects requests without a browser-like agent.
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    if (!res.ok) return { price: null, changePct: null };
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prevClose =
      typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
    if (price === null || prevClose === null || prevClose === 0) {
      return { price, changePct: null };
    }
    return { price, changePct: ((price - prevClose) / prevClose) * 100 };
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
