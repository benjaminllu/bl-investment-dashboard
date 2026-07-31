@AGENTS.md

## Push Policy

Vercel hosts this app and `main` is the deployed branch, so **treat a push to
`main` as a production deploy**, not merely as saving work. "Safe to push" means
"safe to put live."

Two independent questions decide the tier. Green vs amber is *can I clean up
after myself*; red is *is this decision mine to make at all*. Red is about
authority, not magnitude — a red item stays red even when it is well verified
and easily undone.

**Green — push without asking, then report what went out.** All three must hold:

1. **Reversible.** A single `git revert` restores the *live* state. Note that a
   revert does not undo a database write, an applied migration, or anything
   already sent to an external service — if undoing the change needs any step
   beyond the revert, it is not green.
2. **Verified by something that exercises it.** Typecheck and lint prove it
   compiles, not that it works. UI changes need a real render, screenshot, or
   measurement; data changes need the actual values checked.
3. **Contained.** Presentation, copy, or a refactor inside existing behaviour.

**Amber — finish the work, then ask before pushing.** Anything that fails a
green test, plus: schema migrations or any step Ben has to run by hand; a new
dependency or external endpoint; a change to what data gets written or deleted;
edits to `.github/workflows`, `next.config.ts`, or env handling; removing a
feature; or a design/product call where the intent is being guessed at.

**Red — never without Ben saying so explicitly in that moment**, and never under
a standing approval: force-push or history rewrite, anything touching `.env` or
secrets, destructive SQL (`drop`, `delete`, `truncate`), and anything touching
real positions, orders, or money.

The limit worth being honest about: this policy governs blast radius, which is
assessable, not whether the change is the *right* one, which is not. A green
change can be fully verified, trivially revertible, and still not what Ben
wanted — so the residual risk of auto-pushing is building the wrong thing
quickly, not breaking something. Say plainly what was pushed so that is cheap to
catch.

## Design Context

This is a **product**-register, **web**-platform personal investment dashboard (single primary user, casual family/friend viewers). Full strategic context lives in `PRODUCT.md`; the visual system ("The Signal Room" — OLED-dark, one emerald signal color, dense/flat/no-ornamentation) lives in `DESIGN.md`. Guiding principles: density with clarity, serve both a fast glance and a deep-research session on the same surface, optimize for Ben's own workflow over generic flexibility, numbers-first over decorative, and respect the standing tokens in `design-system/bl-investment-dashboard/MASTER.md` rather than reconsidering them per task.
