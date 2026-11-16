import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { NativeSelect, fmtDateTime } from "@/components/kit";
import { canViewAudit } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — TeamInbox" },
      { name: "description", content: "Record of important changes." },
    ],
  }),
  component: AuditPage,
});

const ENTITY: Record<string, string> = {
  leads: "Lead",
  bookings: "Booking",
  contacts: "Contact",
  conversations: "Conversation",
  workspace_members: "Team member",
  workspaces: "Workspace",
  invitations: "Invitation",
};

function AuditPage() {
  const ws = useWorkspace();
  const [entity, setEntity] = useState("");
  const [limit, setLimit] = useState(50);
  const allowed = canViewAudit(ws.role);
  const q = useQuery({
    queryKey: ["audit", ws.workspaceId, entity, limit],
    enabled: allowed,
    queryFn: async () => {
      let r = supabase
        .from("audit_logs")
        .select("*")
        .eq("workspace_id", ws.workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (entity) r = r.eq("entity_type", entity);
      const { data, error } = await r;
      if (error) throw error;
      return data;
    },
  });
  if (!allowed)
    return (
      <PageContainer>
        <Panel>
          <EmptyState
            icon={<ShieldAlert />}
            title="Restricted"
            description="Only admins and managers can view the audit log."
          />
        </Panel>
      </PageContainer>
    );
  return (
    <PageContainer>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when."
        actions={
          <NativeSelect
            className="w-44"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            aria-label="Filter"
          >
            <option value="">All records</option>
            {Object.entries(ENTITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
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
          <EmptyState icon={<ScrollText />} title="No events yet" />
        ) : (
          <ul className="divide-y">
            {q.data.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-semibold">{ws.memberName(a.actor_id)}</span> · {a.action}{" "}
                    · {ENTITY[a.entity_type] ?? a.entity_type}
                  </span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span>
                </div>
                <Details d={a.details as Record<string, unknown>} memberName={ws.memberName} />
              </li>
            ))}
          </ul>
        )}
        {q.data && q.data.length >= limit && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit((l) => l + 50)}>
              Load more
            </Button>
          </div>
        )}
      </Panel>
    </PageContainer>
  );
}

function Details({
  d,
  memberName,
}: {
  d: Record<string, unknown>;
  memberName: (id: string | null) => string;
}) {
  const entries = Object.entries(d ?? {})
    .filter(([k]) => !["id", "workspace_id", "created_by", "token"].includes(k))
    .slice(0, 6);
  if (!entries.length) return null;
  const show = (v: unknown, k: string) => {
    if (v == null) return "—";
    if (
      (k.endsWith("_to") ||
        k === "owner_id" ||
        k === "assigned_to" ||
        k === "from" ||
        k === "to") &&
      typeof v === "string" &&
      v.length === 36
    )
      return memberName(v);
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {entries.map(([k, v]) => {
        const ft =
          v && typeof v === "object" && "from" in (v as object)
            ? (v as { from: unknown; to: unknown })
            : null;
        return (
          <div key={k} className="truncate">
            <span className="font-medium">{k.replace(/_/g, " ")}:</span>{" "}
            {ft ? `${show(ft.from, k)} → ${show(ft.to, k)}` : show(v, k)}
          </div>
        );
      })}
    </div>
  );
}
