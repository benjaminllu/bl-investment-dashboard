// Records one row per day of what the portfolio is actually worth.
//
// This is the honest track record, and the reason it exists is that the
// reconstruction in lib/returnSeries.ts is not one. Applying today's holdings
// to past prices silently drops every position since sold — which, for most
// people, means dropping the losers. These rows cannot be backfilled, only
// accumulated, which is exactly what makes them trustworthy.
//
// Idempotent per day: re-running replaces today's row rather than adding a
// second one, so an extra invocation cannot double-count a day.
const { createClient } = require("@supabase/supabase-js");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const fs = require("fs");
    const envContent = fs.readFileSync(".env.local", "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {
    // .env.local not present — rely on process.env already being set
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CASH_TICKER = "$CASH";

function isUsd(currency) {
  return currency === null || currency === "" || String(currency).toUpperCase() === "USD";
}

async function main() {
  const [{ data: positions, error }, { data: quotes, error: qErr }] = await Promise.all([
    supabase.from("portfolio_positions").select("ticker, quantity, currency"),
    supabase.from("stock_quotes").select("ticker, price"),
  ]);

  if (error || qErr) {
    console.error(`Failed to read positions/quotes: ${(error ?? qErr).message}`);
    process.exitCode = 1;
    return;
  }

  const priceOf = new Map((quotes ?? []).map((q) => [q.ticker, q.price]));

  let securityValue = 0;
  let cashValue = 0;
  let positionCount = 0;
  const unpriced = [];

  for (const p of positions ?? []) {
    if (p.ticker === CASH_TICKER) {
      cashValue += p.quantity;
      continue;
    }
    // Mirrors the page exactly: non-USD positions are excluded from value
    // because quotes are in USD, and an unpriced ticker contributes nothing
    // rather than zero.
    if (!isUsd(p.currency)) {
      unpriced.push(`${p.ticker} (non-USD)`);
      continue;
    }
    const price = priceOf.get(p.ticker);
    if (typeof price !== "number") {
      unpriced.push(p.ticker);
      continue;
    }
    securityValue += price * p.quantity;
    positionCount++;
  }

  if (positionCount === 0) {
    console.error("No priced positions — refusing to write an empty snapshot.");
    process.exitCode = 1;
    return;
  }

  const date = new Date().toISOString().split("T")[0];
  const row = {
    date,
    security_value: securityValue,
    cash_value: cashValue,
    total_value: securityValue + cashValue,
    position_count: positionCount,
  };

  const { error: wErr } = await supabase
    .from("portfolio_snapshots")
    .upsert(row, { onConflict: "date" });

  if (wErr) {
    console.error(`Snapshot write failed (${wErr.code}): ${wErr.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `✓ ${date}  total=$${row.total_value.toFixed(2)} ` +
      `(securities $${securityValue.toFixed(2)}, cash $${cashValue.toFixed(2)}, ` +
      `${positionCount} priced)`
  );
  if (unpriced.length > 0) {
    console.log(`  excluded: ${unpriced.join(", ")}`);
  }

  const { count } = await supabase
    .from("portfolio_snapshots")
    .select("date", { count: "exact", head: true });
  console.log(`  track record: ${count ?? "?"} day(s) recorded`);
}

main();
