import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, NativeSelect, emptyToNull } from "@/components/kit";
import { errMsg } from "@/components/states";

const schema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(200),
  preferred_name: z.string().max(120).optional(),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((v) => !v || z.string().email().safeParse(v).success, "Invalid email")
    .optional(),
  phone: z.string().trim().max(40).optional(),
  preferred_language: z.string().max(40).optional(),
  country: z.string().max(80).optional(),
  notes: z.string().max(5000).optional(),
  assigned_to: z.string().optional(),
});
export type ContactInput = z.infer<typeof schema>;

export function ContactFormDialog({
  open,
  onOpenChange,
  initial,
  contactId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<ContactInput>;
  contactId?: string;
  onSaved?: (id: string) => void;
}) {
  const { workspaceId, members } = useWorkspace();
  const qc = useQueryClient();
  const [f, setF] = useState<ContactInput>({ full_name: "", ...initial } as ContactInput);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ContactInput) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setErr(null);
    const p = schema.safeParse(f);
    if (!p.success) return setErr(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    try {
      const data = emptyToNull({ ...p.data });
      // Duplicate check by reliable identifiers only (never by name)
      if (!contactId && (data.email || data.phone)) {
        const ors = [
          data.email && `email.ilike.${data.email}`,
          data.phone && `phone.eq.${data.phone}`,
        ]
          .filter(Boolean)
          .join(",");
        const { data: dup } = await supabase
          .from("contacts")
          .select("id, full_name")
          .eq("workspace_id", workspaceId)
          .or(ors)
          .limit(1);
        if (
          dup &&
          dup.length &&
          !confirm(
            `A contact with this email or phone already exists (${dup[0]?.full_name}). Create anyway?`,
          )
        ) {
          setBusy(false);
          return;
        }
      }
      if (contactId) {
        const { error } = await supabase.from("contacts").update(data).eq("id", contactId);
        if (error) throw error;
        toast.success("Contact updated");
        onSaved?.(contactId);
      } else {
        const { data: row, error } = await supabase
          .from("contacts")
          .insert({ ...data, workspace_id: workspaceId })
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Contact created");
        onSaved?.(row.id);
      }
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contact"] });
      onOpenChange(false);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contactId ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name *" htmlFor="c-name" className="sm:col-span-2">
            <Input id="c-name" value={f.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Preferred name" htmlFor="c-pn">
            <Input id="c-pn" value={f.preferred_name ?? ""} onChange={set("preferred_name")} />
          </Field>
          <Field label="Preferred language" htmlFor="c-lang">
            <Input
              id="c-lang"
              value={f.preferred_language ?? ""}
              onChange={set("preferred_language")}
              placeholder="English"
            />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input id="c-email" type="email" value={f.email ?? ""} onChange={set("email")} />
          </Field>
          <Field label="Phone" htmlFor="c-phone">
            <Input
              id="c-phone"
              type="tel"
              value={f.phone ?? ""}
              onChange={set("phone")}
              placeholder="+351 …"
            />
          </Field>
          <Field label="Country" htmlFor="c-country">
            <Input id="c-country" value={f.country ?? ""} onChange={set("country")} />
          </Field>
          <Field label="Assigned to" htmlFor="c-assign">
            <NativeSelect id="c-assign" value={f.assigned_to ?? ""} onChange={set("assigned_to")}>
              <option value="">Nobody</option>
              {members
                .filter((m) => m.active)
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name || m.email}
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Internal notes" htmlFor="c-notes" className="sm:col-span-2">
            <Textarea id="c-notes" rows={3} value={f.notes ?? ""} onChange={set("notes")} />
          </Field>
        </div>
        {err && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
            {err}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {contactId ? "Save changes" : "Create contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
