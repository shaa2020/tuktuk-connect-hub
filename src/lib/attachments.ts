// Pure attachment rules shared by browser and server (tested).
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/3gpp",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/webm",
  "audio/wav",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export type AttachmentKind = "image" | "video" | "audio" | "file";

export function kindOf(mime: string): AttachmentKind {
  const m = (mime || "").toLowerCase().split(";")[0]!.trim();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

export function normalizeMime(mime: string) {
  return (mime || "application/octet-stream").toLowerCase().split(";")[0]!.trim();
}

export function attachmentProblem(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file.size) return "The file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Files can be up to 15 MB.";
  if (!ALLOWED_MIME.has(normalizeMime(file.type)))
    return "This file type isn't supported. Use a photo, video, voice note, PDF, Word/Excel, CSV or text file.";
  return null;
}

/** Keeps letters, numbers, dot, dash and underscore; never empty; max 80 chars. */
export function safeFileName(name: string): string {
  const base = (name || "file")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "");
  return (base || "file").slice(-80);
}

export function attachmentPath(
  workspaceId: string,
  conversationId: string,
  name: string,
  id: string = crypto.randomUUID(),
) {
  return `${workspaceId}/${conversationId}/${id}-${safeFileName(name)}`;
}

/** True when a storage path belongs to this workspace + conversation (server re-checks before sending). */
export function pathBelongs(path: string, workspaceId: string, conversationId: string) {
  const p = path.split("/");
  return p.length === 3 && p[0] === workspaceId && p[1] === conversationId && !path.includes("..");
}

export function attachmentLabel(kind: AttachmentKind, name?: string | null) {
  const icon = { image: "📷 Photo", video: "🎬 Video", audio: "🎤 Voice/audio", file: "📎 File" }[
    kind
  ];
  return name ? `${icon}: ${name}` : icon;
}
