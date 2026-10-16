"use client";

import { useMemo, useState } from "react";

import MarketDigestPanel from "@/components/MarketDigestPanel";
import MoversPanel from "@/components/MoversPanel";
import EarningsPanel, { type EarningsRow } from "@/components/EarningsPanel";
import ResearchFeed from "@/components/ResearchFeed";
import StockTable, { type Stock } from "@/components/StockTable";
import TickerChart from "@/components/TickerChart";
import { Panel } from "@/components/shell/parts";

import { CHART_PRESETS } from "@/lib/chartPresets";
import { LIST_ORDER } from "@/data/watchlistOrder";
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
 * The research rail spans the chart and table rows so the feed reads as a
 * column rather than a letterbox. The watchlist pays for that in width, not
 * height: its ten columns have fixed widths totalling ~816px, so Company still
 * absorbs the slack rather than the table truncating.
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
  const lists = useMemo(
    () => [
      "All",
      ...Array.from(new Set(stocks.map((s) => s.list).filter((l): l is string => Boolean(l)))).sort(
        (a, b) => {
          const ai = LIST_ORDER.indexOf(a);
          const bi = LIST_ORDER.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }
      ),
    ],
    [stocks]
  );

  const [activeList, setActiveList] = useState("All");
  const [selected, setSelected] = useState<string | null>(stocks[0]?.ticker ?? null);
  const [presetIndex, setPresetIndex] = useState(0);

  const preset = CHART_PRESETS[presetIndex];
  const visibleStocks = activeList === "All" ? stocks : stocks.filter((s) => s.list === activeList);

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
    // Row one is sized to the digest's actual content rather than to a share
    // of the screen: four majors and six minors, compacted, come to ~21rem, and
    // a summary you have to scroll is not a summary. Row two holds the chart.
    // The watchlist takes what is left — it is the one panel that reads fine at
    // any height, because a table simply shows fewer rows.
    //
    // Below xl the 20rem rail would leave the chart and table a sliver, so the
    // regions stack and the shell scrolls. At xl the min-height floor keeps
    // 16rem for the table on a short laptop screen instead of letting 1fr hit 0.
    <div className="flex flex-col gap-px bg-border xl:grid xl:h-full xl:min-h-[56rem] xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[21rem_19rem_minmax(0,1fr)]">
      <div className="col-span-2 col-start-1 row-start-1 flex min-h-0 flex-col gap-px bg-border xl:grid xl:grid-cols-[minmax(0,1fr)_13rem]">
        <MarketDigestPanel
          digest={digest}
          error={digestError}
          className="flex min-h-0 flex-col overflow-hidden bg-background"
        />
        <MoversPanel
          stocks={stocks}
          compact
          className="flex min-h-0 flex-col overflow-hidden bg-background"
        />
      </div>

      {/* The earnings table needs 22rem to seat six columns without scrolling
          sideways. The chart gives it up: a chart is elastic, a table of fixed
          columns is not. */}
      <div className="col-start-1 row-start-2 flex min-h-0 flex-col gap-px bg-border xl:grid xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          className="flex h-[19rem] min-h-0 min-w-0 flex-col bg-background xl:h-auto"
          label={selected ?? "Chart"}
          meta={
            <span className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous chart preset"
                onClick={() =>
                  setPresetIndex((i) => (i - 1 + CHART_PRESETS.length) % CHART_PRESETS.length)
                }
                className="px-1 transition-colors hover:text-foreground"
              >
                &lsaquo;
              </button>
              {preset.label}
              <button
                type="button"
                aria-label="Next chart preset"
                onClick={() => setPresetIndex((i) => (i + 1) % CHART_PRESETS.length)}
                className="px-1 transition-colors hover:text-foreground"
              >
                &rsaquo;
              </button>
            </span>
          }
        >
          {selected && (
            <TickerChart symbol={selected} studies={preset.studies} className="h-full w-full" />
          )}
        </Panel>

        <EarningsPanel
          rows={allEarnings}
          currencyByTicker={currencyByTicker}
          selected={selected}
          onSelect={setSelected}
          unavailable={earningsUnavailable}
          className="flex h-[19rem] min-h-0 flex-col bg-background p-2 xl:h-auto"
        />
      </div>

      <ResearchFeed
        articles={articles}
        watchlistNews={watchlistNews}
        marketNews={marketNews}
        className="order-last col-start-2 row-span-2 row-start-2 flex h-[32rem] min-h-0 flex-col overflow-hidden bg-background xl:order-none xl:h-auto"
      />

      <section className="col-start-1 row-start-3 flex h-[36rem] min-h-0 flex-col bg-background xl:h-auto">
        {/* Scrolls rather than wrapping, so nineteen categories never break to a
            second line and cost the table a row. */}
        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-2 [&::-webkit-scrollbar]:hidden">
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
        <div className="min-h-0 flex-1">
          <StockTable
            stocks={visibleStocks}
            selected={selected}
            onSelect={setSelected}
            className="h-full overflow-auto"
          />
        </div>
      </section>
    </div>
  );
}
