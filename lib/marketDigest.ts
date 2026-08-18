import { supabase } from "@/lib/supabase";

export interface DigestItem {
  rank: number;
  headline: string;
  url: string;
  source: string;
  category: string;
  whyItMatters: string;
  tickers: string[];
  articleDatetime: number | null;
}

export interface MarketDigest {
  /** ISO date (YYYY-MM-DD) the digest covers, in US Eastern terms. */
  date: string;
  /** When the generator actually finished, as an ISO timestamp. */
  generatedAt: string | null;
  items: DigestItem[];
}

export type DigestResult =
  | { digest: MarketDigest; error: null }
  | { digest: null; error: string | null };

/** Today's date in US Eastern terms, matching how the generator stamps rows. */
export function easternToday(now: Date = new Date()): string {
  // en-CA gives YYYY-MM-DD directly, so no month/day reassembly is needed.
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Reads the most recent digest, whatever day it is from.
 *
 * Returning a stale digest rather than nothing is deliberate: if the 9am job
 * failed or GitHub throttled it into next week, yesterday's ten stories are
 * still worth more than an empty panel — and the panel labels the date, so a
 * stale one is visibly stale rather than quietly wrong.
 */
export async function fetchMarketDigest(): Promise<DigestResult> {
  // Two days' worth is fetched, not ten rows, because a run that found fewer
  // than ten usable stories leaves a short day. A flat `.limit(10)` would then
  // top the latest day up with rows from the day before and render them as one
  // digest.
  const { data, error } = await supabase
    .from("market_digest")
    .select(
      "digest_date, rank, headline, url, source, category, why_it_matters, tickers, article_datetime, generated_at"
    )
    .order("digest_date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(20);

  if (error) return { digest: null, error: `${error.code}: ${error.message}` };
  if (!data || data.length === 0) return { digest: null, error: null };

  // Rows are already sorted by date descending, so the first row names the day
  // the whole digest should come from.
  const latest = data[0].digest_date as string;
  const rows = data.filter((row) => row.digest_date === latest);

  return {
    digest: {
      date: latest,
      generatedAt: (rows[0].generated_at as string) ?? null,
      items: rows.map((row) => ({
        rank: row.rank as number,
        headline: row.headline as string,
        url: row.url as string,
        source: row.source as string,
        category: row.category as string,
        whyItMatters: row.why_it_matters as string,
        tickers: (row.tickers as string[] | null) ?? [],
        articleDatetime: (row.article_datetime as number | null) ?? null,
      })),
    },
    error: null,
  };
}
