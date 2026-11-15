import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listWaTemplates,
  sendWaTemplate,
  submitStarterTemplate,
} from "@/lib/wa-templates.functions";
import { STARTER_TEMPLATES, countVars, fillTemplate } from "@/lib/wa-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, ToneBadge } from "@/components/kit";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};
const STATUS_TEXT: Record<string, string> = {
  APPROVED: "Approved",
  PENDING: "Waiting for WhatsApp",
  REJECTED: "Rejected",
};

function useTemplates(workspaceId: string, enabled = true) {
  const list = useServerFn(listWaTemplates);
  return useQuery({
    queryKey: ["wa-templates", workspaceId],
    enabled,
    staleTime: 60_000,
    queryFn: () => list({ data: { workspaceId } }),
  });
}

/** Composer button + dialog: pick an approved template, fill the blanks, preview, send. */
export function TemplateSender({
  workspaceId,
  conversationId,
  guestName,
  highlight,
}: {
  workspaceId: string;
  conversationId: string;
  guestName?: string | null;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const q = useTemplates(workspaceId, open);
  const send = useServerFn(sendWaTemplate);
  const qc = useQueryClient();
  const approved = (q.data?.templates ?? []).filter((t) => t.status === "APPROVED");
  const [key, setKey] = useState("");
  const [vals, setVals] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const tpl = approved.find((t) => `${t.name}|${t.language}` === key) ?? approved[0];
  const n = tpl ? countVars(tpl.body) : 0;
  const values = Array.from(
    { length: n },
    (_, i) => vals[i] ?? (i === 0 && guestName ? guestName : ""),
  );

  async function go() {
    if (!tpl) return;
    if (values.some((v) => !v.trim())) return toast.error("Please fill in every field.");
    setBusy(true);
    try {
      const r = await send({
        data: {
          conversationId,
          name: tpl.name,
          language: tpl.language,
          params: values.map((v) => v.trim()),
        },
      });
      qc.invalidateQueries({ queryKey: ["timeline", conversationId] });
      if (!r.ok) return toast.error(r.error);
      toast.success("Template sent");
      setOpen(false);
      setVals([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={highlight ? "default" : "outline"}
        onClick={() => setOpen(true)}
        title="Send an approved WhatsApp template"
      >
        <FileText />
        Template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a WhatsApp template</DialogTitle>
            <DialogDescription>
              Approved templates can be sent any time — even after the 24-hour reply window. When
              the guest replies, normal chat opens again.
            </DialogDescription>
          </DialogHeader>
          {q.isLoading ? (
            <Loader2 className="mx-auto animate-spin" />
          ) : !q.data?.ok ? (
            <p className="text-sm text-destructive">
              {q.data?.error ?? "Couldn't load templates."}
            </p>
          ) : approved.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No approved templates yet. A Business Admin can submit ready-made ones under
              Integrations → WhatsApp. WhatsApp usually reviews them within minutes to 48 hours.
            </p>
          ) : (
            <div className="space-y-3">
              <NativeSelect
                aria-label="Template"
                value={tpl ? `${tpl.name}|${tpl.language}` : ""}
                onChange={(e) => {
                  setKey(e.target.value);
                  setVals([]);
                }}
              >
                {approved.map((t) => (
                  <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                    {t.name.replace(/_/g, " ")} ({t.language})
                  </option>
                ))}
              </NativeSelect>
              {values.map((v, i) => (
                <Input
                  key={i}
                  value={v}
                  maxLength={1000}
                  placeholder={`Field ${i + 1}${i === 0 ? " (guest name)" : ""}`}
                  aria-label={`Field ${i + 1}`}
                  onChange={(e) => {
                    const c = [...values];
                    c[i] = e.target.value;
                    setVals(c);
                  }}
                />
              ))}
              {tpl && (
                <div className="rounded-lg bg-success-soft p-3 text-sm whitespace-pre-wrap">
                  {tpl.header && <p className="mb-1 font-semibold">{tpl.header}</p>}
                  {fillTemplate(tpl.body, values)}
                  {tpl.footer && <p className="mt-1 text-xs text-muted-foreground">{tpl.footer}</p>}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={go} disabled={busy || !tpl}>
              {busy && <Loader2 className="animate-spin" />}Send template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Integrations panel: template approval status + one-tap submit of starter templates (admin). */
export function TemplatesPanel({
  workspaceId,
  isAdmin,
}: {
  workspaceId: string;
  isAdmin: boolean;
}) {
  const q = useTemplates(workspaceId);
  const submit = useServerFn(submitStarterTemplate);
  const [busy, setBusy] = useState<string | null>(null);
  const existing = q.data?.templates ?? [];
  async function add(name: string) {
    setBusy(name);
    try {
      const r = await submit({ data: { workspaceId, name } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Sent to WhatsApp for review");
        q.refetch();
      }
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-3 rounded-lg border p-3">
      <p className="text-sm font-semibold">Message templates</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Needed to message a guest more than 24 hours after their last message. WhatsApp must approve
        each one first.
      </p>
      {q.isLoading ? (
        <Loader2 className="animate-spin" />
      ) : !q.data?.ok ? (
        <p className="text-xs text-destructive">{q.data?.error}</p>
      ) : (
        <ul className="space-y-1.5">
          {existing.map((t) => (
            <li
              key={`${t.name}|${t.language}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate">
                {t.name.replace(/_/g, " ")}{" "}
                <span className="text-xs text-muted-foreground">({t.language})</span>
              </span>
              <ToneBadge tone={STATUS_TONE[t.status] ?? "muted"}>
                {STATUS_TEXT[t.status] ?? t.status}
              </ToneBadge>
            </li>
          ))}
          {isAdmin &&
            STARTER_TEMPLATES.filter((s) => !existing.some((t) => t.name === s.name)).map((s) => (
              <li
                key={s.name}
                className="flex items-start justify-between gap-2 border-t pt-1.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="block">{s.name.replace(/_/g, " ")}</span>
                  <span className="block text-xs text-muted-foreground">{s.body}</span>
                </span>
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => add(s.name)}>
                  {busy === s.name && <Loader2 className="animate-spin" />}Submit
                </Button>
              </li>
            ))}
          {existing.length === 0 && !isAdmin && (
            <li className="text-xs text-muted-foreground">
              No templates yet — ask a Business Admin to add them.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
