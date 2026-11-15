// Server-only: the 5-minute background work, split per workspace so it scales with tenants.
// The scheduler call (empty body) fans out one request per active workspace through the
// database (trigger_background_sync_fanout, pg_net) and only runs global tasks itself.
type Sb = any;
const err = (e: unknown) => (e as Error).message.slice(0, 200);

/** Everything that must happen for one workspace. Each step is isolated: one failure never stops the rest. */
export async function processWorkspace(sb: Sb, w: { id: string; platform_connectors: boolean }, now = new Date()) {
  const { syncAllEmailFor, syncWebsiteBookingsFor, alertBrokenChannels } = await import("./background-sync.server");
  const r: Record<string, unknown> = {};
  try { r.email = await syncAllEmailFor(w.id); } catch (e) { r.emailError = err(e); }
  if (w.platform_connectors) { try { r.bookings = await syncWebsiteBookingsFor(sb, w.id, null); } catch (e) { r.bookingsError = err(e); } }
  try { r.alerts = await alertBrokenChannels(w.id); } catch { /* next run */ }
  try { r.operator = await (await import("./ai-operator.server")).runOperatorFor(w.id); } catch (e) { r.operatorError = err(e); }
  try { r.tickets = await (await import("./tickets.server")).autoSendTicketsFor(w.id); } catch (e) { r.ticketsError = err(e); }
  try { r.autoAssigned = await (await import("./driver-dispatch.server")).flushAutoAssigned(w.id); } catch (e) { r.autoAssignError = err(e); }
  // Operator-only: these send from the operator's WhatsApp number.
  if (w.platform_connectors) { try { r.drivers = await (await import("./driver-dispatch.server")).autoSendSchedulesFor(w.id); } catch (e) { r.driversError = err(e); } }
  if (w.platform_connectors) { try { r.guests = await (await import("./guest-messages.server")).autoGuestMessagesFor(w.id); } catch (e) { r.guestsError = err(e); } }
  // PayPal roughly hourly (its reports lag up to 3h anyway).
  if (now.getUTCMinutes() < 5) { try { r.paypal = await (await import("./paypal.server")).syncPaypalFor(w.id, 3); } catch (e) { r.paypalError = err(e); } }
  try { r.social = await (await import("./social-publish.server")).publishDuePosts(w.id); } catch (e) { r.socialError = err(e); }
  try { r.automations = await (await import("./automation.server")).processAutomationEvents(w.id); } catch (e) { r.automationsError = err(e); }
  return r;
}

/** Work that is not tied to one workspace. */
export async function processGlobal(sb: Sb) {
  const out: Record<string, unknown> = {};
  try { await (await import("./whatsapp-inbox.server")).recover(); } catch { /* retried next run */ }
  try { out.push = await (await import("./push.server")).sendPendingPushes(sb); } catch (e) { out.pushError = err(e); }
  return out;
}

/**
 * Asks the database to start one request per active workspace (parallel, each with its own time
 * budget). Returns the number queued, or null if fan-out isn't available (older database) — the
 * caller then falls back to processing serially so nothing is ever skipped.
 */
export async function fanOut(sb: Sb): Promise<number | null> {
  const { data, error } = await sb.rpc("trigger_background_sync_fanout");
  if (error) return null;
  return typeof data === "number" ? data : null;
}
