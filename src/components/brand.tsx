import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-sm font-extrabold text-primary-foreground", className)}>
      24
    </div>
  );
}

export function BrandLockup({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <div className={cn("font-display text-sm font-bold", light ? "text-navy-foreground" : "text-foreground")}>Tuk Tuk 24</div>
        <div className={cn("text-[11px] font-medium", light ? "text-sidebar-foreground" : "text-muted-foreground")}>Lisbon</div>
      </div>
    </div>
  );
}
