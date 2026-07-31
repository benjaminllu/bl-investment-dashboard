-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how the other tables in this project were created.
--
-- Adds price/earnings columns to stock_fundamentals, replacing the insider
-- sentiment (mspr) figure in the watchlist table's last data column.
--
-- Both come from Finnhub's /stock/metric?metric=all, which IS available on the
-- free tier -- confirmed by calling it directly (HTTP 200, 133 metric fields).
-- The dedicated forward-estimate endpoints are NOT: /stock/eps-estimate and
-- /stock/price-target both return 403 "You don't have access to this resource".
--
-- forward_pe is preferred for display and pe_ttm is the fallback, because
-- forward coverage is the better of the two: sampling 16 watchlist names gave
-- forwardPE on 12 and peTTM on only 10. AEHR and UAMY have a forward P/E but no
-- trailing one -- loss-making over the last twelve months, expected profitable
-- ahead -- and every name with a trailing figure also had a forward one.
-- Neither exists for ETFs (SPY, QQQ, EWY) or for names with no expected
-- earnings (RKLB), which correctly render as an em-dash.

alter table stock_fundamentals
  add column if not exists forward_pe numeric,
  add column if not exists pe_ttm numeric;

-- The mspr columns are deliberately left in place rather than dropped: nothing
-- reads them any more, but keeping them avoids a destructive migration and
-- leaves the door open to bringing the metric back. They will simply stop being
-- updated, since refresh-fundamentals.js no longer fetches insider sentiment.
