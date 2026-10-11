// Server-only: WhatsApp template administration + sending via the Lovable connector.
import type { WaTemplate } from "./wa-templates";

const GW = "https://connector-gateway.lovable.dev/whatsapp";

function headers() {
  const lk = process.env.LOVABLE_API_KEY, wk = process.env.WHATSAPP_API_KEY;
  if (!lk || !wk) throw new Error("WhatsApp connection is not configured on the server.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": wk, "Content-Type": "application/json" };
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${GW}${path}`, { ...init, headers: headers() });
  const txt = await res.text();
  if (!res.ok) {
    let m = txt; try { m = JSON.parse(txt)?.error?.error_user_msg ?? JSON.parse(txt)?.error?.message ?? txt; } catch { /* raw */ }
    throw new Error(`WhatsApp (${res.status}): ${m}`.slice(0, 300));
  }
  return txt ? JSON.parse(txt) : {};
}

export async function listTemplates(): Promise<WaTemplate[]> {
  const j = await call("/message_templates?fields=name,status,language,category,components&limit=100");
  return (j.data ?? []).map((t: any) => {
    const c = (type: string) => (t.components ?? []).find((x: any) => x.type === type);
    return { name: t.name, language: t.language, status: t.status, category: t.category, body: c("BODY")?.text ?? "", header: c("HEADER")?.format === "TEXT" ? c("HEADER")?.text : undefined, footer: c("FOOTER")?.text };
  });
}

export async function createTemplate(t: { name: string; category: string; body: string; example: string[] }) {
  return call("/message_templates", {
    method: "POST",
    body: JSON.stringify({ name: t.name, language: "en", category: t.category, components: [{ type: "BODY", text: t.body, ...(t.example.length ? { example: { body_text: [t.example] } } : {}) }] }),
  });
}

export async function sendTemplate(to: string, name: string, language: string, params: string[]) {
  const j = await call("/messages", {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "template",
      template: { name, language: { code: language }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}) },
    }),
  });
  return j?.messages?.[0]?.id as string;
}
