"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { unlockPortfolio, type UnlockState } from "@/app/portfolio/actions";

/**
 * useFormStatus only reports the status of the form it is rendered *inside*, so
 * the button has to be its own component rather than part of the form body.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Unlocking…" : "Unlock"}
    </button>
  );
}

export default function PortfolioLockScreen({ configured }: { configured: boolean }) {
  const [state, formAction] = useActionState<UnlockState, FormData>(unlockPortfolio, {
    error: null,
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Portfolio</h1>

        {/* Centred rather than widened: a full-bleed card would stretch the
            password field across the viewport. The narrow card is the point. */}
        <div className="mx-auto mt-8 w-full rounded-xl bg-card p-6 sm:max-w-md">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
            className="h-6 w-6 text-muted-foreground"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>

          <h2 className="mt-3 text-base font-semibold text-foreground">Positions are private</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Holdings, cost basis and portfolio value are hidden by default. Everything else on the
            dashboard — the watchlist, macro and research — stays open.
          </p>

          {configured ? (
            <form action={formAction} className="mt-4 flex flex-col gap-3">
              <label htmlFor="portfolio-password" className="sr-only">
                Portfolio password
              </label>
              <input
                id="portfolio-password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                placeholder="Password"
                className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
              />
              <SubmitButton />
              {state.error && (
                <p role="alert" className="text-sm text-destructive">
                  {state.error}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Unlocking sets a cookie in this browser for 30 days. It does not change what anyone
                else sees.
              </p>
            </form>
          ) : (
            // Fail-closed: no password configured means locked, not open. Say so
            // plainly rather than showing a form that can never succeed.
            <p className="mt-4 text-sm text-destructive">
              <code className="text-muted-foreground/80">PORTFOLIO_PASSWORD</code> and{" "}
              <code className="text-muted-foreground/80">PORTFOLIO_COOKIE_SECRET</code> are not set
              on this deployment, so the portfolio cannot be unlocked. See{" "}
              <code className="text-muted-foreground/80">.env.example</code>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
