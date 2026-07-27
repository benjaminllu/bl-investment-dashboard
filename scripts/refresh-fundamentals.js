const { createClient } = require("@supabase/supabase-js");

// In GitHub Actions these come from the workflow env: block.
// Locally, load .env.local if present so the script works without manual export.
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
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Finnhub's free tier allows 60 req/min. Two calls per ticker with a 1.1s gap
// after each lands around 54 req/min, leaving headroom for clock drift.
const RATE_LIMIT_DELAY = 1100;

// Market cap arrives in millions of the *listing* currency, not USD, so a
// non-USD value can't be rendered with a "$" prefix. We still store the
// currency rather than dropping the row, so switching to FX conversion later
// wouldn't need a backfill — the display layer decides what to show.
async function fetchProfile(ticker) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`
  );
  const data = await res.json();
  // ETFs and some OTC names come back as {} — no profile on the free tier.
  if (!data || !data.ticker) return { marketCap: null, currency: null };
  return {
    marketCap: typeof data.marketCapitalization === "number" ? data.marketCapitalization : null,
    currency: data.currency || null,
  };
}

// Insider sentiment is derived from SEC Form 4 filings, so it only exists for
// US domestic filers — ETFs and foreign listings legitimately return nothing.
// The series is monthly and lags 1-2 months; we keep the most recent month and
// store which month it was so the UI can disclose the lag.
async function fetchInsiderSentiment(ticker, from, to) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/insider-sentiment` +
      `?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
  );
  const data = await res.json();
  const rows = data && Array.isArray(data.data) ? data.data : [];
  if (rows.length === 0) return { mspr: null, year: null, month: null };

  // The API returns oldest-first; the last entry is the most recent month.
  const latest = rows[rows.length - 1];
  return {
    mspr: typeof latest.mspr === "number" ? latest.mspr : null,
    year: latest.year ?? null,
    month: latest.month ?? null,
  };
}

async function main() {
  const { data: stocks, error } = await supabase
    .from("stocks")
    .select("ticker")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch tickers:", error.message);
    process.exit(1);
  }

  // 13 months back guarantees at least one full month of insider data even
  // right after a year boundary, when a 12-month window could come up empty.
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 13);
  const from = fromDate.toISOString().split("T")[0];
  const to = today.toISOString().split("T")[0];

  console.log(`Refreshing fundamentals for ${stocks.length} tickers...\n`);

  for (const { ticker } of stocks) {
    let profile = { marketCap: null, currency: null };
    let insider = { mspr: null, year: null, month: null };

    // --- Market cap ---
    try {
      profile = await fetchProfile(ticker);
    } catch (e) {
      console.error(`  profile fetch error for ${ticker}:`, e.message);
    }

    await sleep(RATE_LIMIT_DELAY);

    // --- Insider sentiment ---
    try {
      insider = await fetchInsiderSentiment(ticker, from, to);
    } catch (e) {
      console.error(`  insider fetch error for ${ticker}:`, e.message);
    }

    // Write even when both are null, so a ticker that loses coverage gets its
    // stale row cleared instead of showing last week's number indefinitely.
    const { error: wErr } = await supabase.from("stock_fundamentals").upsert(
      {
        ticker,
        market_cap: profile.marketCap,
        market_cap_currency: profile.currency,
        mspr: insider.mspr,
        mspr_year: insider.year,
        mspr_month: insider.month,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ticker" }
    );
    if (wErr) console.error(`  write error for ${ticker}: ${wErr.message}`);

    await sleep(RATE_LIMIT_DELAY);
    console.log(
      `✓ ${ticker}  mcap=${profile.marketCap ?? "—"} ${profile.currency ?? ""}  mspr=${insider.mspr ?? "—"}`
    );
  }

  console.log("\nDone.");
}

main();
