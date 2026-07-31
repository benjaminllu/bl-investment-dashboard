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

// /stock/metric is on the free tier (unlike /stock/eps-estimate and
// /stock/price-target, which both 403), and returns forwardPE alongside the
// trailing measures. Forward is what the table shows; peTTM is stored as a
// fallback for the rare name that has one but no forward figure.
//
// Both are null for ETFs and for companies with no expected earnings, which is
// correct rather than a failure — the UI renders those as an em-dash.
async function fetchPeRatios(ticker) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_KEY}`
  );
  const data = await res.json();
  const m = data && data.metric ? data.metric : {};
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { forwardPe: num(m.forwardPE), peTtm: num(m.peTTM) };
}

// Always queried per symbol, never via the whole-market form of this endpoint:
// that variant is capped at 1500 rows and truncates from the NEAR end with no
// error, so the most imminent earnings are exactly the ones it drops.
//
// Finnhub often answers with a different listing than the one asked for
// (BRK.B -> BRK.A, SKM -> 017670.KS), so the caller keys rows on the ticker it
// requested and keeps row.symbol separately as source_symbol.
async function fetchEarnings(ticker, from, to) {
  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/earnings` +
      `?from=${from}&to=${to}&symbol=${ticker}&token=${FINNHUB_KEY}`
  );
  const data = await res.json();
  return Array.isArray(data?.earningsCalendar) ? data.earningsCalendar : [];
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

  const today = new Date();

  // Forward window for earnings: 18 months comfortably covers the 4 scheduled
  // quarters Finnhub returns, without relying on it to cap the result itself.
  const earningsTo = new Date(today);
  earningsTo.setMonth(earningsTo.getMonth() + 18);
  const earningsFrom = today.toISOString().split("T")[0];
  const earningsToStr = earningsTo.toISOString().split("T")[0];

  console.log(`Refreshing fundamentals for ${stocks.length} tickers...\n`);

  for (const { ticker } of stocks) {
    let profile = { marketCap: null, currency: null };
    let pe = { forwardPe: null, peTtm: null };

    // --- Market cap ---
    try {
      profile = await fetchProfile(ticker);
    } catch (e) {
      console.error(`  profile fetch error for ${ticker}:`, e.message);
    }

    await sleep(RATE_LIMIT_DELAY);

    // --- P/E ratios ---
    try {
      pe = await fetchPeRatios(ticker);
    } catch (e) {
      console.error(`  metric fetch error for ${ticker}:`, e.message);
    }

    await sleep(RATE_LIMIT_DELAY);

    // --- Earnings calendar (many rows per ticker) ---
    // Replace this ticker's whole set rather than reconciling: scheduled dates
    // shift and quarters roll off, so delete + insert is simpler and matches how
    // stock_news is refreshed in refresh-data.js.
    let earningsCount = 0;
    try {
      const rows = await fetchEarnings(ticker, earningsFrom, earningsToStr);

      await supabase.from("stock_earnings").delete().eq("ticker", ticker);

      if (rows.length > 0) {
        const { error: eErr } = await supabase.from("stock_earnings").insert(
          rows.map((r) => ({
            // Keyed on the ticker we asked for, NOT r.symbol -- otherwise BRK.B's
            // rows would be filed under BRK.A and never join back to the watchlist.
            ticker,
            source_symbol: r.symbol ?? null,
            date: r.date,
            hour: r.hour || null,
            quarter: r.quarter ?? null,
            year: r.year ?? null,
            eps_estimate: typeof r.epsEstimate === "number" ? r.epsEstimate : null,
            revenue_estimate:
              typeof r.revenueEstimate === "number" ? r.revenueEstimate : null,
            updated_at: new Date().toISOString(),
          }))
        );
        if (eErr) console.error(`  earnings write error for ${ticker}: ${eErr.message}`);
        else earningsCount = rows.length;
      }
    } catch (e) {
      console.error(`  earnings fetch error for ${ticker}:`, e.message);
    }

    // Write even when all are null, so a ticker that loses coverage gets its
    // stale row cleared instead of showing last week's number indefinitely.
    // The mspr columns are intentionally absent: nothing reads them since the
    // watchlist's insider column was replaced by P/E, and omitting them from
    // the upsert leaves the existing values untouched rather than destroying
    // them, in case the metric is ever wanted back.
    const { error: wErr } = await supabase.from("stock_fundamentals").upsert(
      {
        ticker,
        market_cap: profile.marketCap,
        market_cap_currency: profile.currency,
        forward_pe: pe.forwardPe,
        pe_ttm: pe.peTtm,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ticker" }
    );
    if (wErr) console.error(`  write error for ${ticker}: ${wErr.message}`);

    await sleep(RATE_LIMIT_DELAY);
    console.log(
      `✓ ${ticker}  mcap=${profile.marketCap ?? "—"} ${profile.currency ?? ""}` +
        `  fwdPE=${pe.forwardPe?.toFixed(1) ?? "—"}  ttmPE=${pe.peTtm?.toFixed(1) ?? "—"}` +
        `  earnings=${earningsCount}`
    );
  }

  console.log("\nDone.");
}

main();
