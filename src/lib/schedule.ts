// Pure helpers for the staff schedule page (tested). Times are shown in the viewer's local time.
export type Shift = {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  position: string | null;
};

/** Monday 00:00 (local) of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
export function shiftsByDay(shifts: Shift[]): Record<string, Shift[]> {
  const out: Record<string, Shift[]> = {};
  for (const s of [...shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    (out[dayKey(new Date(s.starts_at))] ??= []).push(s);
  return out;
}
export function hours(s: { starts_at: string; ends_at: string }): number {
  return Math.max(0, (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3_600_000);
}
/** Scheduled hours per person, highest first. */
export function workload(shifts: Shift[]): { user_id: string; hours: number; shifts: number }[] {
  const m = new Map<string, { hours: number; shifts: number }>();
  for (const s of shifts) {
    const v = m.get(s.user_id) ?? { hours: 0, shifts: 0 };
    v.hours += hours(s);
    v.shifts++;
    m.set(s.user_id, v);
  }
  return [...m.entries()]
    .map(([user_id, v]) => ({ user_id, hours: Math.round(v.hours * 10) / 10, shifts: v.shifts }))
    .sort((a, b) => b.hours - a.hours);
}
/** Combines a local date (YYYY-MM-DD) and time (HH:MM) into an ISO timestamp; end before start rolls to next day. */
export function shiftRange(
  date: string,
  start: string,
  end: string,
): { starts_at: string; ends_at: string } | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(start) ||
    !/^\d{2}:\d{2}$/.test(end)
  )
    return null;
  const s = new Date(`${date}T${start}`);
  let e = new Date(`${date}T${end}`);
  if (isNaN(+s) || isNaN(+e)) return null;
  if (e <= s) e = addDays(e, 1);
  return { starts_at: s.toISOString(), ends_at: e.toISOString() };
}
