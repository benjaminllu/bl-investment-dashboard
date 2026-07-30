-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- Upcoming earnings dates per ticker, written by scripts/refresh-fundamentals.js.
-- Unlike stock_fundamentals (one row per ticker), this holds MANY rows per ticker
-- -- typically the next 4 quarters -- so each run replaces a ticker's whole set
-- (delete + insert), the same way stock_news is refreshed in refresh-data.js.
--
-- Finnhub's free tier returns forward estimates only: epsActual/revenueActual are
-- always null and a purely historical query returns nothing, so there is no
-- beat/miss history to store here.
--
-- IMPORTANT -- ticker vs source_symbol:
-- Finnhub frequently answers a query with a DIFFERENT symbol than the one asked
-- for: BRK.B -> BRK.A, SKM -> 017670.KS, STM -> STMPA.PA. `ticker` is always the
-- watchlist symbol that was queried, so rows join back to `stocks`. `source_symbol`
-- records what Finnhub actually returned, which the UI uses to decide whether the
-- per-share figures can be trusted -- a BRK.A EPS estimate is ~1500x the B share.
-- The DATE is still correct in those cases; only the estimates are suspect.

create table if not exists stock_earnings (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  source_symbol text,
  date date not null,
  hour text,
  quarter int,
  year int,
  eps_estimate numeric,
  revenue_estimate numeric,
  updated_at timestamptz not null default now()
);

create index if not exists stock_earnings_ticker_idx on stock_earnings (ticker);
