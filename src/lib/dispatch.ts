export type DispatchStatus = "scheduled" | "dispatched" | "on_tour" | "done";

export const DISPATCH_FLOW: DispatchStatus[] = ["scheduled", "dispatched", "on_tour", "done"];
export const DISPATCH_LABEL: Record<DispatchStatus, string> = {
  scheduled: "Scheduled",
  dispatched: "Driver dispatched",
  on_tour: "On tour",
  done: "Completed",
};

export function nextDispatch(s: DispatchStatus): DispatchStatus | null {
  const i = DISPATCH_FLOW.indexOf(s);
  return i >= 0 && i < DISPATCH_FLOW.length - 1 ? DISPATCH_FLOW[i + 1] : null;
}

export type Slot = {
  id: string;
  tour_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  status?: string;
};

/** Minutes from midnight for "HH:MM[:SS]". */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function range(s: Slot): [number, number] | null {
  if (!s.tour_date || !s.start_time) return null;
  const start = toMinutes(s.start_time);
  return [start, start + (s.duration_minutes || 60)];
}

/** Returns booking ids that overlap another booking sharing the same vehicle or driver on the same day. Cancelled bookings never conflict. */
export function findConflicts(slots: Slot[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const live = slots.filter((s) => s.status !== "cancelled");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.tour_date !== b.tour_date) continue;
      const ra = range(a), rb = range(b);
      if (!ra || !rb || !(ra[0] < rb[1] && rb[0] < ra[1])) continue;
      const reasons: string[] = [];
      if (a.vehicle_id && a.vehicle_id === b.vehicle_id) reasons.push("vehicle");
      if (a.driver_id && a.driver_id === b.driver_id) reasons.push("driver");
      for (const r of reasons) {
        out.set(a.id, [...new Set([...(out.get(a.id) ?? []), r])]);
        out.set(b.id, [...new Set([...(out.get(b.id) ?? []), r])]);
      }
    }
  }
  return out;
}
