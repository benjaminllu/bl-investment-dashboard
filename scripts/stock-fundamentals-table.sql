-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- Holds slow-moving per-ticker fundamentals written by scripts/refresh-fundamentals.js.
-- One row per ticker, upserted on each daily run -- no history is retained, so this
-- table stays the same size as the watchlist rather than growing over time.
--
-- market_cap is in MILLIONS of market_cap_currency, straight from Finnhub's
-- /stock/profile2. It is deliberately not converted to USD: the currency is stored
-- alongside it so the display layer can decide what is safe to render, and so
-- switching to FX conversion later would not need a backfill.
--
-- mspr is Finnhub's Monthly Share Purchase Ratio (-100..100) for the most recent
-- month that had data. mspr_year/mspr_month record which month that was, since the
-- series lags 1-2 months behind today.

create table if not exists stock_fundamentals (
  ticker text primary key,
  market_cap numeric,
  market_cap_currency text,
  mspr numeric,
  mspr_year int,
  mspr_month int,
  updated_at timestamptz not null default now()
);
