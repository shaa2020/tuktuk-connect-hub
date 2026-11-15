// Server-only: routes AI requests to Lovable AI (default) or the workspace's own provider key.
import { AiError, generateText as lovableGenerate } from "./ai-gateway.server";
import { getSecret } from "./secrets.server";

export type Provider = "lovable" | "openai" | "anthropic" | "gemini" | "openrouter" | "custom";
export const PROVIDER_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

export interface ProviderSettings {
  provider: Provider;
  model: string | null;
  base_url: string | null;
}

/** Guess the provider from the key's well-known prefix. */
export function detectProvider(key: string): Provider | null {
  const k = key.trim();
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

/** Pick the best chat model from a list of model ids (pure, tested). */
export function pickModel(provider: Provider, ids: string[]): string | null {
  const clean = ids.map((i) => i.replace(/^models\//, ""));
  const bad =
    /(lite|preview|exp|tts|image|embed|live|audio|vision|thinking|aqa|learnlm|gemma|nano|search|realtime|transcribe|instruct|-\d{4}-\d{2}-\d{2}|\d{3}$)/i;
  const ver = (s: string) => Number(s.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const best = (pat: RegExp) =>
    clean.filter((m) => pat.test(m) && !bad.test(m)).sort((a, b) => ver(b) - ver(a))[0] ?? null;
  if (provider === "gemini")
    return best(/^gemini-[\d.]+-flash$/) ?? best(/^gemini-[\d.]+-pro$/) ?? best(/^gemini/);
  if (provider === "anthropic") return best(/sonnet/) ?? best(/claude/);
  if (provider === "openai")
    return clean.includes("gpt-4o-mini")
      ? "gpt-4o-mini"
      : (best(/^gpt-[\d.o]+(-mini)?$/) ?? best(/^gpt/));
  return null;
}

/** Ask the provider which models this key can use. Returns [] on any failure. */
export async function listModels(provider: Provider, apiKey: string): Promise<string[]> {
  try {
    const k = apiKey.trim();
    if (provider === "gemini") {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000`,
        { headers: { "x-goog-api-key": k } },
      );
      const j = (await r.json().catch(() => ({}))) as any;
      return (j.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: any) => String(m.name));
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": k, "anthropic-version": "2023-06-01" },
      });
      const j = (await r.json().catch(() => ({}))) as any;
      return (j.data ?? []).map((m: any) => String(m.id));
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${k}` },
      });
      const j = (await r.json().catch(() => ({}))) as any;
      return (j.data ?? []).map((m: any) => String(m.id));
    }
  } catch {
    /* fall through */
  }
  return [];
}

export async function autoModel(provider: Provider, apiKey: string): Promise<string | null> {
  if (provider === "openrouter") return "openai/gpt-4o-mini";
  return pickModel(provider, await listModels(provider, apiKey));
}

export async function generate(
  ws: string,
  s: ProviderSettings,
  opts: {
    instructions: string;
    input: string;
    jsonSchema?: { name: string; schema: Record<string, unknown> };
  },
) {
  // Every AI call is metered per workspace. Platform-paid AI counts against the plan allowance
  // (and stops at the limit); calls on the business's own key are recorded but not capped.
  const platformPaid = s.provider === "lovable" || !s.provider;
  const { consumeUsage, TenantGuardError } = await import("./tenancy.server");
  try {
    await consumeUsage(ws, platformPaid ? "monthly_ai_requests" : "monthly_ai_requests_byo");
  } catch (e) {
    if (e instanceof TenantGuardError) throw new AiError(e.message, 402);
    throw e;
  }
  if (platformPaid) return lovableGenerate(opts);
  const apiKey = await getSecret(ws, "ai_api_key");
  if (!apiKey)
    throw new AiError(
      "Your AI provider key is missing. An admin can add it on the AI Assistant page.",
      400,
    );
  if (!s.model) throw new AiError("Choose a model name for your AI provider.", 400);
  return callProvider(s, apiKey, opts);
}

export async function callProvider(
  s: ProviderSettings,
  apiKey: string,
  opts: { instructions: string; input: string },
): Promise<string> {
  let res: Response;
  if (s.provider === "anthropic") {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: s.model,
        max_tokens: 1500,
        system: opts.instructions,
        messages: [{ role: "user", content: opts.input }],
      }),
    });
  } else {
    const base = s.provider === "custom" ? s.base_url : PROVIDER_BASE[s.provider];
    if (!base || !base.startsWith("https://"))
      throw new AiError("A secure (https) provider address is required.", 400);
    // Tenant-supplied addresses are re-checked at call time (SSRF guard).
    const { unsafeUrlReason } = await import("./url-safety");
    const unsafe = s.provider === "custom" ? unsafeUrlReason(base) : null;
    if (unsafe) throw new AiError(`Provider address rejected: ${unsafe}`, 400);
    const model =
      s.provider === "gemini"
        ? String(s.model ?? "")
            .trim()
            .replace(/^models\//, "")
        : s.model;
    res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: opts.instructions },
          { role: "user", content: opts.input },
        ],
      }),
    });
  }
  const raw = (await res.json().catch(() => ({}))) as any;
  const j = Array.isArray(raw) ? (raw[0] ?? {}) : raw;
  if (!res.ok) {
    // Provider error text only — never echo the key.
    let m = String(j?.error?.message || j?.message || `request failed (${res.status})`);
    if (res.status === 404 && s.provider === "gemini")
      m = `Google doesn't offer the model "${s.model}" anymore. Type gemini-2.5-flash in the Model name box and try again.`;
    m = m.replaceAll(apiKey, "••••").slice(0, 300);
    throw new AiError(`Your AI provider: ${m}`, res.status);
  }
  const text =
    s.provider === "anthropic"
      ? (j.content ?? [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("")
      : (j.choices?.[0]?.message?.content ?? "");
  if (!String(text).trim())
    throw new AiError("The AI returned no suggestion for this request.", 422);
  return String(text).trim();
}
