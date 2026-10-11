// Server-only client for the company website API (tuktuk24lisbon.com). The key never leaves the server.
export const WEBSITE_BASE = "https://tuktuk24lisbon.com/api/v1";

export type WebsiteTour = {
  id: string; slug: string; title: string; duration: string; price: number; sale_price: number | null;
  currency: string; pricing_type: string; tagline?: string; description?: string; highlights?: string[];
};

export async function websiteGet<T>(path: string): Promise<T> {
  const key = process.env.WEBSITE_API_KEY;
  if (!key) throw new Error("Website key is not configured.");
  const res = await fetch(`${WEBSITE_BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? `Website replied with ${res.status}.`);
  return json.data as T;
}

export async function websitePost<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.WEBSITE_API_KEY;
  if (!key) throw new Error("Website key is not configured.");
  const res = await fetch(`${WEBSITE_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? `Website replied with ${res.status}.`);
  return json.data as T;
}
