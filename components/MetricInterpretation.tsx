import type { Interpretation } from "@/lib/riskNarrative";

/**
 * The interpretation paragraph shown under a risk metric. Flat and unornamented
 * per DESIGN.md — a rule, a quiet label, and muted body text, with no card of
 * its own competing against the number above it.
 *
 * `stats` is an optional short list of the figures the paragraph is built from,
 * so the reasoning behind the prose stays auditable at a glance.
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
    <div className="mt-3 border-t border-border pt-3">
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
