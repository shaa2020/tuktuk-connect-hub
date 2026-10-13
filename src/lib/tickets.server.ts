import { ticketEligible, ticketMessage, type TicketAuto } from "./tickets";

const NIL = "00000000-0000-0000-0000-000000000000";

// Server-only. Sends a ticket: Gmail first when the guest has an email address, otherwise their existing chat.
export async function sendTicket(bookingId: string, authorId: string | null): Promise<{ ok: true; via: string } | { ok: false; error: string }> {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: b } = await sb.from("bookings").select("*, contacts(email)").eq("id", bookingId).maybeSingle();
  if (!b) return { ok: false, error: "Booking not found." };
  const body = ticketMessage(b as any);
  const mark = () => sb.from("bookings").update({ ticket_sent_at: new Date().toISOString() } as any).eq("id", b.id);
  const { sendToConversation } = await import("./outbound.server");

  const email = ((b as any).contacts?.email as string | null)?.trim();
  if (email && b.contact_id) {
    // 1) Existing email chat with this guest → reply in that thread.
    const { data: ec } = await sb.from("conversations").select("id").eq("contact_id", b.contact_id).eq("channel", "email").order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    if (ec) {
      const r = await sendToConversation(ec.id, body, authorId);
      if (r.ok) { await mark(); return { ok: true, via: "email" }; }
    }
    // 2) No email chat yet → send a new email from the business Gmail.
    const { data: cc } = await sb.from("channel_connections").select("id").eq("workspace_id", b.workspace_id).eq("channel", "email").eq("status", "connected").limit(1).maybeSingle();
    if (cc && !/[\r\n]/.test(email)) {
      try {
        const { sendEmail } = await import("./email-channel.server");
        await sendEmail(b.workspace_id, NIL, email, body);
        await mark();
        return { ok: true, via: "email" };
      } catch { /* fall through to chat */ }
    }
  }

  let { data: conv } = await sb.from("conversations").select("id").eq("booking_id", b.id).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv && b.contact_id) ({ data: conv } = await sb.from("conversations").select("id").eq("contact_id", b.contact_id).neq("channel", "manual").order("last_message_at", { ascending: false }).limit(1).maybeSingle());
  if (!conv) return { ok: false, error: email ? "Email failed and there's no chat with this guest." : "No email or chat for this guest yet." };
  const r = await sendToConversation(conv.id, body, authorId);
  if (r.ok) { await mark(); return { ok: true, via: "chat" }; }
  return r;
}

export async function autoSendTicketsFor(ws: string) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: w } = await (sb.from("workspaces") as any).select("ticket_auto").eq("id", ws).maybeSingle();
  const mode = (w?.ticket_auto ?? "off") as TicketAuto;
  if (mode === "off") return { sent: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await (sb.from("bookings") as any).select("id, status, payment_status").eq("workspace_id", ws).eq("status", "confirmed").eq("is_demo", false).is("ticket_sent_at", null).gte("tour_date", today).limit(20);
  let sent = 0;
  for (const b of rows ?? []) if (ticketEligible(mode, b as any) && (await sendTicket(b.id, null)).ok) sent++;
  return { sent };
}
