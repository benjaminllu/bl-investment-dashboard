import { supabase } from "@/lib/supabase";
import { fetchWatchlistData } from "@/lib/watchlist";
import WatchlistPanel from "@/components/WatchlistPanel";

interface Post {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default async function ResearchPage() {
  // In parallel, not in sequence: the posts query and the watchlist join have
  // nothing to do with each other, so the page pays the slower of the two
  // rather than both. Adding the watchlist here costs no extra wall-clock time.
  const [{ data: posts, error }, watchlist] = await Promise.all([
    supabase.from("posts").select("id, title, body, created_at").order("created_at", { ascending: false }),
    fetchWatchlistData(),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-3xl p-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Research</h1>

        {/* The chart, its presets, the earnings panel and the table, exactly as
            the home page shows them — the same component, so the two cannot
            drift apart. The news rail is deliberately not passed: this page has
            its own written notes below, and stacking a market-news feed beside
            them would put two competing reading columns in one row. */}
        {watchlist.error ? (
          <div className="mb-4 rounded-xl bg-card p-4">
            <p className="text-muted-foreground">
              Failed to load watchlist. Check Supabase connection.
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <WatchlistPanel
              stocks={watchlist.stocks}
              earnings={watchlist.earningsByTicker}
              earningsUnavailable={watchlist.earningsUnavailable}
            />
          </div>
        )}

        {error && <p className="text-muted-foreground">Failed to load posts.</p>}

        {!error && (!posts || posts.length === 0) && (
          <p className="text-muted-foreground">No posts yet. Add one in the Supabase dashboard.</p>
        )}

        <div className="flex flex-col gap-4">
          {(posts ?? []).map((post: Post) => (
            <div key={post.id} className="rounded-xl bg-card p-4">
              <div className="mb-3 flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-foreground">{post.title}</h2>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(post.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {post.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
