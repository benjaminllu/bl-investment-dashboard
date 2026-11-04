"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import type { Stock } from "@/components/StockTable";
import { addTicker, removeTickers, type AddTickerState } from "@/lib/watchlistActions";

/**
 * The watchlist's add/remove controls, shared by the home board and /research.
 *
 * Whether to draw them is asked of /api/unlock-status after load rather than
 * decided during render, because reading the unlock cookie on the server would
 * make the static home page dynamic for every visitor. Visitors get a page
 * without the controls; the actions refuse them regardless.
 */
export function useCanEditWatchlist(): boolean {
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/unlock-status")
      .then((r) => (r.ok ? r.json() : { unlocked: false }))
      .then((d: { unlocked?: boolean }) => live && setCanEdit(d.unlocked === true))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return canEdit;
}

/**
 * The rows a remove click should delete: on a list tab the one row shown, on
 * "All" (where a multi-list ticker appears once) every row of that ticker.
 */
export function rowsToRemove(stock: Stock, stocks: Stock[], activeList: string): Stock[] {
  return activeList === "All" ? stocks.filter((s) => s.ticker === stock.ticker) : [stock];
}

/**
 * The button that opens the add form. Outlined in the signal colour so it
 * reads as an action rather than one more category tab, and filled while the
 * form is open. `className` carries the host bar's height and text size.
 */
export function AddTickerToggle({
  open,
  onToggle,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex shrink-0 items-center gap-1 rounded border px-2 font-semibold transition-colors ${
        open
          ? "border-accent bg-accent text-background"
          : "border-accent/60 bg-accent/10 text-accent hover:bg-accent/20"
      } ${className}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" d="M8 3v10M3 8h10" />
      </svg>
      Add ticker
    </button>
  );
}

const INITIAL: AddTickerState = { error: null, done: null };

const fieldClass =
  "h-6 rounded bg-muted px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** A strip under the category tabs; the toggle that opens it lives in the tab bar. */
export function AddTickerForm({
  lists,
  defaultList,
  onClose,
}: {
  lists: string[];
  defaultList: string;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(addTicker, INITIAL);
  const tickerRef = useRef<HTMLInputElement>(null);

  // Focus on open, and again after each add so several can be typed in a row.
  useEffect(() => {
    tickerRef.current?.focus();
  }, [state]);

  return (
    <div className="shrink-0 border-b border-border px-2 py-1.5">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          ref={tickerRef}
          name="ticker"
          aria-label="Ticker"
          placeholder="Ticker"
          autoComplete="off"
          spellCheck={false}
          required
          className={`${fieldClass} w-24 uppercase placeholder:normal-case`}
        />
        {/* Keyed on defaultList so switching tab re-seeds it. */}
        <ListCombobox key={defaultList} lists={lists} defaultValue={defaultList} />
        <button
          type="submit"
          disabled={pending}
          className="h-6 rounded bg-accent px-2 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-6 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Close
        </button>
      </form>
      {/* Finnhub takes a second or two, so say so rather than leave a dead button. */}
      <p aria-live="polite" className="mt-1 min-h-4 text-xs">
        {pending ? (
          <span className="text-muted-foreground">Checking the symbol and fetching its data…</span>
        ) : state.error ? (
          <span className="text-destructive">{state.error}</span>
        ) : state.done ? (
          <span className="text-muted-foreground">{state.done}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Free text with the existing lists offered underneath: typing a new name
 * creates that list. Built rather than a native <datalist>, whose popup is
 * drawn by the browser and cannot take the app's colours or type.
 *
 * Follows the ARIA combobox pattern: focus stays in the input, arrows move a
 * highlight through the options, Enter picks it, Escape closes.
 */
function ListCombobox({ lists, defaultValue }: { lists: string[]; defaultValue: string }) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const q = value.trim().toLowerCase();
  // An exact match (including the prefilled current tab) shows every list, so
  // the menu is a way to switch rather than a one-item echo of what's typed.
  const exact = lists.some((l) => l.toLowerCase() === q);
  const options = q && !exact ? lists.filter((l) => l.toLowerCase().includes(q)) : lists;
  const isNew = q.length > 0 && !exact;

  const pick = (list: string) => {
    setValue(list);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (options.length ? (i + step + options.length) % options.length : -1));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      // Picks the highlighted list instead of submitting the form.
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        name="list"
        role="combobox"
        aria-label="List"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        placeholder="List"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        required
        className={`${fieldClass} w-44`}
      />
      {open && (options.length > 0 || isNew) && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-label="Lists"
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-56 overflow-auto rounded border border-border bg-card py-1 text-xs shadow-lg shadow-black/40"
        >
          {options.map((l, i) => (
            <li
              key={l}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: click lands after the input's blur has
              // already closed the menu.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(l);
              }}
              onMouseEnter={() => setActive(i)}
              // The current choice is marked in the signal colour.
              className={`cursor-pointer px-2 py-1 ${i === active ? "bg-muted" : ""} ${
                l.toLowerCase() === q
                  ? "font-semibold text-accent"
                  : i === active
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {l}
            </li>
          ))}
          {isNew && (
            <li
              role="presentation"
              className={`px-2 py-1 text-muted-foreground ${options.length ? "mt-1 border-t border-border pt-1.5" : ""}`}
            >
              Create new list <span className="text-foreground">“{value.trim()}”</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Confirms before deleting. Open whenever `rows` is non-null; closing for any
 * reason (Cancel, Esc, a finished delete) calls onClose to clear it.
 */
export function RemoveTickerDialog({ rows, onClose }: { rows: Stock[] | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (rows && !dialog.open) {
      setError(null);
      dialog.showModal();
    } else if (!rows && dialog.open) {
      dialog.close();
    }
  }, [rows]);

  const ticker = rows?.[0]?.ticker ?? "";
  const lists = (rows ?? []).map((r) => r.list).filter(Boolean).join(", ");

  const confirm = () => {
    if (!rows) return;
    startTransition(async () => {
      const result = await removeTickers(rows.map((r) => r.id));
      if (result.error) setError(result.error);
      else onClose();
    });
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="remove-ticker-title"
      className="m-auto w-[min(24rem,92vw)] rounded-xl bg-card p-4 text-foreground backdrop:bg-black/60"
    >
      <h2 id="remove-ticker-title" className="text-sm font-semibold">
        Remove {ticker}?
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {lists ? `Removes ${ticker} from ${lists}.` : `Removes ${ticker} from the watchlist.`} Anything
        stored on {rows && rows.length > 1 ? "those rows" : "that row"}, including notes, is deleted
        too. This can&apos;t be undone.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {/* First in the DOM, so showModal() focuses Cancel rather than Remove. */}
        <button
          type="button"
          onClick={onClose}
          className="h-7 rounded bg-muted px-3 text-xs text-foreground transition-colors hover:bg-muted/70"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="h-7 rounded bg-destructive px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Removing…" : "Remove"}
        </button>
      </div>
    </dialog>
  );
}
