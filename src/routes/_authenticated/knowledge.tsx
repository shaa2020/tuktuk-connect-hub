import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Loader2, Plus, Trash2, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Confirm, Field, NativeSelect, ToneBadge, fmtDate } from "@/components/kit";
import { MAX_DOC_CHARS, titleFromFile } from "@/lib/knowledge";
import { KNOWLEDGE_ACCEPT, extractFileText } from "@/lib/knowledge-files";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — TeamInbox" },
      { name: "description", content: "Tours, prices and policies." },
    ],
  }),
  component: KnowledgePage,
});

const CATS = {
  tours: "Tours",
  prices: "Prices",
  meeting_points: "Meeting points",
  policies: "Policies",
  faq: "FAQ",
  general: "General",
} as const;
type Doc = {
  id: string;
  title: string;
  category: string;
  content: string | null;
  source_name: string | null;
  updated_at: string;
};

function KnowledgePage() {
  const ws = useWorkspace();
  const canEdit = ws.role === "admin" || ws.role === "manager";
  const [edit, setEdit] = useState<Doc | "new" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    let added = 0;
    for (const f of Array.from(files)) {
      setUploading(f.name);
      const r = await extractFileText(f);
      if (!r.ok) {
        toast.error(`${f.name}: ${r.error}`);
        continue;
      }
      const { error } = await supabase.from("knowledge_documents").insert({
        workspace_id: ws.workspaceId,
        title: titleFromFile(f.name),
        category: "general",
        content: r.text,
        source_name: f.name.slice(0, 255),
      });
      if (error) {
        toast.error(`${f.name}: ${error.message}`);
        continue;
      }
      added++;
      if (r.truncated)
        toast.warning(
          `${f.name} was long — only the first ${MAX_DOC_CHARS.toLocaleString()} characters were kept.`,
        );
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (added)
      toast.success(
        `${added} document${added > 1 ? "s" : ""} added — the AI can use ${added > 1 ? "them" : "it"} now.`,
      );
    q.refetch();
  }
  const q = useQuery({
    queryKey: ["kb", ws.workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select("id, title, category, content, source_name, updated_at")
        .eq("workspace_id", ws.workspaceId)
        .order("category")
        .order("title");
      if (error) throw error;
      return data as Doc[];
    },
  });
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Knowledge Base"
        description="Facts the AI uses for suggestions and the AI Operator: write articles or upload your price lists, menus, FAQs and policies."
        actions={
          canEdit && (
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={KNOWLEDGE_ACCEPT}
                className="hidden"
                onChange={(e) => upload(e.target.files)}
                aria-label="Upload documents"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!!uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploading ? "Reading…" : "Upload documents"}
              </Button>
              <Button size="sm" onClick={() => setEdit("new")}>
                <Plus /> New article
              </Button>
            </div>
          )
        }
      />
      <Panel>
        {q.isLoading ? (
          <ListSkeleton />
        ) : q.error ? (
          <div className="p-4">
            <ErrorState message={(q.error as Error).message} />
          </div>
        ) : !q.data?.length ? (
          <EmptyState
            icon={<BookOpen />}
            title="No articles yet"
            description="Upload a PDF, Word or text file (price list, menu, FAQ) or write an article, so AI answers are accurate."
            action={
              canEdit && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload /> Upload documents
                  </Button>
                  <Button onClick={() => setEdit("new")}>
                    <Plus /> New article
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <ul className="divide-y">
            {q.data.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => canEdit && setEdit(d)}
                  className="block w-full px-4 py-3 text-left hover:bg-muted/60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{d.title}</span>
                    <ToneBadge tone="teal">
                      {CATS[d.category as keyof typeof CATS] ?? d.category}
                    </ToneBadge>
                    {d.source_name && (
                      <ToneBadge tone="muted">
                        <FileText className="size-3" /> {d.source_name}
                      </ToneBadge>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Updated {fmtDate(d.updated_at)} · {(d.content?.length ?? 0).toLocaleString()}{" "}
                    characters
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <CannedReplies workspaceId={ws.workspaceId} canEdit={canEdit} />
      {edit && (
        <DocDialog
          doc={edit === "new" ? undefined : edit}
          onClose={() => {
            setEdit(null);
            q.refetch();
          }}
        />
      )}
    </PageContainer>
  );
}

function DocDialog({ doc, onClose }: { doc?: Doc; onClose: () => void }) {
  const { workspaceId } = useWorkspace();
  const [title, setTitle] = useState(doc?.title ?? "");
  const [category, setCategory] = useState(doc?.category ?? "tours");
  const [content, setContent] = useState(doc?.content ?? "");
  async function save() {
    if (!title.trim()) return toast.error("Title is required");
    if (content.length > MAX_DOC_CHARS)
      return toast.error(`Content is too long (max ${MAX_DOC_CHARS.toLocaleString()} characters)`);
    const row = { title: title.trim().slice(0, 200), category, content };
    const { error } = doc
      ? await supabase.from("knowledge_documents").update(row).eq("id", doc.id)
      : await supabase.from("knowledge_documents").insert({ ...row, workspace_id: workspaceId });
    if (error) return toast.error(error.message);
    toast.success("Article saved");
    onClose();
  }
  async function del() {
    if (!doc) return;
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc ? "Edit article" : "New article"}</DialogTitle>
        </DialogHeader>
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lisbon Highlights — 2 hours"
          />
        </Field>
        <Field label="Category">
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Content">
          <Textarea
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Route, duration, price per tuk tuk, max guests, languages, meeting point…"
          />
        </Field>
        <DialogFooter className="gap-2">
          {doc && (
            <Confirm
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
              title="Delete article?"
              description="The AI will no longer use this information."
              confirmLabel="Delete"
              onConfirm={del}
            />
          )}
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Canned = { id: string; title: string; body: string };
function CannedReplies({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const [edit, setEdit] = useState<Canned | "new" | null>(null);
  const q = useQuery({
    queryKey: ["canned", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canned_replies")
        .select("id, title, body")
        .eq("workspace_id", workspaceId)
        .order("sort");
      if (error) throw error;
      return data as Canned[];
    },
  });
  return (
    <>
      <div className="mt-6 mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Saved replies</h2>
          <p className="text-xs text-muted-foreground">
            One-tap answers in the inbox Replies button.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEdit("new")}>
            <Plus /> New reply
          </Button>
        )}
      </div>
      <Panel>
        {q.isLoading ? (
          <ListSkeleton />
        ) : !q.data?.length ? (
          <EmptyState
            icon={<Zap />}
            title="No saved replies"
            description="Add answers to questions guests ask often."
          />
        ) : (
          <ul className="divide-y">
            {q.data.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => canEdit && setEdit(r)}
                  className="block w-full px-4 py-3 text-left hover:bg-muted/60"
                >
                  <span className="text-sm font-semibold">{r.title}</span>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                    {r.body}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {edit && (
        <CannedDialog
          workspaceId={workspaceId}
          item={edit === "new" ? undefined : edit}
          onClose={() => {
            setEdit(null);
            q.refetch();
          }}
        />
      )}
    </>
  );
}

function CannedDialog({
  workspaceId,
  item,
  onClose,
}: {
  workspaceId: string;
  item?: Canned;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  async function save() {
    if (!title.trim() || !body.trim()) return toast.error("Add a title and the reply text.");
    const r = item
      ? await supabase
          .from("canned_replies")
          .update({ title: title.trim(), body: body.trim() })
          .eq("id", item.id)
      : await supabase
          .from("canned_replies")
          .insert({ workspace_id: workspaceId, title: title.trim(), body: body.trim(), sort: 100 });
    if (r.error) return toast.error(r.error.message);
    toast.success("Saved");
    onClose();
  }
  async function del() {
    if (!item) return;
    const r = await supabase.from("canned_replies").delete().eq("id", item.id);
    if (r.error) return toast.error(r.error.message);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit saved reply" : "New saved reply"}</DialogTitle>
        </DialogHeader>
        <Field label="Title">
          <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Reply text">
          <Textarea
            rows={8}
            value={body}
            maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <DialogFooter>
          {item && (
            <Confirm
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
              title="Delete saved reply?"
              description="It will be removed from the inbox Replies list."
              confirmLabel="Delete"
              onConfirm={del}
            />
          )}
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
