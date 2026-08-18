import type { DigestItem, MarketDigest } from "@/lib/marketDigest";
import { easternToday } from "@/lib/marketDigest";

interface Props {
  digest: MarketDigest | null;
  /** Query-level failure, distinct from "the job has not run yet". */
  error: string | null;
}

const ET = "America/New_York";

/**
 * Four major stories at 60% of the width, six minor ones at 40%.
 *
 * The underlying grid is ten columns by six rows, which is the smallest one
 * that divides both ways: a major cell is 3x3 (so two fit across 60% and two
 * fit down), a minor cell is 2x2 (so two fit across 40% and three fit down).
 * Four plus six is the generator's full ten, so the grid never ends ragged.
 */
type Size = "major" | "minor";

const MAJOR_SLOTS = 4;

/**
 * These two tables are also the source of truth for how many cells exist in
 * each band — the grid iterates them rather than a separate count.
 *
 * Explicit placement, because auto-flow cannot produce this shape: dropping
 * four 3x3 cells into a ten-column grid puts the third one alongside the first
 * two rather than beneath them.
 *
 * Written as whole static strings rather than composed from indices —
 * Tailwind scans source text, so `xl:col-start-${n}` would generate nothing.
 */
const MAJOR_PLACEMENT = [
  "xl:col-start-1 xl:row-start-1",
  "xl:col-start-4 xl:row-start-1",
  "xl:col-start-1 xl:row-start-4",
  "xl:col-start-4 xl:row-start-4",
];
const MINOR_PLACEMENT = [
  "xl:col-start-7 xl:row-start-1",
  "xl:col-start-9 xl:row-start-1",
  "xl:col-start-7 xl:row-start-3",
  "xl:col-start-9 xl:row-start-3",
  "xl:col-start-7 xl:row-start-5",
  "xl:col-start-9 xl:row-start-5",
];

function formatDay(isoDate: string): string {
  // Parsed as UTC noon rather than midnight so the date cannot slip a day when
  // it is re-projected into Eastern for display.
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: ET,
  });
}

function formatTime(value: string | number | null): string | null {
  if (value === null) return null;
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET,
  });
}

/** Rank, then category, then any watchlist symbols — the cell's index line. */
function CellHead({ item, size }: { item: DigestItem; size: Size }) {
  const major = size === "major";
  return (
    <div className={`flex items-baseline gap-2 ${major ? "mb-1.5" : "mb-1"}`}>
      {/* The rank is information, not ornament, so it stays at /50 — measured
          at 5.2:1 on the card background, where /40 would fall to 3.8:1 and
          miss AA for text this size. */}
      <span
        className={`shrink-0 font-semibold leading-none tabular-nums text-foreground/50 ${
          major ? "text-2xl" : "text-sm"
        }`}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      <span className="truncate text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {item.category}
      </span>
      {item.tickers.length > 0 && (
        <span className="ml-auto shrink-0 text-xs font-medium tabular-nums tracking-wide text-foreground/80">
          {item.tickers.join(" ")}
        </span>
      )}
    </div>
  );
}

function Provenance({ item }: { item: DigestItem }) {
  const time = formatTime(item.articleDatetime);
  // mt-auto pins this to the bottom so attribution sits on one baseline across
  // a row of uneven headlines.
  //
  // This used to be skipped for the lead, which was three rows tall and whose
  // story did not fill them — pinning there stranded the line at the far edge
  // of an empty region. With four equal majors the cells are close to full, so
  // the shared baseline is worth having and the exception is gone.
  return (
    <p className="mt-auto flex gap-1 pt-1 text-xs uppercase tracking-wide text-muted-foreground">
      <span className="truncate">{item.source}</span>
      {time && <span className="shrink-0">· {time}</span>}
    </p>
  );
}

/**
 * One story.
 *
 * Emerald on hover is the documented link-hover state and the only colour this
 * panel spends — the ranking itself is carried entirely by scale, weight and
 * position, per the One Signal Rule in DESIGN.md.
 */
function Cell({ item, size, placement }: { item: DigestItem; size: Size; placement: string }) {
  const major = size === "major";
  return (
    <li
      className={
        major
          ? `md:col-span-1 xl:col-span-3 xl:row-span-3 ${placement}`
          : `md:col-span-1 xl:col-span-2 xl:row-span-2 ${placement}`
      }
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex h-full flex-col bg-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          major ? "p-3" : "p-2"
        }`}
      >
        <CellHead item={item} size={size} />

        <p
          className={`font-semibold text-foreground transition-colors group-hover:text-accent ${
            major
              ? // Three lines at ~560px wide takes a ~110-character headline
                // whole, so the majors rarely truncate at all.
                "line-clamp-3 text-base leading-snug xl:text-lg"
              : "line-clamp-2 text-xs leading-tight"
          }`}
        >
          {item.headline}
        </p>

        <p
          className={`text-muted-foreground ${
            major
              ? "mt-2 line-clamp-3 text-sm leading-snug"
              : "mt-1 line-clamp-2 text-xs leading-tight"
          }`}
        >
          {item.whyItMatters}
        </p>

        <Provenance item={item} />
      </a>
    </li>
  );
}

/** Shared shell, so every state keeps the same masthead and panel footprint. */
function Panel({ meta, children }: { meta: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2">
        <div className="flex items-baseline gap-2">
          {/* Uppercase and tracked out: this is the page's lead block and reads
              as a wire masthead rather than another panel label. Size stays at
              the text-sm step so the type scale is unchanged. */}
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
            AI Market Summary
          </h2>
          {/* Said plainly rather than buried in a tooltip: the ranking and the
              one-line rationales are a model's judgement, and the panel should
              not be read as an editorial desk's. */}
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Ranked by Gemini
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs uppercase tracking-wide text-muted-foreground">
          {meta}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function MarketDigestPanel({ digest, error }: Props) {
  if (!digest || digest.items.length === 0) {
    return (
      <Panel meta={<span>Runs 9:00 AM ET daily</span>}>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          {error
            ? // Surfaced rather than swallowed: a missing table and a quiet
              // morning look identical from the page, and only one of them is
              // something to fix.
              `Digest unavailable — ${error}`
            : "No digest yet. The first one is written by the 9:00 AM ET run."}
        </p>
      </Panel>
    );
  }

  const stale = digest.date !== easternToday();
  const generatedTime = formatTime(digest.generatedAt);

  // One entry per grid position rather than per story. The hairlines are the
  // container showing through a 1px gap, so a position left unfilled would paint
  // as a solid border-coloured block — and with explicit placement a missing
  // story leaves a hole rather than letting the rest shuffle up. A run that
  // found fewer than ten is legitimate (the generator's floor is five), so every
  // position renders either a story or a filler.
  const slots = [...MAJOR_PLACEMENT, ...MINOR_PLACEMENT].map((placement, i) => ({
    placement,
    size: (i < MAJOR_SLOTS ? "major" : "minor") as Size,
    item: digest.items[i] ?? null,
  }));

  return (
    <Panel
      meta={
        <>
          <span className="font-semibold tracking-[0.14em] text-foreground/80">
            {formatDay(digest.date)}
          </span>
          {generatedTime && <span>· generated {generatedTime} ET</span>}
          {/* Amber, the token DESIGN.md nominates for "notable but not good or
              bad". A digest from an earlier day is still useful — it just must
              not be mistaken for this morning's. */}
          {stale && (
            <span
              title="The 9:00 AM ET job has not produced a digest for today — this is the most recent one."
              className="border border-warning/40 px-1.5 py-0.5 font-semibold tracking-[0.14em] text-warning"
            >
              Not today&apos;s
            </span>
          )}
        </>
      }
    >
      {/* A 1px gap over a border-coloured container rules the whole block into
          cells — the wire-service grid this replaced a row of rounded tiles
          with. Full bleed, so the rules meet the panel edge instead of floating
          inside a margin.

          Ten columns by six rows: the four majors are 3x3 and fill the left
          60%, the six minors are 2x2 and fill the right 40%. Below xl the split
          is meaningless at that width, so the cells drop their spans and run as
          a plain two-column list in rank order — majors first. */}
      <ol className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-10 xl:grid-rows-6">
        {slots.map(({ placement, size, item }, i) =>
          item ? (
            <Cell key={`${item.rank}-${item.url}`} item={item} size={size} placement={placement} />
          ) : (
            <li
              key={`filler-${i}`}
              aria-hidden
              className={`hidden bg-card md:block ${
                size === "major"
                  ? `xl:col-span-3 xl:row-span-3 ${placement}`
                  : `xl:col-span-2 xl:row-span-2 ${placement}`
              }`}
            />
          )
        )}
      </ol>
    </Panel>
  );
}
