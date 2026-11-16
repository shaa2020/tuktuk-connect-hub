// Server-only: calls Lovable AI Gateway (OpenAI Responses API) with streaming and returns final text.
export class AiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function generateText(opts: {
  instructions: string;
  input: string;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new AiError("AI is not configured on the server.", 500);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: opts.instructions,
      input: [{ role: "user", content: opts.input }],
      reasoning: { effort: "low" },
      store: false,
      stream: true,
      // Strict structured output: the model's answer is guaranteed to match the schema.
      ...(opts.jsonSchema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: opts.jsonSchema.name,
                strict: true,
                schema: opts.jsonSchema.schema,
              },
            },
          }
        : {}),
    }),
  });
  if (!res.ok || !res.body) {
    let msg = `AI request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string }; message?: string };
      msg = j.error?.message || j.message || msg;
    } catch {
      /* ignore */
    }
    if (res.status === 402) msg = "AI credits are used up. Top up in Settings → Plans & credits.";
    if (res.status === 429) msg = "AI is busy right now. Please try again in a minute.";
    throw new AiError(msg, res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data) as {
          type?: string;
          delta?: string;
          error?: { message?: string };
          response?: { error?: { message?: string } };
        };
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        if (ev.type === "error" || ev.type === "response.failed")
          throw new AiError(
            ev.error?.message || ev.response?.error?.message || "AI request failed",
            500,
          );
      } catch (e) {
        if (e instanceof AiError) throw e;
      }
    }
  }
  if (!out.trim()) throw new AiError("The AI returned no suggestion for this request.", 422);
  return out.trim();
}
