"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  COOKIE_NAME,
  MAX_AGE_S,
  isLockConfigured,
  mintToken,
  passwordMatches,
} from "@/lib/portfolioLock";

export type UnlockState = { error: string | null };

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
