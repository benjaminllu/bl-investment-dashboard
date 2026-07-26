import { fetchFearGreedIndex } from "@/lib/fearGreed";
import { fetchVixSpread } from "@/lib/cboeVix";
import FearGreedPanel from "@/components/FearGreedPanel";
import VixMetrics from "@/components/VixMetrics";

export default async function RiskPage() {
  const [fearGreed, vixSpread] = await Promise.all([
    fetchFearGreedIndex(),
    fetchVixSpread(),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-foreground">Risk</h1>
          <p className="mt-1 text-sm text-muted-foreground">Volatility and risk indicators.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FearGreedPanel data={fearGreed} />
          <VixMetrics data={vixSpread} />
        </div>
      </div>
    </main>
  );
}
