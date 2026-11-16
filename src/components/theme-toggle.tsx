import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, getThemePref, setThemePref, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Light / Dark / Auto (follows the device). Saved on this device only. */
export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    setPref(getThemePref());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getThemePref() === "system") applyTheme("system");
    };
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex w-full rounded-lg bg-surface-2 p-0.5", className)}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setThemePref(o.value);
            setPref(o.value);
          }}
          className={cn(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
            pref === o.value
              ? "bg-card text-foreground shadow-card"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-3.5" aria-hidden /> {o.label}
        </button>
      ))}
    </div>
  );
}
