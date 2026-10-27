import { THIN_VOLUME, type PredictionMarkets } from "@/lib/polymarket";

const pct = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
const signed = (n: number, digits: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(digits)}`;
const usdShort = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`);

/**
 * "+2.5pp on the week", or null with no week-ago price. `prob` is a 0–1
 * probability, `pct` a value already in percent (a CPI print), `bps` basis points.
 */
function weekChange(now: number, then: number | null, kind: "prob" | "pct" | "bps"): string | null {
  if (then === null) return null;
  if (kind === "bps") return `${signed(now - then, 1)} bps on the week`;
  return kind === "prob" ? `${signed((now - then) * 100, 1)}pp on the week` : `${signed(now - then, 2)}pp on the week`;
}

/** Volume line; thin markets are flagged in amber rather than hidden. */
function Traded({ volume }: { volume: number }) {
  const thin = volume < THIN_VOLUME;
  return (
    <span className={thin ? "text-warning" : undefined}>
      {thin ? "thin · " : ""}
      {usdShort(volume)} traded
    </span>
  );
}

function Reading({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <div className="mt-0.5 space-y-0.5 text-xs tabular-nums text-muted-foreground">{children}</div>
    </li>
  );
}

export default function PredictionMarketsPanel({ data }: { data: PredictionMarkets }) {
  return (
    <section className="border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Prediction Markets</h2>
        <p className="text-xs text-muted-foreground">Polymarket · prices as probabilities · refreshed every 15 min</p>
      </div>

      {data.unavailable ? (
        <p className="text-sm text-muted-foreground">Polymarket did not return data. The panel fills in on the next refresh.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="mb-2 text-xs text-muted-foreground">Fed decision · expected move</h3>
            <ul className="divide-y divide-border">
              {data.fed.map((m) => {
                const leader = m.outcomes.reduce((a, b) => (b.p > a.p ? b : a));
                return (
                  <Reading key={m.date} label={m.date} value={`${signed(m.expectedBps, 1)} bps`}>
                    <p>
                      {leader.label} {pct(leader.p)}
                    </p>
                    <p>
                      {weekChange(m.expectedBps, m.expectedBpsWeekAgo, "bps") ?? "no week-ago price"} ·{" "}
                      <Traded volume={m.volume} />
                    </p>
                  </Reading>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs text-muted-foreground">US recession</h3>
            <ul className="divide-y divide-border">
              {data.recession.map((r) => (
                <Reading key={r.label} label={r.label} value={pct(r.p)}>
                  <p>
                    {weekChange(r.p, r.pWeekAgo, "prob") ?? "no week-ago price"} · <Traded volume={r.volume} />
                  </p>
                </Reading>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs text-muted-foreground">Inflation · expected print</h3>
            {data.cpi ? (
              <ul>
                <Reading label={data.cpi.title} value={`${data.cpi.expected.toFixed(2)}%`}>
                  <p>
                    Most likely {data.cpi.mostLikely.label} at {pct(data.cpi.mostLikely.p)}
                  </p>
                  <p>
                    {weekChange(data.cpi.expected, data.cpi.expectedWeekAgo, "pct") ?? "no week-ago price"} ·{" "}
                    <Traded volume={data.cpi.volume} />
                  </p>
                </Reading>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No open core CPI market.</p>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Expected values weight each outcome by its probability; a &quot;50+ bps&quot; outcome counts as 50, and an
        open-ended CPI range at its edge.{" "}
        {`Markets with under ${usdShort(THIN_VOLUME)} traded are marked thin: a few bettors, not a consensus.`}{" "}
        Polymarket&apos;s users lean crypto-native.
      </p>
    </section>
  );
}
