import WatchlistPanel from "@/components/WatchlistPanel";
import ResearchFeed from "@/components/ResearchFeed";
import MarketDigestPanel from "@/components/MarketDigestPanel";
import MoversPanel from "@/components/MoversPanel";
import { fetchWatchlistData } from "@/lib/watchlist";
import { getLatestArticles } from "@/lib/substack";
import { fetchWatchlistNews, fetchMarketNews } from "@/lib/finnhubNews";
import { fetchMarketDigest } from "@/lib/marketDigest";

export default async function Home() {
  // One stage rather than two. The watchlist join used to run as its own awaited
  // batch before the news fetches could start, so the page paid Supabase and
  // Substack serially; behind fetchWatchlistData they now overlap.
  const [watchlist, articles, watchlistNews, marketNews, digestResult] = await Promise.all([
    fetchWatchlistData(),
    getLatestArticles(10),
    fetchWatchlistNews(),
    fetchMarketNews(),
    fetchMarketDigest(),
  ]);

  if (watchlist.error) {
    console.error(`[home] watchlist unavailable (${watchlist.error})`);
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-3xl p-4">
        {/* Above the watchlist: this is the 9am briefing, and it is the one
            thing on the page that is read once, in order, rather than scanned.
            Boxing it into the research column would put ten ranked stories in a
            quarter-width rail beside a feed that is already unranked market
            news. */}
        {/* The digest gives up ~200px on the right to the movers rail rather
            than the rail getting its own band: both are read in the same
            glance, and a full-width strip of six tickers would cost more
            vertical space than it is worth. Below xl the rail drops beneath the
            digest, where the two-column digest layout already takes over. */}
        <div className="mb-4 flex flex-col gap-2 xl:flex-row xl:items-stretch">
          <div className="min-w-0 flex-1">
            <MarketDigestPanel digest={digestResult.digest} error={digestResult.error} />
          </div>
          <div className="w-full shrink-0 xl:w-48">
            <MoversPanel stocks={watchlist.stocks} />
          </div>
        </div>

        {/* WatchlistPanel owns the whole layout below the digest, not just the
            left half: the chart in the glance row and the table under it share
            one `selected` ticker, so they cannot be split across two siblings of
            a server component. The news feed has no such coupling and is handed
            down as a slot. */}
        <WatchlistPanel
          stocks={watchlist.stocks}
          earnings={watchlist.earningsByTicker}
          earningsUnavailable={watchlist.earningsUnavailable}
          researchFeed={
            <ResearchFeed articles={articles} watchlistNews={watchlistNews} marketNews={marketNews} />
          }
        />
      </div>
    </main>
  );
}
