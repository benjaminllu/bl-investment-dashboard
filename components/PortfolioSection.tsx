import type { PortfolioAnalytics } from "@/lib/portfolioAnalytics";

export type PortfolioPosition = {
  ticker: string;
  company: string | null;
  quantity: number;
  avg_cost: number | null;
  currency: string | null;
  account: string | null;
  imported_at: string;
};

export type EnrichedPosition = PortfolioPosition & {
  usd: boolean;
  isCash: boolean;
  price: number | null;
  /** When the quote behind `price` was last refreshed. */
  priceUpdatedAt: string | null;
  /** The quote is old enough that it should not be presented as live. */
  priceStale: boolean;
  marketValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
};

/**
 * Cash is stored as an ordinary position row under this sentinel ticker, with
 * `quantity` holding the dollar balance and `avg_cost` null. A bare "CASH"
 * would collide with Pathward Financial's real symbol, hence the "$".
 */
export const CASH_TICKER = "$CASH";

export function money(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Dollar amount with the sign outside the symbol: "−$2,937.48", not "$-2,937.48".
 * Negative values are real here — a margin debit is stored as a negative cash
 * balance, and it legitimately reduces a portfolio's value.
 */
export function usd(value: number): string {
  return `${value < 0 ? "−" : ""}$${money(Math.abs(value))}`;
}

/**
 * Share counts: thousands separated, fractions kept but never padded — "5,000"
 * and "1,500.905", not "5000" and "1500.9050000000002". Aggregating tax lots
 * accumulates binary error, and rendering the raw number puts it on screen.
 */
export function shares(quantity: number): string {
  return quantity.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatImportedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3 days ago" — the part that actually tells you whether a slot is stale. */
function relativeAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (hours <= 0) return "just now";
    return `${hours}h ago`;
  }
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

// Quotes come from Finnhub in USD, so pricing a non-USD cost basis against them
// would produce a confidently wrong P&L. Those rows still list — quantity and
// cost are perfectly good — but everything derived from a price is withheld.
export function isUsd(currency: string | null): boolean {
  return currency === null || currency === "" || currency.toUpperCase() === "USD";
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function Signed({ value, render }: { value: number; render: (abs: number) => string }) {
  return (
    <span className={value >= 0 ? "text-accent" : "text-destructive"}>
      {value >= 0 ? "+" : "−"}
      {render(Math.abs(value))}
    </span>
  );
}

/**
 * One portfolio slot. An empty slot still renders, as a placeholder card, so the
 * page keeps a stable five-slot layout whether one portfolio is loaded or five.
 */
export default function PortfolioSection({
  label,
  broker,
  positions,
  analytics,
}: {
  label: string;
  broker: string | null;
  positions: EnrichedPosition[];
  /** Same maths as the panel above, scoped to this slot. */
  analytics?: PortfolioAnalytics;
}) {
  if (positions.length === 0) {
    return (
      <section className="rounded-xl bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <span className="text-xs text-muted-foreground">Never imported</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          No positions imported into this slot yet. See PORTFOLIO.md for how to load a CSV.
        </p>
      </section>
    );
  }

  const valued = positions.filter((p) => p.marketValue !== null);
  const totalValue = valued.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const totalPnl = positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const excluded = positions.length - valued.length;
  const staleCount = positions.filter((p) => p.priceStale).length;
  const importedAt = positions.reduce<string | null>(
    (latest, p) => (latest === null || p.imported_at > latest ? p.imported_at : latest),
    null
  );

  return (
    <section className="overflow-hidden rounded-xl bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 pb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          {broker && (
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{broker}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {positions.length} position{positions.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-baseline gap-4 text-xs tabular-nums">
          <span className="text-muted-foreground">
            Value <span className="font-semibold text-foreground">{usd(totalValue)}</span>
          </span>
          {/* The percentage matters more than the dollars once slots differ by
              an order of magnitude — $309k on $2.8M and $309k on $242k are not
              the same result. */}
          <span className="text-muted-foreground">
            P&amp;L{" "}
            <span className="font-semibold">
              <Signed value={totalPnl} render={(v) => `$${money(v)}`} />
            </span>
            {analytics?.totalReturnPct != null && (
              <span className="font-semibold">
                {" "}
                <Signed
                  value={analytics.totalReturnPct}
                  render={(v) => `${v.toFixed(1)}%`}
                />
              </span>
            )}
          </span>
          {/* Leads with the relative age, since "11 days ago" is what tells you
              a slot is stale; the exact timestamp is the tooltip. */}
          {importedAt && (
            <span className="text-muted-foreground" title={formatImportedAt(importedAt)}>
              Updated{" "}
              <span className="font-semibold text-foreground">{relativeAge(importedAt)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Per-slot character, not a repeat of the panel above. The slots differ
          enough — an index-led book beside a concentrated one — that the
          combined figures describe neither, and beta and concentration are the
          two that diverge most sharply between them. */}
      {analytics && analytics.positionCount > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-xs tabular-nums text-muted-foreground">
          {analytics.beta.value !== null && (
            <span
              title={
                analytics.beta.coveragePct < 95
                  ? `Value-weighted over the ${analytics.beta.coveragePct.toFixed(0)}% of this slot with a published beta.`
                  : "Value-weighted. Beta is linear in weights, so this is the slot's beta exactly."
              }
            >
              Beta <span className="font-semibold text-foreground">{analytics.beta.value.toFixed(2)}</span>
            </span>
          )}
          {analytics.largestPositionTicker && analytics.largestPositionPct !== null && (
            <span title="Largest single holding as a share of this slot's securities.">
              Top{" "}
              <span className="font-semibold text-foreground">
                {analytics.largestPositionTicker} {analytics.largestPositionPct.toFixed(1)}%
              </span>
            </span>
          )}
          {analytics.effectiveHoldings !== null && (
            <span title="Herfindahl-based: the number of equally sized positions that would give the same concentration.">
              Effective{" "}
              <span className="font-semibold text-foreground">
                {analytics.effectiveHoldings.toFixed(1)}
              </span>{" "}
              of {analytics.positionCount}
            </span>
          )}
          {analytics.largestSectorLabel && analytics.largestSectorPct !== null && (
            <span title="Largest sector weight within this slot.">
              Sector{" "}
              <span className="font-semibold text-foreground">
                {analytics.largestSectorLabel} {analytics.largestSectorPct.toFixed(0)}%
              </span>
            </span>
          )}
          {analytics.cashValue !== 0 && (
            <span title={`Cash balance ${usd(analytics.cashValue)}. Negative means a margin debit.`}>
              Cash{" "}
              <span className="font-semibold text-foreground">
                {analytics.cashPct < 0 ? "−" : ""}
                {Math.abs(analytics.cashPct).toFixed(1)}%
              </span>
            </span>
          )}
          {analytics.winners + analytics.losers > 0 && (
            <span title="Positions above and below their cost basis. Counts, not weights — this is breadth, so one large winner cannot mask a broadly losing slot.">
              <span className="font-semibold text-accent">{analytics.winners}</span>
              <span className="text-muted-foreground"> up / </span>
              <span className="font-semibold text-destructive">{analytics.losers}</span>
              <span className="text-muted-foreground"> down</span>
            </span>
          )}
        </div>
      )}

      {/* Totals that quietly omit rows would explain nothing — say how many were
          left out and why. */}
      {excluded > 0 && (
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          {excluded} of {positions.length} excluded from Value — no live quote matched the ticker,
          or the position is not held in USD.
        </p>
      )}

      {staleCount > 0 && (
        <p className="px-4 pb-2 text-xs text-warning">
          {staleCount} position{staleCount === 1 ? " is" : "s are"} priced from a quote over a day
          old (marked <span className="tabular-nums">*</span>). Value and P&amp;L for{" "}
          {staleCount === 1 ? "it" : "them"} are stale.
        </p>
      )}

      <div className="overflow-x-auto">
        {/* table-fixed + explicit column widths keep the layout identical across
            the five slots instead of each table resizing to its own contents —
            the same approach StockTable uses across watchlist tabs. Company is
            the one column left without a width, so it absorbs the slack; it
            truncates, so it is the safest place for the layout to flex. min-w
            stops the numeric columns being squeezed on a narrow viewport — the
            wrapper scrolls instead. */}
        <table className="w-full min-w-230 table-fixed text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="w-28 px-2 py-1.5">Ticker</th>
              <th className="px-2 py-1.5">Company</th>
              <th className="w-24 px-2 py-1.5">Quantity</th>
              <th className="w-24 px-2 py-1.5">Avg Cost</th>
              <th className="w-24 px-2 py-1.5">Price</th>
              <th className="w-32 px-2 py-1.5">Market Value</th>
              <th className="w-28 px-2 py-1.5">P&amp;L</th>
              <th className="w-20 px-2 py-1.5">P&amp;L %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.ticker} className="border-t border-border">
                {/* Option symbols ("DPRO 01/15/2027 10.00 C") are long enough to
                    wrap onto three lines and wreck the row rhythm. Truncating
                    loses nothing here: Company spells the position out in full
                    on the same row, and the symbol is on the tooltip. */}
                <td
                  className="truncate px-2 py-1.5 font-semibold"
                  title={p.isCash ? undefined : p.ticker}
                >
                  {p.isCash ? "Cash" : p.ticker}
                  {!p.isCash && !p.usd && p.currency && (
                    <span
                      className="ml-1 font-normal text-muted-foreground"
                      title={`Held in ${p.currency}; price and P&L are only computed for USD positions`}
                    >
                      {p.currency}
                    </span>
                  )}
                </td>
                {/* Truncates rather than wraps, so one long description cannot
                    make its row taller than every other row on the page. */}
                <td
                  className="truncate px-2 py-1.5 text-muted-foreground"
                  title={p.company ?? undefined}
                >
                  {p.company ?? <Dash />}
                </td>
                {/* Cash has a balance, not a share count or a per-share cost —
                    showing the dollar figure under "Quantity" would read as
                    4,522 shares. */}
                <td className="px-2 py-1.5 tabular-nums">
                  {p.isCash ? <Dash /> : shares(p.quantity)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {!p.isCash && p.avg_cost !== null ? `$${p.avg_cost.toFixed(2)}` : <Dash />}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.price === null ? (
                    <Dash />
                  ) : p.priceStale ? (
                    // Warning colour, not the emerald/red used for direction —
                    // this is about the price's trustworthiness, not its move.
                    <span
                      className="text-warning"
                      title={`Stale price — last refreshed ${p.priceUpdatedAt ? formatImportedAt(p.priceUpdatedAt) : "unknown"}. Market value and P&L for this row are based on it.`}
                    >
                      ${p.price.toFixed(2)}*
                    </span>
                  ) : (
                    `$${p.price.toFixed(2)}`
                  )}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.marketValue !== null ? usd(p.marketValue) : <Dash />}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.pnl !== null ? <Signed value={p.pnl} render={(v) => `$${money(v)}`} /> : <Dash />}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {p.pnlPct !== null ? (
                    <Signed value={p.pnlPct} render={(v) => `${v.toFixed(2)}%`} />
                  ) : (
                    <Dash />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
