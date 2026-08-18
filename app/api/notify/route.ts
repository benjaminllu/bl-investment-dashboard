import { NextResponse } from "next/server";
import webpush from "@/lib/webpush";
import { createClient } from "@supabase/supabase-js";
import { isPortfolioUnlocked } from "@/lib/portfolioLock";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Gated behind the same unlock as /portfolio and /api/subscribe.
 *
 * This route fans out one outbound request per stored subscription, so leaving
 * it open let anyone with the URL both spam Ben's devices and make the
 * deployment send traffic on demand. There is no per-recipient targeting to get
 * right — a broadcast to every row is the whole feature — so the gate is the
 * only thing standing between "Ben pressed Send Test" and "someone else did".
 */
export async function POST() {
  if (!(await isPortfolioUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys");

  if (error) {
    console.error(`[notify] query failed (${error.code}): ${error.message}`);
    return NextResponse.json({ error: "Could not read subscriptions" }, { status: 500 });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const payload = JSON.stringify({
    title: "Ben's Investment Research",
    body: "Test notification — push infrastructure is working.",
  });

  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
    )
  );

  return NextResponse.json({ sent: subscriptions.length });
}
