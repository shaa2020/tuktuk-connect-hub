// Pure: decides whether a tenant-supplied outbound URL is safe for the server to call.
// Blocks plain http, embedded credentials, non-standard ports, localhost, private/link-local/
// metadata IP ranges and internal-only hostnames (SSRF protection, SECURITY_AUDIT F-09).
// DNS rebinding to private IPs is not covered here; the runtime (Cloudflare Workers) cannot reach
// private networks anyway, which is the second layer.

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".intranet",
];

function ipv4Private(host: string): boolean | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function unsafeUrlReason(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Not a valid address.";
  }
  if (u.protocol !== "https:") return "The address must start with https://.";
  if (u.username || u.password) return "The address must not contain a username or password.";
  if (u.port && u.port !== "443") return "Only the standard https port is allowed.";
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)))
    return "Internal addresses are not allowed.";
  if (host.startsWith("[") || host.includes(":"))
    return "IP addresses are not allowed; use the provider's domain name.";
  const v4 = ipv4Private(host);
  if (v4 !== null) return "IP addresses are not allowed; use the provider's domain name.";
  if (!host.includes(".")) return "Use the provider's full domain name.";
  return null;
}

export const isSafeOutboundUrl = (raw: string) => unsafeUrlReason(raw) === null;
