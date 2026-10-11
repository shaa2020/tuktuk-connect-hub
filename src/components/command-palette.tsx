import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Home } from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

type Item = { to: string; label: string; icon: typeof Home; group: string };

export function CommandPalette({ open, onOpenChange, items, groups }: {
  open: boolean; onOpenChange: (v: boolean) => void; items: Item[]; groups: string[];
}) {
  const navigate = useNavigate();
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
      <CommandInput placeholder="Jump to a page…" />
      <CommandList>
        <CommandEmpty>No matching page.</CommandEmpty>
        {groups.map((g) => {
          const gi = items.filter((i) => i.group === g);
          if (!gi.length) return null;
          return (
            <CommandGroup key={g} heading={g}>
              {gi.map((i) => (
                <CommandItem key={i.to} value={i.label} onSelect={() => { onOpenChange(false); navigate({ to: i.to }); }}>
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
