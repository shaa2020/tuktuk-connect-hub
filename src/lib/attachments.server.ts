// Server-only: store inbound media and send outbound attachments through the right channel.
import {
  attachmentLabel,
  attachmentPath,
  kindOf,
  normalizeMime,
  pathBelongs,
  safeFileName,
} from "./attachments";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Saves downloaded media into the private bucket and links it to the message. Never throws. */
export async function storeInboundMedia(
  ws: string,
  conversationId: string,
  messageId: string,
  file: { bytes: ArrayBuffer; mime: string },
  name: string,
) {
  try {
    const sb = await db();
    const mime = normalizeMime(file.mime);
    const path = attachmentPath(ws, conversationId, name);
    const { error } = await sb.storage
      .from("attachments")
      .upload(path, new Uint8Array(file.bytes), { contentType: mime, upsert: false });
    if (error) return false;
    await sb.from("message_attachments").insert({
      workspace_id: ws,
      message_id: messageId,
      storage_path: path,
      mime_type: mime,
      size_bytes: file.bytes.byteLength,
      file_name: safeFileName(name),
      kind: kindOf(mime),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sends a file the team member already uploaded (path inside this conversation) to the customer,
 * from the account they contacted. Records the message + attachment either way (failed or sent).
 */
export async function sendAttachmentToConversation(
  convId: string,
  file: { path: string; name: string; mime: string; size: number; caption?: string },
  authorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = await db();
  const { data: conv } = await sb
    .from("conversations")
    .select("id, workspace_id, channel, connection_id")
    .eq("id", convId)
    .maybeSingle();
  if (!conv) return { ok: false, error: "Conversation not found." };
  if (!pathBelongs(file.path, conv.workspace_id, conv.id))
    return { ok: false, error: "File doesn't belong to this conversation." };
  const mime = normalizeMime(file.mime);
  const kind = kindOf(mime);
  const body = file.caption?.trim() || attachmentLabel(kind, file.name);
  let status: "sent" | "failed" = "sent",
    extId: string | null = null,
    error: string | null = null;
  try {
    if (conv.channel === "webchat") {
      extId = `wc-out:${crypto.randomUUID()}`; // the visitor's widget fetches it
    } else if (["whatsapp", "messenger", "instagram", "telegram"].includes(conv.channel)) {
      const [{ data: cc }, { data: part }, signed] = await Promise.all([
        conv.connection_id
          ? sb
              .from("channel_connections")
              .select("id, status, config")
              .eq("id", conv.connection_id)
              .maybeSingle()
          : sb
              .from("channel_connections")
              .select("id, status, config")
              .eq("workspace_id", conv.workspace_id)
              .eq("channel", conv.channel)
              .eq("status", "connected")
              .limit(1)
              .maybeSingle(),
        sb
          .from("conversation_participants")
          .select("external_identities(external_id)")
          .eq("conversation_id", conv.id)
          .limit(1)
          .maybeSingle(),
        sb.storage.from("attachments").createSignedUrl(file.path, 3600),
      ]);
      if (cc?.status !== "connected") throw new Error("This channel isn't connected.");
      const to = part?.external_identities?.external_id as string | undefined;
      if (!to) throw new Error("No customer address for this conversation.");
      if (!signed.data?.signedUrl) throw new Error("Could not prepare the file.");
      const media = {
        kind,
        url: signed.data.signedUrl,
        name: file.name,
        caption: file.caption?.trim() || undefined,
      };
      if (conv.channel === "telegram")
        extId = await (
          await import("./telegram.server")
        ).sendTelegramMedia(conv.workspace_id, cc.id, to, media);
      else
        extId = await (
          await import("./channels.server")
        ).sendMetaMedia(
          conv.workspace_id,
          conv.channel,
          (cc.config ?? {}) as Record<string, string>,
          to,
          media,
          cc.id,
        );
    } else {
      throw new Error(
        "Sending files on this channel isn't supported yet — send it from the original app.",
      );
    }
  } catch (e) {
    status = "failed";
    error = (e as Error).message.slice(0, 300);
  }
  const { data: msg } = await sb
    .from("messages")
    .insert({
      workspace_id: conv.workspace_id,
      conversation_id: conv.id,
      direction: "outbound",
      body,
      status,
      external_id: extId,
      author_id: authorId,
      error_message: error,
    })
    .select("id")
    .single();
  if (msg)
    await sb.from("message_attachments").insert({
      workspace_id: conv.workspace_id,
      message_id: msg.id,
      storage_path: file.path,
      mime_type: mime,
      size_bytes: file.size,
      file_name: safeFileName(file.name),
      kind,
    });
  return status === "sent" ? { ok: true } : { ok: false, error: error ?? "Sending failed" };
}
