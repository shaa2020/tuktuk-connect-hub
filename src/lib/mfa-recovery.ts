// MFA recovery codes (tested). Codes are shown once; only salted SHA-256 hashes are stored.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = crypto.getRandomValues(new Uint8Array(10));
    const s = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1");
}

export function looksLikeCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{10}$/.test(normalizeCode(code).replace(/0/g, "O").replace(/1/g, "I"));
}

export async function hashCode(userId: string, code: string): Promise<string> {
  const d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`tt-mfa-recovery:${userId}:${normalizeCode(code)}`),
  );
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
