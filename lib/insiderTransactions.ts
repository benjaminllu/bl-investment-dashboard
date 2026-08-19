import { supabase } from "@/lib/supabase";

/**
 * Notable Section 16 insider activity per ticker, for the Insider column in
 * StockTable. Written nightly by scripts/screen-insider-transactions.js.
 */

/**
 * How far back the badge looks.
 *
 * This is a scannability budget, not a data limit. The table holds everything;
 * the column only earns its width if a badge is unusual enough to be worth
 * following. In a live sample, 113 watchlist tickers produced notable activity on
 * roughly a dozen over three days -- so a 30-day window would leave half the rows
 * badged and the column would stop meaning anything at a glance. Two weeks keeps
 * a marked row rare while still covering the Form 4 filing lag, which can be two
 * business days on its own.
 */
export const INSIDER_WINDOW_DAYS = 14;

export interface InsiderEvent {
  /** When the insider traded — not when the filing arrived. */
  date: string;
  ticker: string;
  ownerName: string;
  /** Officer title, else "Director" / "10% owner". */
  role: string;
  /** "P" (open-market purchase) or "S" (open-market sale). */
  code: string;
  valueUsd: number | null;
  /** Pre-scheduled under a Rule 10b5-1 plan, so a weaker signal. */
  is10b51: boolean;
  /** Option exercise or conversion sold the same day — compensation, not a view. */
  isExerciseSale: boolean;
  reason: string | null;
}

export interface InsiderSummary {
  buys: number;
  sells: number;
  buyValueUsd: number;
  sellValueUsd: number;
  /** Two or more insiders buying within a week — the pattern worth stopping on. */
  isCluster: boolean;
  events: InsiderEvent[];
}

export type InsiderResult = {
  byTicker: Record<string, InsiderSummary>;
  error: string | null;
};

function roleOf(row: {
  officer_title: string | null;
  is_director: boolean | null;
  is_ten_percent_owner: boolean | null;
}): string {
  if (row.officer_title) return row.officer_title;
  if (row.is_director) return "Director";
  if (row.is_ten_percent_owner) return "10% owner";
  return "Insider";
}

/**
 * Returns an empty map rather than throwing when the table is missing or the
 * query fails, but reports the error alongside it.
 *
 * The distinction matters and this project has been bitten by collapsing it
 * before: when `stock_earnings` went missing, a discarded error rendered as "no
 * earnings scheduled" across every row. An absent badge and a broken query look
 * identical in the table, so the caller gets the error and logs it.
 */
export async function fetchInsiderActivity(): Promise<InsiderResult> {
  const since = new Date(Date.now() - INSIDER_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("insider_transactions")
    // Deliberately one string literal rather than a concatenation: supabase-js
    // infers the row type by parsing this at the type level, and a `+` defeats
    // that, silently collapsing every column to an error type.
    .select(
      "ticker, transaction_date, owner_name, owner_cik, officer_title, is_director, is_ten_percent_owner, transaction_code, value_usd, is_10b5_1, is_exercise_sale, notable_reason"
    )
    .eq("is_notable", true)
    .gte("transaction_date", since)
    .order("transaction_date", { ascending: false });

  if (error) return { byTicker: {}, error: `${error.code}: ${error.message}` };

  const byTicker: Record<string, InsiderSummary> = {};

  for (const row of data ?? []) {
    const summary = (byTicker[row.ticker] ??= {
      buys: 0,
      sells: 0,
      buyValueUsd: 0,
      sellValueUsd: 0,
      isCluster: false,
      events: [],
    });

    const value = (row.value_usd as number | null) ?? 0;
    if (row.transaction_code === "P") {
      summary.buys++;
      summary.buyValueUsd += value;
    } else {
      summary.sells++;
      summary.sellValueUsd += value;
    }

    // The script writes the cluster verdict into the reason, having seen the whole
    // window at once. Re-deriving it here from a 14-day slice would disagree with
    // it at the edges for no benefit.
    if ((row.notable_reason as string | null)?.startsWith("Cluster buy")) {
      summary.isCluster = true;
    }

    summary.events.push({
      date: row.transaction_date as string,
      ticker: row.ticker as string,
      ownerName: (row.owner_name as string) ?? "—",
      role: roleOf(row),
      code: (row.transaction_code as string) ?? "?",
      valueUsd: row.value_usd as number | null,
      is10b51: (row.is_10b5_1 as boolean | null) ?? false,
      isExerciseSale: (row.is_exercise_sale as boolean | null) ?? false,
      reason: (row.notable_reason as string | null) ?? null,
    });
  }

  return { byTicker, error: null };
}
