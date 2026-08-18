import type { DigestItem, MarketDigest } from "@/lib/marketDigest";
import { easternToday } from "@/lib/marketDigest";

interface Props {
  digest: MarketDigest | null;
  /** Query-level failure, distinct from "the job has not run yet". */
  error: string | null;
}

const ET = "America/New_York";

/**
 * The nine cells beside the lead story. Nine is 3x3, which completes both the
 * three-column layout and the five-column one, so the grid never ends on a
 * ragged row.
 */
const SECONDARY_SLOTS = 9;

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
function CellHead({ item, size }: { item: DigestItem; size: "lead" | "small" }) {
  const lead = size === "lead";
  return (
    <div className={`flex items-baseline gap-2 ${lead ? "mb-1.5" : "mb-1"}`}>
      {/* The rank is information, not ornament, so it stays at /50 — measured
          at 5.2:1 on the card background, where /40 would fall to 3.8:1 and
          miss AA for text this size. */}
      <span
        className={`shrink-0 font-semibold leading-none tabular-nums text-foreground/50 ${
          lead ? "text-5xl" : "text-sm"
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

function Provenance({ item, size }: { item: DigestItem; size: "lead" | "small" }) {
  const time = formatTime(item.articleDatetime);
  // In the small cells mt-auto pins this to the bottom, so attribution sits on
  // one baseline across a row of uneven headlines. The lead is three rows tall
  // and its story does not fill that, so the same trick would strand the line
  // at the far edge of an empty region — there it just follows the text, and
  // the leftover space reads as deliberate margin instead of a gap.
  return (
    <p
      className={`flex gap-1 pt-1 text-xs uppercase tracking-wide text-muted-foreground ${
        size === "lead" ? "" : "mt-auto"
      }`}
    >
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
function Cell({ item, size }: { item: DigestItem; size: "lead" | "small" }) {
  const lead = size === "lead";
  return (
    <li className={lead ? "md:col-span-3 xl:col-span-2 xl:row-span-3" : undefined}>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex h-full flex-col bg-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
          lead ? "p-3 xl:p-4" : "p-2"
        }`}
      >
        <CellHead item={item} size={size} />

        <p
          className={`font-semibold text-foreground transition-colors group-hover:text-accent ${
            lead
              ? // Tight tracking at display size is the editorial move that makes
                // the lead read as a lead. Body copy keeps normal tracking.
                "text-xl leading-[1.12] tracking-tight xl:text-2xl"
              : "line-clamp-2 text-xs leading-tight"
          }`}
        >
          {item.headline}
        </p>

        <p
          className={`text-muted-foreground ${
            lead ? "mt-2 max-w-prose text-sm leading-normal" : "mt-1 line-clamp-2 text-xs leading-tight"
          }`}
        >
          {item.whyItMatters}
        </p>

        <Provenance item={item} size={size} />
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

  const [lead, ...rest] = digest.items;
  const secondary = rest.slice(0, SECONDARY_SLOTS);
  const stale = digest.date !== easternToday();
  const generatedTime = formatTime(digest.generatedAt);

  // The hairlines are the container showing through a 1px gap, so any grid cell
  // left unfilled would paint as a solid border-coloured block. A run that found
  // fewer than ten stories is legitimate (the generator's floor is five), so the
  // shortfall is padded out. Hidden below md, where the grid is a single column
  // and a filler would be an empty row.
  const fillers = Math.max(0, SECONDARY_SLOTS - secondary.length);

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

          Five columns by three rows is fifteen cells: the lead takes two by
          three and the other nine take the remaining three by three, so a
          ten-item ranking lands exactly with no orphan row. */}
      <ol className="grid gap-px bg-border md:grid-cols-3 xl:grid-cols-5 xl:grid-rows-3">
        <Cell item={lead} size="lead" />
        {secondary.map((item) => (
          <Cell key={`${item.rank}-${item.url}`} item={item} size="small" />
        ))}
        {Array.from({ length: fillers }, (_, i) => (
          <li key={`filler-${i}`} aria-hidden className="hidden bg-card md:block" />
        ))}
      </ol>
    </Panel>
  );
}
