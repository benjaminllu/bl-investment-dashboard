"use client";

import { useState } from "react";
import type { FredMetric } from "@/lib/fred";
import FredChart from "./FredChart";

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MarketsMetrics({ metrics }: { metrics: FredMetric[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(metrics[0]?.id ?? null);
  const selected = metrics.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => {
          const delta =
            metric.value !== null && metric.previousValue !== null
              ? metric.value - metric.previousValue
              : null;
          const active = metric.id === selectedId;

          return (
            <button
              key={metric.id}
              onClick={() => setSelectedId(active ? null : metric.id)}
              className={`rounded-xl bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? "ring-2 ring-accent" : ""
              }`}
            >
              <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {formatValue(metric.value, metric.unit)}
              </p>
              <div className="mt-1 flex items-center justify-between text-xs tabular-nums">
                <span className="text-muted-foreground">
                  {metric.date ? formatDate(metric.date) : "No data"}
                </span>
                {delta !== null && (
                  <span
                    className={
                      delta > 0
                        ? "text-accent"
                        : delta < 0
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }
                  >
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
                    {metric.unit}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <FredChart seriesId={selected.id} label={selected.label} unit={selected.unit} />
      )}
    </div>
  );
}
