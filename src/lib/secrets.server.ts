// Server-only: encrypted per-workspace credentials. Values are never returned to the browser.
const enc = new TextEncoder();
const dec = new TextDecoder();

async function key() {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error("Credential storage is not configured on the server.");
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(plain)),
  );
  return `${b64(iv)}.${b64(ct)}`;
}
export async function decrypt(payload: string) {
  const [iv = "", ct = ""] = payload.split(".");
  return dec.decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct)),
  );
}
export const hintOf = (v: string) => (v.length > 8 ? `••••${v.slice(-4)}` : "••••");

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function getSecret(workspaceId: string, kind: string): Promise<string | null> {
  const { data } = await (
    await admin()
  )
    .from("workspace_secrets")
    .select("ciphertext")
    .eq("workspace_id", workspaceId)
    .eq("kind", kind)
    .maybeSingle();
  if (!data) return null;
  try {
    return await decrypt(data.ciphertext);
  } catch {
    return null;
  }
}
export async function setSecret(workspaceId: string, kind: string, value: string, userId: string) {
  const { error } = await (await admin()).from("workspace_secrets").upsert({
    workspace_id: workspaceId,
    kind,
    ciphertext: await encrypt(value),
    hint: hintOf(value),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Could not save credential.");
}
export async function deleteSecrets(workspaceId: string, kinds: string[]) {
  await (
    await admin()
  )
    .from("workspace_secrets")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("kind", kinds);
}
export async function secretHints(workspaceId: string) {
  const { data } = await (
    await admin()
  )
    .from("workspace_secrets")
    .select("kind, hint, updated_at")
    .eq("workspace_id", workspaceId);
  return data ?? [];
}

export async function hmacSha256Hex(secret: string, body: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
