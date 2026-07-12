-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- Holds a snapshot of IBKR positions as of the last time scripts/sync-ibkr-positions.js
-- was run. Every sync fully replaces the contents (delete + insert), so this always
-- reflects exactly what IBKR reported at the last sync -- not an append-only history.

create table if not exists ibkr_positions (
  id uuid primary key default gen_random_uuid(),
  conid bigint not null,
  ticker text not null,
  company text,
  quantity numeric not null,
  avg_cost numeric,
  currency text,
  synced_at timestamptz not null default now()
);

create index if not exists ibkr_positions_ticker_idx on ibkr_positions (ticker);
