import {
  CYCLE_PHASES,
  PHASE_DESCRIPTION,
  PHASE_LABEL,
  type CycleData,
  type PlaybookCheck,
  type PlaybookEntry,
} from "@/lib/cycle";

/**
 * The macro layer, and the only thing on this page that is not price-derived.
 *
 * It sits *after* the price signals rather than above them, which is a
 * deliberate ordering. The business-cycle framework is slow — CFNAI lands with
 * a month's lag on a series that is itself a three-month average — so it can
 * only ever explain a rotation the price data has already shown. Putting it at
 * the top would invite reading it as a prediction that the tables below then
 * confirm, which is backwards.
 *
 * The agreement line is the point of the panel. See `checkPlaybook` in
 * `lib/cycle.ts`.
 */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function Group({ title, entries }: { title: string; entries: PlaybookEntry[] }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
      <ul className="mt-1 space-y-0.5">
        {entries.map((e) => (
          <li key={e.ticker} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-foreground">{e.label}</span>
            <span
              className={`shrink-0 tabular-nums ${
                e.rank === null
                  ? "text-muted-foreground"
                  : e.rank <= 4
                    ? "text-accent"
                    : e.rank >= 8
                      ? "text-destructive"
                      : "text-muted-foreground"
              }`}
            >
              {e.rank === null ? "—" : `#${e.rank}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CyclePanel({
  cycle,
  playbook,
}: {
  cycle: CycleData;
  playbook: PlaybookCheck | null;
}) {
  if (!cycle.available || !cycle.phase) {
    return (
      <div className="border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Business cycle</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {cycle.inputs.length === 0
            ? "Needs FRED_API_KEY in .env.local — the same key the Macro page uses."
            : "The activity series did not load, so no phase can be placed. The inputs below are what did arrive."}
        </p>
      </div>
    );
  }

  const phase = cycle.phase;

  return (
    <div className="border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-foreground">Business cycle</h2>
        <p className="text-xs text-muted-foreground">
          FRED · activity as of {formatDate(cycle.asOf)}
        </p>
      </div>

      {/* The four phases as a strip rather than a single badge: a phase only
          means anything against the ones on either side of it, and the strip
          shows what the classification ruled out. */}
      <div className="grid grid-cols-4 gap-1" role="list" aria-label="Business cycle phase">
        {CYCLE_PHASES.map((p) => (
          <div
            key={p}
            role="listitem"
            aria-current={p === phase ? "true" : undefined}
            className={`rounded px-2 py-1.5 text-center text-xs font-medium transition-colors ${
              p === phase
                ? "bg-accent text-background"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            {PHASE_LABEL[p]}
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-foreground">{cycle.rationale}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {PHASE_DESCRIPTION[phase]}
      </p>

      <div className="mt-3 border-t border-border pt-2">
        <h3 className="text-xs font-semibold text-foreground">What produced that</h3>
        <dl className="mt-1.5 space-y-1.5">
          {cycle.inputs.map((input) => (
            // Below `sm` the reading drops to its own line: the three fixed
            // columns plus a sentence do not fit in 326px of card, and letting
            // the sentence overflow put a horizontal scrollbar on the whole
            // page rather than on this one block.
            <div key={input.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <dt className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:w-36 sm:flex-none">
                {input.label}
              </dt>
              <dd className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                {input.value === null ? "—" : input.value.toFixed(input.decimals)}
                <span className="font-normal text-muted-foreground">{input.unit}</span>
              </dd>
              <dd className="w-14 shrink-0 text-right text-xs tabular-nums">
                {input.change3m === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={
                      input.change3m > 0
                        ? "text-accent"
                        : input.change3m < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                    title="Change over roughly three months"
                  >
                    {input.change3m > 0 ? "+" : input.change3m < 0 ? "−" : ""}
                    {Math.abs(input.change3m).toFixed(input.decimals)}
                  </span>
                )}
              </dd>
              <dd className="w-full text-xs text-muted-foreground sm:w-auto sm:min-w-0 sm:flex-1">
                {input.read}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-xs text-muted-foreground/70">
          The middle column is the three-month change, coloured by its sign alone — a rising
          unemployment rate is green here only because the number went up.
        </p>
      </div>

      {playbook && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-xs font-semibold text-foreground">
              Does the market agree?
            </h3>
            <p className="text-xs text-muted-foreground">
              Momentum rank out of 11 · #1 is the strongest
            </p>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-4">
            <Group title={`Favoured in ${PHASE_LABEL[phase].toLowerCase()}`} entries={playbook.favoured} />
            <Group title="Historically lagged" entries={playbook.laggards} />
          </div>

          <p
            className={`mt-2 text-xs leading-relaxed ${
              playbook.agreement !== null && playbook.agreement >= 1
                ? "text-accent"
                : playbook.agreement !== null && playbook.agreement <= -1
                  ? "text-warning"
                  : "text-muted-foreground"
            }`}
          >
            {playbook.verdict}
            {playbook.favouredMeanRank !== null && playbook.laggardMeanRank !== null && (
              <span className="text-muted-foreground">
                {" "}
                Mean rank {playbook.favouredMeanRank.toFixed(1)} against{" "}
                {playbook.laggardMeanRank.toFixed(1)}.
              </span>
            )}
          </p>
        </div>
      )}

      <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">
        The phase-to-sector mapping is quoted from Fidelity&apos;s business cycle framework, not
        derived here. ISM PMI would be the conventional growth input and is not freely available, so
        the Chicago Fed National Activity Index stands in — broader, and roughly a month slower.
        Four indicators cannot identify a cycle phase reliably; every one of them is printed above
        so the label can be argued with.
      </p>
    </div>
  );
}
