import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2, Send, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Confirm, Field, fmtDateTime } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/social")({
  head: () => ({
    meta: [
      { title: "Social Planner — TeamInbox" },
      { name: "description", content: "Plan and schedule social media posts." },
    ],
  }),
  component: SocialPage,
});

const NETWORKS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook Page" },
  { id: "tiktok", label: "TikTok" },
] as const;

type Post = {
  id: string;
  title: string;
  body: string;
  media_urls: string[];
  targets: { network: string }[];
  status: "draft" | "scheduled" | "publishing" | "published" | "partially_published" | "failed";
  scheduled_at: string | null;
  published_at: string | null;
  error: string | null;
  created_at: string;
};

const STATUS_TONE: Record<Post["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-primary-soft text-primary",
  publishing: "bg-primary-soft text-primary",
  published: "bg-success-soft text-success",
  partially_published: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-destructive",
};

function SocialPage() {
  const ws = useWorkspace();
  const canDelete = ws.role === "admin" || ws.role === "manager";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState("");
  const [targets, setTargets] = useState<string[]>(["instagram"]);
  const [when, setWhen] = useState("");

  const posts = useQuery({
    queryKey: ["social_posts", ws.workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_posts")
        .select("*")
        .eq("workspace_id", ws.workspaceId)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Post[];
    },
  });

  function toggleTarget(id: string) {
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  async function add(publish: boolean) {
    if (!title.trim()) return toast.error("Give the post a title");
    if (!targets.length) return toast.error("Pick at least one network");
    if (!publish && !when) return toast.error("Pick a date and time, or save as draft");
    const { error } = await supabase.from("social_posts").insert({
      workspace_id: ws.workspaceId,
      title: title.trim().slice(0, 120),
      body: body.trim(),
      media_urls: media.trim()
        ? media
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean)
            .slice(0, 10)
        : [],
      targets: targets.map((network) => ({ network })),
      status: when ? "scheduled" : "draft",
      scheduled_at: when ? new Date(when).toISOString() : null,
      created_by: ws.userId,
    });
    if (error) return toast.error(error.message);
    setTitle("");
    setBody("");
    setMedia("");
    setWhen("");
    toast.success(when ? "Post scheduled" : "Draft saved");
    posts.refetch();
  }

  async function del(id: string) {
    const { error } = await supabase.from("social_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    posts.refetch();
  }

  const upcoming = (posts.data ?? []).filter((p) => p.status === "scheduled");
  const drafts = (posts.data ?? []).filter((p) => p.status === "draft");
  const done = (posts.data ?? []).filter(
    (p) => p.status === "published" || p.status === "partially_published" || p.status === "failed",
  );

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Social Planner"
        description="Scheduled posts are published automatically (checked every 5 minutes) to your connected Facebook Pages and Instagram accounts. Instagram needs an image or video URL. TikTok publishing isn't available yet. Results and errors appear on each post."
      />
      <Panel className="mb-4 space-y-3 p-4">
        <h2 className="text-sm font-semibold">New post</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title (internal)">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sunset tour promo"
            />
          </Field>
          <Field label="Schedule for">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>
        <Field label="Caption">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Write the caption…"
          />
        </Field>
        <Field label="Image / video links (one per line, optional)">
          <Textarea
            value={media}
            onChange={(e) => setMedia(e.target.value)}
            rows={2}
            placeholder="https://…"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              onClick={() => toggleTarget(n.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                targets.includes(n.id)
                  ? "border-primary bg-primary-soft text-primary"
                  : "text-muted-foreground",
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => add(false)}>
            <Plus /> {when ? "Schedule post" : "Save draft"}
          </Button>
        </div>
      </Panel>

      {posts.isLoading ? (
        <Panel>
          <ListSkeleton />
        </Panel>
      ) : posts.error ? (
        <ErrorState message={(posts.error as Error).message} />
      ) : !posts.data?.length ? (
        <Panel>
          <EmptyState
            icon={<CalendarClock />}
            title="No posts yet"
            description="Create your first post above to plan your content calendar."
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {[
            { label: "Scheduled", list: upcoming },
            { label: "Drafts", list: drafts },
            { label: "Published & failed", list: done },
          ].map((g) =>
            !g.list.length ? null : (
              <Panel key={g.label}>
                <h2 className="border-b px-4 py-3 text-sm font-semibold">
                  {g.label} ({g.list.length})
                </h2>
                <ul className="divide-y">
                  {g.list.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{p.title}</span>
                          <Badge className={cn("border-0 text-[10px]", STATUS_TONE[p.status])}>
                            {p.status}
                          </Badge>
                        </div>
                        {p.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {p.body}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Send className="size-3" />
                            {p.targets
                              .map(
                                (t) => NETWORKS.find((n) => n.id === t.network)?.label ?? t.network,
                              )
                              .join(", ")}
                          </span>
                          {!!p.media_urls.length && (
                            <span className="flex items-center gap-1">
                              <ImageIcon className="size-3" />
                              {p.media_urls.length} media
                            </span>
                          )}
                          {p.scheduled_at && <span>· {fmtDateTime(p.scheduled_at)}</span>}
                          {p.error && <span className="text-destructive">· {p.error}</span>}
                        </div>
                      </div>
                      {canDelete && (
                        <Confirm
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="Delete post">
                              <Trash2 />
                            </Button>
                          }
                          title="Delete this post?"
                          description="It will be removed from the planner."
                          confirmLabel="Delete"
                          onConfirm={() => del(p.id)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            ),
          )}
        </div>
      )}
    </PageContainer>
  );
}
