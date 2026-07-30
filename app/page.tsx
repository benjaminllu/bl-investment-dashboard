import WatchlistPanel from "@/components/WatchlistPanel";
import { type EarningsRow } from "@/components/EarningsPanel";
import { supabase } from "@/lib/supabase";
import ResearchFeed from "@/components/ResearchFeed";
import { getLatestArticles } from "@/lib/substack";
import { fetchWatchlistNews, fetchMarketNews } from "@/lib/finnhubNews";

export default async function Home() {
  const [
    { data: watchlist, error },
    { data: quotes },
    { data: fundamentals },
    { data: earnings, error: earningsError },
  ] = await Promise.all([
    supabase.from("stocks").select("*").order("created_at", { ascending: true }),
    supabase.from("stock_quotes").select("ticker, price, change_pct, updated_at"),
    supabase
      .from("stock_fundamentals")
      .select("ticker, market_cap, market_cap_currency, mspr, mspr_year, mspr_month"),
    supabase
      .from("stock_earnings")
      .select("ticker, source_symbol, date, hour, quarter, year, eps_estimate, revenue_estimate")
      .order("date", { ascending: true }),
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

  // A failed earnings query is NOT the same as a ticker having no earnings
  // scheduled, and must not render as one: when the `stock_earnings` table was
  // missing entirely, discarding this error made all 126 tickers read
  // "No scheduled earnings" instead of surfacing the real fault.
  if (earningsError) {
    console.error(
      `[home] stock_earnings query failed (${earningsError.code}): ${earningsError.message}`
    );
  }

  // Grouped into a plain object rather than a Map because this crosses the
  // server/client boundary into WatchlistPanel. The query is already ordered by
  // date, so each ticker's array comes out chronological without re-sorting.
  const earningsByTicker: Record<string, EarningsRow[]> = {};
  for (const row of earnings ?? []) {
    (earningsByTicker[row.ticker] ??= []).push({
      ticker: row.ticker,
      sourceSymbol: row.source_symbol ?? null,
      date: row.date,
      hour: row.hour ?? null,
      quarter: row.quarter ?? null,
      year: row.year ?? null,
      epsEstimate: row.eps_estimate ?? null,
      revenueEstimate: row.revenue_estimate ?? null,
    });
  }

  // Today in UTC, matching how EarningsPanel compares date-only strings.
  const now = new Date();
  const todayIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .split("T")[0];

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
    // Earliest date not already past. Rows are date-ordered from the query, so
    // the first match is the next one.
    const nextEarnings =
      (earningsByTicker[stock.ticker] ?? []).find((e) => e.date >= todayIso)?.date ?? null;
    return { ...stock, price, changePct, updatedAt, ...fundamental, nextEarnings };
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
            <WatchlistPanel
              stocks={stocks}
              earnings={earningsByTicker}
              earningsUnavailable={Boolean(earningsError)}
            />
          </div>
          <div className="w-full shrink-0 lg:w-1/4">
            <ResearchFeed articles={articles} watchlistNews={watchlistNews} marketNews={marketNews} />
          </div>
        </div>
      </div>
    </main>
  );
}
