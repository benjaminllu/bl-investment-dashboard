import { NextResponse } from "next/server";
import webpush from "@/lib/webpush";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, keys");

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
