export type ProviderKey = "whatsapp" | "instagram" | "messenger" | "email" | "outlook" | "telegram" | "tiktok" | "linkedin";

const LIVE: ProviderKey[] = ["whatsapp", "instagram", "messenger", "email"];

export type ProviderState =
  | { kind: "soon"; badge: "Coming soon"; action: null }
  | { kind: "connected"; badge: string; action: "Connect another account" }
  | { kind: "attention"; badge: "Reconnect"; action: "Reconnect" }
  | { kind: "none"; badge: "Not connected"; action: "Connect" };

/** Card state derived only from real connection rows — never shows "connected" without one. */
export function providerState(key: ProviderKey, rows: { channel: string; status: string }[]): ProviderState {
  if (!LIVE.includes(key)) return { kind: "soon", badge: "Coming soon", action: null };
  const mine = rows.filter((r) => r.channel === key);
  const ok = mine.filter((r) => r.status === "connected").length;
  if (ok > 0) return { kind: "connected", badge: ok === 1 ? "Connected" : `${ok} connected`, action: "Connect another account" };
  if (mine.some((r) => r.status === "error")) return { kind: "attention", badge: "Reconnect", action: "Reconnect" };
  return { kind: "none", badge: "Not connected", action: "Connect" };
}
