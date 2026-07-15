"use client";

import { addStock } from "@/app/actions";
import { useRef, useState } from "react";

export default function AddStockForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await addStock(formData);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
    } else {
      formRef.current?.reset();
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-card p-4">
      <h2 className="mb-4 text-xl font-semibold text-foreground">Add Stock</h2>
      <form ref={formRef} action={handleSubmit} noValidate className="grid grid-cols-2 gap-3">
        <input
          name="ticker"
          placeholder="Ticker (e.g. AAPL)"
          required
          className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          name="company"
          placeholder="Company name"
          required
          className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          name="priority"
          defaultValue="Medium"
          className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="High">High Priority</option>
          <option value="Medium">Medium Priority</option>
          <option value="Low">Low Priority</option>
        </select>
        <input
          name="latest_update"
          placeholder="Latest update / what to watch"
          className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
        />
        <textarea
          name="thesis"
          placeholder="Investment thesis"
          rows={2}
          className="col-span-2 resize-none rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={loading}
          className="col-span-2 rounded-lg bg-accent py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add to Watchlist"}
        </button>
        {error && <p className="col-span-2 text-sm text-destructive">{error}</p>}
      </form>
    </div>
  );
}
