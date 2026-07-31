import type { Interpretation } from "@/lib/riskNarrative";

/**
 * A metric's interpretation, as its own card sitting under the metric block.
 *
 * The height is fixed rather than content-driven: catalog entries differ in
 * length, so letting these size themselves left the three blocks visibly
 * mismatched. A constant height makes the row read as one band regardless of
 * which entries happen to be selected today.
 *
 * Text scrolls inside the card rather than being clipped, so an unusually long
 * entry stays fully readable instead of being silently cut off.
 *
 * The height is set from the longest of the 160 catalog entries (312 chars),
 * not from whichever entries happen to be showing — today's are near the
 * 241-char median, so sizing to them would have clipped a third of the catalog
 * on some future reading. Measured in the browser, that worst case needs 126px
 * at 1440px wide and up, and 146px at 1280. 150px covers every three-column
 * layout down to a 1280px viewport without ever scrolling; narrower than that
 * the longest entries scroll, which is the intended fallback rather than
 * making every block tall enough for a case that rarely renders.
 */
const BLOCK_HEIGHT = "h-[150px]";

export default function MetricInterpretation({
  interpretation,
  stats,
}: {
  interpretation: Interpretation | null;
  stats?: { label: string; value: string }[];
}) {
  return (
    <div className={`${BLOCK_HEIGHT} flex flex-col overflow-y-auto rounded-xl bg-card p-3`}>
      {interpretation === null ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No interpretation available — the underlying series could not be read.
        </p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
