import Sparkline from "@/components/Sparkline";
import type { Regime } from "@/lib/rotation";

/**
 * The precondition panel, and it sits at the top of the page for that reason.
 *
 * Every ranking below it assumes there is something to rank. When the eleven
 * sectors are moving together — high correlation, low dispersion — the ordering
 * still computes, still sorts, and still looks authoritative, while being
 * almost entirely noise. This band is what stops the rest of the page from
 * being read that way, so it is placed before the rankings rather than
 * appended after them as context.
 *
 * Each tile shows a level, where that level sits against the whole history the
 * page has, and the shape it took getting there. The percentile is doing most
 * of the work: "average pairwise correlation is 0.13" means nothing without
 * knowing that is the lowest reading in the sample.
 *
 * That window is stated from the data rather than described, because it is not
 * the ten years the fetch requests — the sector grid is intersected across
 * calendars and XLC only launched in June 2018. See `Regime.from`.
 */

/**
 * Colour the percentile bar by what the reading means, not by its arithmetic.
 *
 * High dispersion and high leadership spread are the conditions this page wants
 * — those go green at the top. High correlation is the opposite, so it inverts.
 * Breadth is left neutral in both directions on purpose: a high count is good
 * for the index and a low count is where the best relative opportunities have
 * historically been, and picking a colour would assert one of those readings
 * over the other.
 */
const POLARITY: Record<string, 1 | -1 | 0> = {
  dispersion: 1,
  correlation: -1,
  breadth: 0,
  spread: 1,
};

function toneFor(id: string, percentile: number | null): string {
  const polarity = POLARITY[id] ?? 0;
  if (percentile === null || polarity === 0) return "bg-muted-foreground/60";
  const favourable = polarity === 1 ? percentile >= 65 : percentile <= 35;
  const unfavourable = polarity === 1 ? percentile <= 35 : percentile >= 65;
  if (favourable) return "bg-accent";
  if (unfavourable) return "bg-destructive";
  return "bg-muted-foreground/60";
}

function ordinal(n: number): string {
  const r = Math.round(n);
  const suffix = r % 100 >= 11 && r % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][r % 10] ?? "th";
  return `${r}${suffix}`;
}

export default function RotationRegime({ regime }: { regime: Regime | null }) {
  if (!regime) {
    return (
      <div className="border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Regime metrics need the full sector grid, which did not load. They will fill in on the
          next refresh.
        </p>
      </div>
    );
  }

  const score = regime.rotationScore;
  const since = new Date(`${regime.from}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Is there rotation to read?</h2>
        <p className="text-xs text-muted-foreground">
          Percentiles since {since} · sparklines span the same window
        </p>
      </div>

      {score !== null && (
        <div className="mb-4 rounded-lg bg-muted/50 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Rotation conditions
            </span>
            <span
              className={`text-lg font-semibold tabular-nums ${
                score >= 70 ? "text-accent" : score >= 40 ? "text-foreground" : "text-destructive"
              }`}
            >
              {Math.round(score)}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          {/* A two-input average, not an index: dispersion's percentile and the
              inverse of correlation's. Said plainly under the number so it is
              not mistaken for something with more machinery behind it. */}
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-border">
            <div
              className={`h-full rounded ${score >= 70 ? "bg-accent" : score >= 40 ? "bg-muted-foreground" : "bg-destructive"}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {regime.verdict}{" "}
            <span className="text-muted-foreground/70">
              The score is the average of dispersion&apos;s percentile and the inverse of
              correlation&apos;s — nothing more elaborate than the two tiles below it.
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {regime.metrics.map((m) => (
          <div key={m.id} className="rounded-lg bg-muted/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{m.label}</h3>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {m.value === null ? "—" : m.value.toFixed(m.decimals)}
                <span className="text-xs font-normal text-muted-foreground">{m.unit}</span>
              </p>
            </div>

            <div className="mt-1">
              <Sparkline values={m.history} tone="neutral" title={`${m.label} since ${since}`} />
            </div>

            {m.percentile !== null && (
              <div className="mt-1.5">
                <div className="h-1 w-full overflow-hidden rounded bg-border">
                  <div
                    className={`h-full rounded ${toneFor(m.id, m.percentile)}`}
                    style={{ width: `${Math.max(m.percentile, 1.5)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ordinal(m.percentile)} percentile —{" "}
                  {m.percentile >= 50 ? m.high : m.low}
                </p>
              </div>
            )}

            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/80">
              {m.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
