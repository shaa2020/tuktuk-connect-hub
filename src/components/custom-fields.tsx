import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/kit";
import { Panel } from "@/components/states";

type Def = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options: string[];
};

export function useFieldDefs(workspaceId: string) {
  return useQuery({
    queryKey: ["field-defs", workspaceId],
    queryFn: async () =>
      ((
        await supabase
          .from("contact_field_definitions")
          .select("id, key, label, type, options")
          .eq("workspace_id", workspaceId)
          .order("sort")
          .order("created_at")
      ).data ?? []) as Def[],
  });
}

const keyOf = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1")
    .slice(0, 40) || "field";

/** Admin: define custom contact fields (Settings). */
export function CustomFieldDefinitions({ workspaceId }: { workspaceId: string }) {
  const defs = useFieldDefs(workspaceId);
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<Def["type"]>("text");
  const [options, setOptions] = useState("");
  async function add() {
    if (!label.trim()) return toast.error("Give the field a name");
    const opts =
      type === "select"
        ? options
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
            .slice(0, 30)
        : [];
    if (type === "select" && !opts.length)
      return toast.error("List the options, separated by commas");
    const { error } = await supabase.from("contact_field_definitions").insert({
      workspace_id: workspaceId,
      key: keyOf(label),
      label: label.trim().slice(0, 60),
      type,
      options: opts,
    });
    if (error)
      return toast.error(
        error.message.includes("duplicate")
          ? "A field with that name already exists"
          : error.message,
      );
    setLabel("");
    setOptions("");
    qc.invalidateQueries({ queryKey: ["field-defs"] });
  }
  async function remove(id: string) {
    if (
      !window.confirm(
        "Remove this field? Values already saved on contacts stay in exports but are hidden.",
      )
    )
      return;
    const { error } = await supabase.from("contact_field_definitions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["field-defs"] });
  }
  return (
    <Panel className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">Custom contact fields</h2>
      <p className="text-xs text-muted-foreground">
        Extra information you want to keep on every customer, e.g. "Hotel", "Allergies", "VIP
        level".
      </p>
      <ul className="divide-y text-sm">
        {(defs.data ?? []).map((d) => (
          <li key={d.id} className="flex items-center gap-2 py-1.5">
            <span className="flex-1">
              {d.label}{" "}
              <span className="text-xs text-muted-foreground">
                ({d.type}
                {d.options.length ? `: ${d.options.join(", ")}` : ""})
              </span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${d.label}`}
              onClick={() => remove(d.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Field name"
          maxLength={60}
          aria-label="Field name"
        />
        <NativeSelect
          value={type}
          onChange={(e) => setType(e.target.value as Def["type"])}
          aria-label="Field type"
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="select">Choice list</option>
        </NativeSelect>
      </div>
      {type === "select" && (
        <Input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          placeholder="Options, separated by commas"
          aria-label="Options"
        />
      )}
      <Button size="sm" variant="secondary" onClick={add}>
        <Plus /> Add field
      </Button>
    </Panel>
  );
}

/** Contact page: view and edit custom field values (validated again by the database). */
export function ContactCustomFields({
  workspaceId,
  contactId,
  values,
  onSaved,
}: {
  workspaceId: string;
  contactId: string;
  values: Record<string, unknown>;
  onSaved: () => void;
}) {
  const defs = useFieldDefs(workspaceId);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(values ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  if (!defs.data?.length) return null;
  async function save() {
    const out: Record<string, unknown> = {};
    for (const d of defs.data!) {
      const v = (draft[d.key] ?? "").trim();
      if (!v) continue;
      if (d.type === "number") {
        const n = Number(v.replace(",", "."));
        if (!Number.isFinite(n)) return toast.error(`${d.label} must be a number`);
        out[d.key] = n;
      } else out[d.key] = v;
    }
    const { error } = await supabase
      .from("contacts")
      .update({ custom_fields: out as never })
      .eq("id", contactId);
    if (error) return toast.error(error.message);
    setDirty(false);
    toast.success("Saved");
    onSaved();
  }
  const set = (k: string, v: string) => {
    setDraft((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        More details
      </h3>
      {defs.data.map((d) => (
        <label key={d.id} className="block text-sm">
          <span className="text-muted-foreground">{d.label}</span>
          {d.type === "select" ? (
            <NativeSelect
              value={draft[d.key] ?? ""}
              onChange={(e) => set(d.key, e.target.value)}
              className="mt-1"
            >
              <option value="">—</option>
              {d.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input
              className="mt-1"
              type={d.type === "date" ? "date" : d.type === "number" ? "number" : "text"}
              value={draft[d.key] ?? ""}
              maxLength={500}
              onChange={(e) => set(d.key, e.target.value)}
            />
          )}
        </label>
      ))}
      {dirty && (
        <Button size="sm" onClick={save}>
          Save details
        </Button>
      )}
    </div>
  );
}
