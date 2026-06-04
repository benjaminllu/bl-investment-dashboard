"use client";

import { addStock } from "@/app/actions";
import { useRef } from "react";

export default function AddStockForm() {
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    await addStock(formData);
    formRef.current?.reset();
  }

  return (
    <div className="mt-6 rounded-xl bg-slate-900 p-4">
      <h2 className="text-xl font-semibold mb-4">Add Stock</h2>
      <form ref={formRef} action={handleSubmit} className="grid grid-cols-2 gap-3">
        <input
          name="ticker"
          placeholder="Ticker (e.g. AAPL)"
          required
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
        />
        <input
          name="company"
          placeholder="Company name"
          required
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
        />
        <select
          name="priority"
          defaultValue="Medium"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-slate-600"
        >
          <option value="High">High Priority</option>
          <option value="Medium">Medium Priority</option>
          <option value="Low">Low Priority</option>
        </select>
        <input
          name="latest_update"
          placeholder="Latest update / what to watch"
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-slate-600"
        />
        <textarea
          name="thesis"
          placeholder="Investment thesis"
          rows={2}
          className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-slate-600 resize-none"
        />
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-700 py-2 text-sm font-semibold hover:bg-slate-600 transition-colors"
        >
          Add to Watchlist
        </button>
      </form>
    </div>
  );
}
