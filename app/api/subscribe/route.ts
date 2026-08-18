import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPortfolioUnlocked } from "@/lib/portfolioLock";
import { parseEndpoint, parseSubscription } from "@/lib/pushSubscription";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Gated behind the same unlock as /portfolio.
 *
 * These notifications go to Ben's own devices, so a viewer with the link has no
 * reason to register one — and until this gate existed, anyone who found the URL
 * could write rows through the service-role key, which bypasses RLS. The unlock
 * cookie is the only notion of "it's Ben" this app has; SECURITY.md named it as
 * the natural guard for exactly this route.
 */
async function requireUnlocked(): Promise<NextResponse | null> {
  if (await isPortfolioUnlocked()) return null;
  return NextResponse.json({ error: "Locked" }, { status: 401 });
}

/** Malformed JSON must be a 400, not an unhandled rejection turning into a 500. */
async function readJson(req: NextRequest): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUnlocked();
  if (denied) return denied;

  const sub = parseSubscription(await readJson(req));
  if (!sub) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, keys: sub.keys }, { onConflict: "endpoint" });
  if (error) {
    // The client is told nothing beyond "it failed" — a PostgREST message names
    // tables and columns, and this endpoint is reachable from the open internet.
    console.error(`[subscribe] upsert failed (${error.code}): ${error.message}`);
    return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUnlocked();
  if (denied) return denied;

  const endpoint = parseEndpoint(await readJson(req));
  if (!endpoint) return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    console.error(`[subscribe] delete failed (${error.code}): ${error.message}`);
    return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
