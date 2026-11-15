// Server-only: fixed-window rate limiting backed by the check_rate_limit RPC (migration 0021).
// Fails OPEN on database errors for webhooks (never drop customer messages because the limiter
// is down) and CLOSED for credential-like lookups (invites, tickets) via `failClosed`.
import { getRequest } from "@tanstack/react-start/server";

export function clientIp(req?: Request | null): string {
  const r =
    req ??
    (() => {
      try {
        return getRequest();
      } catch {
        return null;
      }
    })();
  const h = r?.headers;
  return (h?.get("cf-connecting-ip") || h?.get("x-forwarded-for")?.split(",")[0] || "unknown")
    .trim()
    .slice(0, 64);
}

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  opts: { failClosed?: boolean } = {},
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc(
      "check_rate_limit" as never,
      { _key: key, _max: max, _window_seconds: windowSeconds } as never,
    );
    if (error) return !opts.failClosed;
    return data === true;
  } catch {
    return !opts.failClosed;
  }
}

export const tooMany = () =>
  new Response("Too many requests", { status: 429, headers: { "retry-after": "60" } });
