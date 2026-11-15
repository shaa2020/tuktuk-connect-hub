// Server-only: Gmail (tuktuklisbon24@gmail.com) channel via the Lovable connector gateway.
// Credentials stay in server env (LOVABLE_API_KEY + GOOGLE_MAIL_API_KEY); never sent to browsers.
import { ingestInbound } from "./channels.server";
import { parseEmailBody } from "./email-format";
import { shouldImportEmail } from "./email-filter";

const GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

async function gmail(path: string, init: RequestInit = {}) {
  const lk = process.env.LOVABLE_API_KEY, gk = process.env.GOOGLE_MAIL_API_KEY;
  if (!lk || !gk) throw new Error("Gmail isn't linked to this app.");
  const res = await fetch(`${GW}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${lk}`, "x-connection-api-key": gk, "content-type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail [${res.status}]: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const guard = async (ws: string) => (await import("./tenancy.server")).assertPlatformConnectors(ws);

/** The linked Gmail belongs to the platform operator: only its workspace may read or send with it. */
export async function gmailProfile(ws: string) {
  await guard(ws);
  const p = await gmail("/users/me/profile");
  return p.emailAddress as string;
}

const hdr = (m: any, name: string) => (m.payload?.headers ?? []).find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value as string | undefined;

function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function findPart(p: any, mime: string): string | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data) return b64urlDecode(p.body.data);
  for (const c of p.parts ?? []) { const r = findPart(c, mime); if (r) return r; }
  return null;
}
export function extractBody(m: any) {
  let t: string = findPart(m.payload, "text/plain") ?? "";
  if (!t) { const h = findPart(m.payload, "text/html"); t = h ? h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ") : m.snippet ?? ""; }
  // Drop quoted history from replies (handles wrapped "On … wrote:" lines and other languages)
  return parseEmailBody(t).main;
}
export function parseFrom(v: string) {
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  return m ? { name: (m[1] ?? "").trim() || (m[2] ?? ""), email: (m[2] ?? "").trim().toLowerCase() } : { name: v.trim(), email: v.trim().toLowerCase() };
}

/** Pulls recent inbox emails into the unified inbox. Duplicates are skipped. */
export async function syncEmail(ws: string, self: string) {
  await guard(ws);
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const list = await gmail(`/users/me/messages?maxResults=25&q=${encodeURIComponent("in:inbox -from:me newer_than:7d -category:promotions -category:social -category:updates -category:forums")}`);
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
  if (!ids.length) return 0;
  const { data: have } = await sb.from("messages").select("external_id").eq("workspace_id", ws).in("external_id", ids.map((i) => `gm:${i}`));
  const seen = new Set((have ?? []).map((r) => r.external_id));
  let n = 0;
  for (const id of ids.reverse()) {
    if (seen.has(`gm:${id}`)) continue;
    const m = await gmail(`/users/me/messages/${id}?format=full`);
    const from = parseFrom(hdr(m, "From") ?? "");
    if (!from.email || from.email === self.toLowerCase()) continue;
    const subject = hdr(m, "Subject");
    const headers: Record<string, string> = {};
    for (const h of m.payload?.headers ?? []) headers[String(h.name).toLowerCase()] = h.value;
    const { data: known } = await sb.from("contacts").select("id").eq("workspace_id", ws).ilike("email", from.email).limit(1).maybeSingle();
    if (!shouldImportEmail({ from: from.email, subject: subject ?? "", body: extractBody(m), headers, labels: m.labelIds ?? [] }, !!known)) continue;
    await ingestInbound(ws, "email", {
      from: from.email, name: from.name, externalMessageId: `gm:${id}`,
      text: (subject ? `Subject: ${subject}\n\n` : "") + extractBody(m), at: new Date(Number(m.internalDate)),
    });
    n++;
  }
  await sb.from("channel_connections").update({ last_checked_at: new Date().toISOString(), last_error: null }).eq("workspace_id", ws).eq("channel", "email");
  return n;
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const mimeHdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

/** Replies in the same Gmail thread as the customer's latest email. */
export async function sendEmail(ws: string, conversationId: string, to: string, body: string) {
  await guard(ws);
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  if (/[\r\n]/.test(to)) throw new Error("Invalid address.");
  const { data: last } = await sb.from("messages").select("external_id").eq("conversation_id", conversationId).eq("direction", "inbound").like("external_id", "gm:%").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let subject = "Tuk Tuk 24 Lisbon", threadId: string | undefined, ref: string | undefined;
  if (last?.external_id) {
    const m = await gmail(`/users/me/messages/${last.external_id.slice(3)}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID`);
    const s = hdr(m, "Subject"); if (s) subject = /^re:/i.test(s) ? s : `Re: ${s}`;
    threadId = m.threadId; ref = hdr(m, "Message-ID");
  }
  const raw = [
    `From: ${mimeHdr("Tuk Tuk 24 Lisbon")} <tuktuklisbon24@gmail.com>`, `To: ${to}`, `Subject: ${mimeHdr(subject.replace(/[\r\n]/g, " "))}`,
    ...(ref ? [`In-Reply-To: ${ref}`, `References: ${ref}`] : []),
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "", body,
  ].join("\r\n");
  const r = await gmail("/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: b64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), ...(threadId ? { threadId } : {}) }) });
  return `gm:${r.id}`;
}
