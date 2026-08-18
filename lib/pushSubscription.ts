/**
 * Validation for the subscription objects that /api/subscribe stores.
 *
 * The endpoint is not just a row in a table — it is a URL the server will later
 * POST to, once per stored row, whenever /api/notify runs. web-push applies no
 * allowlist of its own (it only string-matches the two legacy GCM/FCM hosts, to
 * decide whether to attach a VAPID header), so whatever is stored here is a
 * destination the deployment can be pointed at. The unlock gate on the routes
 * is what stops a stranger writing a row; this is what stops a bad row from
 * being useful even so.
 */

/**
 * Hosts the browsers actually hand out. Matched as suffixes because Mozilla and
 * WNS shard across subdomains (`updates.push.services.mozilla.com`,
 * `wns2-bl2p.notify.windows.com`), while the Google and Apple endpoints are a
 * single fixed host each.
 *
 * A leading dot means "this domain or anything under it"; no dot means an exact
 * host. Written this way so `evil-fcm.googleapis.com.attacker.tld` cannot pass
 * by merely containing an allowed string.
 */
const ALLOWED_ENDPOINT_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "web.push.apple.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
];

function isAllowedHost(host: string): boolean {
  return ALLOWED_ENDPOINT_HOSTS.some((allowed) =>
    allowed.startsWith(".") ? host.endsWith(allowed) : host === allowed
  );
}

export type PushSubscriptionRow = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Returns the row to store, or null if the body is anything other than a
 * genuine subscription. Deliberately returns a fresh object rather than the
 * parsed body: only these three fields reach the database, so extra keys in the
 * payload cannot become columns.
 */
export function parseSubscription(body: unknown): PushSubscriptionRow | null {
  if (typeof body !== "object" || body === null) return null;
  const { endpoint, keys } = body as { endpoint?: unknown; keys?: unknown };

  if (typeof endpoint !== "string" || endpoint.length > 1000) return null;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  // https only. http would be a cleartext push, and the scheme check is also
  // what keeps file:, data: and gopher: out of the destination set.
  if (url.protocol !== "https:") return null;
  if (!isAllowedHost(url.hostname)) return null;

  if (typeof keys !== "object" || keys === null) return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  // Lengths are the encryption keys' real sizes in base64url (65 and 16 raw
  // bytes). Bounded rather than exact: the padding a browser emits varies.
  if (typeof p256dh !== "string" || p256dh.length < 80 || p256dh.length > 200) return null;
  if (typeof auth !== "string" || auth.length < 16 || auth.length > 50) return null;

  return { endpoint, keys: { p256dh, auth } };
}

/** Shape check for the DELETE body, which carries only the endpoint. */
export function parseEndpoint(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { endpoint } = body as { endpoint?: unknown };
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 1000) {
    return null;
  }
  return endpoint;
}
