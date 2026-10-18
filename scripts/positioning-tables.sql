-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- Two daily series behind the Positioning page, both written by scripts on the
-- nightly .github/workflows/positioning-data.yml run and backfilled once by
-- hand with `--backfill` (see each script's header).
--
-- RLS is deliberately left OFF, matching the other market-data tables: these
-- are public exchange and SEC statistics, and the page reads them with the anon
-- key. See scripts/enable-rls-portfolio.sql for the tables where it IS on.


-- Cboe option volume by product, one row per trading day. Raw call and put
-- volumes rather than ratios, so the page can compute a ratio of sums over any
-- window (the correct way to average a ratio) instead of an average of ratios.
--
-- Sources: Cboe's legacy CSVs for 2006-11-01 .. 2019-10-04 (SPX from
-- 2010-07-06), then one JSON file per day from 2019-10-07. SPX is null before
-- 2010-07-06 because the legacy SPX file starts there.
create table if not exists cboe_put_call (
  trade_date  date primary key,
  equity_call bigint not null,
  equity_put  bigint not null,
  index_call  bigint not null,
  index_put   bigint not null,
  spx_call    bigint,
  spx_put     bigint,
  source      text not null check (source in ('legacy-csv', 'daily-json'))
);


-- Market-wide insider activity, one row per Form 4 filing date. Counts are
-- DISTINCT ISSUERS with at least one open-market purchase (code P) or sale
-- (code S) reported that day, so one insider's thirty price-band lines count
-- once. Amendments (4/A) are excluded so a corrected filing is not counted
-- twice.
--
-- Sources: the SEC's quarterly Form 3/4/5 data sets for history (2006 Q1
-- onward), then the EDGAR daily index for days the latest data set does not
-- cover yet. Both are read with the same definitions; `source` records which.
create table if not exists insider_breadth (
  filing_date  date primary key,
  buy_issuers  int not null,
  sell_issuers int not null,
  source       text not null check (source in ('sec-dataset', 'edgar-daily'))
);
