import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Tuk Tuk 24 Lisbon"
      width={36}
      height={36}
      className={cn("h-9 w-9 shrink-0 rounded-xl object-cover shadow-sm", className)}
    />
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
