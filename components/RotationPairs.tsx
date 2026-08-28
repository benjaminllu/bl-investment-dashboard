import Sparkline from "@/components/Sparkline";
import type { PairRow } from "@/lib/rotation";

/**
 * Ratio spreads: the rotations that do not show up in a sector grid.
 *
 * Small versus large, growth versus value, credit versus treasuries — none of
 * these are sectors, and all of them move money in ways the eleven-fund grid
 * cannot see. A small-cap rotation shows up in the sector table only as a faint
 * tilt spread across every cyclical sector at once; here it is one line.
 *
 * Each row is numerator divided by denominator, so the returns are the spread's
 * own return: XLY/XLP up 5% over a month means discretionary beat staples by
 * five points, regardless of whether either of them rose.
 *
 * The "vs 50d" column is what separates a trend from a bounce. A spread can be
 * up over three months and still be rolling over; the fifty-day line is the
 * cheapest way to say which.
 */

const WINDOWS = ["1M", "3M", "6M", "12M"] as const;

function Signed({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value > 0 ? "text-accent" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value).toFixed(1)}
    </span>
  );
}

export default function RotationPairs({ pairs }: { pairs: PairRow[] }) {
  if (pairs.length === 0) return null;

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Cross-cutting spreads</h2>
        <p className="text-xs text-muted-foreground">
          Ratio returns in percent · sparkline covers two years
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-xs text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">Spread</th>
              <th className="w-24 px-2 py-1.5 text-left font-medium">Ratio</th>
              <th className="w-28 px-2 py-1.5 text-left font-medium">2Y</th>
              {WINDOWS.map((w) => (
                <th key={w} className="w-16 px-2 py-1.5 text-right font-medium">
                  {w}
                </th>
              ))}
              <th
                className="w-16 px-2 py-1.5 text-right font-medium"
                title="Percent above or below the ratio's own 50-day average"
              >
                vs 50d
              </th>
              <th className="px-2 py-1.5 text-left font-medium">Reading</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              // The three-month move sets the reading rather than the latest
              // tick: a spread that is up over a quarter but down on the week
              // has not changed its message, it has wobbled.
              const direction = p.ret["3M"];
              const reading =
                direction === null ? "—" : direction >= 0 ? p.up : p.down;
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 py-1.5 text-foreground">{p.label}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {p.numerator}/{p.denominator}
                  </td>
                  <td className="px-2 py-1.5">
                    <Sparkline
                      values={p.history}
                      tone="auto"
                      title={`${p.numerator} relative to ${p.denominator} over two years`}
                    />
                  </td>
                  {WINDOWS.map((w) => (
                    <td key={w} className="px-2 py-1.5 text-right">
                      <Signed value={p.ret[w]} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <Signed value={p.vs50} />
                  </td>
                  <td
                    className={`px-2 py-1.5 text-xs ${
                      direction === null ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {reading}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
        The reading column describes the three-month direction of the spread, not a forecast and not
        a position. A rising ratio only means the numerator outperformed — both sides can be falling.
      </p>
    </div>
  );
}
