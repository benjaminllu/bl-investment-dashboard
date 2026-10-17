import Sparkline from "./Sparkline";
import { ordinal } from "@/lib/riskNarrative";
import type { PositioningSource } from "@/lib/positioning";

/**
 * Amber at the tails, per DESIGN.md's "notable but not good or bad". A crowded
 * reading is neither a gain nor a loss, so it never takes the emerald signal.
 */
function isExtreme(percentile: number | null): boolean {
  return percentile !== null && (percentile >= 90 || percentile <= 10);
}

export default function PositioningPanel({
  title,
  source,
  data,
  footnote,
}: {
  title: string;
  /** Provenance line, e.g. "CFTC TFF · futures only". */
  source: string;
  data: PositioningSource;
  footnote?: string;
}) {
  return (
    <section className="flex flex-col border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {source}
          {data.asOf ? ` · ${data.asOf}` : ""}
        </p>
      </div>

      {data.unavailable ? (
        <p className="text-sm text-muted-foreground">
          The source did not return data. The panel will fill in on the next hourly refresh.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.readings.map((r) => (
            <li key={r.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {r.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{r.value}</p>
                  {r.detail && (
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{r.detail}</p>
                  )}
                </div>
                {/* Sized by the wrapper: Sparkline sets its own w-full, which
                    would otherwise take the row and squeeze the figures. */}
                <div className="w-32 shrink-0">
                  <Sparkline values={r.history} title={`${r.label}, recent history`} />
                </div>
              </div>
              {r.percentile !== null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span
                    className={`tabular-nums ${isExtreme(r.percentile) ? "text-warning" : "text-foreground"}`}
                  >
                    {r.record ? `Record ${r.record}` : ordinal(r.percentile)}
                  </span>{" "}
                  {r.record ? "" : "percentile "}since {r.since}
                </p>
              )}
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{r.read}</p>
            </li>
          ))}
        </ul>
      )}

      {footnote && !data.unavailable && (
        <p className="mt-auto border-t border-border pt-2 text-xs text-muted-foreground">{footnote}</p>
      )}
    </section>
  );
}
