"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import StockTable, { type Stock } from "./StockTable";
import TickerChart from "./TickerChart";
import EarningsPanel, { type EarningsRow } from "./EarningsPanel";
import { CHART_PRESETS } from "@/lib/chartPresets";
import { LIST_ORDER } from "@/data/watchlistOrder";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === "left" ? "M15.75 19.5 8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
      />
    </svg>
  );
}

/**
 * Tracks how far a horizontally scrollable element can still travel, so the
 * scroll arrows can be hidden when there is nothing to scroll and dimmed at
 * each end. Without this the category strip has no affordance at all — the
 * native scrollbar is deliberately suppressed, which is exactly why the row
 * reads as a complete list rather than a scrollable one.
 */
function useScrollAffordance(itemCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px of tolerance: fractional layout widths leave scrollLeft a hair short
    // of its true maximum, which would strand the right arrow enabled forever.
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Catches viewport resizes; itemCount in the deps catches the tab list
    // itself changing, which alters scrollWidth without resizing the element.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, itemCount]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    // The global reduced-motion rule sets scroll-behavior in CSS, which a JS
    // `behavior` option overrides — so the preference has to be read here too.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return { ref, canLeft, canRight, scrollByPage };
}

interface Props {
  stocks: Stock[];
  /** Preloaded for every ticker, so changing selection costs no network. */
  earnings: Record<string, EarningsRow[]>;
  /** True when the earnings query itself failed, as opposed to returning nothing. */
  earningsUnavailable?: boolean;
  /**
   * The news feed, rendered by the page and passed in as a slot.
   *
   * It sits in the glance row, which this component lays out, but it shares no
   * state with the watchlist — so passing it as a node keeps its props (and the
   * three feeds behind them) out of this component's signature entirely.
   *
   * Optional: /research reuses this panel but has its own reading column and no
   * business carrying the home page's news rail. When it is absent the rail is
   * not rendered at all, and the chart takes back that quarter of the row —
   * rather than an empty column holding the space open.
   */
  researchFeed?: React.ReactNode;
}

export default function WatchlistPanel({
  stocks,
  earnings,
  earningsUnavailable,
  researchFeed,
}: Props) {
  const lists = [
    "All",
    ...Array.from(
      new Set(stocks.map((s) => s.list).filter((l): l is string => Boolean(l)))
    ).sort((a, b) => {
      const ai = LIST_ORDER.indexOf(a);
      const bi = LIST_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }),
  ];

  const {
    ref: tabsRef,
    canLeft,
    canRight,
    scrollByPage,
  } = useScrollAffordance(lists.length);
  const scrollable = canLeft || canRight;

  const [activeList, setActiveList] = useState("All");
  const [selected, setSelected] = useState<string | null>(stocks[0]?.ticker ?? null);
  const [presetIndex, setPresetIndex] = useState(0);

  const preset = CHART_PRESETS[presetIndex];
  const visibleStocks =
    activeList === "All" ? stocks : stocks.filter((s) => s.list === activeList);

  // Flattened across every ticker for the earnings panel, which now answers
  // "who reports next" for the whole watchlist rather than for one selection.
  // Deliberately not filtered to visibleStocks: switching category should not
  // hide an imminent report, which is the one thing this panel exists to catch.
  const allEarnings = Object.values(earnings).flat();
  const currencyByTicker = Object.fromEntries(
    stocks.map((s) => [s.ticker, s.marketCapCurrency ?? null])
  );

  const handleListChange = (list: string) => {
    setActiveList(list);
    const first = list === "All" ? stocks[0] : stocks.find((s) => s.list === list);
    if (first) setSelected(first.ticker);
  };

  return (
    <div className="space-y-2">
      {/* The glance row. One height governs all three panels on lg, so the news
          rail can no longer dead-end hundreds of pixels above the chart beside
          it — the old layout let a viewport-relative left column (60vh table)
          sit next to a content-relative right one, two units that cannot
          converge. Below lg they stack and each keeps its own natural height. */}
      <div className="flex flex-col gap-2 lg:h-120 lg:flex-row">
        {selected && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-card px-2">
              <button
                onClick={() =>
                  setPresetIndex((i) => (i - 1 + CHART_PRESETS.length) % CHART_PRESETS.length)
                }
                aria-label="Previous chart preset"
                className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                ‹
              </button>
              <span className="w-28 text-center text-sm font-medium text-foreground/90">
                {preset.label}
              </span>
              <button
                onClick={() => setPresetIndex((i) => (i + 1) % CHART_PRESETS.length)}
                aria-label="Next chart preset"
                className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                ›
              </button>
            </div>
            {/* flex-1 only from lg: on mobile the column is content-sized, and a
                zero flex-basis there would collapse the chart to nothing. */}
            <div className="lg:min-h-0 lg:flex-1">
              <TickerChart symbol={selected} studies={preset.studies} />
            </div>
          </div>
        )}

        <div className="w-full shrink-0 lg:w-96">
          <EarningsPanel
            rows={allEarnings}
            currencyByTicker={currencyByTicker}
            selected={selected}
            onSelect={setSelected}
            unavailable={earningsUnavailable}
          />
        </div>

        {researchFeed && <div className="w-full shrink-0 lg:w-1/4">{researchFeed}</div>}
      </div>

      {/* Full width now that nothing sits beside it. This is the densest thing
          on the page and had been running at 75% while a rail idled next to it. */}
      <div className="overflow-hidden rounded-xl bg-card">
        {/* Arrows sit outside the scroller rather than floating over it, so they
            never cover a category name. They render only when the row actually
            overflows, and each dims at its own end. */}
        <div className="flex items-stretch border-b border-border px-2 pt-1.5">
          {scrollable && (
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              disabled={!canLeft}
              aria-label="Scroll categories left"
              className="flex min-h-11 shrink-0 items-center pr-1 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronIcon direction="left" />
            </button>
          )}

          <div
            ref={tabsRef}
            className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          >
            {lists.map((list) => (
              <button
                key={list}
                onClick={() => handleListChange(list)}
                className={`flex min-h-11 shrink-0 items-center rounded-t px-2 text-sm font-medium transition-colors ${
                  activeList === list
                    ? "border-b-2 border-accent text-accent"
                    : "text-muted-foreground hover:text-foreground/80"
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
              className="flex min-h-11 shrink-0 items-center pl-1 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronIcon direction="right" />
            </button>
          )}
        </div>
        <StockTable stocks={visibleStocks} selected={selected} onSelect={setSelected} />
      </div>
    </div>
  );
}
