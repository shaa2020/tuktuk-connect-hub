import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, MessageSquare, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useNavigate } from "@tanstack/react-router";
import type { Home } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Item = { to: string; label: string; icon: typeof Home; group: string };

export function CommandPalette({
  open,
  onOpenChange,
  items,
  groups,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: Item[];
  groups: string[];
}) {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim().replace(/[%,()]/g, "")), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  // Records search (RLS-scoped to what this person may see). Starts at 2 characters.
  const found = useQuery({
    queryKey: ["global-search", ws.workspaceId, term],
    enabled: open && term.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${term}%`;
      const [contacts, bookings, convs] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, full_name, email, phone")
          .eq("workspace_id", ws.workspaceId)
          .is("merged_into", null)
          .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .limit(6),
        supabase
          .from("bookings")
          .select("id, reference, tour_name, tour_date")
          .eq("workspace_id", ws.workspaceId)
          .or(`reference.ilike.${like},tour_name.ilike.${like}`)
          .limit(5),
        supabase
          .from("conversations")
          .select("id, last_message_preview, contacts!inner(full_name)")
          .eq("workspace_id", ws.workspaceId)
          .ilike("contacts.full_name", like)
          .order("last_message_at", { ascending: false })
          .limit(5),
      ]);
      return {
        contacts: contacts.data ?? [],
        bookings: bookings.data ?? [],
        convs: (convs.data ?? []) as any[],
      };
    },
  });
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search customers, bookings, pages…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>
          {term.length >= 2 && found.isFetching ? "Searching…" : "Nothing found."}
        </CommandEmpty>
        {!!found.data?.contacts.length && (
          <CommandGroup heading="Customers">
            {found.data.contacts.map((c) => (
              <CommandItem
                key={c.id}
                value={`contact ${c.id} ${c.full_name} ${c.email ?? ""} ${c.phone ?? ""} ${q}`}
                onSelect={() => go(() => navigate({ to: "/contacts/$id", params: { id: c.id } }))}
              >
                <User className="mr-2 size-4" />
                <span className="truncate">{c.full_name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {c.email || c.phone}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!found.data?.convs.length && (
          <CommandGroup heading="Conversations">
            {found.data.convs.map((c) => (
              <CommandItem
                key={c.id}
                value={`conv ${c.id} ${c.contacts?.full_name} ${q}`}
                onSelect={() => go(() => navigate({ to: "/inbox", search: { c: c.id } as never }))}
              >
                <MessageSquare className="mr-2 size-4" />
                <span className="truncate">{c.contacts?.full_name}</span>
                <span className="ml-auto max-w-[50%] truncate text-xs text-muted-foreground">
                  {c.last_message_preview}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!found.data?.bookings.length && (
          <CommandGroup heading="Bookings">
            {found.data.bookings.map((b) => (
              <CommandItem
                key={b.id}
                value={`booking ${b.id} ${b.reference} ${b.tour_name} ${q}`}
                onSelect={() =>
                  go(() => navigate({ to: "/bookings", search: { b: b.id } as never }))
                }
              >
                <CalendarCheck className="mr-2 size-4" />
                <span className="truncate">
                  {b.reference} · {b.tour_name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{b.tour_date ?? ""}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {groups.map((g) => {
          const gi = items.filter((i) => i.group === g);
          if (!gi.length) return null;
          return (
            <CommandGroup key={g} heading={g}>
              {gi.map((i) => (
                <CommandItem
                  key={i.to}
                  value={i.label}
                  onSelect={() => {
                    onOpenChange(false);
                    navigate({ to: i.to });
                  }}
                >
                  <i.icon className="mr-2 size-4" />
                  {i.label}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
