export type TourPackage = {
  id: string;
  name: string;
  durationMinutes: number;
  pricePerTuk: number; // EUR, per tuk tuk (not per person)
  maxGuestsPerTuk: number;
  /** per_tuk (default): price × tuks. per_person: price × guests. */
  pricing?: "per_tuk" | "per_person";
  highlights: string[];
};

export const TOUR_PACKAGES: TourPackage[] = [
  { id: "alfama", name: "Historic Alfama", durationMinutes: 60, pricePerTuk: 60, maxGuestsPerTuk: 4, highlights: ["Alfama old town", "Sé Cathedral", "Portas do Sol viewpoint"] },
  { id: "belem", name: "Belém Highlights", durationMinutes: 120, pricePerTuk: 110, maxGuestsPerTuk: 4, highlights: ["Belém Tower", "Jerónimos Monastery", "Pastéis de Belém tasting stop"] },
  { id: "sunset", name: "Sunset Miradouros", durationMinutes: 90, pricePerTuk: 85, maxGuestsPerTuk: 4, highlights: ["Senhora do Monte viewpoint", "Graça", "Sunset photo stops"] },
  { id: "custom", name: "Custom Route", durationMinutes: 120, pricePerTuk: 120, maxGuestsPerTuk: 4, highlights: ["Route planned with the guest"] },
];

export function tuksNeeded(guests: number, perTuk: number): number {
  if (guests <= 0 || perTuk <= 0) return 1;
  return Math.ceil(guests / perTuk);
}

export function quoteTotal(pkg: TourPackage, guests: number): { tuks: number; total: number } {
  const tuks = tuksNeeded(guests, pkg.maxGuestsPerTuk);
  const total = pkg.pricing === "per_person" ? Math.max(guests, 1) * pkg.pricePerTuk : tuks * pkg.pricePerTuk;
  return { tuks, total };
}

const fmtDur = (m: number) => (m <= 0 ? "flexible" : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}`);

/** Ready-to-send booking summary the agent reviews before sending. */
export function formatQuote(pkg: TourPackage, guests: number, date: string, time: string, pickup: string, businessName = "Tuk Tuk 24 Lisbon"): string {
  const { tuks, total } = quoteTotal(pkg, guests);
  const lines = [
    `🛺 ${businessName} — Tour Quote`,
    ``,
    `Tour: ${pkg.name} (${fmtDur(pkg.durationMinutes)})`,
    `Guests: ${guests}${tuks > 1 ? ` · ${tuks} tuk tuks` : ""}`,
  ];
  if (date) lines.push(`Date: ${date}${time ? ` at ${time}` : ""}`);
  if (pickup) lines.push(`Pick-up: ${pickup}`);
  lines.push(``, `Highlights:`);
  for (const h of pkg.highlights) lines.push(`• ${h}`);
  lines.push(``, `Total: €${total} (all taxes included)`);
  lines.push(``, `Reply YES to confirm and we'll reserve your tuk tuk. Any questions, just ask! ☀️`);
  return lines.join("\n");
}

/** "90 minutes", "1.5 Hours", "1 hour", "On-demand" → minutes (0 when unknown). */
export function parseDurationMinutes(s: string): number {
  const m = s.toLowerCase().match(/([\d.]+)\s*(h|hour|hours|min|minute|minutes)/);
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  return Math.round(m[2]!.startsWith("h") ? n * 60 : n);
}
