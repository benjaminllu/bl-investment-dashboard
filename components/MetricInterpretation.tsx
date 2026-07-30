import type { Interpretation } from "@/lib/riskNarrative";

/**
 * The interpretation paragraph for a risk metric, rendered as a footer bar
 * flush with the bottom of its card.
 *
 * Two structural requirements, both of which the parent card has to cooperate
 * with: `mt-auto` needs the card to be `flex h-full flex-col` so the bar is
 * pushed to the bottom regardless of how much content sits above it, and the
 * negative margins assume the card's `p-4` padding so the bar can span the full
 * card width. Grid rows stretch their items to equal height, so with every card
 * built this way the bars line up along the bottom of the row.
 *
 * `bg-muted` is the same recessed surface used for table headers and research
 * rows elsewhere in the app — flat, no ornamentation, per DESIGN.md.
 */
export default function MetricInterpretation({
  interpretation,
  stats,
}: {
  interpretation: Interpretation | null;
  stats?: { label: string; value: string }[];
}) {
  if (!interpretation) return null;

  return (
    <div className="-mx-4 -mb-4 mt-auto rounded-b-xl border-t border-border bg-muted px-4 py-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{interpretation.text}</p>

      {stats && stats.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {stats.map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-xs font-medium tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
