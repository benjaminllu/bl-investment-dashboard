// Verification harness for the deterministic risk-tab interpretations.
//
// Node cannot run this file directly: the lib modules use extensionless
// relative imports, which Node's ESM resolver rejects. Compile with the
// project's own tsc (no extra dependency) and run the output:
//
//   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyRiskNarrative.js
//
// The two `next.revalidate` type errors tsc reports under that config are
// expected — Next's ambient fetch typing is not loaded outside the app build —
// and it emits runnable JS regardless.
//
// What it checks:
//   1. Structure     — unique ids, catalog sizes, exhaustive priority-0 grids.
//   2. Determinism   — identical stats select an identical id and text.
//   3. Totality      — every historical reading matches at least one entry.
//   4. Coverage      — which entries fire across real history, and which never
//                      do. Idle entries are reported, not failed: several are
//                      keyed to events that have not occurred in the available
//                      history (an all-time VIX record, an inverted spread).
//   5. Live output   — prints today's three paragraphs for eyeball review.

import { computeSeriesStats, type SeriesPoint, type SeriesStats } from "../lib/riskStats";
import { fetchVixSpread } from "../lib/cboeVix";
import { fetchFearGreedIndex } from "../lib/fearGreed";
import { VIX_CATALOG, buildVixContext } from "../lib/riskNarrative/vix";
import { SPREAD_CATALOG, buildSpreadContext } from "../lib/riskNarrative/spread";
import {
  FEAR_GREED_CATALOG,
  buildFearGreedContext,
  type FgAnchors,
  type FgComponent,
} from "../lib/riskNarrative/fearGreed";
import { selectNarrative, type BaseContext, type NarrativeEntry } from "../lib/riskNarrative/types";

let failures = 0;

function check(ok: boolean, label: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function structure<C extends BaseContext>(
  name: string,
  catalog: NarrativeEntry<C>[],
  expectedGridCells: number,
) {
  console.log(`\n[structure] ${name}`);
  const ids = catalog.map((e) => e.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  check(dupes.length === 0, "ids are unique", dupes.join(", "));
  check(catalog.length >= 50, "catalog has 50+ entries", `${catalog.length} entries`);

  const grid = catalog.filter((e) => e.priority === 0);
  check(
    grid.length === expectedGridCells,
    "priority-0 grid is complete",
    `${grid.length}/${expectedGridCells} cells`,
  );
  check(
    catalog.length - grid.length >= 20,
    "situational overrides present",
    `${catalog.length - grid.length} specials`,
  );
}

/**
 * Replay a series prefix by prefix, tallying which entry each reading selects.
 * `build` receives the prefix end index so the Fear & Greed context can be
 * reconstructed as it stood on that date rather than as it stands today.
 */
function replay<C extends BaseContext>(
  name: string,
  catalog: NarrativeEntry<C>[],
  build: (stats: SeriesStats, end: number) => C,
  series: SeriesPoint[],
  step: number,
) {
  console.log(`\n[replay] ${name} — ${series.length} sessions, step ${step}`);
  const tally = new Map<string, number>();
  let unmatched = 0;
  let nondeterministic = 0;
  let evaluated = 0;

  // Start once there is enough history for the 63-day lookback to exist.
  for (let end = 80; end <= series.length; end += step) {
    const stats = computeSeriesStats(series.slice(0, end));
    if (!stats) continue;
    evaluated++;
    const first = selectNarrative(catalog, build(stats, end));
    if (!first) {
      unmatched++;
      continue;
    }
    const second = selectNarrative(catalog, build(stats, end));
    if (second === null || second.id !== first.id || second.text !== first.text) nondeterministic++;
    tally.set(first.id, (tally.get(first.id) ?? 0) + 1);
  }

  check(evaluated > 0, "readings evaluated", `${evaluated}`);
  check(unmatched === 0, "every reading matched an entry", `${unmatched} unmatched`);
  check(nondeterministic === 0, "selection is deterministic", `${nondeterministic} mismatches`);

  const fired = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  ${fired.length}/${catalog.length} entries fired across history`);
  console.log(
    `  most frequent: ${fired
      .slice(0, 5)
      .map(([id, n]) => `${id} ${((n / evaluated) * 100).toFixed(1)}%`)
      .join(", ")}`,
  );
  const idle = catalog.map((e) => e.id).filter((id) => !tally.has(id));
  if (idle.length > 0) console.log(`  idle (${idle.length}): ${idle.join(", ")}`);
}

const FEAR_GREED_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
const COMPONENT_IDS = [
  { id: "market_momentum_sp500", label: "Market Momentum" },
  { id: "stock_price_strength", label: "Stock Price Strength" },
  { id: "stock_price_breadth", label: "Stock Price Breadth" },
  { id: "put_call_options", label: "Put and Call Options" },
  { id: "market_volatility_vix", label: "Market Volatility (VIX)" },
  { id: "junk_bond_demand", label: "Junk Bond Demand" },
  { id: "safe_haven_demand", label: "Safe Haven Demand" },
];

/**
 * Component ratings by ISO date, pulled from the per-component `data` arrays in
 * CNN's payload. Without this the replay would score every historical date
 * against today's component mix and badly misreport coverage.
 */
async function fetchComponentRatingsByDate(): Promise<Map<string, FgComponent[]>> {
  const res = await fetch(FEAR_GREED_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Referer: "https://www.cnn.com/markets/fear-and-greed",
    },
  });
  const data: Record<string, { data?: { x: number; y: number; rating?: string }[] }> =
    await res.json();

  const byDate = new Map<string, FgComponent[]>();
  for (const { id, label } of COMPONENT_IDS) {
    for (const point of data[id]?.data ?? []) {
      if (typeof point?.x !== "number") continue;
      const date = new Date(point.x).toISOString().slice(0, 10);
      const list = byDate.get(date) ?? [];
      list.push({ label, score: typeof point.y === "number" ? point.y : null, rating: point.rating ?? null });
      byDate.set(date, list);
    }
  }
  return byDate;
}

async function main() {
  structure("VIX", VIX_CATALOG, 30);
  structure("VIXEQ − VIX", SPREAD_CATALOG, 30);
  structure("Fear & Greed", FEAR_GREED_CATALOG, 25);

  console.log("\nFetching live data…");
  const [vixSpread, fearGreed, componentsByDate] = await Promise.all([
    fetchVixSpread(),
    fetchFearGreedIndex(),
    fetchComponentRatingsByDate(),
  ]);

  const liveAnchors: FgAnchors = {
    previousClose: fearGreed.previousClose,
    previous1Week: fearGreed.previous1Week,
    previous1Month: fearGreed.previous1Month,
    previous1Year: fearGreed.previous1Year,
  };

  check(vixSpread.vixHistory.length > 8000, "VIX history loaded", `${vixSpread.vixHistory.length}`);
  check(
    vixSpread.spreadHistory.length > 2500,
    "spread history joined",
    `${vixSpread.spreadHistory.length}`,
  );
  check(fearGreed.history.length > 200, "Fear & Greed history loaded", `${fearGreed.history.length}`);
  check(componentsByDate.size > 200, "component ratings by date", `${componentsByDate.size} dates`);

  replay("VIX", VIX_CATALOG, buildVixContext, vixSpread.vixHistory, 1);
  replay("VIXEQ − VIX", SPREAD_CATALOG, buildSpreadContext, vixSpread.spreadHistory, 1);

  // Anchors reconstructed from the score series as it stood on each date, and
  // components looked up for that date, so this replay reflects what the page
  // would actually have rendered historically.
  //
  // One unavoidable gap: CNN ships ~251 points, so a 1-year-ago anchor never
  // exists for any prefix and the two fg-vs-year-ago-* entries always read null
  // here. In production those use CNN's own previous_1_year field, which is
  // populated — expect them idle in this replay and reachable on the page.
  const fgSeries = fearGreed.history;
  replay(
    "Fear & Greed",
    FEAR_GREED_CATALOG,
    (stats, end) => {
      const at = (back: number) => fgSeries[end - 1 - back]?.value ?? null;
      const date = fgSeries[end - 1]?.date ?? "";
      return buildFearGreedContext(
        stats,
        {
          previousClose: at(1),
          previous1Week: at(5),
          previous1Month: at(21),
          previous1Year: at(251),
        },
        componentsByDate.get(date) ?? [],
      );
    },
    fgSeries,
    1,
  );

  console.log("\n[live] current readings\n");
  const fgStats = computeSeriesStats(fearGreed.history);
  const vixStats = computeSeriesStats(vixSpread.vixHistory);
  const spreadStats = computeSeriesStats(vixSpread.spreadHistory);

  const live: [string, ReturnType<typeof selectNarrative>][] = [
    [
      "Fear & Greed",
      fgStats
        ? selectNarrative(
            FEAR_GREED_CATALOG,
            buildFearGreedContext(fgStats, liveAnchors, fearGreed.components),
          )
        : null,
    ],
    ["VIX", vixStats ? selectNarrative(VIX_CATALOG, buildVixContext(vixStats)) : null],
    [
      "VIXEQ − VIX",
      spreadStats ? selectNarrative(SPREAD_CATALOG, buildSpreadContext(spreadStats)) : null,
    ],
  ];
  for (const [label, result] of live) {
    check(result !== null, `${label} produced a paragraph`);
    if (result) console.log(`  ${label} [${result.id}]\n  ${result.text}\n`);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
