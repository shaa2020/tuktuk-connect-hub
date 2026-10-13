import { assignmentMessage, lisbonNow, removedMessage, scheduleMessage, SCHEDULE_SEND_MINUTE, type DriverTour } from "./driver-messages";
import { TICKET_BASE_URL } from "./tickets";

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }
const SEL = "id, reference, tour_name, tour_date, start_time, duration_minutes, guests, pickup_location, payment_status, amount, currency, notes, status, ticket_token, driver_id, contacts(full_name, phone), vehicles(name, plate)";

function toTour(b: any): DriverTour {
  return { ...b, guest_name: b.contacts?.full_name ?? null, guest_phone: b.contacts?.phone ?? null,
    vehicle: b.vehicles ? `${b.vehicles.name}${b.vehicles.plate ? ` (${b.vehicles.plate})` : ""}` : null,
    ticket_url: b.status === "confirmed" && b.ticket_token ? `${TICKET_BASE_URL}/ticket/${b.ticket_token}` : null };
}

async function driverOf(sb: any, ws: string, userId: string) {
  const { data } = await sb.from("workspace_members").select("whatsapp_phone, active, profiles(full_name, email)").eq("workspace_id", ws).eq("user_id", userId).maybeSingle();
  if (!data || !data.active) return null;
  return { phone: data.whatsapp_phone as string | null, name: (data.profiles?.full_name || data.profiles?.email || "driver").split(" ")[0] as string };
}

async function send(phone: string, body: string) {
  const { sendWhatsAppConnector } = await import("./channels.server");
  await sendWhatsAppConnector(phone, body);
}

type R = { ok: true } | { ok: false; error: string };

/** Message the driver about a tour they were assigned (or that was removed from them). */
export async function notifyDriver(ws: string, bookingId: string, kind: "assigned" | "cancelled" | "reassigned", driverId?: string | null): Promise<R> {
  const sb = await db();
  const { data: b } = await sb.from("bookings").select(SEL).eq("workspace_id", ws).eq("id", bookingId).maybeSingle();
  if (!b) return { ok: false, error: "Booking not found." };
  const uid = driverId ?? b.driver_id;
  if (!uid) return { ok: false, error: "No driver assigned." };
  const d = await driverOf(sb, ws, uid);
  if (!d?.phone) return { ok: false, error: "This driver has no WhatsApp number. Add it on the Team page." };
  const body = kind === "assigned" ? assignmentMessage(d.name, toTour(b)) : removedMessage(d.name, b, kind);
  try { await send(d.phone, body); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Send one driver their full schedule for a date. */
export async function sendDriverSchedule(ws: string, userId: string, date: string): Promise<R & { tours?: number }> {
  const sb = await db();
  const d = await driverOf(sb, ws, userId);
  if (!d?.phone) return { ok: false, error: "This driver has no WhatsApp number. Add it on the Team page." };
  const { data: rows } = await sb.from("bookings").select(SEL).eq("workspace_id", ws).eq("driver_id", userId).eq("tour_date", date).eq("is_demo", false).in("status", ["confirmed", "tentative"]);
  if (!rows?.length) return { ok: false, error: "This driver has no tours on that day." };
  try { await send(d.phone, scheduleMessage(d.name, date, rows.map(toTour))); return { ok: true, tours: rows.length }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Background job: from 08:30 Lisbon time, each driver with tours today gets their schedule once. */
export async function autoSendSchedulesFor(ws: string) {
  const sb = await db();
  const { data: w } = await sb.from("workspaces").select("driver_auto").eq("id", ws).maybeSingle();
  if (!w?.driver_auto) return { skipped: "off" };
  const now = lisbonNow();
  if (now.minutes < SCHEDULE_SEND_MINUTE) return { skipped: "too early" };
  const { data: tours } = await sb.from("bookings").select("driver_id").eq("workspace_id", ws).eq("tour_date", now.date).eq("is_demo", false).in("status", ["confirmed", "tentative"]).not("driver_id", "is", null);
  const ids = [...new Set((tours ?? []).map((t: any) => t.driver_id as string))];
  if (!ids.length) return { sent: 0 };
  const { data: mems } = await sb.from("workspace_members").select("id, user_id, schedule_sent_on, whatsapp_phone").eq("workspace_id", ws).eq("active", true).in("user_id", ids);
  let sent = 0; const errors: string[] = [];
  for (const m of mems ?? []) {
    if (!m.whatsapp_phone || m.schedule_sent_on === now.date) continue;
    // Claim first so a failing number isn't retried every 2 minutes all day.
    await sb.from("workspace_members").update({ schedule_sent_on: now.date }).eq("id", m.id);
    const r = await sendDriverSchedule(ws, m.user_id, now.date);
    if (r.ok) sent++; else errors.push(r.error);
  }
  return { sent, errors };
}

/** Send the assignment message for tours the database auto-assigned to the default guide. */
export async function flushAutoAssigned(ws: string) {
  const sb = await db();
  const { data: rows } = await sb.from("bookings").select("id").eq("workspace_id", ws).eq("driver_notify_pending", true).limit(50);
  let sent = 0; const errors: string[] = [];
  for (const r of rows ?? []) {
    // Claim first so a failing number isn't retried forever.
    const { data: claimed } = await sb.from("bookings").update({ driver_notify_pending: false }).eq("id", r.id).eq("driver_notify_pending", true).select("id");
    if (!claimed?.length) continue;
    const x = await notifyDriver(ws, r.id, "assigned");
    if (x.ok) sent++; else errors.push(x.error);
  }
  return { sent, errors };
}
