import { cn } from "@/lib/utils";
import markAsset from "@/assets/teaminbox-mark.png.asset.json";
import lockupAsset from "@/assets/teaminbox-lockup.png.asset.json";

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

export function BrandLockup({ light: _light }: { light?: boolean }) {
  return (
    <img
      src={lockupAsset.url}
      alt="TeamInbox — Connect · Collaborate · Respond"
      width={910}
      height={340}
      className="h-14 w-[150px] max-w-full shrink-0 rounded-md object-contain"
    />
  );
}
