import { fetchFredMetrics } from "@/lib/fred";
import MarketsMetrics from "@/components/MarketsMetrics";

export default async function MarketsPage() {
  const metrics = await fetchFredMetrics();
  const hasApiKey = !!process.env.FRED_API_KEY;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl p-4">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Markets</h1>

        {!hasApiKey ? (
          <div className="rounded-xl bg-card p-4">
            <p className="text-muted-foreground">
              Add <code className="text-muted-foreground/80">FRED_API_KEY</code> to{" "}
              <code className="text-muted-foreground/80">.env.local</code> to enable macro
              data. Get a free key at{" "}
              <a
                href="https://fred.stlouisfed.org/docs/api/api_key.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                fred.stlouisfed.org
              </a>
              .
            </p>
          </div>
        ) : (
          <MarketsMetrics metrics={metrics} />
        )}
      </div>
    </main>
  );
}
