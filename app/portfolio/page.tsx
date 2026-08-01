import { supabase } from "@/lib/supabase";
import PortfolioSection, {
  CASH_TICKER,
  isUsd,
  money,
  usd,
  type EnrichedPosition,
  type PortfolioPosition,
} from "@/components/PortfolioSection";

type Portfolio = {
  slot: number;
  label: string;
  broker: string | null;
};

const SLOTS = [1, 2, 3, 4, 5];

export default async function PortfolioPage() {
  const [{ data: portfolios, error: portfoliosError }, { data: positions, error: positionsError }] =
    await Promise.all([
      supabase.from("portfolios").select("slot, label, broker").order("slot", { ascending: true }),
      supabase
        .from("portfolio_positions")
        .select("slot, ticker, company, quantity, avg_cost, currency, account, imported_at")
        .order("ticker", { ascending: true }),
    ]);

  // A failed query is not the same as an empty portfolio and must not render as
  // one — if the tables have not been created yet, "no positions" would be a
  // claim about holdings produced by a query that never ran.
  const error = portfoliosError ?? positionsError;
  if (error) {
    console.error(`[portfolio] query failed (${error.code}): ${error.message}`);
  }

  const rows = error ? [] : ((positions ?? []) as (PortfolioPosition & { slot: number })[]);

  const quoteMap = new Map<string, number>();
  if (rows.length > 0) {
    const { data: quotes } = await supabase
      .from("stock_quotes")
      .select("ticker, price")
      .in("ticker", [...new Set(rows.map((r) => r.ticker))]);
    for (const q of quotes ?? []) {
      if (typeof q.price === "number") quoteMap.set(q.ticker, q.price);
    }
  }

  const bySlot = new Map<number, EnrichedPosition[]>();
  for (const p of rows) {
    const isCash = p.ticker === CASH_TICKER;
    // Named to avoid shadowing the imported usd() currency formatter.
    const inUsd = isUsd(p.currency);

    // Cash counts toward Value but has no price and no unrealized P&L, so it is
    // valued directly off the stored balance rather than through a quote
    // lookup that would never match.
    const price = isCash ? null : inUsd ? quoteMap.get(p.ticker) ?? null : null;
    const marketValue = isCash ? p.quantity : price !== null ? price * p.quantity : null;
    const costBasis =
      !isCash && inUsd && p.avg_cost !== null ? p.avg_cost * p.quantity : null;
    const pnl =
      isCash || marketValue === null || costBasis === null ? null : marketValue - costBasis;
    const pnlPct = pnl !== null && costBasis ? (pnl / costBasis) * 100 : null;

    const enriched: EnrichedPosition = {
      ...p,
      usd: inUsd,
      isCash,
      price,
      marketValue,
      pnl,
      pnlPct,
    };
    bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), enriched]);
  }

  // Cash sorts last. The query orders by ticker, and "$CASH" would otherwise
  // lead every table since "$" sorts ahead of the letters.
  for (const list of bySlot.values()) {
    list.sort((a, b) =>
      a.isCash === b.isCash ? a.ticker.localeCompare(b.ticker) : a.isCash ? 1 : -1
    );
  }

  const labelBySlot = new Map<number, Portfolio>(
    ((portfolios ?? []) as Portfolio[]).map((p) => [p.slot, p])
  );

  const allPositions = [...bySlot.values()].flat();
  const combinedValue = allPositions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const combinedPnl = allPositions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const filledSlots = SLOTS.filter((s) => (bySlot.get(s) ?? []).length > 0).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          {filledSlots > 0 && (
            <p className="text-xs text-muted-foreground">
              {filledSlots} of {SLOTS.length} slots in use
            </p>
          )}
        </div>

        {error ? (
          <div className="rounded-xl bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Positions could not be loaded, so this is not a statement about what you hold. If the{" "}
              <code className="text-muted-foreground/80">portfolios</code> and{" "}
              <code className="text-muted-foreground/80">portfolio_positions</code> tables do not
              exist yet, create them by running{" "}
              <code className="text-muted-foreground/80">scripts/portfolio-positions-table.sql</code>{" "}
              in the Supabase SQL editor. See{" "}
              <code className="text-muted-foreground/80">PORTFOLIO.md</code> for the full import
              instructions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allPositions.length > 0 && (
              <div className="flex flex-wrap gap-4">
                <div className="rounded-xl bg-card px-4 py-2">
                  <p className="text-xs text-muted-foreground">Combined Value</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {usd(combinedValue)}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-2">
                  <p className="text-xs text-muted-foreground">Combined Unrealized P&amp;L</p>
                  <p
                    className={`text-lg font-semibold tabular-nums ${combinedPnl >= 0 ? "text-accent" : "text-destructive"}`}
                  >
                    {combinedPnl >= 0 ? "+" : "−"}${money(Math.abs(combinedPnl))}
                  </p>
                </div>
                <div className="rounded-xl bg-card px-4 py-2">
                  <p className="text-xs text-muted-foreground">Positions</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {allPositions.length}
                  </p>
                </div>
              </div>
            )}

            {/* All five slots always render, so the layout is stable whether one
                portfolio is loaded or five. */}
            {SLOTS.map((slot) => (
              <PortfolioSection
                key={slot}
                label={labelBySlot.get(slot)?.label ?? `Portfolio ${slot}`}
                broker={labelBySlot.get(slot)?.broker ?? null}
                positions={bySlot.get(slot) ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
