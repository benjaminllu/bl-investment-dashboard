"use client";

import { useState, useEffect } from "react";
import WipBadge from "./WipBadge";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export default function NotificationButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
      navigator.serviceWorker.register("/sw.js");
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
      );
    }
  }, []);

  async function enable() {
    setLoading(true);
    setNotice(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      // The server stores subscriptions only for an unlocked session. Without
      // this check a locked viewer would hold a live browser subscription the
      // server has no row for, and the button would sit there saying "Disable"
      // for something that was never enabled. Rolling the browser subscription
      // back keeps the two ends honest about each other.
      if (!res.ok) {
        await sub.unsubscribe();
        setNotice(res.status === 401 ? "Unlock the portfolio first." : "Could not enable.");
        return;
      }
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    setNotice(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const res = await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        // The browser subscription is unsubscribed either way — refusing to turn
        // notifications off because the session expired would be the wrong way
        // round. If the row could not be deleted, say so: it is now orphaned and
        // will keep receiving broadcasts until it is removed while unlocked.
        await sub.unsubscribe();
        if (!res.ok) setNotice("Turned off here, but the server still has it. Unlock and retry.");
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setSending(true);
    setNotice(null);
    const res = await fetch("/api/notify", { method: "POST" });
    if (!res.ok) setNotice(res.status === 401 ? "Unlock the portfolio first." : "Send failed.");
    setSending(false);
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      {/* One badge on the group rather than one per button: Enable and Send Test
          are never visible at the same time, and the whole push feature is what
          is unfinished, not either button individually. */}
      <WipBadge title="Push notifications only send a test message — there is no alerting logic behind them yet." />
      {subscribed ? (
        <>
          <button
            onClick={sendTest}
            disabled={sending}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Test"}
          </button>
          <button
            onClick={disable}
            disabled={loading}
            className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Disable Notifications
          </button>
        </>
      ) : (
        <button
          onClick={enable}
          disabled={loading}
          className="rounded bg-accent px-2 py-1 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Enabling…" : "Enable Notifications"}
        </button>
      )}
      {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
    </div>
  );
}
