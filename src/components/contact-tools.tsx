import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseCsv, toImportRows, type ImportRow } from "@/lib/csv";

/** CSV import (admins/managers). The database skips duplicates by email/phone and audits the import. */
export function ImportContacts({ workspaceId }: { workspaceId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<{ rows: ImportRow[]; columns: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("File is larger than 5 MB.");
    const { rows, mapping } = toImportRows(parseCsv(await f.text()));
    if (!rows.length)
      return toast.error(
        "No contacts found. The first row must contain column names like Name, Email, Phone.",
      );
    setPreview({ rows, columns: Object.keys(mapping) });
  }
  async function run() {
    if (!preview) return;
    setBusy(true);
    const total = { inserted: 0, skipped_duplicates: 0, invalid: 0 };
    try {
      for (let i = 0; i < preview.rows.length; i += 2000) {
        const { data, error } = await supabase.rpc("import_contacts", {
          _ws: workspaceId,
          _rows: preview.rows.slice(i, i + 2000) as never,
        });
        if (error) throw error;
        const d = data as typeof total;
        total.inserted += d.inserted;
        total.skipped_duplicates += d.skipped_duplicates;
        total.invalid += d.invalid;
      }
      toast.success(
        `Imported ${total.inserted}. Skipped ${total.skipped_duplicates} duplicates${total.invalid ? ` and ${total.invalid} invalid rows` : ""}.`,
      );
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
        aria-label="CSV file"
      />
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        <Upload /> Import
      </Button>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import {preview?.rows.length} contacts?</DialogTitle>
            <DialogDescription>
              Recognised columns: {preview?.columns.join(", ") || "none"}. Contacts that already
              exist (same email or phone) are skipped.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 overflow-y-auto rounded border text-xs">
            {preview?.rows.slice(0, 8).map((r, i) => (
              <li key={i} className="border-b px-2 py-1 last:border-0">
                {r.full_name} {r.email ? `· ${r.email}` : ""} {r.phone ? `· ${r.phone}` : ""}
              </li>
            ))}
          </ul>
          <Button disabled={busy} onClick={run}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Likely duplicates with one-tap merge (merge_contacts keeps the older record). */
export function DuplicateFinder({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["duplicates", workspaceId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_duplicate_contacts", { _ws: workspaceId });
      if (error) throw error;
      return data ?? [];
    },
  });
  async function merge(keep: string, dup: string) {
    const { error } = await supabase.rpc("merge_contacts", { _keep: keep, _merge: dup });
    if (error) return toast.error(error.message);
    toast.success("Merged");
    q.refetch();
    qc.invalidateQueries({ queryKey: ["contacts"] });
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy /> Duplicates
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Possible duplicates</DialogTitle>
            <DialogDescription>
              Merging moves conversations, bookings, leads and tasks to the older contact. It can't
              be undone.
            </DialogDescription>
          </DialogHeader>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : q.error ? (
            <p className="text-sm text-destructive">{(q.error as Error).message}</p>
          ) : !q.data?.length ? (
            <p className="text-sm text-muted-foreground">No likely duplicates found.</p>
          ) : (
            <ul className="divide-y text-sm">
              {q.data.map((d) => (
                <li key={d.dup_id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{d.dup_name}</b> → {d.keep_name}{" "}
                    <span className="text-xs text-muted-foreground">({d.reason})</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => merge(d.keep_id, d.dup_id)}>
                    Merge
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
