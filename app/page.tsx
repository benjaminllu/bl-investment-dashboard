import WatchlistPanel from "@/components/WatchlistPanel";
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
    supabase.from("stock_quotes").select("ticker, price, change_pct, updated_at"),
  ]);

  if (error || !watchlist) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  const quoteMap = new Map(
    (quotes ?? []).map((q) => [
      q.ticker,
      { price: q.price ?? 0, changePct: q.change_pct ?? 0, updatedAt: q.updated_at ?? null },
    ])
  );

  const stocks = watchlist.map((stock) => {
    const { price, changePct, updatedAt } = quoteMap.get(stock.ticker) ?? {
      price: 0,
      changePct: 0,
      updatedAt: null,
    };
    return { ...stock, price, changePct, updatedAt };
  });

  const [articles, watchlistNews, marketNews] = await Promise.all([
    getLatestArticles(10),
    fetchWatchlistNews(),
    fetchMarketNews(),
  ]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-screen-2xl p-6">
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
