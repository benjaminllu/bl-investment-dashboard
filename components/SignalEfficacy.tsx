import type { Efficacy, EfficacyRow } from "@/lib/rotation";

/**
 * Did any of the signals above actually predict anything?
 *
 * This panel exists because everything else on this page is persuasive by
 * construction. A rotation graph with tails on it looks like an explanation
 * whether or not the quadrants carry information, and a ranked table looks like
 * an ordering worth acting on whether or not rank 1 beats rank 11 next quarter.
 * The only honest response is to score the signals against their own forward
 * returns and print the answer next to them, including when the answer is
 * unflattering — which, on this universe, it partly is.
 *
 * Numbers are forward relative return measured against the equal-weighted
 * average of the eleven sectors at the same date, so the question is strictly
 * "given two sectors, did the signal tell you which to hold" rather than "did
 * sectors go up". See the note on `computeEfficacy` in `lib/rotation.ts` for
 * why the demeaning is necessary and what it corrects for.
 */

function Cell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value > 0.05 ? "text-accent" : value < -0.05 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value).toFixed(2)}
    </span>
  );
}

function Table({
  title,
  caption,
  horizons,
  rows,
}: {
  title: string;
  caption: string;
  horizons: string[];
  rows: EfficacyRow[];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <p className="mb-1.5 mt-0.5 text-xs text-muted-foreground">{caption}</p>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted text-xs text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Bucket</th>
            {horizons.map((h) => (
              <th key={h} className="w-16 px-2 py-1.5 text-right font-medium">
                +{h}
              </th>
            ))}
            <th className="w-16 px-2 py-1.5 text-right font-medium" title="Share of observations that beat the sector average, at the longest horizon">
              Hit
            </th>
            <th className="w-14 px-2 py-1.5 text-right font-medium">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const longest = row.cells[horizons[horizons.length - 1]];
            return (
              <tr key={row.bucket} className="border-t border-border">
                <td className="px-2 py-1.5 text-foreground">{row.bucket}</td>
                {horizons.map((h) => (
                  <td key={h} className="px-2 py-1.5 text-right">
                    <Cell value={row.cells[h]?.mean ?? null} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {longest ? `${longest.hitRate.toFixed(0)}%` : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {longest ? longest.count.toLocaleString("en-GB") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function SignalEfficacy({ efficacy }: { efficacy: Efficacy | null }) {
  if (!efficacy) return null;

  const from = new Date(`${efficacy.from}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
  const to = new Date(`${efficacy.to}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Has any of this worked?</h2>
        <p className="text-xs text-muted-foreground">
          {from} → {to} · {efficacy.observations.toLocaleString("en-GB")} weekly observations
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Table
          title="By rotation-graph quadrant"
          caption="Mean forward return against the sector average, in percentage points, from the week a fund sat in each quadrant."
          horizons={efficacy.horizons}
          rows={efficacy.quadrants}
        />
        <Table
          title="By momentum score"
          caption="Same measure, bucketed by the composite score in the ranking table above."
          horizons={efficacy.horizons}
          rows={efficacy.momentum}
        />
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Read this before the tables above it.</span>{" "}
          Every figure here is in-sample: the signals were not fitted to this data, but they are
          being scored on the only history the page has, so there is no out-of-sample check behind
          any of it. The windows overlap heavily and the eleven sectors are correlated with each
          other, so the observation counts are far larger than the number of independent
          observations behind them — a twenty-six week horizon over seven years is roughly fourteen
          genuinely separate periods. No significance test is shown because none of these would
          survive one.
        </p>
        <p>
          What the numbers are good for is calibration. If the leading quadrant carries a negative
          edge over this stretch, that does not prove relative strength mean-reverts — but it does
          mean the graph above should be read as a description of where things stand, not as a list
          of what to buy.
        </p>
      </div>
    </div>
  );
}
