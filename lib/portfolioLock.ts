import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The whole trust model for /portfolio lives here.
 *
 * The dashboard is a public URL that gets shared with family and friends. Every
 * page is fine for them to see except the portfolio, which exposes share counts,
 * cost basis and net worth. Rather than a switch Ben has to remember to flip
 * before sharing, positions are hidden by default for *every* browser and Ben
 * unlocks his own with a password. Nothing to remember, and a viewer can never
 * turn it back on.
 *
 * The cookie holds a signed expiry, never the password itself, so a stolen
 * cookie reveals nothing reusable and cannot be extended without the secret.
 */

export const COOKIE_NAME = "portfolio_unlock";

/** 30 days. Long enough that Ben types the password roughly monthly. */
export const MAX_AGE_S = 60 * 60 * 24 * 30;

/**
 * Not a secret, and deliberately not the cookie secret: this key exists only to
 * run both sides of the password comparison through a hash first, so the
 * buffers are always 32 bytes. Comparing the raw strings would leak the
 * password's *length* through the timing of the length check.
 */
const COMPARE_KEY = "portfolio-password-compare";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Both vars must be set for the gate to work. They are read through a function
 * rather than captured at module load so that a missing var is diagnosed at
 * request time with a readable message, instead of poisoning the module.
 */
export function isLockConfigured(): boolean {
  return Boolean(process.env.PORTFOLIO_PASSWORD && process.env.PORTFOLIO_COOKIE_SECRET);
}

/**
 * Two separate vars rather than deriving the signing key from the password:
 * forging a cookie then needs the high-entropy secret, while guessing the
 * password stays an online attack. Rotating either one invalidates every
 * existing session, which is the behaviour you want from a rotation.
 */
export function mintToken(): string | null {
  const secret = process.env.PORTFOLIO_COOKIE_SECRET;
  if (!secret) return null;
  const expiresAt = String(Date.now() + MAX_AGE_S * 1000);
  return `${expiresAt}.${sign(expiresAt, secret)}`;
}

export function verifyToken(token: string | undefined): boolean {
  const secret = process.env.PORTFOLIO_COOKIE_SECRET;
  if (!secret || !token) return false;

  const sep = token.lastIndexOf(".");
  if (sep <= 0) return false;
  const expiresAt = token.slice(0, sep);
  const signature = token.slice(sep + 1);

  // Reject anything non-numeric before it reaches Number(), so a payload like
  // "1e999" or " 123" can never be signed-then-misread.
  if (!/^\d+$/.test(expiresAt)) return false;

  const presented = Buffer.from(signature);
  const expected = Buffer.from(sign(expiresAt, secret));

  // timingSafeEqual throws on a length mismatch rather than returning false, so
  // the lengths have to be compared first.
  if (presented.length !== expected.length) return false;
  if (!timingSafeEqual(presented, expected)) return false;

  // Expiry is checked only *after* the signature, because until the signature
  // verifies, the expiry is just a number the client made up.
  return Number(expiresAt) > Date.now();
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.PORTFOLIO_PASSWORD;
  if (!expected || !input) return false;
  return timingSafeEqual(
    createHmac("sha256", COMPARE_KEY).update(input).digest(),
    createHmac("sha256", COMPARE_KEY).update(expected).digest()
  );
}

/**
 * Fails closed. A missing env var, a tampered cookie and an expired cookie all
 * land here as `false` — the one outcome that must never happen is a
 * misconfigured deploy silently rendering positions to the public.
 */
export async function isPortfolioUnlocked(): Promise<boolean> {
  // cookies() is read unconditionally, *before* the configuration check, and the
  // order matters. Calling it is what opts the route out of static prerendering,
  // and that must not depend on whether an env var happens to be set: with the
  // check first, a build with no PORTFOLIO_PASSWORD prerendered /portfolio as
  // static and served one shared copy to every visitor, which no amount of
  // later configuration would have un-cached.
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!isLockConfigured()) return false;
  return verifyToken(token);
}
