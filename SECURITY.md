# Security

This is a personal, single-user project — this document exists so security
decisions and the reasoning behind them survive past whatever conversation
produced them, not as a formal policy. Last reviewed: 2026-07-10.

## Secrets management

- All credentials (Supabase keys, Finnhub, Gemini, VAPID) live in `.env.local`,
  which is gitignored (`.env*` in `.gitignore`) and has never been committed.
- Verified via a full git history scan (`git log --all --full-history` on env
  files, plus a diff grep across all commits for key-shaped strings) — no
  secret has ever been committed, in any revision.
- GitHub Actions secrets (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `FINNHUB_API_KEY`) are configured in the repo's Actions secrets, not in code.
- `SUPABASE_SERVICE_ROLE_KEY` (full read/write, bypasses RLS) is only ever used
  in local/CI scripts (`scripts/*.js`). The deployed Next.js app itself uses
  only the public anon key (`lib/supabase.ts`).

## IBKR Portfolio integration

The Portfolio tab syncs from Interactive Brokers via the official **Client
Portal Web API**, run locally as a gateway process (downloaded directly from
IBKR, not a third-party wrapper).

- **No credential automation.** Login is manual (browser + 2FA) every time a
  sync is needed. Automated-login tools (e.g. IBeam) were considered and
  explicitly rejected: IBKR's own documentation states there is no supported
  mechanism for this and discourages third-party tools for it, citing account
  risk — and this is a live account, not paper trading, so the credentials at
  stake are full-value. Syncs only happen a few times a day, so the manual
  step's actual cost is low relative to that risk.
- **Gateway network exposure — found and fixed.** The gateway's shipped
  default config (`root/conf.yaml`) had an IP allowlist with placeholder
  example values (`192.*`, plus an unrelated subnet) instead of being
  restricted to loopback, and the process binds to `0.0.0.0` (all interfaces)
  rather than `127.0.0.1` only. Combined with a pre-existing Windows Firewall
  allow-rule for `java.exe` on the Public network profile, this meant the
  gateway could have been reachable from other devices on the same network.
  Fixed by restricting `conf.yaml`'s `ips.allow` to `127.0.0.1` only (verified
  the gateway still works over loopback afterward, and rejects everything
  else at the application layer regardless of firewall/network state).
- **TLS certificate verification is scoped, not global.** The gateway serves
  HTTPS with a self-signed cert (expected for a local, non-public server).
  `scripts/sync-ibkr-positions.js` bypasses cert verification *only* for its
  calls to `https://localhost:5000`, via a dedicated `https.Agent`. An earlier
  draft disabled verification process-wide (`NODE_TLS_REJECT_UNAUTHORIZED=0`),
  which would have also silently disabled it for that same script's Supabase
  calls carrying the service role key — fixed before that version was ever
  run against a live gateway.
- **The sync script never touches credentials.** It only talks to an
  already-authenticated gateway session; no password, TOTP secret, or session
  token is stored anywhere in this repo.

## Supabase data access

- No table in this project uses Row Level Security; all reads go through the
  public anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), which — despite the
  "public" naming — should be treated as visible to anyone, since it ships to
  the browser.
- **Known accepted risk:** `ibkr_positions` (ticker, quantity, cost basis —
  real portfolio data, on a live account) is readable by anyone with the anon
  key, same as every other table in the app. This was an explicit, informed
  decision (2026-07-10), not an oversight.
- **Future improvement, not yet implemented:** add RLS to `ibkr_positions`
  restricting reads to the service role, and switch `app/portfolio/page.tsx`
  to a server-only Supabase client so the anon key is never in the read path
  for this table. Revisit if the project's scope expands.
- This deviates from Supabase's own stated best practice (always enable RLS).
  It's common among solo/hobby projects to skip it, but that's not the same
  as it being correct by that standard — noting the tradeoff here so it isn't
  forgotten.

## Dependencies

- No automated dependency scanning (Dependabot/Snyk) is configured — run
  `npm audit` manually before treating this list as current.
- **Open, low-actionability:** `npm audit` (2026-07-10) flags a
  moderate-severity XSS advisory in `postcss` (GHSA-qx2v-qp2m-jg93), bundled
  inside Next.js's own `node_modules` — not a direct project dependency. No
  fix is available without an upstream Next.js patch; do **not** run
  `npm audit fix --force` for this — it downgrades Next.js to an incompatible
  version.

## What to re-check periodically

- Re-run `npm audit` occasionally; revisit the postcss item once Next.js
  ships a patched bundled version.
- If this project's scope changes — multiple users, a genuinely public-facing
  deployment, or trading automation — revisit both the RLS deferral and the
  manual-login decision above. Both are reasoned specifically for "one person
  checking their own dashboard a few times a day," not as general advice.
