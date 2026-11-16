// Pure helpers for the public booking page (tested).
export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  mode: "slot" | "day";
  duration_minutes: number;
  price_cents: number | null;
  currency: string;
  price_per: "booking" | "person";
  min_guests: number;
  max_guests: number;
  advance_days: number;
};
export type PublicPage = {
  name: string;
  timezone: string;
  intro: string | null;
  services: PublicService[];
};

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "my-business"
  );
}

export function priceLabel(
  s: Pick<PublicService, "price_cents" | "currency" | "price_per" | "mode">,
  guests = 1,
  nights = 1,
): string | null {
  if (s.price_cents === null || s.price_cents === undefined) return null;
  const total =
    (s.price_cents / 100) *
    (s.price_per === "person" ? guests : 1) *
    (s.mode === "day" ? nights : 1);
  return new Intl.NumberFormat("en", { style: "currency", currency: s.currency }).format(total);
}

/** Next `n` dates (YYYY-MM-DD) starting today in the business time zone. */
export function nextDates(timeZone: string, n: number, from = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = fmt.format(from);
  const out: string[] = [];
  const base = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < n; i++)
    out.push(new Date(base.getTime() + i * 86400_000).toISOString().slice(0, 10));
  return out;
}
