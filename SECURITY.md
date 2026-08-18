# Security

This is a personal project. This document summarizes the security practices
in place — it's a working reference, not a formal vulnerability-disclosure
policy (this project doesn't accept external security reports). Last
reviewed: 2026-08-18.

## Secrets management

- All credentials (Supabase keys, Finnhub, Gemini, VAPID) live in `.env.local`,
  which is gitignored (`.env*` in `.gitignore`) and has never been committed.
- Verified via a full git history scan (`git log --all --full-history` on env
  files, plus a diff grep across all commits for key-shaped strings) — no
  secret has ever been committed, in any revision.
- GitHub Actions secrets are configured in the repo's Actions secrets, not in
  code.
- The Supabase service role key (full read/write, bypasses RLS) is used by the
  local/CI scripts (`scripts/*.js`) and, since RLS was enabled on the position
  tables, by the server-rendered `/portfolio` page as well
  (`lib/supabase-server.ts`). It is never exposed to the browser: only
  `NEXT_PUBLIC_*` vars are inlined into the client bundle, and no route handler
  or server action returns raw position rows to a client component.
- `.env.example` lists every variable by name with empty values. It is the one
  exception to the `.env*` gitignore rule and must never be given real values.

## Portfolio access control

The dashboard is a public URL that gets shared with family and friends. Every
page is fine for them to see except `/portfolio`, which exposes share counts,
cost basis and total net worth. Two independent layers gate it, and as of
2026-08-18 both are in place.

1. **Application gate** (`lib/portfolioLock.ts`). `/portfolio` returns a lock
   screen *before running a single Supabase query* when the request carries no
   valid unlock cookie. The numbers are therefore absent from the HTML and the
   RSC flight payload, not merely hidden by CSS.
2. **Row Level Security** (`scripts/enable-rls-portfolio.sql`). RLS is enabled
   with no policy on `portfolios`, `portfolio_positions`, `portfolio_snapshots`
   and `ibkr_positions`, so the publishable key reads zero rows from them.

**This was checked, not assumed.** An audit on 2026-08-18 found layer 2 missing
— the migration had been written months earlier but never run, and the
publishable key returned all 64 position rows while this document claimed it
returned none. It was run that day and re-verified from the outside: the same
query now returns zero rows for all four tables, while the service-role client
still returns 64/5/1 so the page keeps working. The lesson worth keeping is
that a migration living in `scripts/` is not a control until someone runs it,
and this file cannot tell you whether that happened — only the database can.

Layer 1 alone would only be a curtain *if* the publishable key were obtainable.
Today it is not published anywhere: only server components import
`lib/supabase.ts` (confirmed across every commit in the repo's history), and
the key's value does not appear in the production client bundle. But it is a
`sb_publishable_*` key in a `NEXT_PUBLIC_*` var — a class of credential
designed to be public — so it becomes world-readable the moment any client
component imports the browser Supabase client. Layer 2 is what makes that a
non-event instead of a disclosure.

**Threat model.** This protects against a casual viewer — someone with the link
who opens devtools. It is not designed against an attacker who has Ben's
device, his password, or Supabase dashboard access.

**The unlock cookie** holds a signed expiry, never the password: HMAC-SHA256
over the expiry timestamp, keyed by `PORTFOLIO_COOKIE_SECRET`. The signature is
verified before the expiry is trusted, and compared with `timingSafeEqual`.
Password comparison hashes both sides first so neither content nor length leaks
through timing. The cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in
production, and expires after 30 days.

**Known limitation.** There is no cross-instance rate limiting on the password
form — serverless gives no shared store to hold a counter. A fixed 250 ms delay
on each failure is the only friction, so the password must be long and random.

**Fails closed.** If `PORTFOLIO_PASSWORD` or `PORTFOLIO_COOKIE_SECRET` is
missing, the route stays locked and says so. A misconfigured deploy can lock Ben
out; it cannot expose positions.

## Portfolio data entry

The Portfolio tab is loaded by CSV import through the Supabase dashboard, into
the `portfolio_positions` table. This was chosen over an in-app upload form
specifically to preserve the read-only posture described above: a browser upload
writing with the anon key would have been an unauthenticated write endpoint for
anyone who found the URL. A server-side upload with the service-role key would
have been safe from that particular problem but would still have needed its own
auth gate.

That gate now exists (`isPortfolioUnlocked()`), so an in-app upload form has
become defensible where it previously was not. It still has not been built —
importing through the Supabase dashboard adds no new write path to the app at
all, and that remains the smaller surface.

## IBKR Portfolio integration (tabled)

**No longer wired to the Portfolio tab**, which now reads `portfolio_positions`
instead. Kept because the review below remains accurate and applies again if
the integration is picked back up.

The Portfolio tab synced from Interactive Brokers via the official **Client
Portal Web API**, run locally as a gateway process (downloaded directly from
IBKR, not a third-party wrapper).

- **No credential automation.** Login is manual (browser + 2FA) every time a
  sync is needed. Automated-login community tools exist for this API, but
  IBKR's own documentation states there's no officially supported mechanism
  for automating brokerage-session login and discourages third-party tools
  for it. Given how infrequently a sync is actually needed, the manual step's
  cost is low relative to that tradeoff.
- **Gateway network exposure — found and fixed during setup.** The gateway's
  shipped default config (`root/conf.yaml`) had a placeholder IP allowlist
  that didn't actually restrict connections to loopback, and the process
  binds to all network interfaces by default rather than `127.0.0.1` only.
  Fixed by restricting `conf.yaml`'s `ips.allow` to `127.0.0.1`, at the
  application layer (not just relying on OS firewall state) — verified the
  gateway still works locally afterward.
- **TLS certificate verification is scoped, not global.** The gateway serves
  HTTPS with a self-signed cert (expected for a local, non-public server).
  `scripts/sync-ibkr-positions.js` bypasses cert verification *only* for its
  calls to the local gateway, via a dedicated `https.Agent` — it does not
  weaken verification for any other network call the script makes (e.g. its
  Supabase calls).
- **The sync script never touches credentials.** It only talks to an
  already-authenticated local gateway session; no password, TOTP secret, or
  session token is stored anywhere in this repo.

## Data access

- This app uses Supabase's public anon key for reads of market data. As with
  any project using this pattern, the anon key should be treated as visible to
  anyone, since it ships to the client.
- **Row Level Security is enabled on the position tables** — `portfolios`,
  `portfolio_positions`, `portfolio_snapshots`, `ibkr_positions` — with no
  policy, so the publishable key reads nothing from them. Run 2026-08-18 and
  verified from outside the app on the same day. See the section above.
- **`push_subscriptions` still has no RLS**, and is not in that migration. The
  table is currently empty (confirmed with the service-role key, so this is a
  genuine empty and not a policy denial), which is why nothing is exposed yet.
  It holds the endpoint and encryption keys needed to push to Ben's browser, so
  it belongs with the position tables rather than with market data — and it
  stops being empty the first time Ben enables notifications. One line:
  `alter table push_subscriptions enable row level security;`
- Anon *write* privileges on the RLS-less tables are unverified. Supabase's
  default grants give `anon` INSERT/UPDATE/DELETE and RLS is normally what gates
  that, so a key holder may be able to tamper with `price_history` (which feeds
  the risk metrics) or rewrite `stocks`. Check with:

      select table_name, privilege_type from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and privilege_type <> 'SELECT';

  Nothing in this app writes with the anon key, so revoking those is free.
- RLS is deliberately **not** enabled on `stocks`, `stock_quotes`,
  `stock_fundamentals`, `stock_earnings`, `price_history` or `risk_free_rates`.
  These are public market data read from the browser by the watchlist; locking
  them would break the dashboard for no privacy gain. Note that `stocks`
  carries Ben's own thesis notes, which are opinion rather than holdings and
  are already visible on the public home page.
- **The unauthenticated write paths are closed.** `app/api/subscribe` and
  `app/api/notify` now both require a valid unlock cookie via
  `isPortfolioUnlocked()`. `addStock` and its form are gone: the component was
  mounted nowhere, so the action was tree-shaken out of every build and was
  never a live endpoint — but it would have become one the moment the form was
  rendered, and deleting it is cheaper than remembering that.
- **Push endpoints are validated before they are stored**
  (`lib/pushSubscription.ts`). The stored `endpoint` is a URL the server later
  POSTs to, and `web-push` applies no allowlist of its own, so an unvalidated
  row was an SSRF primitive with an attacker-chosen destination. Subscriptions
  are now required to be `https:` on a known push-service host, with
  correctly-sized encryption keys, and only those three fields are persisted.
  Both handlers also answer malformed JSON with a 400 rather than a 500, and
  return generic errors — a raw PostgREST message names tables and columns.

## Dependencies

- No automated dependency scanning (Dependabot/Snyk) is configured — run
  `npm audit` manually before treating this list as current.
- Next.js is pinned to **16.2.11** (bumped from 16.2.6 on 2026-08-18). That
  release closes nine advisories against 16.2.6, of which the ones that
  actually applied here were the App Router Server Actions DoS
  (GHSA-m99w-x7hq-7vfj), two response-body cache-confusion issues
  (GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q) and the server-function endpoint
  disclosure (GHSA-955p-x3mx-jcvp). The middleware bypass did not apply (this
  app has no middleware), nor did the custom-server SSRF (Vercel) or the image
  optimizer DoS (`next/image` is unused).
- Open, low-actionability item: three high-severity advisories remain, all in
  dependencies bundled *inside* Next.js — `postcss` under
  `node_modules/next/node_modules`, and the optional `sharp` image dependency.
  Clearing them needs `next@16.3.1`, a larger jump than the security fix
  required, and neither applies to this app: the PostCSS issues need
  attacker-controlled CSS at build time, and `sharp`/libvips is only reached
  through the image optimizer, which is unused. Worth taking on the next
  routine dependency bump rather than as a security action.

## What to re-check periodically

- Re-run `npm audit` occasionally.
- If this project's scope changes, revisit both the RLS and manual-login
  decisions above — they're reasoned for "one person checking their own
  dashboard a few times a day," not as general-purpose advice.
- Confirm RLS is on. Check it against the database, not against this file —
  this file asserted RLS was on for four days while it was off. After any
  Supabase schema work, re-run:
  `select relname, relrowsecurity from pg_class where relname like 'portfolio%';`
- Confirm the publishable key is still absent from the client bundle. It is the
  assumption holding the position tables private until RLS lands:
  `grep -rl "$NEXT_PUBLIC_SUPABASE_ANON_KEY" .next/static` after a build should
  match nothing.
- Rotate `PORTFOLIO_PASSWORD` / `PORTFOLIO_COOKIE_SECRET` if the link is shared
  more widely than intended. Changing either invalidates every unlock cookie.
