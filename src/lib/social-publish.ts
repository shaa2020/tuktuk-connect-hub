// Pure planning for the social publishing worker (tested). Network calls live in social-publish.server.ts.
// Supported today: Facebook Pages (text, link, single photo) and Instagram professional accounts
// (single image or video/Reel, caption) through the Meta Graph API, using the Page/IG tokens saved
// when the business connected the account. TikTok needs TikTok's Content Posting API approval.

export type Network = "facebook" | "instagram" | "tiktok";
export type Connection = {
  id: string;
  channel: "messenger" | "instagram";
  account_id: string | null;
  status: string;
  label: string | null;
};
export type Job = {
  network: "facebook" | "instagram";
  connectionId: string;
  accountId: string;
  label: string;
};
export type Skip = { network: string; reason: string };

export const MAX_ATTEMPTS = 3;
const VIDEO = /\.(mp4|mov|m4v)(\?|$)/i;

export function planPublish(
  post: { targets: { network: string }[]; media_urls: string[] },
  connections: Connection[],
): { jobs: Job[]; skipped: Skip[] } {
  const jobs: Job[] = [];
  const skipped: Skip[] = [];
  const networks = [...new Set((post.targets ?? []).map((t) => t.network))];
  for (const n of networks) {
    if (n === "tiktok") {
      skipped.push({
        network: n,
        reason: "TikTok publishing needs TikTok Content Posting API approval — not available yet.",
      });
      continue;
    }
    if (n !== "facebook" && n !== "instagram") {
      skipped.push({ network: n, reason: "This network isn't supported." });
      continue;
    }
    if (n === "instagram" && !post.media_urls?.length) {
      skipped.push({ network: n, reason: "Instagram posts need an image or video URL." });
      continue;
    }
    const channel = n === "facebook" ? "messenger" : "instagram";
    const accounts = connections.filter(
      (c) => c.channel === channel && c.status === "connected" && c.account_id,
    );
    if (!accounts.length) {
      skipped.push({
        network: n,
        reason: `No connected ${n === "facebook" ? "Facebook Page" : "Instagram account"}. Connect one on the Integrations page.`,
      });
      continue;
    }
    for (const a of accounts)
      jobs.push({
        network: n,
        connectionId: a.id,
        accountId: a.account_id!,
        label: a.label || a.account_id!,
      });
  }
  return { jobs, skipped };
}

export function captionOf(post: { title: string; body: string }) {
  return (post.body?.trim() || post.title).slice(0, 2200);
}

/** Graph API request for a Facebook Page post. */
export function facebookRequest(
  accountId: string,
  post: { title: string; body: string; media_urls: string[] },
) {
  const message = captionOf(post);
  const media = post.media_urls?.[0];
  if (media && !VIDEO.test(media))
    return { path: `/${accountId}/photos`, params: { url: media, caption: message } };
  if (media)
    return { path: `/${accountId}/videos`, params: { file_url: media, description: message } };
  return { path: `/${accountId}/feed`, params: { message } };
}

/** Graph API container request for an Instagram post (then /media_publish). */
export function instagramContainer(
  accountId: string,
  post: { title: string; body: string; media_urls: string[] },
) {
  const media = post.media_urls[0]!;
  const caption = captionOf(post);
  return VIDEO.test(media)
    ? { path: `/${accountId}/media`, params: { media_type: "REELS", video_url: media, caption } }
    : { path: `/${accountId}/media`, params: { image_url: media, caption } };
}

export type Result = {
  network: string;
  account?: string;
  ok: boolean;
  id?: string;
  error?: string;
};

/** Final status from per-target results. Retryable when nothing succeeded and attempts remain. */
export function finalStatus(
  results: Result[],
  attempts: number,
): { status: "published" | "partially_published" | "failed" | "scheduled"; error: string | null } {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const error = failed.length
    ? failed
        .map((r) => `${r.network}${r.account ? ` (${r.account})` : ""}: ${r.error}`)
        .join("; ")
        .slice(0, 1000)
    : null;
  if (results.length && ok === results.length) return { status: "published", error: null };
  if (ok > 0) return { status: "partially_published", error };
  if (
    attempts < MAX_ATTEMPTS &&
    results.some((r) => r.error && !/needs|isn't supported|No connected/.test(r.error))
  )
    return { status: "scheduled", error };
  return { status: "failed", error };
}
