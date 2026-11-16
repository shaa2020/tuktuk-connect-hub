import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock, Loader2, Minus, Plus, Users } from "lucide-react";
import { createPublicBooking, getBookingPage, getSlots } from "@/lib/booking-page.functions";
import { nextDates, priceLabel, type PublicService } from "@/lib/booking-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Public online booking page: /book/<business-slug>. No sign-in. Availability and the final
// capacity check happen in the database, so customers can never overbook.
export const Route = createFileRoute("/book/$slug")({
  loader: ({ params }) => getBookingPage({ data: { slug: params.slug } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Book with ${loaderData.name}` : "Online booking" },
      { name: "description", content: loaderData?.intro ?? "Book online in a few taps." },
    ],
  }),
  component: BookingPage,
});

const fmtDay = (d: string, tz: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });

function BookingPage() {
  const page = Route.useLoaderData();
  const { slug } = Route.useParams();
  const [service, setService] = useState<PublicService | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [nights, setNights] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; status: string } | null>(null);
  const slotsFn = useServerFn(getSlots);
  const createFn = useServerFn(createPublicBooking);
  const dates = useMemo(
    () => (page ? nextDates(page.timezone, Math.min(service?.advance_days ?? 30, 30)) : []),
    [page, service],
  );
  const slots = useQuery({
    queryKey: ["public-slots", slug, service?.id, date],
    enabled: !!service && !!date,
    queryFn: () => slotsFn({ data: { slug, serviceId: service!.id, date: date! } }),
  });

  if (!page) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Booking page not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please contact the business directly.</p>
      </Shell>
    );
  }
  if (done) {
    return (
      <Shell title={page.name}>
        <div className="rounded-2xl border bg-card p-6 text-center shadow-card">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <h2 className="mt-3 text-xl font-bold">
            {done.status === "confirmed" ? "Booking confirmed" : "Request received"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {done.status === "confirmed"
              ? "We look forward to seeing you."
              : `${page.name} will confirm your booking shortly.`}
          </p>
          <p className="mt-4 font-mono text-lg font-semibold">{done.reference}</p>
          <p className="text-xs text-muted-foreground">Your booking reference</p>
        </div>
      </Shell>
    );
  }

  const total = service ? priceLabel(service, guests, nights) : null;
  const ready =
    service &&
    date &&
    (service.mode === "day" || time) &&
    form.name.trim().length >= 2 &&
    (form.email.trim() || form.phone.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !date) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createFn({
        data: {
          slug,
          serviceId: service.id,
          date,
          time: service.mode === "slot" ? time : null,
          guests,
          nights,
          ...form,
        },
      });
      if (!r.ok) {
        setError(r.error);
        slots.refetch();
      } else setDone(r.booking);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={page.name} intro={page.intro}>
      <form onSubmit={submit} className="space-y-5">
        <Step n={1} title="Choose">
          <div className="grid gap-2">
            {page.services.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No services are open for online booking yet.
              </p>
            )}
            {page.services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setService(s);
                  setTime(null);
                  setGuests(Math.max(s.min_guests, Math.min(2, s.max_guests)));
                }}
                className={cn(
                  "rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent",
                  service?.id === s.id && "border-primary ring-2 ring-primary/30",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  {priceLabel(s) && (
                    <span className="shrink-0 text-sm font-medium">
                      {priceLabel(s)}
                      {s.price_per === "person" ? " / person" : s.mode === "day" ? " / night" : ""}
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {s.mode === "day" ? "Per night" : `${s.duration_minutes} min`}
                </p>
              </button>
            ))}
          </div>
        </Step>

        {service && (
          <Step n={2} title={service.mode === "day" ? "Check-in date" : "Date"}>
            <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    setTime(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-xl border bg-card px-3 py-2 text-sm",
                    date === d && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {fmtDay(d, page.timezone)}
                </button>
              ))}
            </div>
          </Step>
        )}

        {service && date && (
          <Step n={3} title={service.mode === "day" ? "Availability" : "Time"}>
            {slots.isLoading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : service.mode === "day" ? (
              (slots.data?.slots[0]?.remaining ?? 0) > 0 ? (
                <p className="text-sm text-success">Available</p>
              ) : (
                <p className="text-sm text-destructive">Fully booked on this date — try another.</p>
              )
            ) : !slots.data?.slots.some((s) => s.remaining > 0) ? (
              <p className="text-sm text-muted-foreground">
                No times left on this day. Please choose another date.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.data.slots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    disabled={s.remaining < (guests || 1)}
                    onClick={() => setTime(s.time)}
                    className={cn(
                      "rounded-lg border bg-card py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
                      time === s.time && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </Step>
        )}

        {service && date && (
          <Step n={4} title="Details">
            <div className="space-y-3">
              <Counter
                label="Guests"
                icon={<Users className="size-4" />}
                value={guests}
                min={service.min_guests}
                max={service.max_guests}
                onChange={setGuests}
              />
              {service.mode === "day" && (
                <Counter
                  label="Nights"
                  icon={<CalendarCheck className="size-4" />}
                  value={nights}
                  min={1}
                  max={30}
                  onChange={setNights}
                />
              )}
              <Field id="bp-name" label="Your name">
                <Input
                  id="bp-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoComplete="name"
                  required
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="bp-email" label="Email">
                  <Input
                    id="bp-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoComplete="email"
                  />
                </Field>
                <Field id="bp-phone" label="Phone / WhatsApp">
                  <Input
                    id="bp-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    autoComplete="tel"
                  />
                </Field>
              </div>
              <Field id="bp-note" label="Anything we should know? (optional)">
                <Textarea
                  id="bp-note"
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  maxLength={2000}
                />
              </Field>
              <input
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="hidden"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
          </Step>
        )}

        {service && date && (
          <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur">
            {error && (
              <p
                role="alert"
                className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={!ready || busy}>
              {busy && <Loader2 className="animate-spin" />} {total ? `Book · ${total}` : "Book"}
            </Button>
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Payment is arranged directly with {page.name}.
            </p>
          </div>
        )}
      </form>
    </Shell>
  );
}

function Shell({
  title,
  intro,
  children,
}: {
  title?: string;
  intro?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-xl px-4 py-8">
        {title && <h1 className="font-display text-2xl font-bold">{title}</h1>}
        {intro && <p className="mt-1 text-sm text-muted-foreground">{intro}</p>}
        <div className={cn(title && "mt-6")}>{children}</div>
      </div>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs text-primary">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Counter({
  label,
  icon,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          <Minus />
        </Button>
        <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          aria-label={`More ${label.toLowerCase()}`}
        >
          <Plus />
        </Button>
      </span>
    </div>
  );
}
