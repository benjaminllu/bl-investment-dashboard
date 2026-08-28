import HomeBoard from "@/components/HomeBoard";
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
      <main className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Failed to load watchlist. Check Supabase connection.</p>
      </main>
    );
  }

  // No wrapper, no page padding, no h1: the shell owns the viewport and the
  // board fills it edge to edge. The rail already says which page this is.
  return (
    <HomeBoard
      stocks={watchlist.stocks}
      earnings={watchlist.earningsByTicker}
      earningsUnavailable={watchlist.earningsUnavailable}
      digest={digestResult.digest}
      digestError={digestResult.error}
      articles={articles}
      watchlistNews={watchlistNews}
      marketNews={marketNews}
    />
  );
}
