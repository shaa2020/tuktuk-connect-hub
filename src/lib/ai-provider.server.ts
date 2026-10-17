// Server-only: routes AI requests to Lovable AI (default) or the workspace's own provider key.
import { AiError, generateText as lovableGenerate } from "./ai-gateway.server";
import { getSecret } from "./secrets.server";

export type Provider = "lovable" | "openai" | "anthropic" | "gemini" | "openrouter" | "custom";
export const PROVIDER_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

export interface ProviderSettings { provider: Provider; model: string | null; base_url: string | null }

export async function generate(ws: string, s: ProviderSettings, opts: { instructions: string; input: string; jsonSchema?: { name: string; schema: Record<string, unknown> } }) {
  if (s.provider === "lovable" || !s.provider) return lovableGenerate(opts);
  const apiKey = await getSecret(ws, "ai_api_key");
  if (!apiKey) throw new AiError("Your AI provider key is missing. An admin can add it on the AI Assistant page.", 400);
  if (!s.model) throw new AiError("Choose a model name for your AI provider.", 400);
  return callProvider(s, apiKey, opts);
}

export async function callProvider(s: ProviderSettings, apiKey: string, opts: { instructions: string; input: string }): Promise<string> {
  let res: Response;
  if (s.provider === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: s.model, max_tokens: 1500, system: opts.instructions, messages: [{ role: "user", content: opts.input }] }),
    });
  } else {
    const base = s.provider === "custom" ? s.base_url : PROVIDER_BASE[s.provider];
    if (!base || !base.startsWith("https://")) throw new AiError("A secure (https) provider address is required.", 400);
    const model = s.provider === "gemini" ? String(s.model ?? "").trim().replace(/^models\//, "") : s.model;
    res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: opts.instructions }, { role: "user", content: opts.input }] }),
    });
  }
  const raw = (await res.json().catch(() => ({}))) as any;
  const j = Array.isArray(raw) ? (raw[0] ?? {}) : raw;
  if (!res.ok) {
    // Provider error text only — never echo the key.
    let m = String(j?.error?.message || j?.message || `request failed (${res.status})`);
    if (res.status === 404 && s.provider === "gemini") m = `Google doesn't recognise the model "${s.model}". Use gemini-2.5-flash or gemini-2.0-flash.`;
    m = m.replaceAll(apiKey, "••••").slice(0, 300);
    throw new AiError(`Your AI provider: ${m}`, res.status);
  }
  const text = s.provider === "anthropic"
    ? (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
    : j.choices?.[0]?.message?.content ?? "";
  if (!String(text).trim()) throw new AiError("The AI returned no suggestion for this request.", 422);
  return String(text).trim();
}
