// Server-only: runs due automation events for one workspace (called by the background job).
// Events are claimed atomically (pending → processing), each action's outcome is recorded, and
// failures retry up to 3 times. Idempotency comes from the queue's unique (workflow, key).
import { Action, Conditions, matches, nextRetry, render, type Ctx } from "./automation";

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

type Loaded = { ctx: Ctx; conversationId: string | null; contactId: string | null; assignee: string | null };

async function load(sb: any, ws: string, type: string, id: string): Promise<Loaded | null> {
  const { data: w } = await sb.from("workspaces").select("name").eq("id", ws).maybeSingle();
  const base: Ctx = { business_name: w?.name ?? "" };
  if (type === "conversation" || type === "message") {
    let convId = id, text: string | null = null;
    if (type === "message") {
      const { data: m } = await sb.from("messages").select("conversation_id, body").eq("id", id).eq("workspace_id", ws).maybeSingle();
      if (!m) return null; convId = m.conversation_id; text = m.body;
    }
    const { data: c } = await sb.from("conversations").select("id, channel, assigned_to, contact_id, contacts(full_name)").eq("id", convId).eq("workspace_id", ws).maybeSingle();
    if (!c) return null;
    return { ctx: { ...base, channel: c.channel, text, contact_name: c.contacts?.full_name ?? null }, conversationId: c.id, contactId: c.contact_id, assignee: c.assigned_to };
  }
  if (type === "booking") {
    const { data: b } = await sb.from("bookings").select("id, reference, tour_name, tour_date, start_time, contact_id, contacts(full_name)").eq("id", id).eq("workspace_id", ws).maybeSingle();
    if (!b) return null;
    const { data: conv } = b.contact_id
      ? await sb.from("conversations").select("id, assigned_to").eq("workspace_id", ws).eq("contact_id", b.contact_id).neq("channel", "manual").order("last_message_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    return { ctx: { ...base, tour_name: b.tour_name, booking_reference: b.reference, tour_date: b.tour_date, start_time: b.start_time?.slice(0, 5) ?? null, contact_name: b.contacts?.full_name ?? null }, conversationId: conv?.id ?? null, contactId: b.contact_id, assignee: conv?.assigned_to ?? null };
  }
  if (type === "lead") {
    const { data: l } = await sb.from("leads").select("id, title, notes, source, tour_interest, owner_id, contact_id, contacts(full_name)").eq("id", id).eq("workspace_id", ws).maybeSingle();
    if (!l) return null;
    return { ctx: { ...base, text: `${l.title}\n${l.notes ?? ""}`, source: l.source, tour_name: l.tour_interest, contact_name: l.contacts?.full_name ?? null }, conversationId: null, contactId: l.contact_id, assignee: l.owner_id };
  }
  return null;
}

async function runAction(sb: any, ws: string, a: Action, L: Loaded): Promise<string> {
  switch (a.type) {
    case "assign": {
      if (!L.conversationId) throw new Error("No conversation to assign");
      const { error } = await sb.from("conversations").update({ assigned_to: a.user_id }).eq("id", L.conversationId);
      if (error) throw new Error(error.message);
      return "assigned";
    }
    case "set_priority": {
      if (!L.conversationId) throw new Error("No conversation");
      await sb.from("conversations").update({ priority: a.priority }).eq("id", L.conversationId);
      return `priority ${a.priority}`;
    }
    case "add_tag": {
      let { data: tag } = await sb.from("tags").select("id").eq("workspace_id", ws).eq("name", a.tag).maybeSingle();
      if (!tag) tag = (await sb.from("tags").insert({ workspace_id: ws, name: a.tag }).select("id").single()).data;
      if (!tag) throw new Error("Could not create tag");
      if (L.conversationId) await sb.from("conversation_tags").upsert({ conversation_id: L.conversationId, tag_id: tag.id, workspace_id: ws });
      else if (L.contactId) await sb.from("contact_tags").upsert({ contact_id: L.contactId, tag_id: tag.id, workspace_id: ws });
      else throw new Error("Nothing to tag");
      return `tagged ${a.tag}`;
    }
    case "create_task": {
      const { error } = await sb.from("tasks").insert({
        workspace_id: ws, title: render(a.title, L.ctx).slice(0, 200) || a.title, assigned_to: a.assign_to ?? L.assignee ?? null,
        due_at: a.due_hours !== undefined ? new Date(Date.now() + a.due_hours * 3_600_000).toISOString() : null,
        conversation_id: L.conversationId, contact_id: L.contactId, created_by: null,
      });
      if (error) throw new Error(error.message);
      return "task created";
    }
    case "notify": {
      let users: string[] = [];
      if (a.to === "managers") users = ((await sb.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("active", true).in("role", ["admin", "manager"])).data ?? []).map((m: any) => m.user_id);
      else if (a.to === "assignee") users = L.assignee ? [L.assignee] : [];
      else users = [a.to];
      if (!users.length) return "nobody to notify";
      await sb.from("notifications").insert(users.map((u) => ({ workspace_id: ws, user_id: u, kind: "automation", title: render(a.text, L.ctx).slice(0, 120), link: L.conversationId ? `/inbox?c=${L.conversationId}` : null })));
      return `notified ${users.length}`;
    }
    case "send_message": {
      if (!L.conversationId) throw new Error("No customer conversation to reply in");
      const text = render(a.text, L.ctx);
      if (!text) throw new Error("Message is empty after filling placeholders");
      const r = await (await import("./outbound.server")).sendToConversation(L.conversationId, text, null);
      if (!r.ok) throw new Error(r.error);
      return "message sent";
    }
  }
}

export async function processAutomationEvents(ws: string, limit = 20) {
  const sb = await db();
  const now = new Date().toISOString();
  // Recover executions abandoned by a crashed run.
  await sb.from("automation_events").update({ status: "pending" }).eq("workspace_id", ws).eq("status", "processing").lt("run_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { data: due } = await sb.from("automation_events").select("id").eq("workspace_id", ws).eq("status", "pending").lte("run_at", now).order("run_at").limit(limit);
  let done = 0, failed = 0;
  for (const { id } of due ?? []) {
    const { data: ev } = await sb.from("automation_events").update({ status: "processing", run_at: now }).eq("id", id).eq("status", "pending")
      .select("id, workflow_id, entity_type, entity_id, attempts").maybeSingle();
    if (!ev) continue;
    const attempts = (ev.attempts ?? 0) + 1;
    try {
      const { data: wf } = await sb.from("automation_workflows").select("enabled, conditions, actions").eq("id", ev.workflow_id).maybeSingle();
      if (!wf?.enabled) { await sb.from("automation_events").update({ status: "skipped", error: "Workflow disabled", attempts, finished_at: new Date().toISOString() }).eq("id", id); continue; }
      const L = await load(sb, ws, ev.entity_type, ev.entity_id);
      if (!L) { await sb.from("automation_events").update({ status: "skipped", error: "Record no longer exists", attempts, finished_at: new Date().toISOString() }).eq("id", id); continue; }
      const cond = Conditions.safeParse(wf.conditions ?? {});
      if (!cond.success || !matches(cond.data, L.ctx)) { await sb.from("automation_events").update({ status: "skipped", result: { reason: "conditions not met" }, attempts, finished_at: new Date().toISOString() }).eq("id", id); continue; }
      const results: { action: string; ok: boolean; detail: string }[] = [];
      for (const raw of (wf.actions ?? []) as unknown[]) {
        const a = Action.safeParse(raw);
        if (!a.success) { results.push({ action: "invalid", ok: false, detail: "Invalid action" }); continue; }
        try { results.push({ action: a.data.type, ok: true, detail: await runAction(sb, ws, a.data, L) }); }
        catch (e) { results.push({ action: a.data.type, ok: false, detail: (e as Error).message.slice(0, 200) }); }
      }
      const anyFailed = results.some((r) => !r.ok);
      // Only retry when nothing succeeded (avoids repeating actions that already happened).
      const retryAt = anyFailed && results.every((r) => !r.ok) ? nextRetry(attempts) : null;
      await sb.from("automation_events").update({
        status: retryAt ? "pending" : anyFailed ? "failed" : "done", run_at: retryAt ?? now, attempts, result: { actions: results },
        error: anyFailed ? results.filter((r) => !r.ok).map((r) => `${r.action}: ${r.detail}`).join("; ").slice(0, 500) : null,
        finished_at: retryAt ? null : new Date().toISOString(),
      }).eq("id", id);
      if (anyFailed && !retryAt) failed++; else if (!anyFailed) done++;
    } catch (e) {
      const retryAt = nextRetry(attempts);
      await sb.from("automation_events").update({ status: retryAt ? "pending" : "failed", run_at: retryAt ?? now, attempts, error: (e as Error).message.slice(0, 500) }).eq("id", id);
      failed++;
    }
  }
  return { done, failed };
}
