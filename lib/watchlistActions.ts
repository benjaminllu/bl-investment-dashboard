"use server";

import { revalidatePath } from "next/cache";
import { isPortfolioUnlocked } from "@/lib/portfolioLock";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizeListName, normalizeTicker } from "@/lib/tickerSymbol";
import {
  fetchEarnings,
  fetchMetrics,
  fetchNews,
  fetchProfile,
  fetchQuote,
  replaceEarnings,
  replaceNews,
  writeFundamentals,
  writeQuote,
} from "@/scripts/lib/finnhub";

/**
 * Adding and removing watchlist tickers from the UI.
 *
 * Gated by the same unlock as /portfolio. The edit controls are only drawn for
 * an unlocked browser, but that is cosmetic: a server action is a public POST
 * endpoint, so each one re-checks the cookie before touching anything.
 *
 * Both write with the service-role key, because the market-data tables have no
 * RLS policy that would let the publishable key write.
 */

export type AddTickerState = { error: string | null; done: string | null };

const LOCKED = "Locked. Unlock the portfolio and try again.";

/** The pages that render the watchlist, so their static copies rebuild. */
function refreshWatchlistPages() {
  revalidatePath("/");
  revalidatePath("/research");
}

function finnhubFailure(e: unknown, ticker: string): string {
  const status = (e as { status?: number }).status;
  // Unknown symbols come back two ways: 200 with a zero price ("NVDAA"), or
  // 403 "no access" for ones shaped like mutual funds ("ZZZQX"). Either way
  // there is nothing the free tier can track.
  if (status === 403) return `No data for ${ticker} on Finnhub's free tier. Check the symbol.`;
  if (status === 429) {
    return "Finnhub's rate limit was hit, probably by a background refresh. Try again in a minute.";
  }
  return "Could not reach Finnhub. Try again.";
}

export async function addTicker(_prev: AddTickerState, formData: FormData): Promise<AddTickerState> {
  const fail = (error: string): AddTickerState => ({ error, done: null });
  if (!(await isPortfolioUnlocked())) return fail(LOCKED);

  const ticker = normalizeTicker(String(formData.get("ticker") ?? ""));
  if (!ticker) return fail("Enter a ticker like NVDA or BRK.B.");
  const list = normalizeListName(String(formData.get("list") ?? ""));
  if (!list) return fail("Choose a list for it.");

  // A ticker may sit in several lists, one row each, but not twice in one.
  const { data: existing, error: readError } = await supabaseAdmin
    .from("stocks")
    .select("list")
    .eq("ticker", ticker);
  if (readError) {
    console.error(`[watchlist] stocks read failed (${readError.code}): ${readError.message}`);
    return fail("Could not read the watchlist. Try again.");
  }
  if (existing.some((r) => r.list === list)) return fail(`${ticker} is already in ${list}.`);

  // The two checks that decide whether it goes in at all: a price proves the
  // symbol exists, and a company profile is what ETFs lack.
  let quote: Awaited<ReturnType<typeof fetchQuote>>;
  let profile: Awaited<ReturnType<typeof fetchProfile>>;
  try {
    [quote, profile] = await Promise.all([fetchQuote(ticker), fetchProfile(ticker)]);
  } catch (e) {
    return fail(finnhubFailure(e, ticker));
  }
  if (!quote) return fail(`No price found for ${ticker}. Check the symbol.`);
  // shortcut: ETFs (and some foreign listings) have no profile, so they are
  // refused rather than added without a company name. Lift this when ETFs are wanted.
  if (!profile) {
    return fail(
      `${ticker} has no company profile on Finnhub. ETFs and some foreign listings aren't supported yet.`,
    );
  }

  const { error: insertError } = await supabaseAdmin
    .from("stocks")
    .insert({ ticker, list, company: profile.name ?? "" });
  if (insertError) {
    console.error(`[watchlist] insert ${ticker} failed (${insertError.code}): ${insertError.message}`);
    return fail("Could not save the ticker. Try again.");
  }

  // Everything else the nightly jobs would write, fetched now so the row is
  // complete straight away. The row is already in, so a failure here only
  // means that piece waits for the next scheduled refresh.
  const [metrics, earnings, news] = await Promise.allSettled([
    fetchMetrics(ticker),
    fetchEarnings(ticker),
    fetchNews(ticker),
  ]);
  const pending: string[] = [];
  if (await writeQuote(supabaseAdmin, ticker, quote)) pending.push("price");
  // Skipped rather than written as nulls when metrics failed: if the ticker is
  // already in another list, its existing P/E would otherwise be wiped.
  if (metrics.status !== "fulfilled" || (await writeFundamentals(supabaseAdmin, ticker, profile, metrics.value))) {
    pending.push("fundamentals");
  }
  if (earnings.status !== "fulfilled" || (await replaceEarnings(supabaseAdmin, ticker, earnings.value))) {
    pending.push("earnings dates");
  }
  if (news.status !== "fulfilled" || (await replaceNews(supabaseAdmin, ticker, news.value))) {
    pending.push("news");
  }

  refreshWatchlistPages();
  const name = profile.name ? ` (${profile.name})` : "";
  const note = pending.length ? ` Its ${pending.join(", ")} will fill in on the next scheduled refresh.` : "";
  return { error: null, done: `Added ${ticker}${name} to ${list}.${note}` };
}

/**
 * Deletes watchlist rows by id: one row when removing from a single list, every
 * row of the ticker when removing from "All".
 *
 * News and earnings are cleared only for tickers left in no list, because the
 * news feed and earnings panel read those tables whole rather than through
 * `stocks`. Quotes and fundamentals are kept: /portfolio reads them for
 * holdings, and the refresh jobs keep held tickers current anyway.
 */
export async function removeTickers(ids: string[]): Promise<{ error: string | null }> {
  if (!(await isPortfolioUnlocked())) return { error: LOCKED };
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 50 ||
    !ids.every((id) => typeof id === "string" && /^[\w-]{1,64}$/.test(id))
  ) {
    return { error: "Invalid request." };
  }

  const { data: removed, error } = await supabaseAdmin.from("stocks").delete().in("id", ids).select("ticker");
  if (error) {
    console.error(`[watchlist] delete failed (${error.code}): ${error.message}`);
    return { error: "Could not remove it. Try again." };
  }

  const tickers = [...new Set(removed.map((r) => r.ticker as string))];
  if (tickers.length > 0) {
    const { data: remaining, error: readError } = await supabaseAdmin
      .from("stocks")
      .select("ticker")
      .in("ticker", tickers);
    // On a failed read, keep the news and earnings: leftover rows are visible
    // clutter, while deleting a still-watched ticker's rows would be wrong.
    if (readError) {
      console.error(`[watchlist] remaining read failed (${readError.code}): ${readError.message}`);
    } else {
      const stillWatched = new Set(remaining.map((r) => r.ticker));
      const gone = tickers.filter((t) => !stillWatched.has(t));
      if (gone.length > 0) {
        const results = await Promise.all([
          supabaseAdmin.from("stock_news").delete().in("ticker", gone),
          supabaseAdmin.from("stock_earnings").delete().in("ticker", gone),
        ]);
        for (const r of results) {
          if (r.error) console.error(`[watchlist] cleanup failed (${r.error.code}): ${r.error.message}`);
        }
      }
    }
  }

  refreshWatchlistPages();
  return { error: null };
}
