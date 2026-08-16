import { unstable_cache } from "next/cache";
import { fetchMarketNews } from "@/lib/finnhubNews";
import WipBadge from "@/components/WipBadge";

async function generateGeminiSummary(headline: string, source: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a concise financial analyst. Based on this news headline from ${source}, write a single focused paragraph explaining what this story is about and its potential implications for investors. Do not speculate beyond what the headline suggests. Be direct and factual.\n\nHeadline: "${headline}"`,
          }],
        }],
        generationConfig: { maxOutputTokens: 1600, temperature: 0.3 },
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response missing summary text");
  return text;
}

// Only successful generations are cached (unstable_cache never caches a thrown
// error), so a failed request always retries fresh on the next page load
// instead of being stuck behind the 15-minute revalidate window.
const getCachedGeminiSummary = unstable_cache(
  generateGeminiSummary,
  ["gemini-summary"],
  { revalidate: 900 }
);

async function getGeminiSummary(headline: string, source: string): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    return await getCachedGeminiSummary(headline, source);
  } catch {
    return null;
  }
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default async function AISummaryPage() {
  const articles = await fetchMarketNews();
  const article = articles[0] ?? null;
  const summary = article ? await getGeminiSummary(article.headline, article.source) : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">AI Summary</h1>
            <WipBadge title="Summarises only the single latest market headline. Multi-story and per-ticker summaries are not built yet." />
          </div>
          {/* Without this the page reads as finished: one polished card gives no
              hint that it is the top story only, rather than a digest. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Currently summarises the latest market headline only — not a digest of the day.
          </p>
        </div>

        {!article && (
          <p className="text-muted-foreground">No market news available.</p>
        )}

        {article && (
          <div className="max-w-2xl rounded-xl bg-card p-4">
            {article.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.image}
                alt=""
                className="mb-4 h-48 w-full rounded-lg object-cover"
              />
            )}

            <p className="mb-1 text-xs text-muted-foreground">
              {article.source} &nbsp;•&nbsp; {formatDate(article.datetime)}
            </p>

            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 block text-lg font-semibold text-foreground hover:text-accent"
            >
              {article.headline}
            </a>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
                AI Analysis
              </p>
              {summary ? (
                <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {process.env.GEMINI_API_KEY
                    ? "Failed to generate summary."
                    : "Add GEMINI_API_KEY to enable AI analysis."}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
