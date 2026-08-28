"use client";

import { useEffect, useRef } from "react";

import TickerChart from "@/components/TickerChart";
import type { Stock } from "@/components/StockTable";
import type { EarningsRow } from "@/components/EarningsPanel";
import type { NewsItem } from "@/lib/finnhubNews";
import { CHART_PRESETS } from "@/lib/chartPresets";
import { Icon, NAV_ICONS } from "@/components/shell/parts";

/**
 * Tier three of the Desk format: one ticker, opened over whatever page you were
 * already on.
 *
 * The problem it exists to remove: seeing a name move on the watchlist and
 * wanting to know why currently costs a navigation away and back, which loses
 * the table's sort and the selected category. Here it costs a click and Escape.
 *
 * A native <dialog> rather than a positioned div. Three things come free and
 * all three would otherwise have to be written by hand: Escape closes it, focus
 * is trapped inside while it is open and restored to the row on close, and it
 * renders in the top layer — so it is not clipped by the overflow-hidden panels
 * it opens over, which a position:absolute drawer inside the grid would be.
 *
 * Deliberately shows no position or P&L. The real portfolio sits behind the
 * unlock cookie (components/PortfolioLockScreen.tsx); reading it here would
 * route around that gate on a page that has none. If the Desk ships, the
 * position block belongs here — but gated the same way /portfolio is.
 */

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

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Finnhub reports market cap in millions.
function formatCap(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  // A non-USD listing is reported in its own currency, so a KRW name comes back
  // three orders of magnitude too large. Labelled rather than silently converted.
  const suffix = currency && currency !== "USD" ? ` ${currency}` : "";
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}T${suffix}`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}B${suffix}`;
  return `$${Math.round(value)}M${suffix}`;
}

function formatPe(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  return value.toFixed(1);
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-background px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

interface Props {
  stock: Stock | null;
  earnings: EarningsRow[];
  news: NewsItem[];
  /** Every list the ticker appears on, since a name can sit on more than one. */
  lists: string[];
  onClose: () => void;
}

export default function TickerDrawer({ stock, earnings, news, lists, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  // showModal() is imperative, so opening is driven by the presence of a stock
  // rather than by a separate open flag that could drift out of step with it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (stock && !el.open) el.showModal();
    if (!stock && el.open) el.close();
  }, [stock]);

  if (!stock) {
    return <dialog ref={ref} onClose={onClose} className="hidden" />;
  }

  const up = stock.changePct >= 0;
  const upcoming = earnings
    .filter((r) => daysUntil(r.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const insider = stock.insider;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={`${stock.ticker} detail`}
      // Pinned to the right edge at full height: margin-left:auto is what turns
      // a centred modal into a drawer without leaving the top layer.
      className="m-0 ml-auto h-dvh max-h-dvh w-[26rem] max-w-full border-l border-border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold">{stock.ticker}</span>
              <span className="truncate text-xs text-muted-foreground">{stock.company}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">
                ${stock.price.toFixed(2)}
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  up ? "text-accent" : "text-destructive"
                }`}
              >
                {up ? "+" : ""}
                {stock.changePct.toFixed(2)}%
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon path={NAV_ICONS.close} className="h-4 w-4" />
          </button>
        </header>

        <div className="h-44 shrink-0 border-b border-border">
          <TickerChart
            symbol={stock.ticker}
            studies={CHART_PRESETS[0].studies}
            className="h-full w-full"
          />
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-px border-b border-border bg-border">
          <Stat label="Mkt Cap" value={formatCap(stock.marketCap, stock.marketCapCurrency)} />
          <Stat label="P/E TTM" value={formatPe(stock.peTtm)} />
          <Stat label="P/E Fwd" value={formatPe(stock.forwardPe)} />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <section>
            <h3 className="border-b border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
              Upcoming earnings
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No scheduled report for {stock.ticker}.
              </p>
            ) : (
              upcoming.map((r) => {
                const days = daysUntil(r.date);
                return (
                  <div
                    key={`${r.date}-${r.quarter}`}
                    className="flex items-baseline gap-2 border-b border-border px-3 py-1.5 text-xs"
                  >
                    <span className="tabular-nums text-foreground">{formatDate(r.date)}</span>
                    <span className="text-muted-foreground">
                      {r.hour === "bmo" ? "Before open" : r.hour === "amc" ? "After close" : "—"}
                    </span>
                    {r.epsEstimate !== null && (
                      <span className="tabular-nums text-muted-foreground">
                        est. ${r.epsEstimate.toFixed(2)}
                      </span>
                    )}
                    <span
                      className={`ml-auto tabular-nums ${
                        days <= 3 ? "text-warning" : "text-muted-foreground"
                      }`}
                    >
                      {whenLabel(r.date)}
                    </span>
                  </div>
                );
              })
            )}
          </section>

          {insider && (insider.buys > 0 || insider.sells > 0) && (
            <section>
              <h3 className="border-b border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
                Insider activity
              </h3>
              <div className="flex items-baseline gap-3 px-3 py-1.5 text-xs">
                {insider.buys > 0 && (
                  <span className="text-accent">
                    {insider.buys} {insider.buys === 1 ? "buy" : "buys"}
                  </span>
                )}
                {insider.sells > 0 && (
                  <span className="text-destructive">
                    {insider.sells} {insider.sells === 1 ? "sell" : "sells"}
                  </span>
                )}
                {insider.isCluster && (
                  <span className="text-warning">Cluster — two or more buyers in a week</span>
                )}
              </div>
            </section>
          )}

          <section>
            <h3 className="border-b border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
              Recent coverage
            </h3>
            {news.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No recent headlines carrying {stock.ticker}. The feed only tags names on the
                watchlist, so this is not a statement about the news.
              </p>
            ) : (
              news.slice(0, 8).map((n) => (
                <a
                  key={n.url}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border-b border-border px-3 py-1.5 transition-colors hover:bg-muted"
                >
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{n.source}</span>
                    <span className="shrink-0">
                      {new Date(n.datetime * 1000).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-xs leading-snug text-foreground">{n.headline}</p>
                </a>
              ))
            )}
          </section>
        </div>

        {lists.length > 0 && (
          <footer className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            On your lists: <span className="text-accent">{lists.join(" · ")}</span>
          </footer>
        )}
      </div>
    </dialog>
  );
}
