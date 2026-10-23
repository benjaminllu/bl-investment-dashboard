"use client";

import { useActionState, startTransition, type FormEvent } from "react";
import { importPortfolio, type ImportState } from "@/app/portfolio/actions";

const INITIAL: ImportState = { error: null, preview: null, done: null };

const fieldClass =
  "rounded bg-muted px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function PortfolioImport({ slots }: { slots: { slot: number; label: string }[] }) {
  const [state, formAction, pending] = useActionState(importPortfolio, INITIAL);

  // Submitted by hand rather than through <form action>, because React resets a
  // form after its action runs, and that would clear the chosen file between
  // Preview and Import.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  const { preview } = state;

  return (
    <details className="border border-border bg-card" open={state.preview !== null || state.error !== null}>
      <summary className="cursor-pointer select-none px-4 py-2 text-xs text-muted-foreground hover:text-foreground">
        Import positions CSV
      </summary>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 border-t border-border px-4 py-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          File (Schwab positions or Vanguard cost basis)
          <input name="file" type="file" accept=".csv,text/csv" required className="text-xs text-foreground" />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Slot
          <select name="slot" defaultValue="auto" className={fieldClass}>
            <option value="auto">Match account</option>
            {slots.map((s) => (
              <option key={s.slot} value={s.slot}>
                {s.slot} · {s.label}
              </option>
            ))}
          </select>
        </label>

        <label
          className="flex flex-col gap-1 text-xs text-muted-foreground"
          title="Vanguard's cost-basis file leaves out the settlement money market, so enter its balance here."
        >
          Cash balance (optional)
          <input name="cash" inputMode="decimal" placeholder="e.g. 110748.80" className={`${fieldClass} w-32 tabular-nums`} />
        </label>

        <div className="flex gap-2">
          <button type="submit" name="intent" value="preview" disabled={pending} className={`${fieldClass} hover:text-foreground disabled:opacity-50`}>
            {pending ? "Reading…" : "Preview"}
          </button>
          {preview && (
            <button
              type="submit"
              name="intent"
              value="import"
              disabled={pending}
              className="rounded bg-accent px-2 py-1 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {preview.replacing ? `Replace slot ${preview.slot}` : `Import into slot ${preview.slot}`}
            </button>
          )}
        </div>
      </form>

      {(state.error || state.done || preview) && (
        <div className="space-y-2 border-t border-border px-4 py-3 text-xs">
          {state.error && (
            <p role="alert" className="text-destructive">
              {state.error}
            </p>
          )}
          {state.done && (
            <p role="status" className="text-foreground">
              {state.done}
            </p>
          )}
          {preview && !state.done && (
            <>
              <p className="text-muted-foreground">
                {preview.broker} · {preview.account ?? "unknown account"} ·{" "}
                {preview.replacing ? `replaces slot ${preview.slot}` : `fills empty slot ${preview.slot}`} ·{" "}
                {preview.positions.length} positions
                {preview.skipped.length > 0 && `, ${preview.skipped.length} rows skipped`}
              </p>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full tabular-nums">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-4 text-left font-normal">Ticker</th>
                      <th className="py-1 pr-4 text-left font-normal">Name</th>
                      <th className="py-1 pr-4 text-right font-normal">Quantity</th>
                      <th className="py-1 text-right font-normal">Avg cost</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {preview.positions.map((p) => (
                      <tr key={p.ticker} className="border-t border-border">
                        <td className="py-1 pr-4">{p.ticker}</td>
                        <td className="max-w-xs truncate py-1 pr-4 text-muted-foreground">{p.company}</td>
                        <td className="py-1 pr-4 text-right">{p.quantity.toLocaleString("en-US")}</td>
                        <td className="py-1 text-right">{p.avgCost === null ? "—" : `$${p.avgCost.toFixed(2)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.skipped.map((s) => (
                <p key={s.symbol} className="text-muted-foreground">
                  Skipped {s.symbol}: {s.reason}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </details>
  );
}
