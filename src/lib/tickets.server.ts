import { ticketEligible, ticketMessage, type TicketAuto } from "./tickets";

// Server-only. Sends a ticket link into the guest's existing chat (same account they contacted).
export async function sendTicket(bookingId: string, authorId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: b } = await sb.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return { ok: false, error: "Booking not found." };
  let { data: conv } = await sb.from("conversations").select("id").eq("booking_id", b.id).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  if (!conv && b.contact_id) ({ data: conv } = await sb.from("conversations").select("id").eq("contact_id", b.contact_id).neq("channel", "manual").order("last_message_at", { ascending: false }).limit(1).maybeSingle());
  if (!conv) return { ok: false, error: "No chat with this guest yet." };
  const { sendToConversation } = await import("./outbound.server");
  const r = await sendToConversation(conv.id, ticketMessage(b as any), authorId);
  if (r.ok) await sb.from("bookings").update({ ticket_sent_at: new Date().toISOString() }).eq("id", b.id);
  return r;
}

export async function autoSendTicketsFor(ws: string) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: w } = await sb.from("workspaces").select("ticket_auto").eq("id", ws).maybeSingle();
  const mode = (w?.ticket_auto ?? "off") as TicketAuto;
  if (mode === "off") return { sent: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await sb.from("bookings").select("id, status, payment_status").eq("workspace_id", ws).eq("status", "confirmed").eq("is_demo", false).is("ticket_sent_at", null).gte("tour_date", today).limit(20);
  let sent = 0;
  for (const b of rows ?? []) if (ticketEligible(mode, b as any) && (await sendTicket(b.id, null)).ok) sent++;
  return { sent };
}
