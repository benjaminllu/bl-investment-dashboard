-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- Section 16 insider transactions (SEC Form 4) for watchlist tickers, written by
-- scripts/screen-insider-transactions.js on the nightly GitHub Actions run
-- (.github/workflows/screen-insider.yml).
--
-- One row per ECONOMIC TRANSACTION, which is not the same as one row per line in
-- the filing. A broker filling a sale across three price bands reports three
-- lines, and storing them as three rows was actively misleading: it made one
-- decision look like three, and because each line's `sharesOwnedFollowingTransaction`
-- is the balance AFTER that band, the percentage-of-holding for each successive
-- band was computed against an already-depleted balance. A single 50,317-share
-- exit was recorded as sales of 34%, 82% and finally 100% "of holding".
--
-- So lines are grouped by (owner, code, transaction date, security, direct/indirect)
-- and summed: `shares` is the total, `price_per_share` the volume-weighted average,
-- `shares_owned_after` the balance after the last band, and `line_count` records how
-- many bands were folded in. Nothing is judged away -- every reported trade is still
-- here with true totals; only the broker's execution slicing is collapsed, which is
-- an artifact of order routing rather than information about the insider.
--
--
-- WHY EVERY TRANSACTION IS STORED, NOT JUST THE INTERESTING ONES
--
-- Most Form 4 activity is compensation plumbing -- option exercises (code M),
-- grants (A), and shares withheld to cover tax (F) -- and none of it is a
-- decision by the insider to buy or sell anything. Only about a fifth of lines
-- are open-market trades.
--
-- The filter that separates those is a judgement call that WILL be retuned. So
-- the filing is stored verbatim and the judgement lives beside it in
-- `is_notable` / `notable_reason`, exactly like market_digest keeps the newswire
-- fields separate from the model's commentary. Retuning the rule is then an
-- UPDATE over rows already here, not a re-crawl of the SEC.
--
--
-- ticker: the watchlist symbol that matched, NOT the <issuerTradingSymbol> in the
-- filing. Filing agents leave that field as "NONE" surprisingly often, and it is
-- not what rows need to join on -- `ticker` joins back to `stocks` the same way
-- stock_news and stock_earnings do.

create table if not exists insider_transactions (
  id uuid primary key default gen_random_uuid(),

  -- Identity / provenance
  ticker text not null,
  issuer_cik text not null,
  accession_number text not null,
  row_index int not null,
  index_date date not null,        -- the daily index this was discovered in
  filed_date date not null,
  transaction_date date,           -- when the insider actually traded; see note below
  period_of_report date,           -- the filing's own header date, kept for reference

  -- Who
  owner_name text not null,
  owner_cik text not null,
  is_director boolean,
  is_officer boolean,
  is_ten_percent_owner boolean,
  officer_title text,

  -- What
  security_title text,
  transaction_code text not null,  -- P, S, M, A, F, G, C, ...
  acquired_disposed text,          -- A | D
  shares numeric,
  price_per_share numeric,
  value_usd numeric,               -- shares * price_per_share, null if either is
  shares_owned_after numeric,
  is_derivative boolean not null default false,
  line_count int not null default 1,   -- price bands folded into this row

  -- D (held outright) or I (through a trust, LLC, or family member). These are
  -- separate pools and must never be summed together: doing so computes a
  -- percentage-of-holding against a balance the insider does not actually have in
  -- that account, which is how a routine trim starts reading as a full exit.
  ownership_type text,

  -- Same-day "exercise and sell": an option exercise (M) or share conversion (C)
  -- for the same number of shares, sold immediately at market. This is an
  -- employee converting compensation into cash on a pre-set schedule, NOT a view
  -- on the stock -- but it arrives on the wire looking identical to a large
  -- discretionary sale, and it is one of the most common ways insider screens
  -- mislead. Flagged rather than suppressed, because the shares did really hit
  -- the market.
  is_exercise_sale boolean not null default false,

  -- Rule 10b5-1: a sale under a plan adopted months earlier is a far weaker
  -- signal than a discretionary one. Read from the filing's own <aff10b5One>
  -- element, so no footnote text has to be parsed to know this.
  is_10b5_1 boolean,

  -- Judgement, recomputed freely (see header)
  is_notable boolean not null default false,
  notable_reason text,

  created_at timestamptz not null default now(),

  -- Makes every re-run an upsert instead of a duplicate set. This is what lets
  -- the script re-process an index date it has already seen without any
  -- bookkeeping of its own -- important, because GitHub Actions cron drift means
  -- overlapping runs are normal rather than exceptional.
  constraint insider_tx_accession_row_key unique (accession_number, row_index)
);

-- The badge query is "notable lines for these tickers since date X", so ticker
-- leads and the date narrows it.
create index if not exists insider_tx_ticker_date_idx
  on insider_transactions (ticker, transaction_date desc);

-- Lets the script ask "what is the newest index date I have already processed?"
-- in one cheap query instead of tracking state anywhere else.
create index if not exists insider_tx_index_date_idx
  on insider_transactions (index_date desc);


-- ---------------------------------------------------------------------------
-- transaction_date vs period_of_report vs filed_date
-- ---------------------------------------------------------------------------
--
-- Three different dates, and using the wrong one is quietly wrong rather than
-- obviously wrong.
--
--   transaction_date  when the insider actually traded, per that line
--   period_of_report  the filing's single header date
--   filed_date        when it reached EDGAR
--
-- A Form 4 is due by the end of the second business day after the trade, so a
-- Monday trade can legitimately surface on Wednesday night -- and one filing may
-- cover several trade dates at once. A Carvana director's exercise-and-sell on
-- both the 13th and the 14th arrives as one filing, and reading period_of_report
-- as the trade date silently stamped the 14th's trade with the 13th.
--
-- So the UI sorts on transaction_date, and the script bookmarks on index_date.


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Deliberately left OFF, matching stocks / stock_quotes / stock_news / market_digest
-- (see scripts/enable-rls-portfolio.sql for the tables where it IS on). Form 4 is
-- a public SEC filing -- there is nothing here that is not already on sec.gov,
-- and the home page reads it with the anon key like every other market table.
