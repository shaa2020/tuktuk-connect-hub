import { supabase } from "@/integrations/supabase/client";

// Public half of the push key pair. The private half lives only on the server.
export const VAPID_PUBLIC_KEY =
  "BBJQIT6EMFi7FhBZuS-iVN4ia3HmIDL_SXOkMhDHXy1_Qd33xwF0lEEawpIfF4Lk7KjEAwmymgKPlvgwUtf8D_o";

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
export async function subscribePush(ask = false): Promise<"subscribed" | "denied" | "unsupported" | "needs-tap"> {
  if (!pushSupported()) return "unsupported";
  try {
    if (Notification.permission !== "granted" && !ask) return "needs-tap";
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    let existing = await reg.pushManager.getSubscription();
    // Drop subscriptions made with the old (wrongly formatted) key.
    if (existing && localStorage.getItem("tt24-push-key") !== VAPID_PUBLIC_KEY) { await existing.unsubscribe(); existing = null; }
    const sub =
      existing ??
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
    if (!error) localStorage.setItem("tt24-push-key", VAPID_PUBLIC_KEY);
    return error ? "denied" : "subscribed";
  } catch {
    return "denied";
  }
}
