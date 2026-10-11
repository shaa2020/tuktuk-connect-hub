import { supabase } from "@/integrations/supabase/client";

// Public half of the push key pair. The private half lives only on the server.
export const VAPID_PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEElAhPoQwWLsWEFm5L6JU3iJrceYgMv9Jc6QyEMdfLX9B3ffHAXSUQRrCkh8XguTsqMQDCbKaAo-W-DBS1_wP-g";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Registers the service worker and subscribes this device to push notifications.
 * Safe to call repeatedly — the browser de-duplicates the subscription and the
 * row is upserted by endpoint. Asks for notification permission on first call.
 */
export async function subscribePush(): Promise<"subscribed" | "denied" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      }));
    const json = sub.toJSON();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !json.keys) return "denied";
    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: user.id, endpoint: sub.endpoint, keys: json.keys },
      { onConflict: "endpoint" },
    );
    return error ? "denied" : "subscribed";
  } catch {
    return "denied";
  }
}
