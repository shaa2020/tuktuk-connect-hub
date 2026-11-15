// Server-only: shared sync jobs used by the app (while open) and the scheduled background job (app closed).
const STATUS_MAP: Record<string, string> = { new: "inquiry", pending: "tentative", confirmed: "confirmed", done: "completed", completed: "completed", cancelled: "cancelled", canceled: "cancelled" };
const PAY_MAP: Record<string, string> = { paid: "paid", deposit_paid: "partially_paid", refunded: "refunded", request: "pending", pending: "pending" };

function durationFromTitle(t: string): number | null {
  const m = t.match(/(\d+(?:\.\d+)?)\s*h\b/i) ?? t.match(/-\s*(\d+(?:\.\d+)?)h/i);
  if (m?.[1]) return Math.round(parseFloat(m[1]) * 60);
  const n = t.match(/(\d+)\s*min/i);
  return n?.[1] ? +n[1] : null;
}

/** Copies website bookings not yet on the calendar. Skips ones the team deleted. Returns number added. */
export async function syncWebsiteBookingsFor(sb: any, ws: string, userId: string | null) {
  const { websiteGet } = await import("./website-api.server");
  const rows = await websiteGet<any[]>(ws, "/booking-requests?limit=100");
  const refs = rows.map((r) => String(r.id).slice(0, 8).toUpperCase());
  const list = refs.length ? refs : ["-"];
  const [{ data: local }, { data: ignored }] = await Promise.all([
    sb.from("bookings").select("external_reference").eq("workspace_id", ws).in("external_reference", list),
    sb.from("website_booking_ignores").select("external_reference").eq("workspace_id", ws).in("external_reference", list),
  ]);
  const have = new Set([...(local ?? []), ...(ignored ?? [])].map((l: any) => l.external_reference));
  let added = 0;
  for (const r of rows) {
    const reference = String(r.id).slice(0, 8).toUpperCase();
    if (have.has(reference)) continue;
    const email = r.email ? String(r.email).toLowerCase().trim() : null;
    const phone = r.phone ? String(r.phone).trim() : null;
    let contactId: string | null = null;
    if (email) contactId = (await sb.from("contacts").select("id").eq("workspace_id", ws).is("merged_into", null).ilike("email", email).limit(1).maybeSingle()).data?.id ?? null;
    if (!contactId && phone) contactId = (await sb.from("contacts").select("id").eq("workspace_id", ws).is("merged_into", null).eq("phone", phone).limit(1).maybeSingle()).data?.id ?? null;
    if (!contactId) contactId = (await sb.from("contacts").insert({ workspace_id: ws, full_name: String(r.customer_name || "Website guest").slice(0, 200), email, phone, created_by: userId }).select("id").single()).data?.id ?? null;
    const notes = typeof r.notes === "string" ? r.notes : "";
    const pickup = notes.match(/(?:Hotel pickup|Meetup point|Pickup):\s*([^\n—]+)/)?.[1]?.trim() ?? null;
    const time = typeof r.travel_time === "string" && /^\d{1,2}:\d{2}/.test(r.travel_time) ? r.travel_time.slice(0, 5) : null;
    const title = String(r.tour_title || "Website booking");
    const dur = durationFromTitle(title);
    const { error } = await sb.from("bookings").insert({
      workspace_id: ws, contact_id: contactId, tour_name: title.slice(0, 200),
      tour_date: r.travel_date ?? null, start_time: time, guests: Math.max(1, Math.min(500, Number(r.guests) || 1)),
      duration_minutes: dur && dur >= 15 && dur <= 1440 ? dur : null,
      pickup_location: pickup ? pickup.slice(0, 300) : null,
      status: STATUS_MAP[String(r.status)] ?? "inquiry",
      payment_status: PAY_MAP[String(r.payment_status)] ?? "unknown", payment_status_source: "booking_system",
      source_system: "website", external_reference: reference, notes: notes ? notes.slice(0, 5000) : null, created_by: userId,
    });
    if (!error) added++;
  }
  return added;
}

/** Pulls every connected email inbox for a workspace. */
export async function syncAllEmailFor(ws: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin.from("channel_connections").select("id, config").eq("workspace_id", ws).eq("channel", "email").eq("status", "connected");
  let imported = 0;
  for (const cc of rows ?? []) {
    const cfg = (cc.config ?? {}) as Record<string, string>;
    try {
      if (cfg.mode === "imap") {
        const { getSecret } = await import("./secrets.server");
        const { passKind, syncImap } = await import("./imap-mail.server");
        const pass = await getSecret(ws, passKind(cc.id));
        if (pass) imported += await syncImap(ws, cc.id, cfg.address ?? "", pass);
      } else {
        const { syncEmail } = await import("./email-channel.server");
        imported += await syncEmail(ws, cfg.address ?? "");
      }
    } catch (e) {
      await supabaseAdmin.from("channel_connections").update({ last_error: (e as Error).message.slice(0, 300), last_checked_at: new Date().toISOString() }).eq("id", cc.id);
    }
  }
  return imported;
}

/** Alerts admins/managers once per day per broken channel (integration health). */
export async function alertBrokenChannels(ws: string) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: broken } = await sb.from("channel_connections").select("id, channel, account_label, display_name, last_error").eq("workspace_id", ws).not("last_error", "is", null);
  if (!broken?.length) return 0;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: recent } = await sb.from("notifications").select("body").eq("workspace_id", ws).eq("kind", "integration").gte("created_at", since);
  const seen = new Set((recent ?? []).map((r) => r.body));
  const { data: admins } = await sb.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("active", true).in("role", ["admin", "manager"]);
  let n = 0;
  for (const c of broken) {
    const body = `${c.account_label || c.display_name || c.channel}: ${String(c.last_error).slice(0, 160)}`;
    if (seen.has(body)) continue;
    for (const a of admins ?? []) await sb.from("notifications").insert({ workspace_id: ws, user_id: a.user_id, kind: "integration", title: `${c.channel} connection has a problem`, body, link: "/integrations" });
    n++;
  }
  return n;
}
