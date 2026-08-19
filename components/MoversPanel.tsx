/**
 * The day's three best and three worst names on the watchlist.
 *
 * A narrow rail beside the digest rather than a row above the table: the digest
 * answers "what happened in the market", this answers "what did it do to *my*
 * list", and the two are read in the same glance. Six rows is also exactly the
 * digest grid's six-row height, so the two panels bottom out together without
 * either being pinned to a fixed pixel height.
 */

export interface MoverStock {
  ticker: string;
  company: string;
  price: number;
  changePct: number;
  /** Null when no quote row exists yet — such a ticker is not a "0.00% mover". */
  updatedAt: string | null;
}

export interface Mover {
  ticker: string;
  company: string;
  price: number;
  changePct: number;
}

const COUNT = 3;

/**
 * Ranks the watchlist by 1D change.
 *
 * Three filters, each for a different failure: a ticker with no quote row gets
 * price 0 / changePct 0 from the page's default and would otherwise rank as a
 * flat mover; a non-finite change is a bad upstream value; and an exactly-zero
 * change is not a mover in either direction, so it is never allowed to pad a
 * short list.
 *
 * Deduped by ticker because a name can sit on more than one list, and the same
 * symbol appearing twice in a three-row column reads as a data error.
 */
export function rankMovers(stocks: MoverStock[]): { gainers: Mover[]; losers: Mover[] } {
  const seen = new Set<string>();
  const quoted: Mover[] = [];
  for (const s of stocks) {
    if (s.updatedAt === null || !Number.isFinite(s.changePct) || s.changePct === 0) continue;
    if (seen.has(s.ticker)) continue;
    seen.add(s.ticker);
    quoted.push({
      ticker: s.ticker,
      company: s.company,
      price: s.price,
      changePct: s.changePct,
    });
  }

  const byChange = [...quoted].sort((a, b) => b.changePct - a.changePct);
  return {
    gainers: byChange.filter((s) => s.changePct > 0).slice(0, COUNT),
    losers: byChange
      .filter((s) => s.changePct < 0)
      .slice(-COUNT)
      // Worst first, so each half reads outward from the middle: the two
      // extremes of the day sit at the top and bottom of the rail.
      .reverse(),
  };
}

function Row({ mover, direction }: { mover: Mover; direction: "up" | "down" }) {
  const up = direction === "up";
  return (
    <li className="flex flex-1 flex-col justify-center gap-0.5 px-3 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{mover.ticker}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            up ? "text-accent" : "text-destructive"
          }`}
        >
          {up ? "+" : ""}
          {mover.changePct.toFixed(2)}%
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{mover.company}</span>
        <span className="shrink-0 tabular-nums">${mover.price.toFixed(2)}</span>
      </div>
    </li>
  );
}

/** Holds a row's height when a half is short, so the rail never goes ragged. */
function EmptyRow() {
  return (
    <li className="flex flex-1 items-center px-3 py-1.5 text-xs text-muted-foreground">—</li>
  );
}

function Half({
  label,
  movers,
  direction,
}: {
  label: string;
  movers: Mover[];
  direction: "up" | "down";
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* The caption is neutral; the colour lives on the numbers, which is where
          it means something (One Signal Rule). It sits outside the list rather
          than as a first <li>, so it is not announced as one of the movers. */}
      <h3 className="shrink-0 px-3 pt-2 pb-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </h3>
      {/* Three across once there is width for it, one column on a phone, and a
          stacked flex column again at xl where the panel is the tall rail. */}
      <ol className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:divide-x-0 xl:divide-y">
        {Array.from({ length: COUNT }, (_, i) => {
          const mover = movers[i];
          return mover ? (
            <Row key={mover.ticker} mover={mover} direction={direction} />
          ) : (
            <EmptyRow key={`${label}-empty-${i}`} />
          );
        })}
      </ol>
    </div>
  );
}

export default function MoversPanel({ stocks }: { stocks: MoverStock[] }) {
  const { gainers, losers } = rankMovers(stocks);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl bg-card">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
          Movers
        </h2>
        {/* Says which change this is: the table beside it also carries 1M and
            YTD columns, and this rail ranks on neither. */}
        <span className="text-xs uppercase tracking-wide text-muted-foreground">1D</span>
      </div>

      {/* At xl this is the vertical rail: flex-1 rows share whatever height the
          digest sets, rather than the rail stopping short and leaving a gap
          under it. Below xl the panel drops beneath the digest, where six rows
          stacked would cost ~400px of page for six numbers — so the two halves
          go side by side instead and the whole thing collapses to one strip. */}
      <div className="flex min-h-0 flex-1 flex-col divide-y divide-border md:flex-row md:divide-x md:divide-y-0 xl:flex-col xl:divide-x-0 xl:divide-y">
        <Half label="Gainers" movers={gainers} direction="up" />
        <Half label="Losers" movers={losers} direction="down" />
      </div>
    </section>
  );
}
