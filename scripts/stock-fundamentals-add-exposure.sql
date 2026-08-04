-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how the other tables in this project were created.
--
-- Adds the per-ticker characteristics the Portfolio tab's exposure panel
-- aggregates: sector and size for the two pie charts, beta and volatility for
-- the risk numbers, and price-to-book / 12-month return / ROE for the style
-- axis, momentum and quality figures.
--
-- Every one of these already arrives in a response refresh-fundamentals.js
-- fetches today -- sector from /stock/profile2, the rest from
-- /stock/metric?metric=all -- so populating them costs no additional API calls
-- against the 60 req/min free tier. They were simply being discarded.
--
-- Coverage was measured against the real book (34 priceable holdings,
-- $235k) before building on them, weighted by market value rather than by
-- name count, since one 20% position matters more than ten microcaps:
--
--   sector      99.1% of value   (33/34 names)
--   beta        99.1%            (33/34)
--   volatility  95.9%            (33/34)
--   roe         89.6%            (30/34)
--   52w return  88.7%            (29/34)
--   price/book  69.7%            (29/34)
--
-- Only MTLMY (0.9% of value) has no profile at all. price_to_book is the weak
-- one, which is why the style axis it feeds renders an explicit "Unclassified"
-- slice rather than defaulting those names into "Blend" and quietly inventing
-- an exposure.

alter table stock_fundamentals
  add column if not exists sector text,
  add column if not exists beta numeric,
  add column if not exists price_to_book numeric,
  -- Finnhub's 3MonthADReturnStd: annualised stdev of daily returns, in percent.
  add column if not exists volatility_3m numeric,
  -- 52WeekPriceReturnDaily, in percent. Price return only -- excludes dividends.
  add column if not exists return_52w numeric,
  -- roeTTM, in percent. Negative for the pre-profit names, which is most of them.
  add column if not exists roe_ttm numeric;
