// Server-only Web Push sender (RFC 8291 aes128gcm + VAPID), built on WebCrypto
// so it runs in the edge runtime without Node-only dependencies.
import type { SupabaseClient } from "@supabase/supabase-js";

const enc = new TextEncoder();

function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64u(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  len: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    len * 8,
  );
  return new Uint8Array(bits);
}

async function vapidJwt(audience: string, privB64: string, pubB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    b64uToBytes(privB64) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64u(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: "mailto:tuktuklisbon24@gmail.com",
      }),
    ),
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(`${header}.${claims}`) as BufferSource,
  );
  return `${header}.${claims}.${bytesToB64u(sig)}`;
}

async function encryptPayload(
  p256dhB64: string,
  authB64: string,
  payload: string,
): Promise<Uint8Array> {
  const uaPubBytes = b64uToBytes(p256dhB64);
  const authSecret = b64uToBytes(authB64);

  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPubBytes = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  const uaPub = await crypto.subtle.importKey(
    "raw",
    uaPubBytes as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPub }, asKeys.privateKey, 256),
  );

  // RFC 8291 §3.3 key derivation
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(enc.encode("WebPush: info\0"), uaPubBytes, asPubBytes),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = last-record delimiter
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt",
  ]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      plain as BufferSource,
    ),
  );

  // aes128gcm content coding header: salt | rs(4) | idlen(1) | keyid
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPubBytes.length]), asPubBytes, cipher);
}

type PushKeys = { p256dh?: string; auth?: string };

async function sendOne(
  endpoint: string,
  keys: PushKeys,
  payload: string,
  privB64: string,
  pubB64: string,
): Promise<number> {
  if (!keys.p256dh || !keys.auth) return 400;
  const audience = new URL(endpoint).origin;
  const [jwt, body] = await Promise.all([
    vapidJwt(audience, privB64, pubB64),
    encryptPayload(keys.p256dh, keys.auth, payload),
  ]);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${pubB64}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body: body as BodyInit,
  });
  return res.status;
}

/**
 * Delivers unsent in-app notifications as Web Push messages.
 * Called from the scheduled background-sync route; marks each notification
 * push_sent_at so it is delivered exactly once. Dead subscriptions (404/410)
 * are removed.
 */
export async function sendPendingPushes(
  sb: SupabaseClient,
  onlyIds?: string[],
): Promise<{ sent: number; failed: number }> {
  const priv = process.env["VAPID_PRIVATE_KEY"];
  const pub =
    "BBJQIT6EMFi7FhBZuS-iVN4ia3HmIDL_SXOkMhDHXy1_Qd33xwF0lEEawpIfF4Lk7KjEAwmymgKPlvgwUtf8D_o"; // raw P-256 point (RFC 8292)
  if (!priv) return { sent: 0, failed: 0 };

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = sb
    .from("notifications")
    .select("id, user_id, title, body, link")
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50);
  if (onlyIds) q = q.in("id", onlyIds);
  const { data: pending } = await q;
  if (!pending?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, keys")
      .eq("user_id", n.user_id);
    const payload = JSON.stringify({
      title: n.title,
      body: n.body ?? "",
      url: n.link ?? "/notifications",
      tag: n.id,
    });
    let ok = false;
    for (const sub of subs ?? []) {
      try {
        const status = await sendOne(sub.endpoint, sub.keys as PushKeys, payload, priv, pub);
        if (status >= 200 && status < 300) ok = true;
        else if (status === 404 || status === 410)
          await sb.from("push_subscriptions").delete().eq("id", sub.id);
        else failed++;
      } catch {
        failed++;
      }
    }
    if (ok) sent++;
    await sb
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", n.id);
  }
  return { sent, failed };
}

/** Creates a notification for every active team member and pushes it to their phones right away. */
export async function notifyTeam(
  sb: SupabaseClient,
  ws: string,
  n: { kind: string; title: string; body: string; link: string },
) {
  const { data: members } = await sb
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ws)
    .eq("active", true);
  if (!members?.length) return;
  const { data: rows } = await sb
    .from("notifications")
    .insert(
      members.map((m: any) => ({
        workspace_id: ws,
        user_id: m.user_id,
        kind: n.kind,
        title: n.title.slice(0, 120),
        body: n.body.slice(0, 300),
        link: n.link,
      })),
    )
    .select("id");
  if (rows?.length)
    await sendPendingPushes(
      sb,
      rows.map((r: any) => r.id),
    );
}
