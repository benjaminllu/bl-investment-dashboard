// Controls the order watchlist tabs appear. Names must match exactly what you
// enter in the "list" column in Supabase. Any list not included here will be
// appended alphabetically after the ones listed.
// Every list named here gets a tab even with no tickers yet, so a new list can
// be created here and filled from the add-ticker form.
export const LIST_ORDER: string[] = [
  "Index",
  "Mega",
  "I<3MINERS",
  "Aero/Defense",
  "AI Bottlenecks",
  "AI Infra",
  "Crypto",
  "Data Centers",
  "Semiconductors",
  "Communications",
  "Space",
  "Financials",
  "Consumer",
  "Medical",
  "Industrials",
  "Macro",
  "Energy",
  "Software",
  "International",
  "Misc Speculative",
];

/** "All" followed by every list: LIST_ORDER first, then any others alphabetically. */
export function watchlistTabs(stocks: { list?: string | null }[]): string[] {
  const extra = new Set(stocks.map((s) => s.list).filter((l): l is string => Boolean(l)));
  for (const l of LIST_ORDER) extra.delete(l);
  return ["All", ...LIST_ORDER, ...[...extra].sort((a, b) => a.localeCompare(b))];
}
