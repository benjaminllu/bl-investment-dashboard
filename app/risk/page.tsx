import { fetchFearGreedIndex } from "@/lib/fearGreed";
import { fetchVixSpread } from "@/lib/cboeVix";
import { computeSeriesStats, type SeriesStats } from "@/lib/riskStats";
import { interpretFearGreed, interpretSpread, interpretVix, ordinal } from "@/lib/riskNarrative";
import FearGreedPanel from "@/components/FearGreedPanel";
import VixMetrics from "@/components/VixMetrics";

/**
 * The figures each interpretation is built from, surfaced under the paragraph so
 * the prose stays checkable. `showLongRun` differs per metric on purpose: Cboe
 * gives decades of history, CNN's payload only gives one trailing year, and the
 * copy must not imply otherwise. The long-run label is derived from the data's
 * own first date so it cannot drift if the upstream coverage changes.
 */
function interpretationStats(stats: SeriesStats | null, digits: number, showLongRun: boolean) {
  if (!stats) return undefined;
  const chips = [
    { label: "1Y avg", value: stats.year.mean.toFixed(digits) },
    { label: "Pctl", value: ordinal(stats.pctRankFull) },
    {
      label: "1M",
      value:
        stats.change21d === null
          ? "—"
          : `${stats.change21d >= 0 ? "+" : "−"}${Math.abs(stats.change21d).toFixed(digits)}`,
    },
  ];
  if (showLongRun) {
    chips.splice(1, 0, {
      label: `Avg since ${stats.firstDate.slice(0, 4)}`,
      value: stats.full.mean.toFixed(digits),
    });
  }
  return chips;
}

export default async function RiskPage() {
  const [fearGreed, vixSpread] = await Promise.all([
    fetchFearGreedIndex(),
    fetchVixSpread(),
  ]);

  // Statistics come from history the two fetchers already downloaded, and the
  // interpretation is a pure lookup over it — no model call on render.
  const fearGreedStats = computeSeriesStats(fearGreed.history);
  const vixStats = computeSeriesStats(vixSpread.vixHistory);
  const spreadStats = computeSeriesStats(vixSpread.spreadHistory);

  const fearGreedInterpretation = interpretFearGreed(
    fearGreedStats,
    {
      previousClose: fearGreed.previousClose,
      previous1Week: fearGreed.previous1Week,
      previous1Month: fearGreed.previous1Month,
      previous1Year: fearGreed.previous1Year,
    },
    fearGreed.components,
    fearGreed.rating,
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-foreground">Risk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Volatility and risk indicators.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FearGreedPanel
            data={fearGreed}
            interpretation={fearGreedInterpretation}
            // CNN's payload is one trailing year, so there is no long-run column.
            interpretationStats={interpretationStats(fearGreedStats, 0, false)}
          />
          <VixMetrics
            data={vixSpread}
            vixInterpretation={interpretVix(vixStats)}
            vixStats={interpretationStats(vixStats, 2, true)}
            spreadInterpretation={interpretSpread(spreadStats)}
            spreadStats={interpretationStats(spreadStats, 2, true)}
          />
        </div>
      </div>
    </main>
  );
}
