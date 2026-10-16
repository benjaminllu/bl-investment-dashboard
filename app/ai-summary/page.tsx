import { unstable_cache } from "next/cache";
import { fetchMarketDigest, type DigestItem } from "@/lib/marketDigest";

/** The 9am digest has already ranked the day's wire; this page explains its top four. */
const TOP_N = 4;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          summary: { type: "string" },
        },
        required: ["rank", "summary"],
        propertyOrdering: ["rank", "summary"],
      },
    },
  },
  required: ["summaries"],
};

/**
 * One request for all four stories, not one per story: the free tier is
 * budgeted in requests per day, and the 9am digest job already spends one to
 * three of them.
 */
async function generateSummaries(
  date: string,
  stories: { rank: number; headline: string; source: string; whyItMatters: string }[],
): Promise<Record<number, string>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const list = stories
    .map((s) => `${s.rank}\t[${s.source}] ${s.headline}\n\tDesk note: ${s.whyItMatters}`)
    .join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a concise financial analyst. Below are the ${stories.length} most important market stories of ${date}, ranked, each with a one-line desk note. For each, write a single focused paragraph of three to four sentences explaining what the story is about and its potential implications for investors. Work only from the headline and the note: never invent a number, a date, a quote or an outcome. Be direct and factual.\n\nReturn one entry per story, with its rank copied exactly.\n\nSTORIES:\n${list}`,
          }],
        }],
        generationConfig: {
          temperature: 0.3,
          // Paraphrasing four headlines needs no reasoning pass, and 2.5-flash
          // bills thinking against maxOutputTokens. Off, a call is ~1k tokens.
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2000,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
  const data = await res.json();
  const usage = data?.usageMetadata;
  console.log(
    `[ai-summary] gemini tokens in/out/thinking: ${usage?.promptTokenCount}/${usage?.candidatesTokenCount}/${usage?.thoughtsTokenCount ?? 0}`
  );
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini response missing summary text");

  const wanted = new Set(stories.map((s) => s.rank));
  const out: Record<number, string> = {};
  for (const item of JSON.parse(text).summaries ?? []) {
    if (wanted.has(item.rank) && typeof item.summary === "string" && item.summary.trim()) {
      out[item.rank] = item.summary.trim();
    }
  }
  if (Object.keys(out).length === 0) throw new Error("Gemini returned no usable summaries");
  return out;
}

// Only successful generations are cached (unstable_cache never caches a thrown
// error), so a failed request always retries fresh on the next page load.
// The arguments are the digest's date and stories, so the key changes once a
// day when the digest does: one Gemini request per day, however often the page
// is opened.
const getCachedSummaries = unstable_cache(generateSummaries, ["ai-summary-top4"], {
  revalidate: 86400,
});

async function getSummaries(date: string, items: DigestItem[]): Promise<Record<number, string> | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    return await getCachedSummaries(
      date,
      items.map(({ rank, headline, source, whyItMatters }) => ({ rank, headline, source, whyItMatters })),
    );
  } catch (e) {
    console.error("[ai-summary] summary generation failed:", e);
    return null;
  }
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default async function AISummaryPage() {
  const { digest, error } = await fetchMarketDigest();
  const top = digest ? digest.items.slice(0, TOP_N) : [];
  const summaries = digest && top.length > 0 ? await getSummaries(digest.date, top) : null;

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-screen-3xl p-4">
        <div className="mb-4">
          <h1 className="text-sm font-semibold text-foreground">AI Summary</h1>
          {/* Without this the page reads as reporting: the model only ever sees
              the headline and the digest's one-line note, never the article. */}
          <p className="mt-1 text-sm text-muted-foreground">
            The top {TOP_N} stories from the {digest ? formatDate(digest.date) : "latest"} market
            digest, explained by Gemini from the headline alone.
          </p>
        </div>

        {top.length === 0 && (
          <p className="text-muted-foreground">
            {error ? "The market digest could not be loaded." : "No market digest available yet."}
          </p>
        )}

        {top.length > 0 && (
          <ol className="max-w-3xl divide-y divide-border border border-border bg-card">
            {top.map((item) => (
              <li key={item.rank} className="p-4">
                <p className="mb-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{String(item.rank).padStart(2, "0")}</span>
                  &nbsp;•&nbsp;{item.category}&nbsp;•&nbsp;{item.source}
                </p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-2 block text-base font-semibold text-foreground hover:text-accent"
                >
                  {item.headline}
                </a>
                {summaries?.[item.rank] ? (
                  <p className="text-sm leading-relaxed text-foreground/90">{summaries[item.rank]}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {process.env.GEMINI_API_KEY
                      ? "Failed to generate summary."
                      : "Add GEMINI_API_KEY to enable AI analysis."}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
