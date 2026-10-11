import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home, Inbox, Users, Target, CalendarCheck, CheckSquare, Workflow, Sparkles, BarChart3,
  UsersRound, Truck, Plug, BookOpen, Bell, Settings, ScrollText, MoreHorizontal, LogOut, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { canViewAudit, ROLE_LABEL, initials } from "@/lib/domain";
import { BrandLockup, BrandMark } from "@/components/brand";
import { OfflineBanner } from "@/components/states";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type NavItem = { to: string; label: string; icon: typeof Home; badge?: "inbox" | "notif"; audit?: boolean };

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/leads", label: "Leads", icon: Target },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/dispatch", label: "Tour Calendar", icon: Truck },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/automations", label: "Automations", icon: Workflow },
  { to: "/ai", label: "AI Assistant", icon: Sparkles },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/team", label: "Team", icon: UsersRound },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/notifications", label: "Notifications", icon: Bell, badge: "notif" },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/audit", label: "Audit Log", icon: ScrollText, audit: true },
];
const MOBILE_MAIN = ["/dashboard", "/inbox", "/contacts", "/leads"];

function useCounts() {
  const { workspaceId, userId } = useWorkspace();
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ["count", "unread", workspaceId],
    queryFn: async () => {
      const { count } = await supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).eq("unread", true).not("status", "in", "(resolved,archived)");
      return count ?? 0;
    },
  });
  const notif = useQuery({
    queryKey: ["count", "notif", userId],
    queryFn: async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("read_at", null);
      return count ?? 0;
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel(`ws-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation"] });
        qc.invalidateQueries({ queryKey: ["count"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["count"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, userId, qc]);
  return { inbox: inbox.data ?? 0, notif: notif.data ?? 0 };
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[10px] font-bold leading-5 text-primary-foreground", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const counts = useCounts();
  const loc = useLocation();
  const signOut = useSignOut();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV.filter((n) => !n.audit || canViewAudit(ws.role));
  const isActive = (to: string) => loc.pathname === to || loc.pathname.startsWith(to + "/");
  const countFor = (b?: NavItem["badge"]) => (b === "inbox" ? counts.inbox : b === "notif" ? counts.notif : 0);

  useEffect(() => setMoreOpen(false), [loc.pathname]);

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] md:flex", collapsed ? "w-[68px]" : "w-60")}>
        <div className="flex h-16 items-center justify-between px-3.5">
          {collapsed ? <BrandMark /> : <BrandLockup light />}
        </div>
        <nav className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2" aria-label="Main">
          {items.map((n) => {
            const active = isActive(n.to);
            const c = countFor(n.badge);
            return (
              <Link
                key={n.to}
                to={n.to}
                title={collapsed ? n.label : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{n.label}</span>}
                {!collapsed ? <CountBadge n={c} /> : c > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-2.5">
          <div className={cn("flex items-center gap-2.5 rounded-lg p-1.5", collapsed && "justify-center")}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold text-sidebar-accent-foreground">{initials(ws.fullName)}</div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-sidebar-accent-foreground">{ws.fullName}</div>
                <div className="truncate text-[11px]">{ROLE_LABEL[ws.role]}</div>
              </div>
            )}
          </div>
          <div className={cn("mt-1 flex gap-1", collapsed && "flex-col")}>
            <button onClick={() => setCollapsed((v) => !v)} className="flex h-8 flex-1 items-center justify-center rounded-lg hover:bg-sidebar-accent" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
            <button onClick={signOut} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs hover:bg-sidebar-accent" aria-label="Sign out">
              <LogOut className="size-4" />{!collapsed && "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:hidden">
          <BrandLockup />
          <Link to="/notifications" className="relative flex size-10 items-center justify-center rounded-lg hover:bg-accent" aria-label="Notifications">
            <Bell className="size-5" />
            {counts.notif > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive" />}
          </Link>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden" aria-label="Main">
        <div className="grid grid-cols-5">
          {MOBILE_MAIN.map((to) => {
            const n = NAV.find((x) => x.to === to)!;
            const active = isActive(to);
            const c = countFor(n.badge);
            return (
              <Link key={to} to={to} className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <n.icon className="size-5" />
                {n.label}
                {c > 0 && <span className="absolute left-1/2 top-2 ml-2 min-w-4 rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">{c > 99 ? "99+" : c}</span>}
              </Link>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", !MOBILE_MAIN.some(isActive) ? "text-primary" : "text-muted-foreground")}>
            <MoreHorizontal className="size-5" /> More
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-8">
          <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {items.filter((n) => !MOBILE_MAIN.includes(n.to)).map((n) => (
              <Link key={n.to} to={n.to} className={cn("relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium", isActive(n.to) ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
                <n.icon className="size-5" />
                {n.label}
                {countFor(n.badge) > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}
              </Link>
            ))}
          </div>
          <button onClick={signOut} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium text-destructive">
            <LogOut className="size-4" /> Sign out
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-5 md:px-8 md:py-8", className)}>{children}</div>;
}
