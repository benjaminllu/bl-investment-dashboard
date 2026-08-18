-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- same as how other tables in this project were created.
--
-- The AI Market Summary block on the home page. One row per story, ten rows per
-- day, written by scripts/generate-market-digest.js on the 9am ET GitHub Actions
-- run (.github/workflows/market-digest.yml).
--
-- Rows-per-story rather than one jsonb blob per day: the shape matches how
-- stock_news and stock_earnings already store multi-row-per-key data, and it
-- keeps `rank` sortable in the query instead of in JavaScript.
--
-- History is kept rather than overwritten. Ten narrow rows a day is ~3.6k rows a
-- year, which is nothing, and it means a bad digest can be compared against the
-- days around it. The generator prunes anything older than 90 days so this
-- cannot grow without bound.
--
--
-- headline / url / source are copied verbatim from the newswire, NOT written by
-- the model. The model only ever returns an index into the candidate list it was
-- given, plus its own `why_it_matters` sentence -- so a hallucinated story cannot
-- reach this table, only a questionable ranking of real ones.
--
-- `tickers` is validated against the `stocks` watchlist before insert, so a chip
-- rendered here always corresponds to a symbol Ben actually tracks.

create table if not exists market_digest (
  id uuid primary key default gen_random_uuid(),
  digest_date date not null,
  rank int not null,
  headline text not null,
  url text not null,
  source text not null,
  category text not null,
  why_it_matters text not null,
  tickers text[] not null default '{}',
  article_datetime bigint,
  image text,
  model text,
  generated_at timestamptz not null default now(),

  -- Makes a re-run for the same day an upsert rather than a duplicate set. The
  -- generator still deletes the day's rows first (a re-run can legitimately
  -- return fewer than ten), but this stops a partial failure leaving eleven.
  constraint market_digest_date_rank_key unique (digest_date, rank)
);

create index if not exists market_digest_date_idx on market_digest (digest_date desc);


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Deliberately left OFF, matching stocks / stock_quotes / stock_news and the
-- rest of the market-data tables (see scripts/enable-rls-portfolio.sql). This is
-- public newswire plus a model's commentary on it -- there is nothing private
-- here, and the home page reads it with the anon key like everything else.
