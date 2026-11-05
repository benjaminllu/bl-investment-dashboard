"use client";

import { useMemo, useState } from "react";

import MarketDigestPanel from "@/components/MarketDigestPanel";
import MoversPanel from "@/components/MoversPanel";
import EarningsPanel, { type EarningsRow } from "@/components/EarningsPanel";
import ResearchFeed from "@/components/ResearchFeed";
import StockTable, { type Stock, uniqueByTicker } from "@/components/StockTable";
import { ChevronIcon, useScrollAffordance } from "@/components/ScrollAffordance";
import {
  AddTickerForm,
  AddTickerToggle,
  RemoveTickerDialog,
  rowsToRemove,
  useCanEditWatchlist,
} from "@/components/WatchlistEditing";

import { watchlistTabs } from "@/data/watchlistOrder";
import type { MarketDigest } from "@/lib/marketDigest";
import type { SubstackArticle } from "@/lib/substack";
import type { NewsItem } from "@/lib/finnhubNews";

/**
 * The home board: everything the old home page carried, laid out as regions
 * rather than as cards.
 *
 * The change that matters is not visual. Panels are separated by a 1px rule —
 * the grid gap showing the border colour through — instead of each floating in
 * its own 12px-radius box with 16px of padding on four sides. That padding,
 * times the panels on this page, plus the ~100px header the shell replaced, is
 * the height the watchlist now gets to use. On a 1080p screen the table went
 * from roughly five visible rows to roughly twelve.
 *
 * Below the digest from 1720px, three full-height columns: the watchlist,
 * earnings, and the research feed, so the feed reads as a column rather than
 * a letterbox. The watchlist pays for its neighbours in width, not height: its
 * ten columns have fixed widths totalling ~816px, and Company (the one
 * unsized column) collapses to nothing below the `board` breakpoint (1720px).
 * Below it, earnings stacks over the feed in one right rail instead.
 */
interface Props {
  stocks: Stock[];
  /** Preloaded for every ticker, so changing selection costs no network. */
  earnings: Record<string, EarningsRow[]>;
  /** True when the earnings query itself failed, as opposed to returning nothing. */
  earningsUnavailable?: boolean;
  digest: MarketDigest | null;
  digestError: string | null;
  articles: SubstackArticle[];
  watchlistNews: NewsItem[];
  marketNews: NewsItem[];
}

export default function HomeBoard({
  stocks,
  earnings,
  earningsUnavailable,
  digest,
  digestError,
  articles,
  watchlistNews,
  marketNews,
}: Props) {
  const lists = useMemo(() => watchlistTabs(stocks), [stocks]);

  const [activeList, setActiveList] = useState("All");
  const [selected, setSelected] = useState<string | null>(stocks[0]?.ticker ?? null);

  const { ref: tabsRef, canLeft, canRight, scrollByPage } = useScrollAffordance(lists.length);
  const scrollable = canLeft || canRight;

  const canEdit = useCanEditWatchlist();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Stock[] | null>(null);

  const uniqueStocks = useMemo(() => uniqueByTicker(stocks), [stocks]);
  const visibleStocks =
    activeList === "All" ? uniqueStocks : stocks.filter((s) => s.list === activeList);

  // Flattened across every ticker rather than filtered to the visible list:
  // switching category should not hide an imminent report, which is the one
  // thing this panel exists to catch.
  const allEarnings = useMemo(() => Object.values(earnings).flat(), [earnings]);
  const currencyByTicker = useMemo(
    () => Object.fromEntries(stocks.map((s) => [s.ticker, s.marketCapCurrency ?? null])),
    [stocks]
  );

  const handleListChange = (list: string) => {
    setActiveList(list);
    const first = list === "All" ? stocks[0] : stocks.find((s) => s.list === list);
    if (first) setSelected(first.ticker);
  };

  return (
    // Row one is never shorter than the digest's actual content: four majors
    // and six minors, compacted, come to ~21rem, and a summary you have to
    // scroll is not a summary. From 1720px the two rows split the screen
    // evenly; narrower than that, row one sizes to its content (the twelve
    // movers are the tallest part) because the right rail has to fit earnings
    // and the feed below it. Earnings is 22rem because its table needs
    // that to seat six columns without scrolling sideways.
    //
    // Below xl the side columns would leave the table a sliver, so the regions
    // stack and the shell scrolls. The min-height floor keeps the last row from
    // hitting 0 on a short laptop screen.
    <div className="flex flex-col gap-px bg-border xl:grid xl:h-full xl:min-h-[56rem] xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_19rem_minmax(0,1fr)] board:min-h-[48rem] board:grid-cols-[minmax(0,1fr)_22rem_20rem] board:grid-rows-[minmax(21rem,1fr)_minmax(0,1fr)]">
      <div className="col-span-full col-start-1 row-start-1 flex min-h-0 flex-col gap-px bg-border xl:grid xl:grid-cols-[minmax(0,1fr)_13rem]">
        <MarketDigestPanel
          digest={digest}
          error={digestError}
          className="flex min-h-0 flex-col overflow-hidden bg-background"
        />
        <MoversPanel
          stocks={uniqueStocks}
          compact
          className="flex min-h-0 flex-col overflow-hidden bg-background"
        />
      </div>

      <EarningsPanel
        rows={allEarnings}
        currencyByTicker={currencyByTicker}
        selected={selected}
        onSelect={setSelected}
        unavailable={earningsUnavailable}
        className="col-start-2 row-start-2 flex h-[19rem] min-h-0 flex-col bg-background p-2 xl:h-auto"
      />

      <ResearchFeed
        articles={articles}
        watchlistNews={watchlistNews}
        marketNews={marketNews}
        className="order-last col-start-2 row-start-3 flex h-[32rem] min-h-0 flex-col overflow-hidden bg-background xl:order-none xl:h-auto board:col-start-3 board:row-start-2"
      />

      <section className="col-start-1 row-span-2 row-start-2 flex h-[36rem] min-h-0 flex-col bg-background xl:h-auto board:row-span-1">
        {/* Scrolls rather than wrapping, so nineteen categories never break to a
            second line and cost the table a row. */}
        {/* Arrows sit outside the scroller so they never cover a category, and
            render only when the tabs overflow; each dims at its own end. Same
            treatment as the /research tab bar. */}
        <div className="flex shrink-0 items-center border-b border-border pr-1.5">
          {scrollable && (
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={!canLeft}
              aria-label="Scroll categories left"
              className="flex h-7 shrink-0 items-center px-1 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronIcon direction="left" />
            </button>
          )}
          <div
            ref={tabsRef}
            className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden"
          >
            {lists.map((list) => (
              <button
                key={list}
                type="button"
                onClick={() => handleListChange(list)}
                className={`flex h-7 shrink-0 items-center px-2 text-xs font-medium transition-colors ${
                  activeList === list
                    ? "border-b-2 border-accent text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {list}
              </button>
            ))}
          </div>
          {scrollable && (
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              disabled={!canRight}
              aria-label="Scroll categories right"
              className="flex h-7 shrink-0 items-center px-1 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronIcon direction="right" />
            </button>
          )}
          {/* Outside the scroller so it stays put while the tabs scroll. */}
          {canEdit && (
            <AddTickerToggle
              open={adding}
              onToggle={() => setAdding((a) => !a)}
              className="ml-1.5 h-5 text-xs"
            />
          )}
        </div>
        {canEdit && adding && (
          <AddTickerForm
            lists={lists.slice(1)}
            defaultList={activeList === "All" ? "" : activeList}
            onClose={() => setAdding(false)}
          />
        )}
        <div className="min-h-0 flex-1">
          <StockTable
            stocks={visibleStocks}
            selected={selected}
            onSelect={setSelected}
            onRemove={canEdit ? (s) => setRemoving(rowsToRemove(s, stocks, activeList)) : undefined}
            className="h-full overflow-auto"
          />
        </div>
        {canEdit && <RemoveTickerDialog rows={removing} onClose={() => setRemoving(null)} />}
      </section>
    </div>
  );
}
