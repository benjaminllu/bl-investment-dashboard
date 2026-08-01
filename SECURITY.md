# Security

This is a personal project. This document summarizes the security practices
in place — it's a working reference, not a formal vulnerability-disclosure
policy (this project doesn't accept external security reports). Last
reviewed: 2026-07-10.

## Secrets management

- All credentials (Supabase keys, Finnhub, Gemini, VAPID) live in `.env.local`,
  which is gitignored (`.env*` in `.gitignore`) and has never been committed.
- Verified via a full git history scan (`git log --all --full-history` on env
  files, plus a diff grep across all commits for key-shaped strings) — no
  secret has ever been committed, in any revision.
- GitHub Actions secrets are configured in the repo's Actions secrets, not in
  code.
- The Supabase service role key (full read/write, bypasses RLS) is only ever
  used in local/CI scripts (`scripts/*.js`). The deployed Next.js app itself
  uses only the public anon key (`lib/supabase.ts`).

## Portfolio data entry

The Portfolio tab is loaded by CSV import through the Supabase dashboard, into
the `portfolio_positions` table. This was chosen over an in-app upload form
specifically to preserve the read-only posture described above: the deployed
app uses only the anon key, RLS is not enabled on this project's tables, and
the site is publicly reachable — so a browser upload writing with the anon key
would have been an unauthenticated write endpoint for anyone who found the URL.
A server-side upload with the service-role key would have been safe from that
particular problem but would still have needed its own auth gate, which this
project does not otherwise have. Importing through the Supabase dashboard adds
no new write path to the app at all.

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

- This app uses Supabase's public anon key for reads across all tables. As
  with any project using this pattern, the anon key should be treated as
  visible to anyone, since it ships to the client.
- Row Level Security is not yet enabled on this project's tables. This is a
  known gap, tracked as a future improvement rather than an oversight —
  revisit if the project's scope expands (multiple users, a more sensitive
  data surface, or a genuinely public-facing deployment).

## Dependencies

- No automated dependency scanning (Dependabot/Snyk) is configured — run
  `npm audit` manually before treating this list as current.
- Open, low-actionability item: `npm audit` currently flags a
  moderate-severity advisory in a dependency bundled inside Next.js's own
  `node_modules` (not a direct project dependency). No fix is available
  without an upstream Next.js patch; running `npm audit fix --force` for this
  would downgrade Next.js to an incompatible version and should not be done.

## What to re-check periodically

- Re-run `npm audit` occasionally.
- If this project's scope changes, revisit both the RLS and manual-login
  decisions above — they're reasoned for "one person checking their own
  dashboard a few times a day," not as general-purpose advice.
