/**
 * Finnhub fetchers and the per-ticker table writes, shared by the two refresh
 * jobs (scripts/refresh-data.js, scripts/refresh-fundamentals.js) and the
 * in-app "add ticker" action (lib/watchlistActions.ts), so a ticker added from
 * the UI is written exactly the way the nightly job would write it.
 *
 * Every fetcher throws on a non-2xx response instead of parsing the error body.
 * A 429 body is JSON ({"error": "API limit reached..."}), so reading it as data
 * made a rate-limited earnings call look like "no earnings scheduled" and the
 * caller then deleted the ticker's real rows.
 */

const { isLowQuality } = require("../newsFilter");

const BASE = "https://finnhub.io/api/v1";

// Read per call rather than at load: the jobs fill process.env from .env.local
// after requiring this module.
async function get(path, params) {
  const qs = new URLSearchParams({ ...params, token: process.env.FINNHUB_API_KEY ?? "" });
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (!res.ok) {
    const err = new Error(`Finnhub ${path} HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const isoDate = (d) => d.toISOString().split("T")[0];
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Last price and day change, or null when Finnhub has no price (c: 0 for unknown symbols). */
async function fetchQuote(ticker) {
  const data = await get("/quote", { symbol: ticker });
  return data.c ? { price: data.c, changePct: data.dp } : null;
}

// Market cap arrives in millions of the *listing* currency, not USD, so a
// non-USD value can't be rendered with a "$" prefix. We still store the
// currency rather than dropping the row, so switching to FX conversion later
// wouldn't need a backfill — the display layer decides what to show.
//
// Returns null when there is no profile: ETFs and some OTC names come back as
// {} on the free tier.
async function fetchProfile(ticker) {
  const data = await get("/stock/profile2", { symbol: ticker });
  if (!data || !data.ticker) return null;
  return {
    name: data.name || null,
    marketCap: num(data.marketCapitalization),
    currency: data.currency || null,
    // finnhubIndustry is Finnhub's own taxonomy, not GICS — "Metals & Mining"
    // and "Semiconductors" sit at the same level, so it is closer to industry
    // than sector. Stored as given rather than remapped: an invented GICS
    // rollup would be a guess layered on top of someone else's guess.
    sector: data.finnhubIndustry || null,
  };
}

const EMPTY_PROFILE = { name: null, marketCap: null, currency: null, sector: null };

// /stock/metric is on the free tier (unlike /stock/eps-estimate and
// /stock/price-target, which both 403), and returns forwardPE alongside the
// trailing measures. Forward is what the table shows; peTTM is stored as a
// fallback for the rare name that has one but no forward figure.
//
// Both are null for ETFs and for companies with no expected earnings, which is
// correct rather than a failure — the UI renders those as an em-dash.
// The same response also carries the characteristics the Portfolio exposure
// panel aggregates (beta, price/book, volatility, 12m return, ROE), so they are
// read from this one call rather than costing extra requests.
async function fetchMetrics(ticker) {
  const data = await get("/stock/metric", { symbol: ticker, metric: "all" });
  const m = data && data.metric ? data.metric : {};
  return {
    forwardPe: num(m.forwardPE),
    peTtm: num(m.peTTM),
    beta: num(m.beta),
    priceToBook: num(m.pbAnnual),
    volatility3m: num(m["3MonthADReturnStd"]),
    return52w: num(m["52WeekPriceReturnDaily"]),
    roeTtm: num(m.roeTTM),
  };
}

const EMPTY_METRICS = {
  forwardPe: null,
  peTtm: null,
  beta: null,
  priceToBook: null,
  volatility3m: null,
  return52w: null,
  roeTtm: null,
};

// Forward window for earnings: 18 months comfortably covers the 4 scheduled
// quarters Finnhub returns, without relying on it to cap the result itself.
function earningsWindow(today = new Date()) {
  const to = new Date(today);
  to.setMonth(to.getMonth() + 18);
  return { from: isoDate(today), to: isoDate(to) };
}

// Always queried per symbol, never via the whole-market form of this endpoint:
// that variant is capped at 1500 rows and truncates from the NEAR end with no
// error, so the most imminent earnings are exactly the ones it drops.
//
// Finnhub often answers with a different listing than the one asked for
// (BRK.B -> BRK.A, SKM -> 017670.KS), so the caller keys rows on the ticker it
// requested and keeps row.symbol separately as source_symbol.
async function fetchEarnings(ticker, { from, to } = earningsWindow()) {
  const data = await get("/calendar/earnings", { from, to, symbol: ticker });
  return Array.isArray(data?.earningsCalendar) ? data.earningsCalendar : [];
}

function newsWindow(today = new Date()) {
  return { from: isoDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)), to: isoDate(today) };
}

/** The three most recent articles that pass the quality filter. */
async function fetchNews(ticker, { from, to } = newsWindow()) {
  const articles = await get("/company-news", { symbol: ticker, from, to });
  return (Array.isArray(articles) ? articles : []).filter((a) => !isLowQuality(a)).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Writes. Each returns the Supabase error (or null) for the caller to report.
// ---------------------------------------------------------------------------

async function writeQuote(supabase, ticker, quote) {
  const { error } = await supabase.from("stock_quotes").upsert(
    { ticker, price: quote.price, change_pct: quote.changePct, updated_at: new Date().toISOString() },
    { onConflict: "ticker" }
  );
  return error;
}

// Written even when all are null, so a ticker that loses coverage gets its
// stale row cleared instead of showing last week's number indefinitely.
// The mspr columns are intentionally absent: nothing reads them since the
// watchlist's insider column was replaced by P/E, and omitting them from
// the upsert leaves the existing values untouched rather than destroying
// them, in case the metric is ever wanted back.
async function writeFundamentals(supabase, ticker, profile, metrics) {
  const { error } = await supabase.from("stock_fundamentals").upsert(
    {
      ticker,
      market_cap: profile.marketCap,
      market_cap_currency: profile.currency,
      sector: profile.sector,
      forward_pe: metrics.forwardPe,
      pe_ttm: metrics.peTtm,
      beta: metrics.beta,
      price_to_book: metrics.priceToBook,
      volatility_3m: metrics.volatility3m,
      return_52w: metrics.return52w,
      roe_ttm: metrics.roeTtm,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ticker" }
  );
  return error;
}

// Replace this ticker's whole set rather than reconciling: scheduled dates
// shift and quarters roll off, so delete + insert is simpler and matches how
// stock_news is refreshed.
async function replaceEarnings(supabase, ticker, rows) {
  await supabase.from("stock_earnings").delete().eq("ticker", ticker);
  if (rows.length === 0) return null;
  const { error } = await supabase.from("stock_earnings").insert(
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
      revenue_estimate: typeof r.revenueEstimate === "number" ? r.revenueEstimate : null,
      updated_at: new Date().toISOString(),
    }))
  );
  return error;
}

async function replaceNews(supabase, ticker, articles) {
  await supabase.from("stock_news").delete().eq("ticker", ticker);
  if (articles.length === 0) return null;
  const { error } = await supabase.from("stock_news").insert(
    articles.map((a) => ({
      ticker,
      headline: a.headline,
      url: a.url,
      source: a.source,
      image: a.image || null,
      datetime: a.datetime,
    }))
  );
  return error;
}

module.exports = {
  EMPTY_PROFILE,
  EMPTY_METRICS,
  earningsWindow,
  newsWindow,
  fetchQuote,
  fetchProfile,
  fetchMetrics,
  fetchEarnings,
  fetchNews,
  writeQuote,
  writeFundamentals,
  replaceEarnings,
  replaceNews,
};
