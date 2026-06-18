import { Suspense } from "react";
import WatchlistPanel from "@/components/WatchlistPanel";
import MarketBanner from "@/components/MarketBanner";
import { supabase } from "@/lib/supabase";
import ResearchFeed from "@/components/ResearchFeed";
import { getLatestArticles } from "@/lib/substack";
import { fetchWatchlistNews, fetchMarketNews } from "@/lib/finnhubNews";

async function fetchQuote(ticker: string): Promise<{ price: number; changePct: number }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { price: 0, changePct: 0 };
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 300 } }
    );
    const data = await res.json();
    return { price: data.c ?? 0, changePct: data.dp ?? 0 };
  } catch {
    return { price: 0, changePct: 0 };
  }
}

export default async function Home() {
  const { data: watchlist, error } = await supabase
    .from("stocks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !watchlist) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  const stocks = await Promise.all(
    watchlist.map(async (stock) => { 
      const { price, changePct } = await fetchQuote(stock.ticker);
      return { ...stock, price, changePct };
    })
  );

  const validPrices = stocks.filter((s) => s.price > 0);
  const tickers = (validPrices.length > 0 ? validPrices : stocks).map((s) => s.ticker);
  const [articles, watchlistNews, marketNews] = await Promise.all([
    getLatestArticles(10),
    fetchWatchlistNews(tickers),
    fetchMarketNews(),
  ]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-screen-2xl p-6">

        <div className="mt-0 mb-2 rounded-xl bg-slate-900 p-4">
          <Suspense fallback={
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="h-4 w-64 animate-pulse rounded bg-slate-800" />
              <div className="flex flex-wrap items-center gap-6">
                {["S&P 500", "NASDAQ", "DOW", "Russell 2000", "Gold", "Oil", "Copper"].map((label) => (
                  <div key={label} className="text-center">
                    <p className="text-xs text-slate-400">{label}</p>
                    <div className="mt-1 h-4 w-12 animate-pulse rounded bg-slate-800" />
                  </div>
                ))}
                <div className="h-6 w-px bg-slate-700" />
                {["2Y Yield", "10Y Yield"].map((label) => (
                  <div key={label} className="text-center">
                    <p className="text-xs text-slate-400">{label}</p>
                    <div className="mt-1 h-4 w-16 animate-pulse rounded bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          }>
            <MarketBanner />
          </Suspense>
        </div>

        <div className="flex gap-6 items-start">
          <div className="min-w-0 flex-1">
            <WatchlistPanel stocks={stocks} />
          </div>
          <div className="w-1/4 shrink-0">
            <ResearchFeed articles={articles} watchlistNews={watchlistNews} marketNews={marketNews} />
          </div>
        </div>
      </div>
    </main>
  );
}
