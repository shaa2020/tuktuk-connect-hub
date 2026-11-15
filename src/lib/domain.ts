import type { Database } from "@/integrations/supabase/types";

type E = Database["public"]["Enums"];
export type AppRole = E["app_role"];
export type ChannelType = E["channel_type"];
export type ConversationStatus = E["conversation_status"];
export type Priority = E["priority_level"];
export type MessageStatus = E["message_status"];
export type LeadStage = E["lead_stage"];
export type BookingStatus = E["booking_status"];
export type PaymentStatus = E["payment_status"];
export type Tone =
  | "blue" | "teal" | "success" | "warning" | "danger" | "info" | "muted" | "secondary";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Business Admin",
  manager: "Manager",
  agent: "Agent",
};

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  email: "Email",
  manual: "Phone / Manual",
  telegram: "Telegram",
  webchat: "Website chat",
};

export const STATUS_META: Record<ConversationStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "blue" },
  in_progress: { label: "In progress", tone: "info" },
  waiting_customer: { label: "Waiting for customer", tone: "warning" },
  waiting_team: { label: "Waiting for team", tone: "danger" },
  resolved: { label: "Resolved", tone: "success" },
  archived: { label: "Archived", tone: "muted" },
};

export const PRIORITY_META: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "muted" },
  normal: { label: "Normal", tone: "secondary" },
  high: { label: "High", tone: "warning" },
  urgent: { label: "Urgent", tone: "danger" },
};

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  unknown: "Delivery unknown",
  logged: "Logged manually",
};

export const LEAD_STAGES: LeadStage[] = [
  "new", "contacted", "qualified", "quote_requested", "quote_sent", "awaiting_customer", "won", "lost",
];
export const LEAD_STAGE_META: Record<LeadStage, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "blue" },
  contacted: { label: "Contacted", tone: "info" },
  qualified: { label: "Qualified", tone: "teal" },
  quote_requested: { label: "Quote requested", tone: "warning" },
  quote_sent: { label: "Quote sent", tone: "warning" },
  awaiting_customer: { label: "Awaiting customer", tone: "secondary" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};

export const BOOKING_STATUS_META: Record<BookingStatus, { label: string; tone: Tone }> = {
  inquiry: { label: "Inquiry", tone: "muted" },
  quote: { label: "Quote", tone: "info" },
  tentative: { label: "Tentative", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  completed: { label: "Completed", tone: "teal" },
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unknown: "Unknown",
  pending: "Pending",
  paid: "Paid",
  partially_paid: "Partially paid",
  refunded: "Refunded",
};

/* ---------- Permission rules (UI mirror of database policies) ---------- */
// These only decide what the interface shows. The database enforces the same
// rules independently, so hiding a button is never the security boundary.

export function canManageTeam(role: AppRole | null | undefined) {
  return role === "admin";
}
export function canManageWorkspace(role: AppRole | null | undefined) {
  return role === "admin";
}
export function canViewAudit(role: AppRole | null | undefined) {
  return role === "admin" || role === "manager";
}
export function canDeleteContacts(role: AppRole | null | undefined) {
  return role === "admin" || role === "manager";
}
export function canDeleteLeads(role: AppRole | null | undefined) {
  return role === "admin" || role === "manager";
}
export function canDeleteBookings(role: AppRole | null | undefined) {
  return role === "admin" || role === "manager" || role === "agent";
}
/** Agents may only (re)assign a conversation to themselves or unassign it. */
export function canAssignTo(
  role: AppRole | null | undefined,
  me: string,
  target: string | null,
) {
  if (!role) return false;
  if (role === "admin" || role === "manager") return true;
  return target === null || target === me;
}
/** Which conversations a member may see. */
export function canSeeConversation(
  role: AppRole | null | undefined,
  me: string,
  assignedTo: string | null,
  agentsSeeUnassigned: boolean,
) {
  if (!role) return false;
  if (role === "admin" || role === "manager") return true;
  if (assignedTo === me) return true;
  return assignedTo === null && agentsSeeUnassigned;
}
/** Only manually logged entries may be created from the app until a channel is connected. */
export function canSendOnChannel(channel: ChannelType, connected: boolean) {
  if (channel === "manual") return false;
  return connected;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.replace(/\[SAMPLE\]\s*/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
