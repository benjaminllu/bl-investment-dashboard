import { computeSectorTable, SECTOR_DEFS } from "@/lib/sectors";
import { computeRotation, ROTATION_UNIVERSE } from "@/lib/rotation";
import { fetchUniverse } from "@/lib/marketBars";
import { checkPlaybook, fetchCycle } from "@/lib/cycle";
import SectorTable from "@/components/SectorTable";
import RotationGraph from "@/components/RotationGraph";
import RotationRegime from "@/components/RotationRegime";
import RotationPairs from "@/components/RotationPairs";
import MomentumRanks from "@/components/MomentumRanks";
import LeadershipHeatmap from "@/components/LeadershipHeatmap";
import SignalEfficacy from "@/components/SignalEfficacy";
import CyclePanel from "@/components/CyclePanel";

/**
 * Prices move all day, but this page is about relative standing over weeks and
 * its shortest window is a full session — an hour is finer than the question it
 * answers. Every fetch behind it carries the same window, so a page rebuild
 * reuses them rather than re-fetching.
 */
export const revalidate = 3600;

/**
 * The page is ordered as an argument, not as a dashboard.
 *
 *   1. Is there rotation to read at all?   (regime)
 *   2. Where is everything standing?       (rotation graph)
 *   3. In what order, and what moved?      (momentum ranking)
 *   4. Has it persisted?                   (monthly leadership grid)
 *   5. What is moving that isn't a sector? (cross-cutting spreads)
 *   6. Did any of it predict anything?     (efficacy)
 *   7. Why might it be happening?          (business cycle)
 *   8. And the plain returns.              (the original table)
 *
 * The two that would conventionally go first are deliberately not first. The
 * regime band leads because every ranking underneath it is meaningless when
 * sectors move together, and the reader needs to know that before reading them
 * rather than after. The efficacy panel sits late but before the returns table
 * because it is a caveat on everything above it, and a caveat placed at the top
 * gets skipped.
 */

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SECTOR_LABELS = Object.fromEntries(SECTOR_DEFS.map((d) => [d.ticker, d.label]));

export default async function SectorsPage() {
  // One universe, two consumers. The returns table and every rotation metric
  // read the same bars, so the twenty-seven Yahoo calls happen once.
  const [universe, cycle] = await Promise.all([fetchUniverse(ROTATION_UNIVERSE), fetchCycle()]);

  const sectors = computeSectorTable(universe);
  const rotation = computeRotation(universe);

  const playbook =
    cycle.phase === null
      ? null
      : checkPlaybook(
          cycle.phase,
          rotation.momentum.filter((r) => r.tier === "sector"),
        );

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-screen-3xl space-y-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-sm font-semibold text-foreground">Sectors</h1>
          <p className="text-xs text-muted-foreground">
            Sector ETFs vs SPY · Yahoo Finance
            {sectors.asOf ? ` · close ${formatDate(sectors.asOf)}` : ""}
          </p>
        </div>

        {rotation.unavailable ? (
          <div className="border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              The rotation metrics need every sector ETF on a common calendar, and at least one did
              not load. The returns table below is unaffected; the rest will fill in on the next
              refresh.
            </p>
          </div>
        ) : (
          <>
            <RotationRegime regime={rotation.regime} />

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <RotationGraph groups={rotation.rrg} />
              <CyclePanel cycle={cycle} playbook={playbook} />
            </div>

            <MomentumRanks rows={rotation.momentum} />

            <LeadershipHeatmap
              months={rotation.heatmap}
              tickers={rotation.heatmapTickers}
              labels={SECTOR_LABELS}
            />

            <RotationPairs pairs={rotation.pairs} />

            <SignalEfficacy efficacy={rotation.efficacy} />
          </>
        )}

        <SectorTable data={sectors} />
      </div>
    </main>
  );
}
