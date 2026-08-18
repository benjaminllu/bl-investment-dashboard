-- STATUS: applied 2026-08-18, and verified from outside the app the same day
-- (publishable key returns zero rows from all four tables; service-role still
-- returns 64/5/1). Before that it sat here unrun for months while SECURITY.md
-- described it as done -- re-run the verification query at the bottom rather
-- than trusting this line.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- IMPORTANT: run this only *after* the app change that gates /portfolio has been
-- deployed, and after SUPABASE_SERVICE_ROLE_KEY is set in Vercel. Running it
-- first makes /portfolio render an *empty* portfolio rather than an error,
-- because a policy denial and "you hold nothing" look identical to the page.
--
--
-- Why
-- ---
-- The dashboard is a public URL shared with family and friends, and the app's
-- unlock gate (lib/portfolioLock.ts) only controls what the *page* renders. The
-- Supabase publishable key is a NEXT_PUBLIC_* var of a class meant to be public,
-- and inlines into the browser bundle the moment any client component imports
-- lib/supabase.ts. Today none do, so the key is not actually published — but
-- that is an accident of the current import graph, not a control. Once it ships,
-- without RLS anyone could skip the page and read positions from the devtools
-- console:
--
--     supabase.from('portfolio_positions').select('*')
--
-- Enabling RLS with no policy is what turns that gate from a curtain into a
-- lock. `anon` then reads zero rows from these tables.
--
--
-- What this does NOT break
-- ------------------------
-- `service_role` bypasses RLS entirely, so everything that writes positions
-- keeps working untouched:
--
--   * scripts/import-portfolio-csv.js   (Schwab / Vanguard CSV import)
--   * scripts/snapshot-portfolio.js     (daily portfolio_snapshots row)
--   * scripts/sync-ibkr-positions.js    (IBKR gateway sync)
--   * .github/workflows/refresh-data.yml and refresh-fundamentals.yml
--
-- All of them already authenticate with SUPABASE_SERVICE_ROLE_KEY, as does the
-- deployed /portfolio page after this change (lib/supabase-server.ts).

alter table portfolios          enable row level security;
alter table portfolio_positions enable row level security;
alter table portfolio_snapshots enable row level security;
alter table ibkr_positions      enable row level security;

-- Deliberately no policies. A table with RLS on and no policy grants nothing to
-- anon, which is exactly what is wanted here — there is no per-user model to
-- express, just "the public key cannot read this".
--
-- ibkr_positions is included even though nothing reads it any more
-- (see scripts/portfolio-positions-table.sql): it still holds real share counts.


-- ---------------------------------------------------------------------------
-- Left open on purpose
-- ---------------------------------------------------------------------------
--
--   stocks, stock_quotes, stock_fundamentals, stock_earnings,
--   price_history, risk_free_rates
--
-- These are public market data, not holdings, and the watchlist reads them from
-- the browser with the anon key. Locking them down would break the rest of the
-- dashboard for no privacy gain.
--
-- Note that `stocks` carries Ben's own thesis notes. That is opinion rather than
-- position data, and it is already visible to anyone loading the home page, so
-- it stays where it is.


-- ---------------------------------------------------------------------------
-- Verifying
-- ---------------------------------------------------------------------------
--
--     select relname, relrowsecurity
--     from pg_class
--     where relname in ('portfolios', 'portfolio_positions',
--                       'portfolio_snapshots', 'ibkr_positions');
--
-- All four should report relrowsecurity = true. Then, in a logged-out browser
-- console on the deployed site, confirm the anon read returns no rows.


-- ---------------------------------------------------------------------------
-- Undoing
-- ---------------------------------------------------------------------------
--
-- Reverting the app code does NOT turn this off; it has to be undone by hand:
--
--     alter table portfolios          disable row level security;
--     alter table portfolio_positions disable row level security;
--     alter table portfolio_snapshots disable row level security;
--     alter table ibkr_positions      disable row level security;
