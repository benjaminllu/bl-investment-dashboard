"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import MarketDigestPanel from "@/components/MarketDigestPanel";
import MoversPanel, { rankMovers } from "@/components/MoversPanel";
import EarningsPanel, { type EarningsRow } from "@/components/EarningsPanel";
import StockTable, { type Stock } from "@/components/StockTable";
import TickerChart from "@/components/TickerChart";

import { CHART_PRESETS } from "@/lib/chartPresets";

import type { MarketDigest } from "@/lib/marketDigest";
import type { NewsItem } from "@/lib/finnhubNews";

import { Icon, NAV_ICONS, Panel, type NavItem } from "@/components/shell/parts";
import TickerDrawer from "./TickerDrawer";

/**
 * The "Desk" format: the Console shell plus the structural change.
 *
 * Three tiers instead of nine flat pages:
 *   1. Today   — this screen. The 9am read: what needs you, then the digest.
 *   2. Boards  — Markets / Portfolio / Research. Four destinations, not nine.
 *   3. Drawer  — any ticker, over any page, without navigating (TickerDrawer).
 *
 * NOT BUILT HERE: the Markets board itself, which is where Macro, Sectors,
 * Positioning and Risk merge into one scrollable surface. The rail links to
 * /macro for now. That merge is deferred on purpose — lib/sectors.ts and the
 * Sectors page are mid-rewrite in the working tree, and folding a page into a
 * board while it is actively changing buys a merge conflict rather than an
 * answer. It also needs a real decision about section order, which is a
 * judgement about how Ben researches rather than something to guess at.
 */

const DESK_NAV: NavItem[] = [
  { label: "Today", href: "/format-preview/desk", icon: "cal" },
  { label: "Markets", href: "/macro", icon: "globe" },
  { label: "Portfolio", href: "/portfolio", icon: "brief" },
  { label: "Research", href: "/research", icon: "doc" },
];

/** "today" / "tomorrow" / "in 5d". "in 0d" is not something anyone says. */
function whenLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d}d`;
}

function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - todayUtc) / 86_400_000);
}

/**
 * One thing that wants attention, stated as a name rather than a number.
 *
 * Not the big-number stat tile: the headline is the ticker or the count, and
 * the number is support. A row of four 40px figures would be the SaaS hero
 * metric, which says less per pixel than "PLTR — after close, in 2 days".
 */
function AttentionTile({
  kicker,
  head,
  sub,
  tone,
  onClick,
}: {
  kicker: string;
  head: string;
  sub: string;
  tone?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="text-xs text-muted-foreground">{kicker}</div>
      <div className={`mt-0.5 text-base font-semibold leading-tight ${tone ?? "text-foreground"}`}>
        {head}
      </div>
      <div className="mt-auto truncate pt-1 text-xs text-muted-foreground">{sub}</div>
    </>
  );

  const base = "flex min-w-0 flex-col bg-background px-3 py-2 text-left";

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${base} transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  );
}

interface Props {
  stocks: Stock[];
  earnings: Record<string, EarningsRow[]>;
  earningsUnavailable: boolean;
  digest: MarketDigest | null;
  digestError: string | null;
  watchlistNews: NewsItem[];
}

export default function DeskShell({
  stocks,
  earnings,
  earningsUnavailable,
  digest,
  digestError,
  watchlistNews,
}: Props) {
  const router = useRouter();

  // Seeded rather than null: the chart band is always on screen, and an empty
  // panel on first paint reads as broken rather than as "nothing selected".
  const [selected, setSelected] = useState<string | null>(stocks[0]?.ticker ?? null);
  const [drawerTicker, setDrawerTicker] = useState<string | null>(null);
  const [presetIndex, setPresetIndex] = useState(0);
  const [query, setQuery] = useState("");

  const preset = CHART_PRESETS[presetIndex];

  const allEarnings = useMemo(() => Object.values(earnings).flat(), [earnings]);
  const currencyByTicker = useMemo(
    () => Object.fromEntries(stocks.map((s) => [s.ticker, s.marketCapCurrency ?? null])),
    [stocks]
  );

  const { gainers, losers } = useMemo(() => rankMovers(stocks), [stocks]);

  /** The soonest report across the whole watchlist — the thing tonight hinges on. */
  const nextReport = useMemo(() => {
    const upcoming = allEarnings
      .filter((r) => daysUntil(r.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [allEarnings]);

  /** Every list a ticker sits on: a name can appear on more than one. */
  const listsByTicker = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of stocks) {
      if (!s.list) continue;
      (map[s.ticker] ??= []).push(s.list);
    }
    return map;
  }, [stocks]);

  const drawerStock = drawerTicker
    ? (stocks.find((s) => s.ticker === drawerTicker) ?? null)
    : null;
  const drawerNews = useMemo(
    () => (drawerTicker ? watchlistNews.filter((n) => n.ticker === drawerTicker) : []),
    [watchlistNews, drawerTicker]
  );

  /* ---- command palette -------------------------------------------------- */
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const q = query.trim().toLowerCase();
  const pageHits = q ? DESK_NAV.filter((n) => n.label.toLowerCase().includes(q)) : DESK_NAV;
  const tickerHits = q
    ? stocks
        .filter((s) => s.ticker.toLowerCase().includes(q) || s.company.toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  // From the palette a ticker opens the drawer rather than just highlighting a
  // row — the palette is how you ask about a name you cannot see on screen.
  const chooseTicker = (ticker: string) => {
    setSelected(ticker);
    setDrawerTicker(ticker);
    dialogRef.current?.close();
  };

  const chooseFirst = () => {
    if (tickerHits.length > 0) chooseTicker(tickerHits[0].ticker);
    else if (pageHits.length > 0) {
      dialogRef.current?.close();
      router.push(pageHits[0].href);
    }
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
        {/* The utility bar replaces the per-page h1: the rail already says
            where you are, so this carries the date and data freshness instead
            of repeating the word "Today" in 24px bold. */}
        <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border px-3 text-xs">
          <span className="font-semibold">Today</span>
          <span className="text-muted-foreground">{today}</span>
          <a
            href="/format-preview"
            className="ml-auto text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Compare with the Console format ›
          </a>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[5.5rem_13rem_16rem_minmax(0,1fr)] gap-px bg-border">
          {/* Tier one, first screen: what needs you, before any table. */}
          <div className="grid grid-cols-4 gap-px bg-border">
            <AttentionTile
              kicker="Next report"
              head={nextReport ? nextReport.ticker : "Nothing scheduled"}
              sub={
                nextReport
                  ? `${nextReport.hour === "bmo" ? "Before open" : nextReport.hour === "amc" ? "After close" : "Time unset"} · ${whenLabel(nextReport.date)}`
                  : earningsUnavailable
                    ? "Lookup failed — not a statement about the schedule"
                    : "No upcoming reports across the watchlist"
              }
              tone={nextReport && daysUntil(nextReport.date) <= 3 ? "text-warning" : undefined}
              onClick={nextReport ? () => setDrawerTicker(nextReport.ticker) : undefined}
            />
            <AttentionTile
              kicker="Best on your list"
              head={gainers[0] ? `${gainers[0].ticker} +${gainers[0].changePct.toFixed(2)}%` : "—"}
              sub={gainers[0]?.company ?? "No quoted gainers today"}
              tone="text-accent"
              onClick={gainers[0] ? () => setDrawerTicker(gainers[0].ticker) : undefined}
            />
            <AttentionTile
              kicker="Worst on your list"
              head={losers[0] ? `${losers[0].ticker} ${losers[0].changePct.toFixed(2)}%` : "—"}
              sub={losers[0]?.company ?? "No quoted losers today"}
              tone="text-destructive"
              onClick={losers[0] ? () => setDrawerTicker(losers[0].ticker) : undefined}
            />
            <AttentionTile
              kicker="Digest"
              head={digest ? `${digest.items.length} stories` : "Not yet run"}
              sub={
                digest
                  ? `Ranked by Gemini · ${digest.date}`
                  : (digestError ?? "The 9:00 AM ET job has not produced one")
              }
            />
          </div>

          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_13rem] gap-px bg-border">
            <MarketDigestPanel
              digest={digest}
              error={digestError}
              className="flex min-h-0 flex-col overflow-auto bg-background"
            />
            <MoversPanel
              stocks={stocks}
              compact
              className="flex min-h-0 flex-col overflow-hidden bg-background"
            />
          </div>

          {/* The chart is a standing panel here, not only a thing inside the
              drawer. Selecting a row moves it; the drawer is for the full
              read-up on one name, not for the glance at its shape. */}
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_20rem] gap-px bg-border">
            <Panel
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
              onSelect={(t) => {
                setSelected(t);
                setDrawerTicker(t);
              }}
              unavailable={earningsUnavailable}
              className="flex min-h-0 flex-col bg-background p-2"
            />
          </div>

          {/* Row click moves the chart; the ticker button inside the row opens
              the drawer. Two levels of "tell me more" from one table, which is
              what stops the drawer from firing on every idle click. */}
          <Panel
            label="Watchlist"
            meta={`${stocks.length} names · row selects · ticker opens detail`}
            bodyClassName="min-h-0 flex-1"
          >
            <StockTable
              stocks={stocks}
              selected={selected}
              onSelect={setSelected}
              onOpenTicker={setDrawerTicker}
              className="h-full overflow-auto"
            />
          </Panel>
      </div>

      <TickerDrawer
        stock={drawerStock}
        earnings={drawerTicker ? (earnings[drawerTicker] ?? []) : []}
        news={drawerNews}
        lists={drawerTicker ? (listsByTicker[drawerTicker] ?? []) : []}
        onClose={() => setDrawerTicker(null)}
      />

      {/* ---- command palette ---- */}
      <dialog
        ref={dialogRef}
        onClose={() => setQuery("")}
        className="mt-[12vh] w-[min(34rem,92vw)] rounded-xl bg-card p-0 text-foreground backdrop:bg-black/60"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              chooseFirst();
            }
          }}
          placeholder="Jump to a ticker or a board…"
          aria-label="Jump to a ticker or a board"
          className="w-full bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none"
        />
        <div className="max-h-80 overflow-auto py-1">
          {tickerHits.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs text-muted-foreground">Tickers</p>
              {tickerHits.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chooseTicker(s.ticker)}
                  className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="w-16 shrink-0 font-semibold">{s.ticker}</span>
                  <span className="truncate text-muted-foreground">{s.company}</span>
                  <span
                    className={`ml-auto shrink-0 tabular-nums ${
                      s.changePct >= 0 ? "text-accent" : "text-destructive"
                    }`}
                  >
                    {s.changePct >= 0 ? "+" : ""}
                    {s.changePct.toFixed(2)}%
                  </span>
                </button>
              ))}
            </>
          )}
          {pageHits.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs text-muted-foreground">Boards</p>
              {pageHits.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <Icon path={NAV_ICONS[n.icon]} className="h-4 w-4 text-muted-foreground" />
                  {n.label}
                </a>
              ))}
            </>
          )}
          {q && tickerHits.length === 0 && pageHits.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Nothing matches “{query}”. Try a ticker, a company name, or a board.
            </p>
          )}
        </div>
      </dialog>
    </div>
  );
}
