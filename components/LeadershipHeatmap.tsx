import type { HeatmapMonth } from "@/lib/rotation";

/**
 * Fifteen months of who beat the index, as a grid.
 *
 * The rotation graph shows where each sector is now and the ranking table shows
 * the current ordering. Neither shows persistence, and persistence is the whole
 * question: a sector that has led four months running is a different
 * proposition from one that led once and is being carried by that month in
 * every trailing window on the page. This grid is the only place that
 * distinction is visible, which is why it is here rather than a nicer-looking
 * set of overlaid relative-strength lines.
 *
 *
 * THE COLOUR SCALE IS CAPPED, NOT NORMALISED
 *
 * Cell intensity saturates at ±6 percentage points in a month rather than
 * scaling to whatever the largest value in the grid happens to be. Normalising
 * to the extreme would mean one violent month — April 2026 sits near thirteen
 * points — flattening every other month in the picture to near-invisibility,
 * and would also make the scale mean something different each time the page
 * refreshes. A fixed cap keeps a month comparable to the month above it and to
 * the same month read last week.
 *
 *
 * THE TEXT STAYS WHITE, AND THE MIX STOPS AT 55%
 *
 * The obvious move on a filled cell is to flip the label to the dark
 * background colour once the fill gets bright. Measured against these two
 * tokens over this card, that is wrong at every intensity the grid produces:
 *
 *   emerald over card    45% mix → white 6.25:1, near-black 3.23:1
 *                        55% mix → white 4.94:1, near-black 4.08:1
 *   red over card        55% mix → white 6.48:1, near-black 3.11:1
 *                        70% mix → white 4.80:1, near-black 4.21:1
 *
 * White wins on both ramps until well past the point where the fill would be
 * too loud for a data grid, and near-black never clears 4.5:1 on the red ramp
 * at all. So there is no flip: white throughout, and the fill is capped at 55%,
 * which is the last step where white still clears 4.5:1 on the emerald ramp.
 */

/** Percentage points of monthly relative return at which a cell reaches full intensity. */
const CAP = 6;

function intensity(value: number): number {
  return Math.min(Math.abs(value) / CAP, 1);
}

/** The maximum share of the accent colour mixed into a cell — see the note above. */
const MAX_MIX = 55;

function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });
}

export default function LeadershipHeatmap({
  months,
  tickers,
  labels,
}: {
  months: HeatmapMonth[];
  tickers: string[];
  labels: Record<string, string>;
}) {
  if (months.length === 0) {
    return null;
  }

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Leadership, month by month</h2>
        <p className="text-xs text-muted-foreground">
          Monthly total return minus SPY&apos;s, in percentage points · full colour at ±{CAP}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                Sector
              </th>
              {months.map((m, i) => {
                // The year appears only where it changes — the first column and
                // each January. Fifteen months always cross a year boundary, and
                // a bare "Dec Jan" gives no hint which side of it you are on.
                const year = m.month.slice(0, 4);
                const showYear = i === 0 || year !== months[i - 1].month.slice(0, 4);
                return (
                  <th
                    key={m.month}
                    className={`px-1 py-1.5 text-center font-medium tabular-nums ${
                      m.partial ? "text-muted-foreground/60" : "text-muted-foreground"
                    }`}
                    title={m.partial ? `${m.month} — month still in progress` : m.month}
                  >
                    {formatMonth(m.month)}
                    {showYear ? ` ’${year.slice(2)}` : ""}
                    {m.partial ? "*" : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tickers.map((t) => (
              <tr key={t}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 text-left font-normal text-foreground"
                >
                  <span className="text-muted-foreground">{t}</span>{" "}
                  <span className="hidden sm:inline">{labels[t] ?? ""}</span>
                </th>
                {months.map((m) => {
                  const v = m.values[t];
                  if (v === null || v === undefined) {
                    return (
                      <td key={m.month} className="px-1 py-1 text-center text-muted-foreground">
                        —
                      </td>
                    );
                  }
                  const alpha = intensity(v);
                  const colour = v >= 0 ? "var(--color-accent)" : "var(--color-destructive)";
                  return (
                    <td
                      key={m.month}
                      className="px-1 py-1 text-center tabular-nums"
                      style={{
                        // color-mix against the card, not an opacity on the
                        // element: opacity would fade the number inside it too,
                        // and the number is the point of the cell.
                        backgroundColor: `color-mix(in srgb, ${colour} ${(alpha * MAX_MIX).toFixed(0)}%, var(--color-card))`,
                      }}
                      title={`${labels[t] ?? t}, ${m.month}: ${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}pp vs SPY`}
                    >
                      {v >= 0 ? "+" : "−"}
                      {Math.abs(v).toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        * The final column is the month still in progress, so it is not yet comparable with the
        completed months beside it.
      </p>
    </div>
  );
}
