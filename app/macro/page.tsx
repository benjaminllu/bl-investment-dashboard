import { fetchFredMetrics } from "@/lib/fred";
import { fetchFedDotPlot } from "@/lib/fedDotPlot";
import { fetchMacroKeyDates } from "@/lib/keyDates";
import MacroMetrics from "@/components/MacroMetrics";
import MacroKeyBand from "@/components/MacroKeyBand";

export default async function MacroPage() {
  const hasApiKey = !!process.env.FRED_API_KEY;
  const [metrics, dotPlot, keyDates] = await Promise.all([
    fetchFredMetrics(),
    fetchFedDotPlot(),
    fetchMacroKeyDates(),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-screen-2xl space-y-4 p-4">
        <h1 className="text-2xl font-bold text-foreground">Macro</h1>

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
          <>
            <MacroKeyBand dotPlot={dotPlot} keyDates={keyDates} />
            <MacroMetrics metrics={metrics} />
          </>
        )}
      </div>
    </main>
  );
}
