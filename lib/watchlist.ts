import { supabase } from "@/lib/supabase";
import { fetchInsiderActivity } from "@/lib/insiderTransactions";
import type { Stock } from "@/components/StockTable";
import type { EarningsRow } from "@/components/EarningsPanel";

/**
 * The watchlist, assembled from the five tables that feed it.
 *
 * Extracted from app/page.tsx when the same panel was added to /research.
 * Sharing the *code* is the point — the two pages still each run these queries,
 * because routes render independently and nothing hands one page's result to
 * another. What is shared is the join: which columns are read, how a missing
 * fundamentals row is filled in, and how "next earnings" is picked. Duplicating
 * that would let the same ticker show a different market cap or a different
 * next-report date depending on which tab you were looking at, and it would
 * drift silently, because both copies would keep rendering.
 *
 * All five queries are one `Promise.all`, so the cost is the slowest of them
 * (~300ms cold, well under half that warm) rather than their sum.
 */

export interface WatchlistData {
  stocks: Stock[];
  /** Every known report per ticker, so changing selection costs no network. */
  earningsByTicker: Record<string, EarningsRow[]>;
  /** The earnings query itself failed, as opposed to returning nothing. */
  earningsUnavailable: boolean;
  /**
   * The watchlist query failed outright. Distinct from an empty watchlist, and
   * the caller must render it as a fault rather than as "no stocks".
   */
  error: string | null;
}

export async function fetchWatchlistData(): Promise<WatchlistData> {
  const [
    { data: watchlist, error },
    { data: quotes },
    { data: fundamentals },
    { data: earnings, error: earningsError },
    insiderResult,
  ] = await Promise.all([
    supabase.from("stocks").select("*").order("created_at", { ascending: true }),
    supabase.from("stock_quotes").select("ticker, price, change_pct, updated_at"),
    supabase
      .from("stock_fundamentals")
      .select("ticker, market_cap, market_cap_currency, forward_pe, pe_ttm"),
    supabase
      .from("stock_earnings")
      .select("ticker, source_symbol, date, hour, quarter, year, eps_estimate, revenue_estimate")
      .order("date", { ascending: true }),
    fetchInsiderActivity(),
  ]);

  if (error || !watchlist) {
    return {
      stocks: [],
      earningsByTicker: {},
      earningsUnavailable: true,
      error: error ? `${error.code}: ${error.message}` : "no watchlist returned",
    };
  }

  const quoteMap = new Map(
    (quotes ?? []).map((q) => [
      q.ticker,
      { price: q.price ?? 0, changePct: q.change_pct ?? 0, updatedAt: q.updated_at ?? null },
    ]),
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
        forwardPe: f.forward_pe ?? null,
        peTtm: f.pe_ttm ?? null,
      },
    ]),
  );

  // A failed earnings query is NOT the same as a ticker having no earnings
  // scheduled, and must not render as one: when the `stock_earnings` table was
  // missing entirely, discarding this error made all 126 tickers read
  // "No scheduled earnings" instead of surfacing the real fault.
  if (earningsError) {
    console.error(
      `[watchlist] stock_earnings query failed (${earningsError.code}): ${earningsError.message}`,
    );
  }

  // Logged rather than rendered: an empty Insider column and a failed query look
  // identical in the table, and most rows are legitimately empty.
  if (insiderResult.error) {
    console.error(`[watchlist] insider_transactions query failed (${insiderResult.error})`);
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
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
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
      forwardPe: null,
      peTtm: null,
    };
    // Earliest date not already past. Rows are date-ordered from the query, so
    // the first match is the next one.
    const nextEarnings =
      (earningsByTicker[stock.ticker] ?? []).find((e) => e.date >= todayIso)?.date ?? null;
    return {
      ...stock,
      price,
      changePct,
      updatedAt,
      ...fundamental,
      nextEarnings,
      insider: insiderResult.byTicker[stock.ticker] ?? null,
    };
  });

  return {
    stocks,
    earningsByTicker,
    earningsUnavailable: Boolean(earningsError),
    error: null,
  };
}
