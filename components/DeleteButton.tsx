"use client";

import { deleteStock } from "@/app/actions";

export default function DeleteButton({ id }: { id: string }) {
  return (
    <button
      onClick={() => deleteStock(id)}
      className="text-slate-500 hover:text-red-400 transition-colors text-xs"
    >
      Remove
    </button>
  );
}
