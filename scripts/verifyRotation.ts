/**
 * Replays lib/rotation.ts against a saved bar dump (or a live fetch) and prints
 * every number the page will show, so the maths can be checked without a
 * browser. See the header of tsconfig.verify.json for how to run it.
 *
 *   npx tsc -p tsconfig.verify.json && node .verify-out/scripts/verifyRotation.js
 */
import { computeRotation, ROTATION_UNIVERSE, LOOKBACKS } from "../lib/rotation";
import { fetchUniverse } from "../lib/marketBars";

function pad(s: string | number, n: number) {
  return String(s).padStart(n);
}

async function main() {
  // The real fetcher, so the script can never drift from the range or the
  // adjusted-close handling the page actually uses. The `next.revalidate`
  // option is a no-op outside the Next build; tsc reports it and emits anyway.
  const data = computeRotation(await fetchUniverse(ROTATION_UNIVERSE));
  console.log("asOf", data.asOf, "unavailable", data.unavailable);

  for (const group of data.rrg) {
    console.log(`\n=== RRG ${group.label} (${group.dates.length} weeks, last ${group.dates.at(-1)}) ===`);
    for (const s of group.series) {
      const p = s.tail[s.tail.length - 1];
      console.log(
        pad(s.ticker, 5),
        pad(s.quadrant, 10),
        "x", pad(p.x.toFixed(2), 6),
        "y", pad(p.y.toFixed(2), 6),
        "| tail", s.tail.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" "),
      );
    }
  }

  console.log("\n=== MOMENTUM ===");
  console.log("tick tier      " + LOOKBACKS.map((l) => pad(l, 8)).join("") + "   score rank prior  vs50  vs200 rsLine");
  for (const r of data.momentum) {
    console.log(
      pad(r.ticker, 5),
      pad(r.tier, 9),
      LOOKBACKS.map((l) => pad(r.excess[l] === null ? "—" : r.excess[l]!.toFixed(1), 8)).join(""),
      pad(r.score === null ? "—" : r.score.toFixed(2), 7),
      pad(r.rank ?? "—", 4),
      pad(r.rankPrior ?? "—", 5),
      pad(r.vs50 === null ? "—" : r.vs50.toFixed(1), 6),
      pad(r.vs200 === null ? "—" : r.vs200.toFixed(1), 6),
      pad(r.rsLine.length, 4),
      r.rsLine.length ? r.rsLine[r.rsLine.length - 1].toFixed(1) : "",
    );
  }

  console.log("\n=== REGIME ===");
  if (data.regime) {
    for (const m of data.regime.metrics) {
      console.log(
        pad(m.id, 12),
        pad(m.value === null ? "—" : m.value.toFixed(m.decimals), 8) + m.unit,
        "pctile", pad(m.percentile === null ? "—" : m.percentile.toFixed(0), 4),
        "history", pad(m.history.length, 4),
      );
    }
    console.log("from", data.regime.from, "rotationScore", data.regime.rotationScore?.toFixed(2), "|", data.regime.verdict);
  }

  console.log("\n=== HEATMAP (relative %, last 5 months) ===");
  console.log("month     " + data.heatmapTickers.map((t) => pad(t, 7)).join(""));
  for (const row of data.heatmap.slice(-5)) {
    console.log(
      row.month + (row.partial ? "*" : " "),
      data.heatmapTickers
        .map((t) => pad(row.values[t] === null ? "—" : row.values[t]!.toFixed(1), 7))
        .join(""),
    );
  }

  console.log("\n=== PAIRS ===");
  for (const p of data.pairs) {
    console.log(
      pad(`${p.numerator}/${p.denominator}`, 10),
      (["1M", "3M", "6M", "12M"] as const)
        .map((k) => pad(p.ret[k] === null ? "—" : p.ret[k]!.toFixed(1), 8))
        .join(""),
      "vs50", pad(p.vs50 === null ? "—" : p.vs50.toFixed(1), 6),
      "hist", pad(p.history.length, 4),
    );
  }

  console.log("\n=== EFFICACY ===");
  if (data.efficacy) {
    const e = data.efficacy;
    console.log(`sample ${e.from} → ${e.to}, ${e.observations} weekly observations`);
    for (const set of [e.quadrants, e.momentum]) {
      for (const row of set) {
        console.log(
          pad(row.bucket, 18),
          e.horizons
            .map((h) => {
              const c = row.cells[h];
              return c ? `${h}: ${pad(c.mean.toFixed(2), 6)}pp hit ${pad(c.hitRate.toFixed(0), 3)}% n=${pad(c.count, 5)}` : `${h}: —`;
            })
            .join("  "),
        );
      }
      console.log("");
    }
  } else {
    console.log("(unavailable)");
  }
}

main();
