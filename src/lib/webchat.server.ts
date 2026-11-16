// Server-only: website live chat. Visitors post messages with their private visitor id; replies
// from the team are stored as outbound messages and fetched by the widget (polling).
import { allowedOrigin } from "./webchat";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export async function connectionForKey(key: string) {
  const { data } = await (
    await db()
  )
    .from("channel_connections")
    .select("id, workspace_id, status, config")
    .eq("channel", "webchat")
    .eq("account_id", key)
    .maybeSingle();
  if (!data || data.status !== "connected") return null;
  const { data: w } = await (
    await db()
  )
    .from("workspaces")
    .select("name, suspended_at")
    .eq("id", data.workspace_id)
    .maybeSingle();
  if (!w || w.suspended_at) return null;
  return {
    ...data,
    businessName: w.name as string,
    config: (data.config ?? {}) as { allowed_origins?: string[]; greeting?: string },
  };
}

export function corsHeaders(
  origin: string | null,
  allowed: string[] | undefined,
): Record<string, string> | null {
  const o = allowedOrigin(origin, allowed);
  if (o === null) return null;
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

/** Messages of the visitor's conversation(s), oldest first, after an optional timestamp. */
export async function visitorMessages(ws: string, visitor: string, after: string | null) {
  const sb = await db();
  const { data: ident } = await sb
    .from("external_identities")
    .select("id")
    .eq("workspace_id", ws)
    .eq("channel", "webchat")
    .eq("external_id", visitor)
    .maybeSingle();
  if (!ident) return [];
  const { data: parts } = await sb
    .from("conversation_participants")
    .select("conversation_id")
    .eq("external_identity_id", ident.id);
  const ids = (parts ?? []).map((p: any) => p.conversation_id);
  if (!ids.length) return [];
  let q = sb
    .from("messages")
    .select(
      "id, direction, body, created_at, status, message_attachments(storage_path, mime_type, file_name, kind)",
    )
    .in("conversation_id", ids)
    .in("status", ["sent", "delivered", "read"])
    .order("created_at")
    .limit(200);
  if (after) q = q.gt("created_at", after);
  const { data } = await q;
  // Team files: short-lived signed links (1 h) so the visitor's widget can show/download them.
  const out = [];
  for (const m of data ?? []) {
    const files = [];
    for (const a of (m as any).message_attachments ?? []) {
      const { data: signed } = await sb.storage
        .from("attachments")
        .createSignedUrl(a.storage_path, 3600);
      if (signed?.signedUrl)
        files.push({ url: signed.signedUrl, name: a.file_name ?? "file", kind: a.kind });
    }
    out.push({
      id: m.id,
      from: m.direction === "inbound" ? "visitor" : "team",
      text: m.body,
      at: m.created_at,
      files,
    });
  }
  return out;
}
