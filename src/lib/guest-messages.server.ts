// Server-only: automatic guest WhatsApp reminders (evening before) and review requests (after the tour).
import { lisbonNow } from "./driver-messages";
import { nextDate, reminderMessage, reviewDue, reviewMessage, REMINDER_SEND_MINUTE } from "./guest-messages";
import { TICKET_BASE_URL } from "./tickets";

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }
async function send(phone: string, body: string) {
  const { sendWhatsAppConnector } = await import("./channels.server");
  await sendWhatsAppConnector(phone, body);
}

/** Runs every 5 minutes from the background job. Each booking is claimed before sending so it is never messaged twice. */
export async function autoGuestMessagesFor(ws: string) {
  const sb = await db();
  const { data: w } = await sb.from("workspaces").select("guest_reminder_auto, review_request_auto, google_review_url, tripadvisor_review_url").eq("id", ws).maybeSingle();
  if (!w) return { skipped: "no workspace" };
  const now = lisbonNow();
  const out = { reminders: 0, reviews: 0, errors: [] as string[] };

  if (w.guest_reminder_auto && now.minutes >= REMINDER_SEND_MINUTE) {
    const { data: rows } = await sb.from("bookings")
      .select("id, tour_name, tour_date, start_time, pickup_location, ticket_token, status, driver_id, contacts(full_name, phone)")
      .eq("workspace_id", ws).eq("is_demo", false).eq("status", "confirmed").eq("tour_date", nextDate(now.date)).is("reminder_sent_at", null).limit(50);
    for (const b of rows ?? []) {
      const phone = b.contacts?.phone; if (!phone) continue;
      const { data: claimed } = await sb.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id).is("reminder_sent_at", null).select("id");
      if (!claimed?.length) continue;
      let driver: string | null = null;
      if (b.driver_id) {
        const { data: p } = await sb.from("profiles").select("full_name").eq("id", b.driver_id).maybeSingle();
        driver = p?.full_name?.split(" ")[0] ?? null;
      }
      try {
        await send(phone, reminderMessage({ guest_name: b.contacts?.full_name, tour_name: b.tour_name, tour_date: b.tour_date, start_time: b.start_time, pickup_location: b.pickup_location, driver_name: driver, ticket_url: b.ticket_token ? `${TICKET_BASE_URL}/ticket/${b.ticket_token}` : null }));
        out.reminders++;
      } catch (e) { out.errors.push(`reminder: ${(e as Error).message.slice(0, 150)}`); }
    }
  }

  if (w.review_request_auto && (w.google_review_url || w.tripadvisor_review_url)) {
    // Only recent tours (last 2 days) so turning this on never messages old guests.
    const since = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
    const { data: rows } = await sb.from("bookings")
      .select("id, tour_name, tour_date, start_time, duration_minutes, contacts(full_name, phone)")
      .eq("workspace_id", ws).eq("is_demo", false).in("status", ["confirmed", "completed"]).gte("tour_date", since).lte("tour_date", now.date).is("review_sent_at", null).limit(50);
    for (const b of rows ?? []) {
      const phone = b.contacts?.phone; if (!phone) continue;
      if (!reviewDue(b.tour_date, b.start_time, b.duration_minutes, now.date, now.minutes)) continue;
      const { data: claimed } = await sb.from("bookings").update({ review_sent_at: new Date().toISOString() }).eq("id", b.id).is("review_sent_at", null).select("id");
      if (!claimed?.length) continue;
      try { await send(phone, reviewMessage(b.contacts?.full_name, b.tour_name, w.google_review_url, w.tripadvisor_review_url)); out.reviews++; }
      catch (e) { out.errors.push(`review: ${(e as Error).message.slice(0, 150)}`); }
    }
  }
  return out;
}
