"use client";

import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function NotificationButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

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
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setSending(true);
    await fetch("/api/notify", { method: "POST" });
    setSending(false);
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      {subscribed ? (
        <>
          <button
            onClick={sendTest}
            disabled={sending}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Test"}
          </button>
          <button
            onClick={disable}
            disabled={loading}
            className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-50"
          >
            Disable Notifications
          </button>
        </>
      ) : (
        <button
          onClick={enable}
          disabled={loading}
          className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? "Enabling…" : "Enable Notifications"}
        </button>
      )}
    </div>
  );
}
