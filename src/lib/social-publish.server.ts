// Server-only: publishes due social posts. Called per workspace by the background job.
// Each post is claimed atomically (status scheduled → publishing) so two runs never publish twice;
// a run that crashed leaves "publishing" for >15 min, after which the post is retried (bounded).
import { GRAPH, tokenKind } from "./channels.server";
import {
  facebookRequest,
  finalStatus,
  instagramContainer,
  MAX_ATTEMPTS,
  planPublish,
  type Connection,
  type Result,
} from "./social-publish";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

async function graph(path: string, params: Record<string, string>, token: string) {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || j.error)
    throw new Error(
      String(j?.error?.message ?? `Meta returned ${res.status}`)
        .replaceAll(token, "••••")
        .slice(0, 300),
    );
  return j as { id?: string; post_id?: string };
}

export async function publishDuePosts(ws: string, limit = 5) {
  const sb = await db();
  const now = new Date();
  // Recover posts stuck in "publishing" (worker died mid-run).
  await sb
    .from("social_posts")
    .update({ status: "scheduled" })
    .eq("workspace_id", ws)
    .eq("status", "publishing")
    .lt("publish_started_at", new Date(now.getTime() - 15 * 60_000).toISOString())
    .lt("publish_attempts", MAX_ATTEMPTS);
  const { data: due } = await sb
    .from("social_posts")
    .select("id")
    .eq("workspace_id", ws)
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at")
    .limit(limit);
  if (!due?.length) return { published: 0 };
  const { data: conns } = await sb
    .from("channel_connections")
    .select("id, channel, account_id, status, account_label")
    .eq("workspace_id", ws)
    .in("channel", ["messenger", "instagram"]);
  const connections: Connection[] = (conns ?? []).map((c: any) => ({
    id: c.id,
    channel: c.channel,
    account_id: c.account_id,
    status: c.status,
    label: c.account_label,
  }));
  const { getSecret } = await import("./secrets.server");
  let published = 0;
  for (const { id } of due) {
    const { data: claimed } = await sb
      .from("social_posts")
      .update({ status: "publishing", publish_started_at: now.toISOString() })
      .eq("id", id)
      .eq("status", "scheduled")
      .select("id, title, body, media_urls, targets, publish_attempts")
      .maybeSingle();
    if (!claimed) continue; // another run took it
    const attempts = (claimed.publish_attempts ?? 0) + 1;
    const plan = planPublish(claimed, connections);
    const results: Result[] = plan.skipped.map((s) => ({
      network: s.network,
      ok: false,
      error: s.reason,
    }));
    for (const job of plan.jobs) {
      try {
        const token = await getSecret(
          ws,
          tokenKind(job.network === "facebook" ? "messenger" : "instagram", job.connectionId),
        );
        if (!token) throw new Error("Account token missing — reconnect this account.");
        if (job.network === "facebook") {
          const req = facebookRequest(job.accountId, claimed);
          const r = await graph(req.path, req.params as unknown as Record<string, string>, token);
          results.push({
            network: "facebook",
            account: job.label,
            ok: true,
            id: r.post_id ?? r.id,
          });
        } else {
          const c = instagramContainer(job.accountId, claimed);
          const container = await graph(
            c.path,
            c.params as unknown as Record<string, string>,
            token,
          );
          const r = await graph(
            `/${job.accountId}/media_publish`,
            { creation_id: String(container.id) },
            token,
          );
          results.push({ network: "instagram", account: job.label, ok: true, id: r.id });
        }
      } catch (e) {
        results.push({
          network: job.network,
          account: job.label,
          ok: false,
          error: (e as Error).message,
        });
      }
    }
    const fin = finalStatus(results, attempts);
    await sb
      .from("social_posts")
      .update({
        status: fin.status,
        error: fin.error,
        publish_attempts: attempts,
        publish_results: results,
        ...(fin.status === "published" || fin.status === "partially_published"
          ? { published_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", id);
    if (fin.status === "published" || fin.status === "partially_published") published++;
  }
  return { published };
}
