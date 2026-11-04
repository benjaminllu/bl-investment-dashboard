/**
 * Turns what was typed into the "add ticker" box into the symbol Finnhub and
 * the `stocks` table use, or null when it cannot be one.
 *
 * Kept out of lib/watchlistActions.ts because a "use server" file may only
 * export async functions, and this needs a test.
 *
 * A space between letters becomes a dot ("brk b" -> "BRK.B"), the same
 * convention Vanguard exports break and portfolioImport.js repairs: left as a
 * space, both refresh jobs treat the symbol as an option and skip it forever.
 * The character whitelist also keeps anything odd out of the Finnhub URL.
 */
export function normalizeTicker(input: string): string | null {
  const symbol = input.trim().toUpperCase().replace(/^([A-Z]+) ([A-Z])$/, "$1.$2");
  return /^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(symbol) ? symbol : null;
}

/** List names are free text from the same form; this only bounds them. */
export function normalizeListName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= 40 && name !== "All" ? name : null;
}
