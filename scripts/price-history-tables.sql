-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how the other tables in this project were created.
--
-- Three tables backing the Portfolio tab's risk-adjusted return metrics. Every
-- other table here holds point-in-time state; these are the first that retain
-- history, because Sharpe, drawdown and beta regression cannot be computed from
-- a snapshot no matter how many characteristics it carries.
--
-- WHY YAHOO AND NOT FINNHUB: /stock/candle returns 403 "You don't have access
-- to this resource" on the free tier. Yahoo's chart endpoint is already used in
-- this project for S&P futures, is free, and — checked against the real book —
-- covers all 34 holdings including the OTC foreign listings Finnhub struggles
-- with (ATXRF, TORXF, CPPKF, MTLMY et al), with up to 5 years of daily closes.

-- Daily closes and volume, per ticker. Also holds the benchmark (SPY), which is
-- stored as an ordinary ticker rather than in a table of its own.
--
-- Volume is kept because it costs nothing extra in the same response and turns
-- into days-to-liquidate, which is otherwise uncomputable.
create table if not exists price_history (
  ticker text not null,
  date date not null,
  close numeric not null,
  volume numeric,
  primary key (ticker, date)
);

-- Range scans by date are the common access pattern: "every close in the last
-- 252 trading days" rather than "every close for one ticker".
create index if not exists price_history_date_idx on price_history (date);

-- The real track record, one row per day, written by scripts/snapshot-portfolio.js.
--
-- This exists because reconstructing returns from today's holdings is NOT a
-- track record: it silently excludes every position since sold, so it inherits
-- hindsight. Reconstruction is fine for describing the risk of what is held now
-- (volatility, beta, correlation); it is not fine for claiming what was earned.
-- These rows accumulate the latter, one day at a time, and nothing backfills
-- them.
create table if not exists portfolio_snapshots (
  date date primary key,
  security_value numeric not null,
  cash_value numeric not null,
  total_value numeric not null,
  position_count int not null,
  created_at timestamptz not null default now()
);

-- Daily 3-month Treasury bill yield (FRED DTB3), as an annualised percent.
-- The Sharpe numerator is an EXCESS return, so a constant would quietly bias
-- every window -- DTB3 has moved enough over the past year to matter at the
-- second decimal of a Sharpe ratio.
create table if not exists risk_free_rates (
  date date primary key,
  annual_pct numeric not null
);
