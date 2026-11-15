import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tables included in a full workspace export (GDPR portability). Read with the admin's own
// RLS-scoped client, so the export can never contain anything the admin can't already see.
// Encrypted credentials are never exported.
export const EXPORT_TABLES = [
  "contacts", "contact_consents", "contact_tags", "tags", "external_identities", "leads", "lead_activities", "bookings",
  "conversations", "messages", "internal_notes", "tasks", "knowledge_documents", "canned_replies", "saved_replies",
  "vehicles", "staff_shifts", "time_off_requests", "social_posts", "automation_workflows", "paypal_transactions",
  "contact_field_definitions", "audit_logs",
] as const;
const PAGE = 1000, MAX_PER_TABLE = 50_000;

export const exportWorkspaceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: ok } = await sb.rpc("has_ws_role", { _ws: data.workspaceId, _roles: ["admin"] });
    if (ok !== true) throw new Error("Only a Business Admin can export all workspace data.");
    const out: Record<string, unknown[]> = {};
    const truncated: string[] = [];
    for (const t of EXPORT_TABLES) {
      const rows: unknown[] = [];
      for (let from = 0; from < MAX_PER_TABLE; from += PAGE) {
        const { data: page, error } = await sb.from(t).select("*").eq("workspace_id", data.workspaceId).range(from, from + PAGE - 1);
        if (error) throw new Error(`${t}: ${error.message}`);
        rows.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
        if (from + PAGE >= MAX_PER_TABLE) truncated.push(t);
      }
      out[t] = rows;
    }
    const { data: ws } = await sb.from("workspaces").select("id, name, timezone, industry, locale, plan, created_at").eq("id", data.workspaceId).maybeSingle();
    await sb.from("audit_logs").insert({ workspace_id: data.workspaceId, actor_id: context.userId, action: "export", entity_type: "workspaces", entity_id: data.workspaceId, details: { full_export: true, tables: EXPORT_TABLES.length } });
    return JSON.stringify({ exported_at: new Date().toISOString(), workspace: ws, truncated, data: out });
  });
