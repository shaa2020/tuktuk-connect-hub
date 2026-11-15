// Browser-safe helpers for self-service registration and onboarding.

/**
 * Public registration is OFF until the owner enables it (Supabase Auth "allow signups" + this
 * flag). Until then /signup explains that access is by invitation. See docs/BLOCKERS.md B-AUTH-1.
 */
export const PUBLIC_SIGNUP_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUP === "true";

export const INDUSTRIES = [
  { value: "tour_operator", label: "Tour operator" },
  { value: "travel_agency", label: "Travel agency" },
  { value: "hotel", label: "Hotel / accommodation" },
  { value: "restaurant", label: "Restaurant / café" },
  { value: "hospitality", label: "Other hospitality" },
  { value: "local_services", label: "Local services" },
  { value: "retail", label: "Retail / shop" },
  { value: "other", label: "Other" },
] as const;

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "pt", label: "Português" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
] as const;

const FALLBACK_TIMEZONES = [
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "America/New_York",
  "America/Sao_Paulo",
  "UTC",
];
export function timeZones(): string[] {
  try {
    const list = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    return list?.length ? list : FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES;
  }
}
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Lisbon";
  } catch {
    return "Europe/Lisbon";
  }
}

/** Mirrors the Supabase password policy configured for this project (lower, upper, digit, symbol). */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("at least 10 characters");
  if (pw.length > 72) out.push("at most 72 characters");
  if (!/[a-z]/.test(pw)) out.push("a lowercase letter");
  if (!/[A-Z]/.test(pw)) out.push("an uppercase letter");
  if (!/\d/.test(pw)) out.push("a number");
  if (!/[^A-Za-z0-9]/.test(pw)) out.push("a symbol");
  return out;
}

export function validateBusinessName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return "Enter your business name (at least 2 characters).";
  if (n.length > 120) return "Business name must be 120 characters or fewer.";
  return null;
}
