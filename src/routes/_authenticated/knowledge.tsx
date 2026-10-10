import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Confirm, Field, NativeSelect, ToneBadge, fmtDate } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Tours, prices and policies." }] }),
  component: KnowledgePage,
});

const CATS = { tours: "Tours", prices: "Prices", meeting_points: "Meeting points", policies: "Policies", faq: "FAQ", general: "General" } as const;
type Doc = { id: string; title: string; category: string; content: string | null; updated_at: string };

function KnowledgePage() {
  const ws = useWorkspace();
  const canEdit = ws.role === "admin" || ws.role === "manager";
  const [edit, setEdit] = useState<Doc | "new" | null>(null);
  const q = useQuery({
    queryKey: ["kb", ws.workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("knowledge_documents").select("id, title, category, content, updated_at").eq("workspace_id", ws.workspaceId).order("category").order("title");
      if (error) throw error;
      return data as Doc[];
    },
  });
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Knowledge Base" description="Facts the AI uses for suggestions: tours, prices, meeting points and policies."
        actions={canEdit && <Button size="sm" onClick={() => setEdit("new")}><Plus /> New article</Button>} />
      <Panel>
        {q.isLoading ? <ListSkeleton /> : q.error ? <div className="p-4"><ErrorState message={(q.error as Error).message} /></div> :
          !q.data?.length ? <EmptyState icon={<BookOpen />} title="No articles yet" description="Add your tour descriptions, prices and meeting points so AI suggestions are accurate." action={canEdit && <Button onClick={() => setEdit("new")}><Plus /> New article</Button>} /> : (
            <ul className="divide-y">{q.data.map((d) => (
              <li key={d.id}>
                <button onClick={() => canEdit && setEdit(d)} className="block w-full px-4 py-3 text-left hover:bg-muted/60">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold">{d.title}</span><ToneBadge tone="teal">{CATS[d.category as keyof typeof CATS] ?? d.category}</ToneBadge></div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Updated {fmtDate(d.updated_at)}</p>
                </button>
              </li>
            ))}</ul>
          )}
      </Panel>
      {edit && <DocDialog doc={edit === "new" ? undefined : edit} onClose={() => { setEdit(null); q.refetch(); }} />}
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
    if (content.length > 20000) return toast.error("Content is too long (max 20,000 characters)");
    const row = { title: title.trim().slice(0, 200), category, content };
    const { error } = doc ? await supabase.from("knowledge_documents").update(row).eq("id", doc.id) : await supabase.from("knowledge_documents").insert({ ...row, workspace_id: workspaceId });
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
        <DialogHeader><DialogTitle>{doc ? "Edit article" : "New article"}</DialogTitle></DialogHeader>
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lisbon Highlights — 2 hours" /></Field>
        <Field label="Category"><NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
        <Field label="Content"><Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Route, duration, price per tuk tuk, max guests, languages, meeting point…" /></Field>
        <DialogFooter className="gap-2">
          {doc && <Confirm trigger={<Button variant="outline" className="text-destructive"><Trash2 /> Delete</Button>} title="Delete article?" description="The AI will no longer use this information." confirmLabel="Delete" onConfirm={del} />}
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
