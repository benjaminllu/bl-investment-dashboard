"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  COOKIE_NAME,
  MAX_AGE_S,
  isLockConfigured,
  isPortfolioUnlocked,
  mintToken,
  passwordMatches,
} from "@/lib/portfolioLock";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
  addCash,
  parsePortfolioCsv,
  resolveSlot,
  seedMissingQuotes,
  writeSlot,
} from "@/scripts/lib/portfolioImport";

export type UnlockState = { error: string | null };

export type ImportState = {
  error: string | null;
  /** Set by both intents: what the file contains and where it would go. */
  preview: {
    broker: string;
    account: string | null;
    slot: number;
    replacing: boolean;
    positions: { ticker: string; company: string | null; quantity: number; avgCost: number | null }[];
    skipped: { symbol: string; reason: string }[];
  } | null;
  /** Set only once a write has landed. */
  done: string | null;
};

/** Broker exports are a few KB; anything near the 1MB action limit is not one. */
const MAX_IMPORT_BYTES = 512 * 1024;

/**
 * Serverless gives us no shared store, so there is no honest way to rate limit
 * across instances. A fixed delay on every failure is the friction we can
 * actually deliver — it caps a single attacker at ~4 guesses/second per
 * instance. The real defence is a long random password from a password
 * manager, which costs nothing here because it is typed about once a month.
 */
const FAILED_ATTEMPT_DELAY_MS = 250;

export async function unlockPortfolio(
  _prevState: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  if (!isLockConfigured()) {
    return { error: "The portfolio password is not configured on this deployment." };
  }

  const password = (formData.get("password") as string | null) ?? "";
  const token = passwordMatches(password) ? mintToken() : null;

  if (!token) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    return { error: "Incorrect password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Vercel is HTTPS-only, but localhost over plain HTTP would silently drop a
    // Secure cookie and make the gate look broken in development.
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_S,
  });

  // The nav lives in the root layout and shows a different control either side
  // of the gate, so the layout has to re-render too — not just the page.
  revalidatePath("/", "layout");
  redirect("/portfolio");
}

export async function lockPortfolio(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  revalidatePath("/", "layout");
  redirect("/portfolio");
}

/**
 * The in-app version of scripts/import-portfolio-csv.js, running the same
 * parser and slot rules. `intent=preview` is the CLI's --dry-run; only
 * `intent=import` writes.
 *
 * Gated here, not just by the page: an action is a public endpoint, and this
 * one writes positions with the service-role key.
 */
export async function importPortfolio(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const fail = (error: string): ImportState => ({ error, preview: null, done: null });

  if (!(await isPortfolioUnlocked())) return fail("Locked. Unlock the portfolio and try again.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file.");
  if (file.size > MAX_IMPORT_BYTES) return fail("That file is too large to be a positions export.");

  const slotField = formData.get("slot");
  const requestedSlot = slotField === "auto" || slotField === null ? null : Number(slotField);
  if (requestedSlot !== null && !(Number.isInteger(requestedSlot) && requestedSlot >= 1 && requestedSlot <= 5)) {
    return fail("Slot must be 1-5.");
  }

  const cashField = String(formData.get("cash") ?? "").replace(/[$,\s]/g, "");

  let parsed;
  try {
    parsed = parsePortfolioCsv(await file.text());
    if (cashField !== "") addCash(parsed, Number(cashField));
  } catch (e) {
    return fail((e as Error).message);
  }

  const target = await resolveSlot(supabaseAdmin, parsed.account, requestedSlot);
  if (target.error) return fail(target.error);
  const slot = target.slot as number;

  const preview: ImportState["preview"] = {
    broker: parsed.broker,
    account: parsed.account,
    slot,
    replacing: Boolean(target.replacing),
    positions: parsed.positions.map((p: { ticker: string; company: string | null; quantity: number; avg_cost: number | null }) => ({
      ticker: p.ticker,
      company: p.company,
      quantity: p.quantity,
      avgCost: p.avg_cost,
    })),
    skipped: parsed.skipped,
  };

  if (formData.get("intent") !== "import") return { error: null, preview, done: null };

  try {
    // A re-import of the account already in this slot keeps whatever name the
    // slot was given, rather than resetting it to the raw account number.
    const label = target.sameAccount ? null : parsed.account;
    const { sold } = await writeSlot(supabaseAdmin, slot, parsed, label);
    const seeded = await seedMissingQuotes(supabaseAdmin, parsed.positions);
    revalidatePath("/portfolio");
    return {
      error: null,
      preview,
      done:
        `Imported ${parsed.positions.length} positions into slot ${slot}.` +
        (sold.length > 0 ? ` Removed ${sold.length} no longer held: ${sold.join(", ")}.` : "") +
        (seeded.length > 0 ? ` Seeded ${seeded.length} price(s) from the file for tickers with no quote yet.` : ""),
    };
  } catch (e) {
    return { error: (e as Error).message, preview, done: null };
  }
}
