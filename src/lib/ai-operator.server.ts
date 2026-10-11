// Server-only: the AI Operator ("Away mode"). Runs from the 5-minute background job or "Run now".
// Bounded per run, single-flight lock in the database, idempotent per guest message, pauses on credit/permission errors.
import { decisionFromRaw, PARSE_FAIL_ALERT, replyAllowed, vehiclesFor } from "./ai-operator";

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
            required: ["ready", "date", "time", "guests", "tour", "pickup", "name"],
            properties: {
              ready: { type: "boolean" },
              date: { type: "string" },
              time: { type: "string" },
              guests: { type: "integer" },
              tour: { type: "string" },
              pickup: { type: "string" },
              name: { type: "string" },
            },
          },
        ],
      },
    },
  },
};
const RULES = `You are the AI Operator for Tuk Tuk 24 Lisbon, a tuk-tuk tour company in Lisbon, Portugal. The team is away and you handle guest chats on their behalf.
Rules:
- Be warm, short and professional. Reply in the language the guest writes in.
- Guest-facing reply style: clean, calm, professional and neatly organised. Answer the latest question directly; avoid rambling, sales pitches, repeated greetings and repeated information from earlier replies.
- Use plain text that reads naturally in the guest's channel. No Markdown headings, tables, bold markers, decorative symbols or emojis. Separate short paragraphs with a blank line; never send one dense wall of text.
- For a simple question, use 1-3 concise sentences. When several details are needed, give a brief answer followed by a short list, one detail per line (e.g. Date: ..., Guests: ..., Pickup: ...). Use lists only when they make the reply clearer; never print empty fields or internal JSON keys.
- Ask only for information still missing from the conversation. Group related booking questions in one short paragraph or a compact list. Finish with one clear next step when needed; do not add generic filler or a sign-off to every chat reply.
- Keep email replies slightly more formal, with a greeting and short closing where appropriate; WhatsApp, Messenger and Instagram should be conversational and concise. Do not promise an exact response time unless the business knowledge explicitly supports it.
- Only state prices, tours, times, meeting points and policies that appear in the business knowledge. Never invent them. If something is unknown, say a team member will confirm it soon.
- Each tuk-tuk carries up to 6 guests.
- Never say a booking or payment is confirmed. You may say the request is noted and the team will confirm.
- To take a booking request, collect: date, start time, number of guests, tour, pickup place and the guest's name.
- ALWAYS send a reply to every new guest message. Even when you hand off to a human, still write a short reply first (e.g. "Thanks for your message! A team member will be with you very shortly."). Never leave a guest without an answer.
- Use action "handoff" (with a reply) if the guest is upset, complains, asks for a refund or a human, mentions an emergency, or you are unsure — the team gets alerted, but the guest still gets your reply.
- If a message is unreadable (e.g. a voice note or sticker you cannot see), reply asking the guest to send it as text.
Answer ONLY with JSON in this shape:
{"action":"reply"|"handoff"|"none","reply":"text to send the guest (empty if none)","tags":["short label"],"urgent":true|false,"alert":"short note for the owner, or empty","booking":{"ready":true|false,"date":"YYYY-MM-DD","time":"HH:MM","guests":0,"tour":"","pickup":"","name":""}}
Set booking.ready true only when the guest has clearly given date, guests and tour. Use "none" only when the guest's message clearly needs no answer at all (e.g. they just said "ok" or "thanks" after everything is settled).`;

type Admin = any;

export async function runOperatorFor(ws: string, opts: { force?: boolean } = {}) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: s } = await sb.from("ai_operator_settings").select("*").eq("workspace_id", ws).maybeSingle();
  if (!s?.away_mode) return { skipped: "off" };
  if (s.paused_reason && !opts.force) return { skipped: "paused" };
  const { data: ai } = await sb.from("ai_settings").select("instructions, enabled, provider, model, base_url").eq("workspace_id", ws).maybeSingle();
  if (!ai?.enabled) return { skipped: "ai_disabled" };

  // Single-flight lease.
  const now = new Date();
  const { data: lock } = await sb.from("ai_operator_settings")
    .update({ lock_until: new Date(now.getTime() + 4 * 60_000).toISOString() })
    .eq("workspace_id", ws).or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`).select("workspace_id");
  if (!lock?.length) return { skipped: "locked" };

  let handled = 0;
  try {
    const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const { data: convs } = await sb.from("conversations")
      .select("id, channel, assigned_to, booking_id, contact_id, priority, contacts(full_name, phone, preferred_language)")
      .eq("workspace_id", ws).eq("awaiting_reply", true).eq("is_demo", false)
      .in("channel", ["whatsapp", "email", "messenger", "instagram"])
      .not("status", "in", "(resolved,archived)").gte("last_message_at", since)
      .order("last_message_at", { ascending: true }).limit(25);
    const kb = await knowledge(sb, ws);
    for (const c of convs ?? []) {
      if (handled >= BATCH) break;
      const { data: last } = await sb.from("messages").select("id").eq("conversation_id", c.id).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!last) continue;
      const { data: mark } = await sb.from("ai_operator_marks").select("*").eq("conversation_id", c.id).maybeSingle();
      // Human takeover: once a team member has replied in this chat, the operator steps back for good.
      if (!mark?.handed_off) {
        const { data: humanMsg } = await sb.from("messages").select("id").eq("conversation_id", c.id).eq("direction", "outbound").not("author_id", "is", null).limit(1);
        if (humanMsg?.length) {
          await sb.from("ai_operator_marks").upsert({ conversation_id: c.id, workspace_id: ws, last_inbound_id: last.id, replies: mark?.replies ?? 0, handed_off: true, updated_at: new Date().toISOString() });
          await log(sb, ws, c.id, "handoff", "A team member replied — the AI Operator stepped back from this chat.");
          continue;
        }
      }
      // A previous handoff never silences the chat: every new guest message gets an answer.
      if (mark?.last_inbound_id === last.id) continue;
      handled++;
      const r = await handleConversation(sb, ws, s, ai, kb, c, mark?.replies ?? 0);
      await sb.from("ai_operator_marks").upsert({ conversation_id: c.id, workspace_id: ws, last_inbound_id: last.id, replies: r.replies, handed_off: r.handedOff, updated_at: new Date().toISOString() });
      if (r.stop) break;
    }
    if (opts.force && s.paused_reason) await sb.from("ai_operator_settings").update({ paused_reason: null }).eq("workspace_id", ws);
  } finally {
    await sb.from("ai_operator_settings").update({ lock_until: null, last_run_at: new Date().toISOString() }).eq("workspace_id", ws);
  }
  return { handled };
}

async function knowledge(sb: Admin, ws: string) {
  const { data } = await sb.from("knowledge_documents").select("title, category, content").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(40);
  return (data ?? []).map((d: any) => `## ${d.title} (${d.category})\n${d.content ?? ""}`).join("\n\n").slice(0, 30000);
}

async function log(sb: Admin, ws: string, convId: string | null, kind: string, summary: string, detail: Record<string, unknown> = {}) {
  await sb.from("ai_operator_log").insert({ workspace_id: ws, conversation_id: convId, kind, summary: summary.slice(0, 300), detail });
}

async function alertTeam(sb: Admin, ws: string, convId: string, title: string, body: string) {
  const { data: members } = await sb.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("active", true).in("role", ["admin", "manager"]);
  if (!members?.length) return;
  await sb.from("notifications").insert(members.map((m: any) => ({ workspace_id: ws, user_id: m.user_id, kind: "ai_operator", title: title.slice(0, 120), body: body.slice(0, 300), link: `/inbox?c=${convId}` })));
}

async function handleConversation(sb: Admin, ws: string, s: any, ai: any, kb: string, c: any, replies: number) {
  const { generate } = await import("./ai-provider.server");
  const { AiError } = await import("./ai-gateway.server");
  const guest = c.contacts ?? {};
  const name = guest.full_name || "Guest";
  const { data: msgs } = await sb.from("messages").select("direction, body, author_id").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(30);
  const transcript = (msgs ?? []).reverse().map((m: any) => `${m.direction === "inbound" ? "Guest" : "Team"}: ${String(m.body).slice(0, 1500)}`).join("\n");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });

  if (!replyAllowed(replies, s.max_replies)) {
    if (s.allow_alert) await alertTeam(sb, ws, c.id, `AI Operator handed over: ${name}`, "Reply limit reached for this chat — a team member should take over.");
    await log(sb, ws, c.id, "handoff", `Reply limit reached with ${name}; handed to the team.`);
    return { replies, handedOff: true, stop: false };
  }

  let raw: string;
  try {
    raw = await generate(ws, { provider: ai.provider ?? "lovable", model: ai.model, base_url: ai.base_url }, {
      instructions: `${RULES}\n\nToday in Lisbon: ${today}.\n\nOwner instructions:\n${ai.instructions || "(none)"}\n${s.notes ? `\nAway-mode notes from the owner:\n${s.notes}` : ""}\n\nBusiness knowledge:\n${kb || "(none)"}`,
      input: `Guest name: ${name}. Channel: ${c.channel}.\nConversation (oldest first):\n${transcript}`,
      jsonSchema: DECISION_SCHEMA,
    });
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
    await log(sb, ws, c.id, "error", `AI answer was not readable; handed to the team. Excerpt: ${raw.slice(0, 160)}`);
  }
  let sent = 0;

  // Always answer the guest — even on handoff, the reply goes out first.
  if (d.reply && s.allow_reply) {
    const { sendToConversation } = await import("./outbound.server");
    const r = await sendToConversation(c.id, d.reply, null);
    if (r.ok) { sent = 1; await log(sb, ws, c.id, "reply", `Replied to ${name}: ${d.reply.slice(0, 160)}`); }
    else await log(sb, ws, c.id, "error", `Reply to ${name} failed: ${r.error}`);
  } else if (d.reply) {
    await log(sb, ws, c.id, "suggest", `Suggested reply for ${name} (not sent): ${d.reply.slice(0, 220)}`, { reply: d.reply });
  }

  if (s.allow_assign) {
    for (const t of d.tags) {
      const { data: tag } = await sb.from("tags").upsert({ workspace_id: ws, name: t }, { onConflict: "workspace_id,name" }).select("id").maybeSingle();
      if (tag) await sb.from("conversation_tags").upsert({ conversation_id: c.id, tag_id: tag.id, workspace_id: ws }).then(() => {}, () => {});
    }
    const patch: Record<string, unknown> = {};
    if (d.urgent && c.priority !== "urgent") patch.priority = "urgent";
    if ((d.action === "handoff" || d.booking) && !c.assigned_to && s.default_assignee) patch.assigned_to = s.default_assignee;
    if (Object.keys(patch).length) {
      await sb.from("conversations").update(patch).eq("id", c.id);
      await log(sb, ws, c.id, "assign", `Updated chat with ${name}${patch.priority ? " · marked urgent" : ""}${patch.assigned_to ? " · assigned" : ""}${d.tags.length ? ` · tags: ${d.tags.join(", ")}` : ""}`);
    }
  }

  if (d.booking && s.allow_booking && !c.booking_id) {
    const b = d.booking;
    const { data: bk, error } = await sb.from("bookings").insert({
      workspace_id: ws, contact_id: c.contact_id, tour_name: b.tour || null, tour_date: b.date, start_time: b.time || null,
      guests: b.guests, pickup_location: b.pickup || null, status: "tentative", source_system: "ai_operator",
      notes: `Taken by AI Operator from chat — please confirm with the guest. Needs ${vehiclesFor(b.guests)} tuk-tuk(s).${b.name ? ` Guest name given: ${b.name}.` : ""}`,
    }).select("id").maybeSingle();
    if (bk) {
      await sb.from("conversations").update({ booking_id: bk.id }).eq("id", c.id);
      await log(sb, ws, c.id, "booking", `Added a tentative booking for ${name}: ${b.date}${b.time ? ` ${b.time}` : ""}, ${b.guests} guests${b.tour ? `, ${b.tour}` : ""}.`, { booking_id: bk.id });
      if (s.allow_alert) await alertTeam(sb, ws, c.id, `New booking request from ${name}`, `${b.date} ${b.time} · ${b.guests} guests · ${b.tour || "tour not set"} — confirm in Tour Calendar.`);
    } else await log(sb, ws, c.id, "error", `Couldn't add booking for ${name}: ${error?.message ?? "unknown"}`);
  }

  if (d.action === "handoff") await log(sb, ws, c.id, "handoff", `Handed ${name} to the team${d.alert ? `: ${d.alert}` : "."}`);
  if (s.allow_alert && (d.action === "handoff" || d.urgent)) {
    await alertTeam(sb, ws, c.id, d.urgent ? `Urgent: ${name}` : `Needs you: ${name}`, d.alert || "The AI Operator handed this chat to the team.");
  }
  return { replies: replies + sent, handedOff: d.action === "handoff", stop: false };
}
