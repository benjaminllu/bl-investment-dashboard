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
}

export default function WatchlistPanel({ stocks, earnings, earningsUnavailable }: Props) {
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

  const handleListChange = (list: string) => {
    setActiveList(list);
    const first = list === "All" ? stocks[0] : stocks.find((s) => s.list === list);
    if (first) setSelected(first.ticker);
  };

  return (
    <div className="space-y-2">
      {selected && (
        <>
          <div className="flex items-center justify-center gap-2 rounded-lg bg-card px-2">
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
          <TickerChart
            symbol={selected}
            studies={preset.studies}
            studiesOverrides={preset.studiesOverrides}
          />
          <EarningsPanel
            ticker={selected}
            rows={earnings[selected] ?? []}
            currency={
              stocks.find((s) => s.ticker === selected)?.marketCapCurrency ?? null
            }
            unavailable={earningsUnavailable}
          />
        </>
      )}

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
