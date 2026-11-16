import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, PageHeader, Panel, errMsg } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Confirm, Field, NativeSelect, ToneBadge } from "@/components/kit";
import { canManageWorkspace, canViewAudit } from "@/lib/domain";
import { SLUG_RE, priceLabel, slugify } from "@/lib/booking-page";

export const Route = createFileRoute("/_authenticated/services")({
  head: () => ({
    meta: [
      { title: "Services & online booking" },
      {
        name: "description",
        content: "What customers can book, opening hours, capacity and your public booking page.",
      },
    ],
  }),
  component: ServicesPage,
});

type Service = Tables<"services">;
type Hours = Record<string, [string, string][]>;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW = ["1", "2", "3", "4", "5", "6", "0"]; // Postgres dow: 0 = Sunday

const blank = (): Partial<Service> => ({
  name: "",
  description: "",
  booking_mode: "slot",
  duration_minutes: 60,
  slot_interval_minutes: 60,
  capacity: 10,
  capacity_unit: "guests",
  min_guests: 1,
  max_guests: 10,
  price_cents: null,
  currency: "EUR",
  price_per: "person",
  weekly_hours: {
    "1": [["09:00", "18:00"]],
    "2": [["09:00", "18:00"]],
    "3": [["09:00", "18:00"]],
    "4": [["09:00", "18:00"]],
    "5": [["09:00", "18:00"]],
    "6": [["10:00", "16:00"]],
  },
  lead_time_hours: 2,
  advance_days: 90,
  public: true,
  active: true,
});

const svcPrice = (s: Service) =>
  priceLabel({
    price_cents: s.price_cents,
    currency: s.currency,
    price_per: s.price_per as "person" | "booking",
    mode: s.booking_mode as "slot" | "day",
  });

function ServicesPage() {
  const ws = useWorkspace();
  const canEdit = canViewAudit(ws.role); // admin + manager, mirrors the "services write" policy
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["services", ws.workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("workspace_id", ws.workspaceId)
        .order("sort")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  async function remove(s: Service) {
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) return toast.error(errMsg(error));
    toast.success("Service deleted");
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Services & online booking"
        description="What customers can book — tours, rooms, tables, appointments — with your hours and capacity."
        actions={
          canEdit && (
            <Button onClick={() => setEditing(blank())}>
              <Plus /> New service
            </Button>
          )
        }
      />
      {canManageWorkspace(ws.role) && <BookingPageSettings />}
      <Panel className="mt-4">
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : !list.data?.length ? (
          <EmptyState
            icon={<Store />}
            title="No services yet"
            description="Add what you sell (e.g. “City tour”, “Double room”, “Table for dinner”, “Haircut”). Each one gets its own hours and capacity."
            action={
              canEdit && (
                <Button onClick={() => setEditing(blank())}>
                  <Plus /> Add your first service
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y">
            {list.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    {!s.active && <ToneBadge tone="muted">Paused</ToneBadge>}
                    {s.active && s.public && <ToneBadge tone="success">Bookable online</ToneBadge>}
                    {s.active && !s.public && <ToneBadge tone="secondary">Team only</ToneBadge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {s.booking_mode === "day" ? "Per night/day" : `${s.duration_minutes} min`} ·
                    capacity {s.capacity} {s.capacity_unit}
                    {svcPrice(s) &&
                      ` · ${svcPrice(s)}${s.price_per === "person" ? " / person" : ""}`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}
                    >
                      <Pencil />
                    </Button>
                    <Confirm
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`}>
                          <Trash2 />
                        </Button>
                      }
                      title={`Delete “${s.name}”?`}
                      description="Existing bookings stay; they just lose the link to this service. To stop new bookings temporarily, pause it instead."
                      confirmLabel="Delete"
                      onConfirm={() => remove(s)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ServiceSheet value={editing} onClose={() => setEditing(null)} />
    </PageContainer>
  );
}

function BookingPageSettings() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["booking-page-cfg", ws.workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("public_slug, booking_page_enabled, booking_page_intro, booking_auto_confirm")
        .eq("id", ws.workspaceId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [slug, setSlug] = useState("");
  const [intro, setIntro] = useState("");
  useEffect(() => {
    if (cfg.data) {
      setSlug(cfg.data.public_slug ?? slugify(ws.workspaceName));
      setIntro(cfg.data.booking_page_intro ?? "");
    }
  }, [cfg.data, ws.workspaceName]);

  async function save(patch: {
    public_slug?: string;
    booking_page_enabled?: boolean;
    booking_page_intro?: string | null;
    booking_auto_confirm?: boolean;
  }) {
    if (patch.booking_page_enabled && !cfg.data?.public_slug && !patch.public_slug)
      patch.public_slug = slug;
    if (patch.public_slug !== undefined && !SLUG_RE.test(patch.public_slug)) {
      return toast.error("Page address: 3–40 lowercase letters, numbers or dashes.");
    }
    const { error } = await supabase.from("workspaces").update(patch).eq("id", ws.workspaceId);
    if (error)
      return toast.error(
        error.code === "23505" ? "That page address is taken — try another." : errMsg(error),
      );
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["booking-page-cfg"] });
  }

  const url = cfg.data?.public_slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${cfg.data.public_slug}`
    : null;
  if (!cfg.data) return null;
  return (
    <Panel className="mt-4 space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Online booking page</h2>
          <p className="text-sm text-muted-foreground">
            A public page where customers book your services themselves. Bookings appear in Bookings
            and notify managers.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch
            checked={cfg.data.booking_page_enabled}
            onCheckedChange={(v) => save({ booking_page_enabled: v })}
            aria-label="Booking page on"
          />
          {cfg.data.booking_page_enabled ? "On" : "Off"}
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Page address" htmlFor="bp-slug" hint="Letters, numbers and dashes.">
          <div className="flex gap-2">
            <Input
              id="bp-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
            <Button
              variant="outline"
              disabled={slug === cfg.data.public_slug}
              onClick={() => save({ public_slug: slug })}
            >
              Save
            </Button>
          </div>
        </Field>
        <Field label="Welcome text (optional)" htmlFor="bp-intro">
          <div className="flex gap-2">
            <Input
              id="bp-intro"
              value={intro}
              maxLength={500}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="e.g. Book your tour in under a minute."
            />
            <Button
              variant="outline"
              disabled={intro === (cfg.data.booking_page_intro ?? "")}
              onClick={() => save({ booking_page_intro: intro.trim() || null })}
            >
              Save
            </Button>
          </div>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={cfg.data.booking_auto_confirm}
          onCheckedChange={(v) => save({ booking_auto_confirm: v })}
          aria-label="Confirm automatically"
        />
        Confirm bookings automatically (otherwise they arrive as “tentative” for you to confirm)
      </label>
      {url && cfg.data.booking_page_enabled && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono">{url}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(url).then(
                () => toast.success("Link copied"),
                () => toast.error("Copy failed"),
              )
            }
          >
            <Copy /> Copy
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          </Button>
        </div>
      )}
    </Panel>
  );
}

function ServiceSheet({ value, onClose }: { value: Partial<Service> | null; onClose: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [f, setF] = useState<Partial<Service>>(blank());
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value) {
      setF(value);
      setPrice(value.price_cents != null ? (value.price_cents / 100).toFixed(2) : "");
    }
  }, [value]);
  const hours = (f.weekly_hours ?? {}) as Hours;
  const setHours = (dow: string, range: [string, string] | null) =>
    setF({ ...f, weekly_hours: { ...hours, [dow]: range ? [range] : [] } });
  const num = (k: keyof Service) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: Number(e.target.value) });

  async function save() {
    if (!f.name?.trim()) return toast.error("Give the service a name");
    const cents = price.trim() ? Math.round(Number(price.replace(",", ".")) * 100) : null;
    if (cents !== null && (!Number.isFinite(cents) || cents < 0))
      return toast.error("Price must be a number");
    if ((f.min_guests ?? 1) > (f.max_guests ?? 1))
      return toast.error("Minimum guests can't be above maximum");
    setBusy(true);
    const row: TablesInsert<"services"> = {
      workspace_id: ws.workspaceId,
      name: f.name.trim(),
      description: f.description?.trim() || null,
      booking_mode: f.booking_mode,
      duration_minutes: f.duration_minutes,
      slot_interval_minutes: f.slot_interval_minutes,
      capacity: f.capacity,
      capacity_unit: f.capacity_unit,
      min_guests: f.min_guests,
      max_guests: f.max_guests,
      price_cents: cents,
      currency: (f.currency || "EUR").toUpperCase(),
      price_per: f.price_per,
      weekly_hours: f.weekly_hours,
      lead_time_hours: f.lead_time_hours,
      advance_days: f.advance_days,
      public: f.public,
      active: f.active,
    };
    const { error } = f.id
      ? await supabase.from("services").update(row).eq("id", f.id)
      : await supabase.from("services").insert(row);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(f.id ? "Service updated" : "Service added");
    qc.invalidateQueries({ queryKey: ["services"] });
    onClose();
  }

  const day = f.booking_mode === "day";
  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{f.id ? "Edit service" : "New service"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <Field label="Name" htmlFor="sv-name">
            <Input
              id="sv-name"
              value={f.name ?? ""}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="City tour, Double room, Dinner table…"
            />
          </Field>
          <Field label="Description (shown to customers)" htmlFor="sv-desc">
            <Textarea
              id="sv-desc"
              rows={2}
              value={f.description ?? ""}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </Field>
          <Field label="How is it booked?" htmlFor="sv-mode">
            <NativeSelect
              id="sv-mode"
              value={f.booking_mode}
              onChange={(e) => setF({ ...f, booking_mode: e.target.value })}
            >
              <option value="slot">By time slot (tours, tables, appointments)</option>
              <option value="day">By night / day (rooms, rentals)</option>
            </NativeSelect>
          </Field>
          {!day && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (min)" htmlFor="sv-dur">
                <Input
                  id="sv-dur"
                  type="number"
                  min={5}
                  max={1440}
                  value={f.duration_minutes}
                  onChange={num("duration_minutes")}
                />
              </Field>
              <Field label="Start every (min)" htmlFor="sv-int">
                <Input
                  id="sv-int"
                  type="number"
                  min={5}
                  max={1440}
                  value={f.slot_interval_minutes}
                  onChange={num("slot_interval_minutes")}
                />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={day ? "Units available per night" : "Capacity per slot"} htmlFor="sv-cap">
              <Input
                id="sv-cap"
                type="number"
                min={1}
                max={10000}
                value={f.capacity}
                onChange={num("capacity")}
              />
            </Field>
            <Field label="Capacity counts" htmlFor="sv-unit">
              <NativeSelect
                id="sv-unit"
                value={f.capacity_unit}
                onChange={(e) => setF({ ...f, capacity_unit: e.target.value })}
              >
                <option value="guests">Guests</option>
                <option value="bookings">Bookings</option>
              </NativeSelect>
            </Field>
            <Field label="Min guests" htmlFor="sv-min">
              <Input
                id="sv-min"
                type="number"
                min={1}
                value={f.min_guests}
                onChange={num("min_guests")}
              />
            </Field>
            <Field label="Max guests per booking" htmlFor="sv-max">
              <Input
                id="sv-max"
                type="number"
                min={1}
                value={f.max_guests}
                onChange={num("max_guests")}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price" htmlFor="sv-price" className="col-span-1">
              <Input
                id="sv-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Free"
              />
            </Field>
            <Field label="Currency" htmlFor="sv-cur">
              <Input
                id="sv-cur"
                maxLength={3}
                value={f.currency ?? "EUR"}
                onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Per" htmlFor="sv-per">
              <NativeSelect
                id="sv-per"
                value={f.price_per}
                onChange={(e) => setF({ ...f, price_per: e.target.value })}
              >
                <option value="person">Person</option>
                <option value="booking">{day ? "Night" : "Booking"}</option>
              </NativeSelect>
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">
              {day ? "Days open for check-in" : "Opening hours"}
            </legend>
            {DOW.map((d, i) => {
              const r = hours[d]?.[0] ?? null;
              return (
                <div key={d} className="flex items-center gap-2">
                  <label className="flex w-20 items-center gap-2 text-sm">
                    <Switch
                      checked={!!r}
                      onCheckedChange={(v) => setHours(d, v ? ["09:00", "18:00"] : null)}
                      aria-label={`Open on ${DAYS[i]}`}
                    />
                    {DAYS[i]}
                  </label>
                  {r && !day ? (
                    <>
                      <Input
                        type="time"
                        className="h-9 w-28"
                        value={r[0]}
                        onChange={(e) => setHours(d, [e.target.value, r[1]])}
                        aria-label={`${DAYS[i]} opens`}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        className="h-9 w-28"
                        value={r[1]}
                        onChange={(e) => setHours(d, [r[0], e.target.value])}
                        aria-label={`${DAYS[i]} closes`}
                      />
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">{r ? "Open" : "Closed"}</span>
                  )}
                </div>
              );
            })}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Book at least (hours ahead)" htmlFor="sv-lead">
              <Input
                id="sv-lead"
                type="number"
                min={0}
                max={720}
                value={f.lead_time_hours}
                onChange={num("lead_time_hours")}
              />
            </Field>
            <Field label="Book up to (days ahead)" htmlFor="sv-adv">
              <Input
                id="sv-adv"
                type="number"
                min={1}
                max={730}
                value={f.advance_days}
                onChange={num("advance_days")}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!f.public} onCheckedChange={(v) => setF({ ...f, public: v })} /> Show
            on the online booking page
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />{" "}
            Active (uncheck to pause new bookings)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {f.id ? "Save changes" : "Add service"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
