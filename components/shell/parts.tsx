"use client";

import Link from "next/link";

import MarketClock from "@/components/MarketClock";
import type { IndexRow } from "@/lib/indexQuotes";
import type { TreasuryYields } from "@/lib/fred";

/**
 * The app shell's building blocks: icon rail, one-line tape, hairline panels.
 *
 * Production code. AppShell and HomeBoard render these on every page. The Desk
 * format preview (components/preview/) borrows them too, so deleting that
 * preview means deleting its imports of this file, not this file.
 */

export const NAV_ICONS = {
  home: "M3 10.6 12 3.4l9 7.2M5.6 9.4V20.6h12.8V9.4",
  brief: "M3.4 8.2h17.2v12.4H3.4zM8.8 8.2V5.4h6.4v2.8",
  doc: "M6.2 3.4h7.6l4 4v13.2H6.2zM13.8 3.4v4h4",
  spark: "M12 3.6l1.7 4.9 4.9 1.7-4.9 1.7L12 16.8l-1.7-4.9L5.4 10.2l4.9-1.7z",
  line: "M4.2 19.4V4.6M4.2 19.4h15.2M7.4 15.2l3.6-4.2 3 2.6 5.4-6",
  grid: "M4.2 4.2h6.6v6.6H4.2zM13.2 4.2h6.6v6.6h-6.6zM4.2 13.2h6.6v6.6H4.2zM13.2 13.2h6.6v6.6h-6.6z",
  compass: "M12 20.8a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6zM15.4 8.6l-2 4.8-4.8 2 2-4.8z",
  shield: "M12 3.4l7 2.8v5.6c0 4.2-2.9 7.3-7 8.8-4.1-1.5-7-4.6-7-8.8V6.2z",
  bars: "M5.4 20V11.2M12 20V4.8M18.6 20v-6.2",
  cal: "M4.2 5.6h15.6v15H4.2zM4.2 10h15.6M8.6 3.4v4M15.4 3.4v4",
  globe:
    "M12 20.8a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6zM3.4 9.4h17.2M3.4 14.6h17.2M12 3.2c2.6 2.7 2.6 15 0 17.6M12 3.2c-2.6 2.7-2.6 15 0 17.6",
  search: "M11 17.6a6.6 6.6 0 100-13.2 6.6 6.6 0 000 13.2zM15.8 15.8 20.4 20.4",
  close: "M6 6l12 12M18 6L6 18",
} as const;

export type NavIcon = keyof typeof NAV_ICONS;

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
}

export function Icon({
  path,
  className = "h-[18px] w-[18px]",
}: {
  path: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

/** A region, not a card: one label strip and a body, bounded by the grid gap. */
export function Panel({
  label,
  meta,
  children,
  className = "flex min-h-0 min-w-0 flex-col bg-background",
  bodyClassName = "min-h-0 flex-1 overflow-hidden",
}: {
  label: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={className}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        {meta && <span className="shrink-0 truncate">{meta}</span>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Rail({
  items,
  activeHref,
  onSearch,
}: {
  items: NavItem[];
  activeHref: string;
  onSearch: () => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 border-r border-border py-2"
    >
      <button
        type="button"
        onClick={onSearch}
        aria-label="Open command palette"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon path={NAV_ICONS.search} />
      </button>
      <span className="mb-2 text-xs text-muted-foreground">⌘K</span>

      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          // next/link, not a bare anchor: an <a> reloads the whole document on
          // every tab, which throws away the React tree, the tape, and every
          // cached RSC payload, then rebuilds them. Link navigates on the client
          // and prefetches each route while the rail sits in the viewport, so by
          // the time you click, the payload is usually already here.
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-8 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-card text-accent before:absolute before:-left-2 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-accent before:content-['']"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon path={NAV_ICONS[item.icon]} />
          </Link>
        );
      })}
    </nav>
  );
}

function TapeItem({
  label,
  price,
  changePct,
}: {
  label: string;
  price: number | null;
  changePct: number | null;
}) {
  const tone =
    changePct === null
      ? "text-muted-foreground"
      : changePct >= 0
        ? "text-accent"
        : "text-destructive";
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{price === null ? "—" : price.toFixed(2)}</span>
      <span className={`tabular-nums ${tone}`}>
        {changePct === null ? "—" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
      </span>
    </span>
  );
}

/** The banner's two stacked lines, collapsed into one 32px strip. */
export function Tape({
  indices,
  yields,
}: {
  indices: IndexRow[];
  yields: TreasuryYields;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 overflow-hidden px-2 text-xs">
      <span className="shrink-0 border-r border-border pr-3 font-serif text-sm italic">
        Ben&rsquo;s Investment Research
      </span>
      {/* Sized by its own text rather than scale-90: a transform shrinks the
          drawing but not the layout box, which left ~45px of dead space that
          pushed Copper under the WIP badge at 1920px. */}
      <span className="shrink-0">
        <MarketClock />
      </span>
      <div className="flex items-center gap-3 overflow-hidden">
        {indices.map((idx) => (
          <TapeItem key={idx.ticker} label={idx.label} price={idx.price} changePct={idx.changePct} />
        ))}
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-muted-foreground">10Y</span>
          <span className="font-semibold tabular-nums">
            {yields.tenYear === null ? "—" : `${yields.tenYear.toFixed(2)}%`}
          </span>
          {yields.tenYearBps !== null && (
            <span
              className={`tabular-nums ${
                yields.tenYearBps >= 0 ? "text-destructive" : "text-accent"
              }`}
            >
              {yields.tenYearBps >= 0 ? "+" : ""}
              {yields.tenYearBps}bps
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * The strip that replaces a page's `<h1>`.
 *
 * The rail already says which page you are on, so a 32px bold restatement of
 * the tab you just clicked was ~50px of height per page saying nothing. The
 * heading stays in the markup — it is still the page's h1 for anything reading
 * structure — it just stops being the loudest thing on screen.
 */
export function PageBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border px-3 text-xs">
      <h1 className="font-semibold text-foreground">{title}</h1>
      {children}
    </div>
  );
}
