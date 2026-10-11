import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, ArrowLeft, Inbox as InboxIcon, Phone, MessageCircle, Instagram, Mail, Facebook, StickyNote,
  MoreVertical, Send, Sparkles, Languages, Loader2, Smile, AlertTriangle, Tag, Flag, CheckSquare, Target, CalendarCheck, User, Lock, X, MailOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { aiAssist } from "@/lib/ai.functions";
import { sendChannelMessage, syncEmailNow } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { EmptyState, ErrorState, ListSkeleton, errMsg } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, Field, NativeSelect, SampleBadge, ToneBadge, fmtDateTime, fmtRelative } from "@/components/kit";
import { ContactSelect, LeadSelect, BookingSelect } from "@/components/pickers";
import { ContactFormDialog } from "@/components/contact-form";
import { TaskDialog } from "./tasks";
import {
  CHANNEL_LABEL, MESSAGE_STATUS_LABEL, PRIORITY_META, STATUS_META, canAssignTo,
  type ChannelType, type ConversationStatus, type Priority,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const FILTERS = {
  all: "All conversations", mine: "My conversations", unassigned: "Unassigned", unread: "Unread", open: "Open",
  waiting_customer: "Waiting for customer", waiting_team: "Waiting for team", resolved: "Resolved", high: "High priority", failed: "Failed messages",
} as const;
type FilterKey = keyof typeof FILTERS;

export const Route = createFileRoute("/_authenticated/inbox")({
  validateSearch: z.object({ c: z.string().optional() }),
  head: () => ({ meta: [{ title: "Inbox — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Unified customer inbox." }] }),
  component: InboxPage,
});

export function ChannelIcon({ channel, className }: { channel: ChannelType; className?: string }) {
  const I = { whatsapp: MessageCircle, instagram: Instagram, messenger: Facebook, email: Mail, manual: Phone }[channel];
  return <I className={cn("size-3.5", className)} aria-label={CHANNEL_LABEL[channel]} />;
}

function useChannelStatus() {
  const { workspaceId } = useWorkspace();
  return useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: async () => {
      const { data } = await supabase.from("channel_connections").select("channel, status").eq("workspace_id", workspaceId);
      return new Map((data ?? []).map((r) => [r.channel, r.status]));
    },
  });
}

/** While the inbox is open, check the business Gmail for new customer emails every minute. */
function useEmailSync(workspaceId: string, enabled: boolean) {
  const qc = useQueryClient();
  const sync = useServerFn(syncEmailNow);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const run = async () => {
      const r = await sync({ data: { workspaceId } }).catch(() => null);
      if (!stop && r?.ok && r.imported > 0) qc.invalidateQueries();
    };
    run();
    const t = setInterval(() => { if (document.visibilityState === "visible") run(); }, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [workspaceId, enabled, sync, qc]);
}

/** Live-refresh the conversation list when any conversation or message changes in this workspace. */
function useInboxRealtime(workspaceId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["count"] });
      }, 300);
    };
    const ch = supabase.channel(`inbox-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` }, (p) => {
        refresh();
        const id = (p.new as { id?: string })?.id;
        if (id) qc.invalidateQueries({ queryKey: ["conversation", id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch); };
  }, [workspaceId, qc]);
}

function InboxPage() {
  const ws = useWorkspace();
  const chStatus = useChannelStatus();
  useEmailSync(ws.workspaceId, chStatus.data?.get("email") === "connected");
  useInboxRealtime(ws.workspaceId);
  const { c } = Route.useSearch();
  const navigate = useNavigate({ from: "/inbox" });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [channel, setChannel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [label, setLabel] = useState("");
  const [since, setSince] = useState("");
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState(40);
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim().replace(/[%,()]/g, "")), 300); return () => clearTimeout(t); }, [term]);

  const tags = useQuery({
    queryKey: ["tags", ws.workspaceId],
    queryFn: async () => (await supabase.from("tags").select("id, name").eq("workspace_id", ws.workspaceId).order("name")).data ?? [],
  });

  const list = useQuery({
    queryKey: ["conversations", ws.workspaceId, filter, channel, assignee, label, since, debounced, limit],
    queryFn: async () => {
      let r = supabase.from("conversations")
        .select("id, channel, subject, status, priority, assigned_to, unread, last_message_at, last_message_preview, lead_id, booking_id, escalated, is_demo, contacts(full_name), conversation_tags(tags(id, name))", { count: "exact" })
        .eq("workspace_id", ws.workspaceId).order("last_message_at", { ascending: false }).range(0, limit - 1);
      if (filter === "mine") r = r.eq("assigned_to", ws.userId);
      if (filter === "unassigned") r = r.is("assigned_to", null);
      if (filter === "unread") r = r.eq("unread", true);
      if (filter === "open") r = r.in("status", ["open", "in_progress"]);
      if (filter === "waiting_customer" || filter === "waiting_team" || filter === "resolved") r = r.eq("status", filter);
      if (filter === "high") r = r.in("priority", ["high", "urgent"]);
      if (filter !== "resolved" && filter !== "all") r = r.neq("status", "archived");
      if (filter === "failed") {
        const { data: f } = await supabase.from("messages").select("conversation_id").eq("workspace_id", ws.workspaceId).eq("status", "failed").limit(500);
        r = r.in("id", [...new Set((f ?? []).map((x) => x.conversation_id)), "00000000-0000-0000-0000-000000000000"]);
      }
      if (channel) r = r.eq("channel", channel as ChannelType);
      if (assignee) r = r.eq("assigned_to", assignee);
      if (since) r = r.gte("last_message_at", new Date(since).toISOString());
      if (label) {
        const { data: ct } = await supabase.from("conversation_tags").select("conversation_id").eq("tag_id", label);
        r = r.in("id", [...(ct ?? []).map((x) => x.conversation_id), "00000000-0000-0000-0000-000000000000"]);
      }
      if (debounced) {
        const [cs, ms, bs] = await Promise.all([
          supabase.from("contacts").select("id").eq("workspace_id", ws.workspaceId).or(`full_name.ilike.%${debounced}%,email.ilike.%${debounced}%,phone.ilike.%${debounced}%`).limit(100),
          supabase.from("messages").select("conversation_id").eq("workspace_id", ws.workspaceId).ilike("body", `%${debounced}%`).limit(100),
          supabase.from("bookings").select("id").eq("workspace_id", ws.workspaceId).ilike("reference", `%${debounced}%`).limit(50),
        ]);
        const parts = [`subject.ilike.%${debounced}%`];
        const cIds = (cs.data ?? []).map((x) => x.id);
        const mIds = [...new Set((ms.data ?? []).map((x) => x.conversation_id))];
        const bIds = (bs.data ?? []).map((x) => x.id);
        if (cIds.length) parts.push(`contact_id.in.(${cIds.join(",")})`);
        if (mIds.length) parts.push(`id.in.(${mIds.join(",")})`);
        if (bIds.length) parts.push(`booking_id.in.(${bIds.join(",")})`);
        r = r.or(parts.join(","));
      }
      const { data, error, count } = await r;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4rem)] md:h-dvh">
      {/* List pane */}
      <section className={cn("flex w-full flex-col border-r bg-card md:w-[380px] md:shrink-0", c && "hidden md:flex")} aria-label="Conversations">
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Inbox</h1>
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus /> New</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Name, email, phone, message, booking ref" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search conversations" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect value={filter} onChange={(e) => { setFilter(e.target.value as FilterKey); setLimit(40); }} aria-label="View" className="h-9 text-xs">
              {Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
            <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel" className="h-9 text-xs">
              <option value="">All channels</option>
              {(Object.keys(CHANNEL_LABEL) as ChannelType[]).map((k) => <option key={k} value={k}>{CHANNEL_LABEL[k]}</option>)}
            </NativeSelect>
            <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee" className="h-9 text-xs">
              <option value="">Any assignee</option>
              {ws.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
            </NativeSelect>
            <NativeSelect value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" className="h-9 text-xs">
              <option value="">Any label</option>
              {tags.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
            <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} aria-label="Active since" className="col-span-2 h-9 text-xs" title="Active since" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.isLoading ? <ListSkeleton rows={7} /> : list.error ? <div className="p-3"><ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /></div> :
            !list.data?.rows.length ? (
              <EmptyState icon={<InboxIcon />} title="No conversations" description={debounced || filter !== "all" ? "Nothing matches these filters." : "Social channels aren't connected yet. Log phone or walk-in enquiries with “New”."} />
            ) : (
              <ul>
                {list.data.rows.map((v) => {
                  const labels = (v.conversation_tags ?? []).map((x) => x.tags).filter(Boolean) as { id: string; name: string }[];
                  return (
                    <li key={v.id}>
                      <button onClick={() => navigate({ search: { c: v.id } })} className={cn("flex w-full gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60", c === v.id && "bg-primary-soft hover:bg-primary-soft")}>
                        <div className="relative">
                          <Avatar name={v.contacts?.full_name ?? v.subject} />
                          <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-card"><ChannelIcon channel={v.channel} className="size-2.5 text-muted-foreground" /></span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("truncate text-sm", v.unread ? "font-bold" : "font-medium")}>{v.contacts?.full_name ?? v.subject ?? "Unknown customer"}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtRelative(v.last_message_at)}</span>
                          </div>
                          <div className={cn("truncate text-xs", v.unread ? "text-foreground" : "text-muted-foreground")}>{v.last_message_preview ?? "No messages yet"}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <ToneBadge tone={STATUS_META[v.status].tone}>{STATUS_META[v.status].label}</ToneBadge>
                            {(v.priority === "high" || v.priority === "urgent") && <ToneBadge tone={PRIORITY_META[v.priority].tone}>{PRIORITY_META[v.priority].label}</ToneBadge>}
                            {v.escalated && <ToneBadge tone="danger">Escalated</ToneBadge>}
                            {v.lead_id && <Target className="size-3 text-teal" aria-label="Has lead" />}
                            {v.booking_id && <CalendarCheck className="size-3 text-success" aria-label="Has booking" />}
                            {labels.slice(0, 2).map((t) => <ToneBadge key={t.id} tone="muted">{t.name}</ToneBadge>)}
                            <SampleBadge show={v.is_demo} />
                            <span className="ml-auto truncate text-[11px] text-muted-foreground">{v.assigned_to ? ws.memberName(v.assigned_to) : "Unassigned"}</span>
                          </div>
                        </div>
                        {v.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          {list.data && list.data.count > limit && <div className="p-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 40)}>Load more</Button></div>}
        </div>
      </section>
      {/* Thread pane */}
      <section className={cn("min-w-0 flex-1 flex-col bg-background", c ? "flex" : "hidden md:flex")}>
        {c ? <Thread key={c} id={c} onBack={() => navigate({ search: {} })} /> : (
          <div className="flex flex-1 items-center justify-center"><EmptyState icon={<MessageCircle />} title="Select a conversation" description="Choose a conversation from the list to read and reply." /></div>
        )}
      </section>
      {newOpen && <NewConversationDialog onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); navigate({ search: { c: id } }); }} />}
    </div>
  );
}

type TimelineItem =
  | { kind: "msg"; id: string; at: string; direction: "inbound" | "outbound"; body: string; status: string; author: string | null; error: string | null }
  | { kind: "note"; id: string; at: string; body: string; author: string };

const MSG_PAGE = 50;

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const channels = useChannelStatus();
  const [msgLimit, setMsgLimit] = useState(MSG_PAGE);
  const [dialog, setDialog] = useState<null | "contact" | "newcontact" | "lead" | "booking" | "task" | "labels">(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conv = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations")
        .select("*, contacts(id, full_name, email, phone, preferred_language), leads(id, title, stage), bookings(id, reference, tour_name, status, tour_date), conversation_tags(tags(id, name))")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const timeline = useQuery({
    queryKey: ["timeline", id, msgLimit],
    queryFn: async () => {
      const [m, n] = await Promise.all([
        supabase.from("messages").select("id, direction, body, status, author_id, created_at, error_message", { count: "exact" }).eq("conversation_id", id).order("created_at", { ascending: false }).range(0, msgLimit - 1),
        supabase.from("internal_notes").select("id, body, author_id, created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(200),
      ]);
      if (m.error) throw m.error;
      if (n.error) throw n.error;
      const oldest = m.data.length ? m.data[m.data.length - 1]!.created_at : null;
      const hasMore = (m.count ?? 0) > m.data.length;
      const items: TimelineItem[] = [
        ...m.data.map((x) => ({ kind: "msg" as const, id: x.id, at: x.created_at, direction: x.direction, body: x.body, status: x.status, author: x.author_id, error: x.error_message })),
        ...n.data.filter((x) => !hasMore || !oldest || x.created_at >= oldest).map((x) => ({ kind: "note" as const, id: x.id, at: x.created_at, body: x.body, author: x.author_id })),
      ].sort((a, b) => a.at.localeCompare(b.at));
      return { items, hasMore };
    },
  });

  // Mark read on open
  useEffect(() => {
    if (conv.data?.unread) {
      supabase.from("conversations").update({ unread: false }).eq("id", id).then(() => qc.invalidateQueries({ queryKey: ["count"] }));
    }
  }, [conv.data?.unread, id, qc]);

  // Realtime for this thread (dedup by refetching by id rather than appending payloads)
  useEffect(() => {
    const ch = supabase.channel(`thread-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["timeline", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_notes", filter: `conversation_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["timeline", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  useEffect(() => { if (msgLimit === MSG_PAGE) bottomRef.current?.scrollIntoView({ block: "end" }); }, [timeline.data?.items.length, msgLimit]);

  if (conv.isLoading) return <ListSkeleton rows={6} />;
  if (conv.error) return <div className="p-4"><ErrorState message={(conv.error as Error).message} onRetry={() => conv.refetch()} /></div>;
  const v = conv.data;
  if (!v) return <div className="p-6"><ErrorState message="This conversation doesn't exist or isn't assigned to you." /></div>;

  const labels = (v.conversation_tags ?? []).map((x) => x.tags).filter(Boolean) as { id: string; name: string }[];
  const connected = channels.data?.get(v.channel) === "connected";

  async function update(patch: Database["public"]["Tables"]["conversations"]["Update"], success?: string) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", id);
    if (error) return toast.error(error.message.includes("Agents can only") ? "Agents can only assign conversations to themselves." : error.message);
    if (success) toast.success(success);
    qc.invalidateQueries({ queryKey: ["conversation", id] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["count"] });
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b bg-card px-3 py-2.5">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to list"><ArrowLeft /></Button>
        <Avatar name={v.contacts?.full_name ?? v.subject} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {v.contacts ? <Link to="/contacts/$id" params={{ id: v.contacts.id }} className="truncate text-sm font-semibold hover:underline">{v.contacts.full_name}</Link>
              : <span className="truncate text-sm font-semibold">{v.subject ?? "Unknown customer"}</span>}
            <SampleBadge show={v.is_demo} />
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><ChannelIcon channel={v.channel} />{CHANNEL_LABEL[v.channel]}{v.subject && v.contacts ? ` · ${v.subject}` : ""}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Conversation actions"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => update({ unread: !v.unread }, v.unread ? "Marked as read" : "Marked as unread")}><MailOpen />{v.unread ? "Mark as read" : "Mark as unread"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => update({ escalated: !v.escalated, priority: v.escalated ? v.priority : "urgent" }, v.escalated ? "Escalation removed" : "Escalated to managers")}><Flag />{v.escalated ? "Remove escalation" : "Escalate"}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("labels")}><Tag />Labels</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDialog("contact")}><User />Link existing contact</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("newcontact")}><Plus />Create new contact</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("lead")}><Target />Link lead</DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/leads" search={{ new: true, contact: v.contact_id ?? undefined, conversation: id }}><Target />Create lead from conversation</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("booking")}><CalendarCheck />Link booking</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialog("task")}><CheckSquare />Create follow-up task</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="grid grid-cols-3 gap-2 border-b bg-card px-3 py-2">
        <NativeSelect className="h-9 text-xs" value={v.status} onChange={(e) => update({ status: e.target.value as ConversationStatus }, "Status updated")} aria-label="Status">
          {(Object.keys(STATUS_META) as ConversationStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </NativeSelect>
        <NativeSelect className="h-9 text-xs" value={v.priority} onChange={(e) => update({ priority: e.target.value as Priority }, "Priority updated")} aria-label="Priority">
          {(Object.keys(PRIORITY_META) as Priority[]).map((s) => <option key={s} value={s}>{PRIORITY_META[s].label}</option>)}
        </NativeSelect>
        <NativeSelect className="h-9 text-xs" value={v.assigned_to ?? ""} onChange={(e) => update({ assigned_to: e.target.value || null }, "Assignment updated")} aria-label="Assignee">
          <option value="">Unassigned</option>
          {ws.members.filter((m) => m.active).map((m) => (
            <option key={m.user_id} value={m.user_id} disabled={!canAssignTo(ws.role, ws.userId, m.user_id)}>{m.full_name || m.email}{m.user_id === ws.userId ? " (me)" : ""}</option>
          ))}
        </NativeSelect>
      </div>

      {(labels.length > 0 || v.leads || v.bookings || v.escalated) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-card px-3 py-2 text-xs">
          {v.escalated && <ToneBadge tone="danger"><Flag className="size-3" />Escalated</ToneBadge>}
          {labels.map((t) => <ToneBadge key={t.id} tone="muted">{t.name}</ToneBadge>)}
          {v.leads && <Link to="/leads" search={{ l: v.leads.id }}><ToneBadge tone="teal"><Target className="size-3" />{v.leads.title}</ToneBadge></Link>}
          {v.bookings && <Link to="/bookings" search={{ b: v.bookings.id }}><ToneBadge tone="success"><CalendarCheck className="size-3" />{v.bookings.reference}</ToneBadge></Link>}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-6">
        {timeline.data?.hasMore && <div className="text-center"><Button variant="ghost" size="sm" onClick={() => setMsgLimit((l) => l + MSG_PAGE)}>Load earlier messages</Button></div>}
        {timeline.isLoading ? <ListSkeleton rows={3} /> : timeline.error ? <ErrorState message={(timeline.error as Error).message} onRetry={() => timeline.refetch()} /> :
          !timeline.data?.items.length ? <p className="py-10 text-center text-sm text-muted-foreground">No messages yet.</p> :
            timeline.data.items.map((it) => it.kind === "note" ? (
              <div key={it.id} className="mx-auto max-w-xl rounded-xl border border-dashed border-note-border bg-note px-3.5 py-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-warning"><Lock className="size-3" />Internal note · {ws.memberName(it.author)} · {fmtDateTime(it.at)}</div>
                <p className="whitespace-pre-wrap text-sm">{it.body}</p>
              </div>
            ) : (
              <div key={it.id} className={cn("flex", it.direction === "outbound" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 md:max-w-[70%]", it.direction === "outbound" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card")}>
                  <p className="whitespace-pre-wrap text-sm">{it.body}</p>
                  <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", it.direction === "outbound" ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {it.direction === "outbound" && it.author && <span>{ws.memberName(it.author)} ·</span>}
                    <span>{fmtDateTime(it.at)}</span>
                    <span>· {MESSAGE_STATUS_LABEL[it.status as keyof typeof MESSAGE_STATUS_LABEL]}</span>
                    {it.status === "failed" && <AlertTriangle className="size-3" />}
                  </div>
                  {it.status === "failed" && it.error && <p className="mt-1 text-[11px]">{it.error}</p>}
                </div>
              </div>
            ))}
        <div ref={bottomRef} />
      </div>

      <Composer conversationId={id} channel={v.channel} connected={connected} />

      {dialog === "contact" && <LinkDialog title="Link existing contact" onClose={() => setDialog(null)} render={(val, set) => <ContactSelect value={val} onChange={set} />} initial={v.contact_id ?? ""} onSave={(x) => update({ contact_id: x || null }, "Contact linked").then(() => setDialog(null))} />}
      {dialog === "lead" && <LinkDialog title="Link lead" onClose={() => setDialog(null)} render={(val, set) => <LeadSelect value={val} onChange={set} />} initial={v.lead_id ?? ""} onSave={(x) => update({ lead_id: x || null }, "Lead linked").then(() => setDialog(null))} />}
      {dialog === "booking" && <LinkDialog title="Link booking" onClose={() => setDialog(null)} render={(val, set) => <BookingSelect value={val} onChange={set} />} initial={v.booking_id ?? ""} onSave={(x) => update({ booking_id: x || null }, "Booking linked").then(() => setDialog(null))} />}
      {dialog === "newcontact" && <ContactFormDialog open onOpenChange={() => setDialog(null)} onSaved={(cid) => update({ contact_id: cid }, "Contact created and linked")} />}
      {dialog === "task" && <TaskDialog defaults={{ conversation: id, contact: v.contact_id ?? undefined, lead: v.lead_id ?? undefined }} onClose={() => setDialog(null)} />}
      {dialog === "labels" && <LabelsDialog conversationId={id} current={labels} onClose={() => { setDialog(null); conv.refetch(); qc.invalidateQueries({ queryKey: ["conversations"] }); }} />}
    </>
  );
}

const EMOJI = ["😀", "😊", "🙏", "👍", "👋", "🎉", "❤️", "🙌", "😅", "🤔", "✅", "📍", "🕒", "📅", "🛺", "☀️", "🌅", "🇵🇹", "🍷", "📸"];

function Composer({ conversationId, channel, connected }: { conversationId: string; channel: ChannelType; connected: boolean }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const draftKey = `draft:${conversationId}`;
  const [mode, setMode] = useState<"send" | "log" | "note">(connected ? "send" : "log");
  useEffect(() => { setMode(connected ? "send" : "log"); }, [connected, conversationId]);
  const sendFn = useServerFn(sendChannelMessage);
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { setText(localStorage.getItem(draftKey) ?? ""); }, [draftKey]);
  useEffect(() => { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); }, [text, draftKey]);

  const assist = useServerFn(aiAssist);
  const [ai, setAi] = useState<{ kind: "draft" | "summarize" | "translate"; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  async function runAi(task: "draft" | "summarize" | "translate") {
    setAiBusy(task);
    try {
      const r = await assist({ data: { conversationId, task, text: text.trim() || undefined } });
      if (r.ok) setAi({ kind: task, text: r.text }); else toast.error(r.error);
    } catch (e) { toast.error(errMsg(e)); } finally { setAiBusy(null); }
  }

  async function submit() {
    const body = text.trim();
    if (!body) return;
    if (body.length > (mode === "note" ? 5000 : 10000)) return toast.error("Message is too long");
    setBusy(true);
    setFailed(null);
    try {
      if (mode === "send") {
        const r = await sendFn({ data: { conversationId, body } });
        if (!r.ok) { qc.invalidateQueries({ queryKey: ["timeline", conversationId] }); throw new Error(r.error); }
      } else if (mode === "note") {
        const { error } = await supabase.from("internal_notes").insert({ workspace_id: ws.workspaceId, conversation_id: conversationId, body, author_id: ws.userId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("messages").insert({ workspace_id: ws.workspaceId, conversation_id: conversationId, direction, body, status: "logged" });
        if (error) throw error;
      }
      setText("");
      qc.invalidateQueries({ queryKey: ["timeline", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      setFailed(errMsg(e)); // keep the text so nothing is lost
    } finally { setBusy(false); }
  }

  return (
    <div className="pb-safe border-t bg-card p-3">
      {!connected && mode === "log" && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {channel === "manual"
              ? "Phone / walk-in conversation: entries are logged for the record and are not sent to the customer."
              : `${CHANNEL_LABEL[channel]} isn't connected yet, so replies can't be sent from here. You can log what was said on another device.`}
          </span>
        </div>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {connected && <button onClick={() => setMode("send")} className={cn("flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium", mode === "send" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Send className="size-3" />Reply to customer</button>}
        <button onClick={() => setMode("log")} className={cn("h-8 rounded-full px-3 text-xs font-medium", mode === "log" ? "bg-navy text-primary-foreground" : "bg-muted text-muted-foreground")}>Log message</button>
        <button onClick={() => setMode("note")} className={cn("flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium", mode === "note" ? "bg-warning text-primary-foreground" : "bg-muted text-muted-foreground")}><StickyNote className="size-3" />Internal note</button>
        {mode === "log" && (
          <NativeSelect className="ml-auto h-8 w-auto text-xs" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label="Who said it">
            <option value="outbound">We replied</option>
            <option value="inbound">Customer said</option>
          </NativeSelect>
        )}
      </div>
      {ai && (
        <div className="mb-2 rounded-lg border border-primary/30 bg-primary-soft p-2.5">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase text-primary">
            <span>AI {ai.kind === "summarize" ? "summary" : ai.kind === "translate" ? "translation" : "suggested reply"} — review before using</span>
            <button onClick={() => setAi(null)} aria-label="Dismiss"><X className="size-3.5" /></button>
          </div>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{ai.text}</p>
          {ai.kind !== "summarize" && <Button size="sm" variant="outline" className="mt-2" onClick={() => { setText(ai.text); setAi(null); }}>Use this text</Button>}
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => runAi("draft")} disabled={!!aiBusy}>{aiBusy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />}Draft reply</Button>
        <Button size="sm" variant="outline" onClick={() => runAi("summarize")} disabled={!!aiBusy}>{aiBusy === "summarize" ? <Loader2 className="animate-spin" /> : <Sparkles />}Summarize</Button>
        <Button size="sm" variant="outline" onClick={() => runAi("translate")} disabled={!!aiBusy || !text.trim()} title="Translate the text in the box into the guest's language">{aiBusy === "translate" ? <Loader2 className="animate-spin" /> : <Languages />}Translate</Button>
      </div>
      <div className={cn("flex items-end gap-2 rounded-xl border p-1.5", mode === "note" && "border-note-border bg-note")}>
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Insert emoji"><Smile /></Button></PopoverTrigger>
          <PopoverContent className="w-64 p-2">
            <div className="grid grid-cols-5 gap-1">{EMOJI.map((e) => <button key={e} onClick={() => setText((t) => t + e)} className="rounded p-1.5 text-xl hover:bg-muted">{e}</button>)}</div>
          </PopoverContent>
        </Popover>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
          placeholder={mode === "send" ? `Reply via ${CHANNEL_LABEL[channel]}` : mode === "note" ? "Private note — only your team can see this" : direction === "outbound" ? "What did you reply?" : "What did the customer say?"}
          rows={1}
          className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent p-1.5 shadow-none focus-visible:ring-0"
          aria-label="Message"
        />
        <Button size="icon" className="size-9 shrink-0" onClick={submit} disabled={busy || !text.trim()} variant={mode === "note" ? "navy" : "default"} aria-label={mode === "send" ? "Send" : mode === "note" ? "Add note" : "Log message"}><Send /></Button>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Ctrl/⌘ + Enter to save · Draft is kept on this device</span>
        {failed && <span className="flex items-center gap-1 text-destructive">{mode === "send" ? "Not sent:" : "Not saved:"} {failed} <button className="font-semibold underline" onClick={submit}>Retry</button></span>}
      </div>
    </div>
  );
}

function LinkDialog({ title, initial, render, onSave, onClose }: { title: string; initial: string; render: (v: string, set: (v: string) => void) => React.ReactNode; onSave: (v: string) => Promise<unknown>; onClose: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {render(v, setV)}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(v)}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LabelsDialog({ conversationId, current, onClose }: { conversationId: string; current: { id: string; name: string }[]; onClose: () => void }) {
  const { workspaceId } = useWorkspace();
  const [name, setName] = useState("");
  const tags = useQuery({ queryKey: ["tags", workspaceId], queryFn: async () => (await supabase.from("tags").select("id, name").eq("workspace_id", workspaceId).order("name")).data ?? [] });
  const [sel, setSel] = useState(new Set(current.map((c) => c.id)));
  async function toggle(id: string) {
    const on = sel.has(id);
    const { error } = on
      ? await supabase.from("conversation_tags").delete().eq("conversation_id", conversationId).eq("tag_id", id)
      : await supabase.from("conversation_tags").insert({ conversation_id: conversationId, tag_id: id, workspace_id: workspaceId });
    if (error) return toast.error(error.message);
    const n = new Set(sel); on ? n.delete(id) : n.add(id); setSel(n);
  }
  async function create() {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    const { data, error } = await supabase.from("tags").insert({ workspace_id: workspaceId, name: n }).select("id").single();
    if (error) return toast.error(error.message.includes("duplicate") ? "That label already exists" : error.message);
    setName("");
    await tags.refetch();
    toggle(data.id);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Labels</DialogTitle><DialogDescription>Tap a label to add or remove it.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2">
          {tags.data?.map((t) => (
            <button key={t.id} onClick={() => toggle(t.id)} className={cn("flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium", sel.has(t.id) ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
              {t.name}{sel.has(t.id) && <X className="size-3" />}
            </button>
          ))}
          {!tags.data?.length && <p className="text-sm text-muted-foreground">No labels yet.</p>}
        </div>
        <div className="flex gap-2"><Input placeholder="New label" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /><Button variant="outline" onClick={create}>Add</Button></div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewConversationDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState("");
  const [first, setFirst] = useState("");
  const [assign, setAssign] = useState(ws.userId);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const channels = useMemo(() => Object.keys(CHANNEL_LABEL) as ChannelType[], []);
  async function create() {
    setErr(null);
    if (!contact && !subject.trim()) return setErr("Choose a contact or enter a subject");
    setBusy(true);
    try {
      const { data, error } = await supabase.from("conversations").insert({
        workspace_id: ws.workspaceId, channel: "manual", contact_id: contact || null, subject: subject.trim().slice(0, 200) || null, assigned_to: assign || null, unread: false,
      }).select("id").single();
      if (error) throw error;
      if (first.trim()) {
        const { error: me } = await supabase.from("messages").insert({ workspace_id: ws.workspaceId, conversation_id: data.id, direction: "inbound", body: first.trim().slice(0, 10000), status: "logged" });
        if (me) throw me;
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation created");
      onCreated(data.id);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a new conversation</DialogTitle>
          <DialogDescription>For phone calls, walk-ins and other enquiries. Social channels will appear here automatically once connected.</DialogDescription>
        </DialogHeader>
        <Field label="Channel">
          <NativeSelect value="manual" onChange={() => undefined}>
            {channels.map((c) => <option key={c} value={c} disabled={c !== "manual"}>{CHANNEL_LABEL[c]}{c !== "manual" ? " — not connected" : ""}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Contact"><ContactSelect value={contact} onChange={setContact} /></Field>
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Phone enquiry — sunset tour" /></Field>
        <Field label="Assign to">
          <NativeSelect value={assign} onChange={(e) => setAssign(e.target.value)}>
            <option value="">Unassigned</option>
            {ws.members.filter((m) => m.active).map((m) => <option key={m.user_id} value={m.user_id} disabled={!canAssignTo(ws.role, ws.userId, m.user_id)}>{m.full_name || m.email}</option>)}
          </NativeSelect>
        </Field>
        <Field label="What did the customer say? (optional)"><Textarea rows={3} value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
        {err && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{err}</p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create} disabled={busy}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

