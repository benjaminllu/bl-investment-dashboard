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
            text: `You are a concise financial analyst. Below are the ${stories.length} most important market stories of ${date}, ranked, each with a one-line desk note. For each, write a single focused paragraph of three to four sentences explaining what the story is about and its potential implications for investors. Work only from the headline and the note: never invent a number, a date, a quote or an outcome, and never add a title, role or background fact about a person or company that the headline does not state — refer to people exactly as the headline does. Be direct and factual.\n\nReturn one entry per story, with its rank copied exactly.\n\nSTORIES:\n${list}`,
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

function formatTime(unix: number | null): string | null {
  if (unix === null) return null;
  return new Date(unix * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/**
 * One story, in the home digest panel's vocabulary: rank, category and tickers
 * on the index line, the desk note as a standfirst, provenance pinned to the
 * foot so it shares a baseline across each row of the grid.
 */
function Story({ item, summary }: { item: DigestItem; summary: string | undefined }) {
  const time = formatTime(item.articleDatetime);
  return (
    <li className="flex min-w-0 flex-col bg-card p-4">
      <div className="mb-2 flex items-baseline gap-2">
        {/* /50 rather than /40: measured 5.2:1 on the card in MarketDigestPanel. */}
        <span className="shrink-0 text-xl font-semibold leading-none tabular-nums text-foreground/50">
          {String(item.rank).padStart(2, "0")}
        </span>
        <span className="truncate text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {item.category}
        </span>
        {item.tickers.length > 0 && (
          <span className="ml-auto shrink-0 text-xs font-medium tabular-nums tracking-wide text-foreground/80">
            {item.tickers.join(" ")}
          </span>
        )}
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-base font-semibold leading-snug text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {item.headline}
      </a>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{item.whyItMatters}</p>

      {/* Capped at a reading measure: on a wide screen a cell runs past 1000px,
          and a paragraph that long is hard to track line to line. 85ch is
          about the width of a two-line headline, so the block reads as one. */}
      {summary ? (
        <p className="mt-3 max-w-[85ch] text-sm leading-relaxed text-foreground/90">{summary}</p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {process.env.GEMINI_API_KEY
            ? "Failed to generate summary."
            : "Add GEMINI_API_KEY to enable AI analysis."}
        </p>
      )}

      <p className="mt-auto flex gap-1 pt-3 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{item.source}</span>
        {time && <span className="shrink-0">· {time}</span>}
      </p>
    </li>
  );
}

export default async function AISummaryPage() {
  const { digest, error } = await fetchMarketDigest();
  const top = digest ? digest.items.slice(0, TOP_N) : [];
  const summaries = digest && top.length > 0 ? await getSummaries(digest.date, top) : null;

  return (
    <main className="flex min-h-full flex-col gap-3 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-sm font-semibold text-foreground">AI Summary</h1>
        {/* Without this the page reads as reporting: the model only ever sees
            the headline and the digest's one-line note, never the article. */}
        <p className="text-xs text-muted-foreground">
          Top {TOP_N} from the {digest ? formatDate(digest.date) : "latest"} market digest ·
          explained by Gemini from the headline alone
        </p>
      </div>

      {top.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {error ? "The market digest could not be loaded." : "No market digest available yet."}
        </p>
      )}

      {/* Regions, not cards: the 1px gap shows the border colour through, as on
          the home board. Two by two from xl so all four sit on one screen.
          Rows hug their content rather than filling the viewport, which left a
          tall empty band in every cell; grid stretch still keeps the two cells
          of a row equal, so the foot lines stay aligned. */}
      {top.length > 0 && (
        <ol className="grid gap-px border border-border bg-border xl:grid-cols-2">
          {top.map((item) => (
            <Story key={item.rank} item={item} summary={summaries?.[item.rank]} />
          ))}
        </ol>
      )}
    </main>
  );
}
