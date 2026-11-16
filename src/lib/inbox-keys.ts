// Inbox speed tools: keyboard shortcuts and snooze presets (pure, tested).

export type InboxCommand =
  "next" | "prev" | "resolve" | "assignMe" | "reply" | "search" | "select" | "help" | "close";

export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "j / k", label: "Next / previous conversation" },
  { keys: "r", label: "Reply (focus the message box)" },
  { keys: "e", label: "Resolve conversation" },
  { keys: "a", label: "Assign to me" },
  { keys: "x", label: "Select for bulk actions" },
  { keys: "/", label: "Search the inbox" },
  { keys: "Esc", label: "Close conversation / clear selection" },
  { keys: "?", label: "Show shortcuts" },
];

type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
};

/** True when the key press belongs to a text field and must not trigger shortcuts. */
export function isTypingTarget(t: unknown): boolean {
  if (!t || typeof t !== "object") return false;
  const el = t as { tagName?: string; isContentEditable?: boolean; type?: string };
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT")
    return !["checkbox", "radio", "button", "submit"].includes(el.type ?? "text");
  return false;
}

export function commandFor(e: KeyLike): InboxCommand | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Escape") return "close";
  if (isTypingTarget(e.target)) return null;
  switch (e.key) {
    case "j":
    case "ArrowDown":
      return "next";
    case "k":
    case "ArrowUp":
      return "prev";
    case "e":
      return "resolve";
    case "a":
      return "assignMe";
    case "r":
      return "reply";
    case "/":
      return "search";
    case "x":
      return "select";
    case "?":
      return "help";
    default:
      return null;
  }
}

/** Id `step` places away from `current` in `ids` (clamped); first item when nothing is open. */
export function moveSelection(
  ids: string[],
  current: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (!ids.length) return undefined;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, i + step))];
}

export type SnoozePreset = "1h" | "3h" | "tomorrow" | "monday";
export const SNOOZE_LABEL: Record<SnoozePreset, string> = {
  "1h": "1 hour",
  "3h": "3 hours",
  tomorrow: "Tomorrow 9:00",
  monday: "Next Monday 9:00",
};

/** When a snooze preset ends, in the viewer's local time. */
export function snoozeUntil(preset: SnoozePreset, now = new Date()): Date {
  if (preset === "1h") return new Date(now.getTime() + 3600_000);
  if (preset === "3h") return new Date(now.getTime() + 3 * 3600_000);
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  if (preset === "tomorrow") d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

export function isSnoozed(until: string | null | undefined, now = new Date()): boolean {
  return !!until && new Date(until).getTime() > now.getTime();
}

/** "14:30" for later today, otherwise "Thu 09:00" — shown as "Snoozed until …". */
export function snoozeLabel(until: string, now = new Date()): string {
  const d = new Date(until);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}
