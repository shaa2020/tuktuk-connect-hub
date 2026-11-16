import { Check, Plus } from "lucide-react";
import { switchWorkspace, useWorkspace } from "@/hooks/use-workspace";
import { ROLE_LABEL } from "@/lib/domain";
import { cn } from "@/lib/utils";

/** Lists every business the person belongs to. Switching reloads the app for a clean slate. */
export function WorkspaceList({
  onPicked,
  className,
}: {
  onPicked?: () => void;
  className?: string;
}) {
  const ws = useWorkspace();
  return (
    <div className={cn("space-y-1", className)} role="group" aria-label="Your businesses">
      {ws.workspaces.map((w) => {
        const current = w.id === ws.workspaceId;
        return (
          <button
            key={w.id}
            type="button"
            disabled={current}
            onClick={() => {
              onPicked?.();
              switchWorkspace(w.id);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent",
              current && "font-semibold",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{w.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {ROLE_LABEL[w.role]}
                {w.suspended ? " · suspended" : ""}
              </span>
            </span>
            {current && <Check className="size-4 shrink-0 text-primary" aria-label="Current" />}
          </button>
        );
      })}
      <a
        href="/onboarding"
        onClick={onPicked}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-accent"
      >
        <Plus className="size-4" /> Create a new business
      </a>
    </div>
  );
}
