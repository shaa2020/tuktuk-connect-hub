import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users, Download, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, SampleBadge, fmtRelative } from "@/components/kit";
import { ContactFormDialog } from "@/components/contact-form";
import { DuplicateFinder, ImportContacts } from "@/components/contact-tools";

export const Route = createFileRoute("/_authenticated/contacts/")({
  head: () => ({
    meta: [
      { title: "Contacts — TeamInbox" },
      { name: "description", content: "Customer contacts." },
    ],
  }),
  component: ContactsPage,
});

const PAGE = 50;

function ContactsPage() {
  const { workspaceId, memberName, userId, role } = useWorkspace();
  const staff = role === "admin" || role === "manager";
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(false);
  const term = q.trim().replace(/[%,()]/g, "");

  const query = useQuery({
    queryKey: ["contacts", workspaceId, term, mine, limit],
    queryFn: async () => {
      let r = supabase
        .from("contacts")
        .select(
          "id, full_name, email, phone, country, preferred_language, assigned_to, last_interaction_at, is_demo, anonymized_at",
          { count: "exact" },
        )
        .eq("workspace_id", workspaceId)
        .is("merged_into", null)
        .order("created_at", { ascending: false })
        .range(0, limit - 1);
      if (term) r = r.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      if (mine) r = r.eq("assigned_to", userId);
      const { data, error, count } = await r;
      if (error) throw error;
      return { rows: data, count: count ?? 0 };
    },
  });

  async function exportCsv() {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "full_name, preferred_name, email, phone, preferred_language, country, created_at, last_interaction_at",
      )
      .eq("workspace_id", workspaceId)
      .is("merged_into", null)
      .is("anonymized_at", null)
      .limit(5000);
    if (error) return toast.error(error.message);
    const cols = Object.keys(data[0] ?? { full_name: "" });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      cols.join(","),
      ...data.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: userId,
      action: "export",
      entity_type: "contacts",
      details: { rows: data.length },
    });
    toast.success(`Exported ${data.length} contacts`);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Contacts"
        description={query.data ? `${query.data.count} contacts` : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download /> Export
            </Button>
            {staff && <ImportContacts workspaceId={workspaceId} />}
            {staff && <DuplicateFinder workspaceId={workspaceId} />}
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus /> New contact
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, email or phone"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            aria-label="Search contacts"
          />
        </div>
        <Button variant={mine ? "default" : "outline"} onClick={() => setMine((v) => !v)}>
          Assigned to me
        </Button>
      </div>
      <Panel>
        {query.isLoading ? (
          <ListSkeleton />
        ) : query.error ? (
          <div className="p-4">
            <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
          </div>
        ) : !query.data?.rows.length ? (
          <EmptyState
            icon={<Users />}
            title={term ? "No matching contacts" : "No contacts yet"}
            description={
              term
                ? "Try a different search."
                : "Add your first customer to start building your guest database."
            }
            action={
              !term && (
                <Button onClick={() => setOpen(true)}>
                  <Plus /> New contact
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y">
            {query.data.rows.map((c) => (
              <li key={c.id}>
                <Link
                  to="/contacts/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60"
                >
                  <Avatar name={c.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {c.anonymized_at ? "Anonymized contact" : c.full_name}
                      </span>
                      <SampleBadge show={c.is_demo} />
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.email, c.phone, c.country].filter(Boolean).join(" · ") ||
                        "No contact details"}
                    </div>
                  </div>
                  <div className="hidden text-right text-xs text-muted-foreground sm:block">
                    <div>{memberName(c.assigned_to)}</div>
                    {c.last_interaction_at && (
                      <div>Active {fmtRelative(c.last_interaction_at)} ago</div>
                    )}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {query.data && query.data.count > limit && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
              Load more
            </Button>
          </div>
        )}
      </Panel>
      {open && <ContactFormDialog open={open} onOpenChange={setOpen} />}
    </PageContainer>
  );
}
