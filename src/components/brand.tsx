import { cn } from "@/lib/utils";
import markAsset from "@/assets/teaminbox-mark.png.asset.json";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={markAsset.url}
      alt="TeamInbox"
      width={36}
      height={36}
      className={cn("h-9 w-9 shrink-0 rounded-md object-contain", className)}
    />
  );
}

export function BrandLockup({ light }: { light?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <img
        src={markAsset.url}
        alt="TeamInbox — Connect · Collaborate · Respond"
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-md object-contain"
      />
      <span
        className={cn(
          "font-display text-[1.35rem] font-extrabold leading-none tracking-tight",
          light ? "text-white" : "text-foreground"
        )}
      >
        Team<span className="text-primary">Inbox</span>
      </span>
    </span>
  );
}
