import DeskShell from "@/components/preview/DeskShell";
import { fetchWatchlistData } from "@/lib/watchlist";
import { fetchWatchlistNews } from "@/lib/finnhubNews";
import { fetchMarketDigest } from "@/lib/marketDigest";

/**
 * TEMPORARY — the "Desk" format, alongside /format-preview's "Console".
 * Delete this folder and components/preview/ once the format is decided.
 *
 * Same shell as the Console, but showing the structural change: four
 * destinations instead of nine, an attention band above the digest, and a
 * ticker drawer that opens over the page instead of navigating away from it.
 *
 * Reads a subset of what the Console preview reads — no Substack or general
 * market feed, because Today's job is what needs Ben this morning and the
 * reading list is a board of its own in this format.
 */
export const metadata = {
  title: "Format preview — Desk",
  robots: { index: false, follow: false },
};

export default async function DeskPreviewPage() {
  const [watchlist, watchlistNews, digestResult] = await Promise.all([
    fetchWatchlistData(),
    fetchWatchlistNews(),
    fetchMarketDigest(),
  ]);

  if (watchlist.error) {
    console.error(`[format-preview/desk] watchlist unavailable (${watchlist.error})`);
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground">
          Failed to load watchlist. Check the Supabase connection — this preview reads exactly what
          the home page reads, so this is not a preview-specific fault.
        </p>
      </main>
    );
  }

  return (
    <DeskShell
      stocks={watchlist.stocks}
      earnings={watchlist.earningsByTicker}
      earningsUnavailable={watchlist.earningsUnavailable}
      digest={digestResult.digest}
      digestError={digestResult.error}
      watchlistNews={watchlistNews}
    />
  );
}
