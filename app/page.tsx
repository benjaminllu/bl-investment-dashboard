import WatchlistPanel from "@/components/WatchlistPanel";
import { supabase } from "@/lib/supabase";
import ResearchFeed from "@/components/ResearchFeed";
import { getLatestArticles } from "@/lib/substack";
import { fetchWatchlistNews, fetchMarketNews } from "@/lib/finnhubNews";

export default async function Home() {
  const [
    { data: watchlist, error },
    { data: quotes },
    { data: fundamentals },
  ] = await Promise.all([
    supabase.from("stocks").select("*").order("created_at", { ascending: true }),
    supabase.from("stock_quotes").select("ticker, price, change_pct, updated_at"),
    supabase
      .from("stock_fundamentals")
      .select("ticker, market_cap, market_cap_currency, mspr, mspr_year, mspr_month"),
  ]);

  if (error || !watchlist) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  const quoteMap = new Map(
    (quotes ?? []).map((q) => [
      q.ticker,
      { price: q.price ?? 0, changePct: q.change_pct ?? 0, updatedAt: q.updated_at ?? null },
    ])
  );

  // Fundamentals come from a separate daily job, so a ticker can legitimately
  // have a quote but no fundamentals row yet (or ever — ETFs and foreign
  // listings have no Finnhub profile or SEC insider filings).
  const fundamentalsMap = new Map(
    (fundamentals ?? []).map((f) => [
      f.ticker,
      {
        marketCap: f.market_cap ?? null,
        marketCapCurrency: f.market_cap_currency ?? null,
        mspr: f.mspr ?? null,
        msprYear: f.mspr_year ?? null,
        msprMonth: f.mspr_month ?? null,
      },
    ])
  );

  const stocks = watchlist.map((stock) => {
    const { price, changePct, updatedAt } = quoteMap.get(stock.ticker) ?? {
      price: 0,
      changePct: 0,
      updatedAt: null,
    };
    const fundamental = fundamentalsMap.get(stock.ticker) ?? {
      marketCap: null,
      marketCapCurrency: null,
      mspr: null,
      msprYear: null,
      msprMonth: null,
    };
    return { ...stock, price, changePct, updatedAt, ...fundamental };
  });

  const [articles, watchlistNews, marketNews] = await Promise.all([
    getLatestArticles(10),
    fetchWatchlistNews(),
    fetchMarketNews(),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="flex flex-col gap-4 items-start lg:flex-row">
          <div className="min-w-0 w-full flex-1">
            <WatchlistPanel stocks={stocks} />
          </div>
          <div className="w-full shrink-0 lg:w-1/4">
            <ResearchFeed articles={articles} watchlistNews={watchlistNews} marketNews={marketNews} />
          </div>
        </div>
      </div>
    </main>
  );
}
