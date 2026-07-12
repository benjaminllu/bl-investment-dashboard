import { supabase } from "@/lib/supabase";

type Position = {
  id: string;
  conid: number;
  ticker: string;
  company: string | null;
  quantity: number;
  avg_cost: number | null;
  currency: string | null;
  synced_at: string;
};

function formatSyncedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default async function PortfolioPage() {
  const { data: positions, error } = await supabase
    .from("ibkr_positions")
    .select("*")
    .order("ticker", { ascending: true });

  const hasPositions = !error && positions && positions.length > 0;

  let quoteMap = new Map<string, { price: number; changePct: number }>();
  if (hasPositions) {
    const tickers = positions.map((p) => p.ticker);
    const { data: quotes } = await supabase
      .from("stock_quotes")
      .select("ticker, price, change_pct")
      .in("ticker", tickers);
    quoteMap = new Map(
      (quotes ?? []).map((q) => [q.ticker, { price: q.price ?? 0, changePct: q.change_pct ?? 0 }])
    );
  }

  const rows = hasPositions
    ? (positions as Position[]).map((p) => {
        const quote = quoteMap.get(p.ticker);
        const price = quote?.price ?? null;
        const marketValue = price !== null ? price * p.quantity : null;
        const costBasis = p.avg_cost !== null ? p.avg_cost * p.quantity : null;
        const pnl = marketValue !== null && costBasis !== null ? marketValue - costBasis : null;
        const pnlPct = pnl !== null && costBasis ? (pnl / costBasis) * 100 : null;
        return { ...p, price, marketValue, pnl, pnlPct };
      })
    : [];

  const totalValue = rows.reduce((sum, r) => sum + (r.marketValue ?? 0), 0);
  const totalPnl = rows.reduce((sum, r) => sum + (r.pnl ?? 0), 0);
  const syncedAt = rows[0]?.synced_at;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          {syncedAt && (
            <p className="text-xs text-muted-foreground">
              Synced {formatSyncedAt(syncedAt)} &middot; run{" "}
              <code className="text-muted-foreground/80">node scripts/sync-ibkr-positions.js</code> to
              refresh
            </p>
          )}
        </div>

        {!hasPositions ? (
          <div className="rounded-xl bg-card p-4">
            <p className="text-muted-foreground">
              No positions to show. This is either because no sync has run yet, or the last sync
              found zero open positions. To sync (or re-sync): start the IBKR Client Portal Gateway,
              log in at <code className="text-muted-foreground/80">https://localhost:5000</code>,
              then run{" "}
              <code className="text-muted-foreground/80">node scripts/sync-ibkr-positions.js</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="rounded-xl bg-card px-4 py-2">
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="text-lg font-semibold text-foreground">
                  ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-xl bg-card px-4 py-2">
                <p className="text-xs text-muted-foreground">Unrealized P&amp;L</p>
                <p className={`text-lg font-semibold ${totalPnl >= 0 ? "text-accent" : "text-destructive"}`}>
                  {totalPnl >= 0 ? "+" : ""}
                  ${totalPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-card">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">Ticker</th>
                    <th className="px-2 py-1.5">Quantity</th>
                    <th className="px-2 py-1.5">Avg Cost</th>
                    <th className="px-2 py-1.5">Price</th>
                    <th className="px-2 py-1.5">Market Value</th>
                    <th className="px-2 py-1.5">P&amp;L</th>
                    <th className="px-2 py-1.5">P&amp;L %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-2 py-1.5 font-semibold">{r.ticker}</td>
                      <td className="px-2 py-1.5">{r.quantity}</td>
                      <td className="px-2 py-1.5">
                        {r.avg_cost !== null ? `$${r.avg_cost.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5">{r.price !== null ? `$${r.price.toFixed(2)}` : "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.marketValue !== null ? `$${r.marketValue.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.pnl !== null ? (
                          <span className={r.pnl >= 0 ? "text-accent" : "text-destructive"}>
                            {r.pnl >= 0 ? "+" : ""}${r.pnl.toFixed(2)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.pnlPct !== null ? (
                          <span className={r.pnlPct >= 0 ? "text-accent" : "text-destructive"}>
                            {r.pnlPct >= 0 ? "+" : ""}
                            {r.pnlPct.toFixed(2)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
