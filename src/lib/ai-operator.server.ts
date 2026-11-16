// Server-only: the AI Operator ("Away mode"). Runs from the 5-minute background job or "Run now".
// Bounded per run, single-flight lock in the database, idempotent per guest message, pauses on credit/permission errors.
import {
  decisionFromRaw,
  PARSE_FAIL_ALERT,
  replyAllowed,
  vehiclesFor,
  withinTourHours,
} from "./ai-operator";
import { TT24_PLAYBOOK } from "./tt24-playbook";
import { loadKnowledge } from "./knowledge.server";

const BATCH = 5;
// Strict structured output so the model's decision is always parseable JSON.
const DECISION_SCHEMA = {
  name: "operator_decision",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["action", "reply", "tags", "urgent", "alert", "booking"],
    properties: {
      action: { type: "string", enum: ["reply", "handoff", "none"] },
      reply: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      urgent: { type: "boolean" },
      alert: { type: "string" },
      booking: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "ready",
              "date",
              "time",
              "guests",
              "tour",
              "pickup",
              "name",
              "children",
              "dropoff",
              "contact",
              "language",
              "special",
              "duration",
            ],
            properties: {
              ready: { type: "boolean" },
              date: { type: "string" },
              time: { type: "string" },
              guests: { type: "integer" },
              tour: { type: "string" },
              pickup: { type: "string" },
              name: { type: "string" },
              children: { type: "string" },
              dropoff: { type: "string" },
              contact: { type: "string" },
              language: { type: "string" },
              special: { type: "string" },
              duration: { type: "integer" },
            },
          },
        ],
      },
    },
  },
};
// The TukTuk24 playbook is only used for the operator's own workspace; other businesses get a
// neutral role built from their own name, instructions and knowledge base.
function rulesFor(name: string, operator: boolean) {
  const role = operator
    ? `You are the AI Operator for TukTuk24 (Tuk Tuk 24 Lisbon). The team is away and you handle guest chats on their behalf.\n\n${TT24_PLAYBOOK}`
    : `You are the AI Operator for ${name || "this business"}. The team is away and you handle customer chats on their behalf. Only state facts found in the owner instructions or business knowledge; never invent prices, availability or policies.`;
  return `${role}\n\n${MECHANICS}`;
}
const MECHANICS = `Operator mechanics:
- ALWAYS write a reply to every new guest message, even when handing off.
- Use action "handoff" (with a reply) for cancellations, modifications, refunds, payment disputes, complaints, requests for a human, emergencies, large groups/custom itineraries, a completed booking enquiry awaiting confirmation, or when unsure. The team gets alerted; the guest still gets your reply.
- In "alert", write a short summary for the team (e.g. the collected booking details or what the guest needs).
- If a message is unreadable (voice note, sticker), reply asking the guest to send it as text.
- Use "none" only when the message clearly needs no answer (e.g. "ok" or "thanks" after everything is settled).
- booking: fill every field the guest has given anywhere in the chat, and keep filling it on every later message (empty string / 0 when unknown; guests = adults + children; time as HH:MM 24h, e.g. 12:30 PM -> 12:30; language = preferred tour language, or the language the guest writes in if they never stated one; duration = tour length in minutes, infer it from the tour name, e.g. "2-hour tour" -> 120, "1.5-hour" -> 90, 0 when unknown). Return the booking object whenever date and guests are known, even if not ready. Set booking.ready true only when name, tour, date, guests and a contact or pickup are known. Use null when the chat is not about a booking.`;

type Admin = any;

export async function runOperatorFor(ws: string, opts: { force?: boolean } = {}) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: s } = await sb
    .from("ai_operator_settings")
    .select("*")
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!s?.away_mode) return { skipped: "off" };
  if (s.paused_reason && !opts.force) return { skipped: "paused" };
  const { data: ai } = await sb
    .from("ai_settings")
    .select("instructions, enabled, provider, model, base_url")
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!ai?.enabled) return { skipped: "ai_disabled" };

  // Single-flight lease.
  const now = new Date();
  const { data: lock } = await sb
    .from("ai_operator_settings")
    .update({ lock_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq("workspace_id", ws)
    .or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`)
    .select("workspace_id");
  if (!lock?.length) return { skipped: "locked" };

  let handled = 0;
  try {
    const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const { data: convs } = await sb
      .from("conversations")
      .select(
        "id, channel, assigned_to, booking_id, contact_id, priority, contacts(full_name, phone, preferred_language)",
      )
      .eq("workspace_id", ws)
      .eq("awaiting_reply", true)
      .eq("is_demo", false)
      .in("channel", ["whatsapp", "email", "messenger", "instagram"])
      .not("status", "in", "(resolved,archived)")
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: true })
      .limit(25);
    for (const c of convs ?? []) {
      if (handled >= BATCH) break;
      const { data: last } = await sb
        .from("messages")
        .select("id")
        .eq("conversation_id", c.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last) continue;
      const { data: mark } = await sb
        .from("ai_operator_marks")
        .select("*")
        .eq("conversation_id", c.id)
        .maybeSingle();
      // Human takeover: once a team member has replied in this chat, the operator steps back for good.
      if (!mark?.handed_off) {
        const { data: humanMsg } = await sb
          .from("messages")
          .select("id")
          .eq("conversation_id", c.id)
          .eq("direction", "outbound")
          .not("author_id", "is", null)
          .limit(1);
        if (humanMsg?.length) {
          await sb.from("ai_operator_marks").upsert({
            conversation_id: c.id,
            workspace_id: ws,
            last_inbound_id: last.id,
            replies: mark?.replies ?? 0,
            handed_off: true,
            updated_at: new Date().toISOString(),
          });
          await log(
            sb,
            ws,
            c.id,
            "handoff",
            "A team member replied — the AI Operator stepped back from this chat.",
          );
          continue;
        }
      }
      // A previous handoff never silences the chat: every new guest message gets an answer.
      if (mark?.last_inbound_id === last.id) continue;
      handled++;
      const { data: recent } = await sb
        .from("messages")
        .select("body")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(8);
      const kb = await loadKnowledge(
        sb,
        ws,
        ((recent ?? []) as { body: string | null }[]).map((m) => m.body ?? "").reverse(),
      );
      const r = await handleConversation(sb, ws, s, ai, kb, c, mark?.replies ?? 0);
      await sb.from("ai_operator_marks").upsert({
        conversation_id: c.id,
        workspace_id: ws,
        last_inbound_id: last.id,
        replies: r.replies,
        handed_off: r.handedOff,
        updated_at: new Date().toISOString(),
      });
      if (r.stop) break;
    }
    if (opts.force && s.paused_reason)
      await sb.from("ai_operator_settings").update({ paused_reason: null }).eq("workspace_id", ws);
  } finally {
    await sb
      .from("ai_operator_settings")
      .update({ lock_until: null, last_run_at: new Date().toISOString() })
      .eq("workspace_id", ws);
  }
  return { handled };
}

async function log(
  sb: Admin,
  ws: string,
  convId: string | null,
  kind: string,
  summary: string,
  detail: Record<string, unknown> = {},
) {
  await sb.from("ai_operator_log").insert({
    workspace_id: ws,
    conversation_id: convId,
    kind,
    summary: summary.slice(0, 300),
    detail,
  });
}

async function alertTeam(sb: Admin, ws: string, convId: string, title: string, body: string) {
  const { data: members } = await sb
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ws)
    .eq("active", true)
    .in("role", ["admin", "manager"]);
  if (!members?.length) return;
  await sb.from("notifications").insert(
    members.map((m: any) => ({
      workspace_id: ws,
      user_id: m.user_id,
      kind: "ai_operator",
      title: title.slice(0, 120),
      body: body.slice(0, 300),
      link: `/inbox?c=${convId}`,
    })),
  );
}

async function handleConversation(
  sb: Admin,
  ws: string,
  s: any,
  ai: any,
  kb: string,
  c: any,
  replies: number,
) {
  const { generate } = await import("./ai-provider.server");
  const { AiError } = await import("./ai-gateway.server");
  const guest = c.contacts ?? {};
  const name = guest.full_name || "Guest";
  const { data: msgs } = await sb
    .from("messages")
    .select("direction, body, author_id")
    .eq("conversation_id", c.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const transcript = (msgs ?? [])
    .reverse()
    .map(
      (m: any) =>
        `${m.direction === "inbound" ? "Guest" : "Team"}: ${String(m.body).slice(0, 1500)}`,
    )
    .join("\n");
  const { data: wsRow } = await sb
    .from("workspaces")
    .select("name, timezone, platform_connectors")
    .eq("id", ws)
    .maybeSingle();
  const tz = (wsRow?.timezone as string) || "Europe/Lisbon";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  if (!replyAllowed(replies, s.max_replies)) {
    if (s.allow_alert)
      await alertTeam(
        sb,
        ws,
        c.id,
        `AI Operator handed over: ${name}`,
        "Reply limit reached for this chat — a team member should take over.",
      );
    await log(sb, ws, c.id, "handoff", `Reply limit reached with ${name}; handed to the team.`);
    return { replies, handedOff: true, stop: false };
  }

  let raw: string;
  try {
    raw = await generate(
      ws,
      { provider: ai.provider ?? "lovable", model: ai.model, base_url: ai.base_url },
      {
        instructions: `${rulesFor(wsRow?.name ?? "", wsRow?.platform_connectors === true)}\n\nToday (${tz}): ${today}.\n\nOwner instructions:\n${ai.instructions || "(none)"}\n${s.notes ? `\nAway-mode notes from the owner:\n${s.notes}` : ""}\n\nBusiness knowledge:\n${kb || "(none)"}`,
        input: `Guest name: ${name}. Channel: ${c.channel}.\nConversation (oldest first):\n${transcript}`,
        jsonSchema: DECISION_SCHEMA,
      },
    );
  } catch (e) {
    const status = e instanceof AiError ? e.status : 500;
    const msg = (e as Error).message.slice(0, 200);
    if (status === 402 || status === 403) {
      await sb.from("ai_operator_settings").update({ paused_reason: msg }).eq("workspace_id", ws);
      await log(sb, ws, c.id, "paused", `Paused: ${msg}`);
      await alertTeam(sb, ws, c.id, "AI Operator paused", msg);
    } else {
      await log(sb, ws, c.id, "error", `AI request failed: ${msg}`);
    }
    // Don't mark this message handled on failure — retry next run (except when paused).
    return { replies, handedOff: false, stop: true };
  }

  const d = decisionFromRaw(raw);
  if (d.action === "handoff" && d.alert === PARSE_FAIL_ALERT) {
    await log(
      sb,
      ws,
      c.id,
      "parse_fail",
      "The AI answer could not be read, so the chat was handed to the team.",
      { excerpt: raw.slice(0, 300) },
    );
  }
  let sent = 0;

  // Always answer the guest — even on handoff, the reply goes out first.
  if (d.reply && s.allow_reply) {
    const { sendToConversation } = await import("./outbound.server");
    const r = await sendToConversation(c.id, d.reply, null);
    if (r.ok) {
      sent = 1;
      await log(sb, ws, c.id, "reply", `Replied to ${name}: ${d.reply.slice(0, 160)}`);
    } else await log(sb, ws, c.id, "error", `Reply to ${name} failed: ${r.error}`);
  } else if (d.reply) {
    // Approval mode: the reply waits in the inbox until a team member approves (or edits) it.
    await sb
      .from("ai_reply_drafts")
      .update({ status: "discarded" })
      .eq("conversation_id", c.id)
      .eq("status", "pending");
    await sb.from("ai_reply_drafts").insert({
      workspace_id: ws,
      conversation_id: c.id,
      body: d.reply.slice(0, 4096),
      source: "ai_operator",
    });
    await log(
      sb,
      ws,
      c.id,
      "suggest",
      `Reply for ${name} waiting for approval: ${d.reply.slice(0, 220)}`,
      { reply: d.reply },
    );
  }

  if (s.allow_assign) {
    for (const t of d.tags) {
      const { data: tag } = await sb
        .from("tags")
        .upsert({ workspace_id: ws, name: t }, { onConflict: "workspace_id,name" })
        .select("id")
        .maybeSingle();
      if (tag)
        await sb
          .from("conversation_tags")
          .upsert({ conversation_id: c.id, tag_id: tag.id, workspace_id: ws })
          .then(
            () => {},
            () => {},
          );
    }
    const patch: Record<string, unknown> = {};
    if (d.urgent && c.priority !== "urgent") patch.priority = "urgent";
    if ((d.action === "handoff" || d.booking) && !c.assigned_to && s.default_assignee)
      patch.assigned_to = s.default_assignee;
    if (Object.keys(patch).length) {
      await sb.from("conversations").update(patch).eq("id", c.id);
      await log(
        sb,
        ws,
        c.id,
        "assign",
        `Updated chat with ${name}${patch.priority ? " · marked urgent" : ""}${patch.assigned_to ? " · assigned" : ""}${d.tags.length ? ` · tags: ${d.tags.join(", ")}` : ""}`,
      );
    }
  }

  if (d.booking && s.allow_booking) {
    const b = d.booking;
    const extras = [
      b.name && `Guest name: ${b.name}`,
      b.contact && `Contact: ${b.contact}`,
      b.children && `Children: ${b.children}`,
      b.dropoff && `Drop-off: ${b.dropoff}`,
      b.special && `Special requests: ${b.special}`,
      b.time && !withinTourHours(b.time) && `Requested time ${b.time} is outside 09:00-19:00`,
    ]
      .filter(Boolean)
      .join(". ");
    const notes = `Taken by AI Operator from chat — please check the slot is free and confirm with the guest. Needs ${vehiclesFor(b.guests)} tuk-tuk(s).${extras ? ` ${extras}.` : ""}`;
    const fields: Record<string, unknown> = { tour_date: b.date, guests: b.guests, notes };
    if (b.tour) fields.tour_name = b.tour;
    if (b.time) fields.start_time = b.time;
    if (b.pickup) fields.pickup_location = b.pickup;
    const lang = b.language || (guest?.preferred_language ?? "");
    if (lang) fields.language = lang;
    if (b.duration > 0) fields.duration_minutes = b.duration;
    // Real guest name replaces a phone-number placeholder on the contact.
    if (b.name && c.contact_id && (!guest.full_name || /^[+\d\s()-]+$/.test(guest.full_name))) {
      await sb.from("contacts").update({ full_name: b.name }).eq("id", c.contact_id);
    }
    if (c.booking_id) {
      const { data: cur } = await sb
        .from("bookings")
        .select("status, source_system")
        .eq("id", c.booking_id)
        .maybeSingle();
      if (cur?.status === "tentative" && cur.source_system === "ai_operator") {
        const { error } = await sb.from("bookings").update(fields).eq("id", c.booking_id);
        if (!error)
          await log(
            sb,
            ws,
            c.id,
            "booking",
            `Updated the tentative booking for ${b.name || name}: ${b.date}${b.time ? ` ${b.time}` : ""}, ${b.guests} guests.`,
            { booking_id: c.booking_id },
          );
      }
    } else if (b.ready) {
      const { data: bk, error } = await sb
        .from("bookings")
        .insert({
          workspace_id: ws,
          contact_id: c.contact_id,
          tour_name: b.tour || null,
          ...fields,
          status: "tentative",
          source_system: "ai_operator",
        })
        .select("id")
        .maybeSingle();
      if (bk) {
        await sb.from("conversations").update({ booking_id: bk.id }).eq("id", c.id);
        await log(
          sb,
          ws,
          c.id,
          "booking",
          `Added a tentative booking for ${b.name || name}: ${b.date}${b.time ? ` ${b.time}` : ""}, ${b.guests} guests${b.tour ? `, ${b.tour}` : ""}.`,
          { booking_id: bk.id },
        );
        if (s.allow_alert)
          await alertTeam(
            sb,
            ws,
            c.id,
            `New booking request from ${b.name || name}`,
            `${b.date} ${b.time} · ${b.guests} guests · ${b.tour || "tour not set"} — check the slot and confirm in Tour Calendar.`,
          );
      } else
        await log(
          sb,
          ws,
          c.id,
          "error",
          `Couldn't add booking for ${name}: ${error?.message ?? "unknown"}`,
        );
    }
  }

  if (d.action === "handoff")
    await log(
      sb,
      ws,
      c.id,
      "handoff",
      `Handed ${name} to the team${d.alert ? `: ${d.alert}` : "."}`,
    );
  if (s.allow_alert && (d.action === "handoff" || d.urgent)) {
    await alertTeam(
      sb,
      ws,
      c.id,
      d.urgent ? `Urgent: ${name}` : `Needs you: ${name}`,
      d.alert || "The AI Operator handed this chat to the team.",
    );
  }
  return { replies: replies + sent, handedOff: d.action === "handoff", stop: false };
}
