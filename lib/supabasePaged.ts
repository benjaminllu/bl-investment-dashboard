import { supabase } from "./supabase";

/**
 * Every row of a table, oldest first, past PostgREST's 1,000-row cap. Same loop
 * as fetchPriceHistory on the portfolio page. Returns null on a query error so
 * the caller can show the panel as unavailable rather than as empty.
 */
export async function fetchAllRows<T>(table: string, columns: string, orderBy: string): Promise<T[] | null> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[${table}] query failed (${error.code}): ${error.message}`);
      return null;
    }
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}
