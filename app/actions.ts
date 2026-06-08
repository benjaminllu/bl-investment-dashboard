"use server";

import { supabaseAdmin } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function addStock(formData: FormData) {
  const ticker = (formData.get("ticker") as string).toUpperCase().trim();
  const company = (formData.get("company") as string).trim();
  const priority = formData.get("priority") as string;
  const thesis = ((formData.get("thesis") as string) ?? "").trim();
  const latest_update = ((formData.get("latest_update") as string) ?? "").trim();

  if (!ticker || !company) return { error: "Ticker and company are required." };

  const { error } = await supabaseAdmin.from("stocks").insert({ ticker, company, priority, thesis, latest_update });
  if (error) return { error: error.message };

  revalidatePath("/");
  return { error: null };
}

export async function deleteStock(id: string) {
  await supabaseAdmin.from("stocks").delete().eq("id", id);
  revalidatePath("/");
}
