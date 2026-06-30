import { Suspense } from "react";
import WatchlistPanel from "@/components/WatchlistPanel";
import MarketBanner from "@/components/MarketBanner";
import { supabase } from "@/lib/supabase";
import ResearchFeed from "@/components/ResearchFeed";
import { getLatestArticles } from "@/lib/substack";
import { fetchWatchlistNews, fetchMarketNews } from "@/lib/finnhubNews";

export default async function Home() {
  const [
    { data: watchlist, error },
    { data: quotes },
  ] = await Promise.all([
    supabase.from("stocks").select("*").order("created_at", { ascending: true }),
    supabase.from("stock_quotes").select("ticker, price, change_pct"),
  ]);

  if (error || !watchlist) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  const quoteMap = new Map(
    (quotes ?? []).map((q) => [q.ticker, { price: q.price ?? 0, changePct: q.change_pct ?? 0 }])
  );

  const stocks = watchlist.map((stock) => {
    const { price, changePct } = quoteMap.get(stock.ticker) ?? { price: 0, changePct: 0 };
    return { ...stock, price, changePct };
  });

  const [articles, watchlistNews, marketNews] = await Promise.all([
    getLatestArticles(10),
    fetchWatchlistNews(),
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
