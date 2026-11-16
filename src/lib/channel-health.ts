// Pure: one health row per channel from real channel_connections rows (tested).
// Placeholder rows (never set up) are hidden; a channel with any error is flagged first.
export type ConnRow = { channel: string; status: string; last_error?: string | null };
export type ChannelHealth = {
  channel: string;
  connected: number;
  errors: number;
  tone: "success" | "danger" | "warning";
  label: string;
};

export function channelHealth(rows: ConnRow[]): ChannelHealth[] {
  const by = new Map<string, { connected: number; errors: number }>();
  for (const r of rows) {
    const isError = r.status === "error" || (r.status === "connected" && !!r.last_error);
    if (r.status !== "connected" && !isError) continue; // placeholder / disconnected: not shown
    const v = by.get(r.channel) ?? { connected: 0, errors: 0 };
    if (isError) v.errors++;
    else v.connected++;
    by.set(r.channel, v);
  }
  return [...by.entries()]
    .map(([channel, v]) => ({
      channel,
      ...v,
      tone: (v.errors && !v.connected
        ? "danger"
        : v.errors
          ? "warning"
          : "success") as ChannelHealth["tone"],
      label: v.errors
        ? `${v.errors} need${v.errors === 1 ? "s" : ""} attention`
        : v.connected === 1
          ? "Connected"
          : `${v.connected} connected`,
    }))
    .sort((a, b) => b.errors - a.errors || a.channel.localeCompare(b.channel));
}
