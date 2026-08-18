-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- Backs the Portfolio tab, which holds up to five separate portfolios (e.g. a
-- Schwab brokerage account and a Vanguard IRA shown side by side).
--
-- Nothing in the deployed app writes to either table. Positions are loaded
-- out-of-band — see PORTFOLIO.md for the import instructions.
--
-- Both tables have RLS enabled with no policy, so the public key reads nothing
-- from them and only the service-role key can. Run scripts/enable-rls-portfolio.sql
-- after creating them -- creating a table does not carry the policy over, and it
-- went unrun for months once already. See SECURITY.md for why the page's
-- password gate needs that second layer to mean anything.
--
-- This replaces ibkr_positions as the tab's source. The IBKR sync
-- (scripts/sync-ibkr-positions.js, scripts/ibkr-positions-table.sql) is kept
-- and still documented, but is no longer wired to the page.


-- Five fixed slots rather than free-form portfolio names, so the page has a
-- stable layout: a slot can be renamed or emptied without the other portfolios
-- shifting position, and an unfilled slot renders as a placeholder card.
create table if not exists portfolios (
  slot smallint primary key check (slot between 1 and 5),
  label text not null,
  -- Free text, e.g. 'schwab' or 'vanguard'. Recorded so the page can show where
  -- a portfolio came from, and so an importer can pick the right column mapping.
  broker text,
  updated_at timestamptz not null default now()
);

-- Seed all five so the page always has labels to render. Renaming is just an
-- update; there is no need to insert rows later.
insert into portfolios (slot, label) values
  (1, 'Portfolio 1'),
  (2, 'Portfolio 2'),
  (3, 'Portfolio 3'),
  (4, 'Portfolio 4'),
  (5, 'Portfolio 5')
on conflict (slot) do nothing;


create table if not exists portfolio_positions (
  slot smallint not null references portfolios (slot) on delete cascade,
  ticker text not null,
  company text,
  quantity numeric not null,
  avg_cost numeric,
  currency text,
  account text,
  imported_at timestamptz not null default now(),

  -- Composite primary key, on purpose. The same ticker can legitimately be held
  -- in more than one portfolio, so it cannot be unique on its own — but within
  -- a single portfolio a duplicate ticker is a double-count. This also makes a
  -- re-import over an uncleared slot fail loudly rather than silently doubling
  -- every position, which matters because a CSV import appends rather than
  -- replaces.
  primary key (slot, ticker)
);

-- Cash is held as an ordinary row under the sentinel ticker '$CASH', with the
-- dollar balance in `quantity` and `avg_cost` null — so a slot's Value ties out
-- to the broker's own positions total without needing is_cash/market_value
-- columns for one row per portfolio. '$CASH' rather than 'CASH' because CASH is
-- Pathward Financial's real symbol. See PORTFOLIO.md.

create index if not exists portfolio_positions_slot_idx on portfolio_positions (slot);


-- ---------------------------------------------------------------------------
-- Clearing a slot before re-importing
-- ---------------------------------------------------------------------------
--
-- These tables hold "what is held right now", not a history, so the previous
-- snapshot has to go or a position since sold would linger on the page forever.
-- Clear a single slot rather than the whole table, so the other portfolios are
-- left alone:
--
--     delete from portfolio_positions where slot = 1;
--
-- Renaming a slot:
--
--     update portfolios set label = 'Schwab Brokerage', broker = 'schwab'
--     where slot = 1;
--
-- Full import instructions, including per-broker column mappings, are in
-- PORTFOLIO.md.
