import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home, Inbox, Users, Target, CalendarCheck, CheckSquare, Workflow, Sparkles, BarChart3,
  UsersRound, Truck, Plug, BookOpen, Bell, Settings, ScrollText, MoreHorizontal, LogOut, PanelLeftClose, PanelLeft,
  CalendarClock, ShieldCheck, Search,
} from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { canViewAudit, ROLE_LABEL, initials } from "@/lib/domain";
import { BrandLockup, BrandMark } from "@/components/brand";
import { subscribePush } from "@/lib/push";
import { OfflineBanner } from "@/components/states";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type NavGroup = "Daily work" | "Customers" | "Growth" | "Admin";
type NavItem = { to: string; label: string; short?: string; icon: typeof Home; group: NavGroup; badge?: "inbox" | "notif"; audit?: boolean; platform?: boolean };

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home, group: "Daily work" },
  { to: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox", group: "Daily work" },
  { to: "/dispatch", label: "Tour Calendar", short: "Tours", icon: Truck, group: "Daily work" },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck, group: "Daily work" },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, group: "Daily work" },
  { to: "/contacts", label: "Contacts", icon: Users, group: "Customers" },
  { to: "/leads", label: "Leads", icon: Target, group: "Customers" },
  { to: "/notifications", label: "Notifications", icon: Bell, badge: "notif", group: "Customers" },
  { to: "/social", label: "Social Planner", icon: CalendarClock, group: "Growth" },
  { to: "/ai", label: "AI Assistant", icon: Sparkles, group: "Growth" },
  { to: "/automations", label: "Automations", icon: Workflow, group: "Growth" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, group: "Growth" },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen, group: "Growth" },
  { to: "/team", label: "Team", icon: UsersRound, group: "Admin" },
  { to: "/integrations", label: "Integrations", icon: Plug, group: "Admin" },
  { to: "/settings", label: "Settings", icon: Settings, group: "Admin" },
  { to: "/audit", label: "Audit Log", icon: ScrollText, audit: true, group: "Admin" },
  { to: "/platform", label: "Platform", icon: ShieldCheck, platform: true, group: "Admin" },
];
const GROUPS: NavGroup[] = ["Daily work", "Customers", "Growth", "Admin"];
const MOBILE_MAIN = ["/dashboard", "/inbox", "/dispatch", "/bookings"];

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
  const [searchOpen, setSearchOpen] = useState(false);
  const platformAdmin = useQuery({
    queryKey: ["is_platform_admin", ws.userId],
    queryFn: async () => (await supabase.rpc("is_platform_admin")).data === true,
    staleTime: 300_000,
  });
  const items = NAV.filter((n) => (!n.audit || canViewAudit(ws.role)) && (!n.platform || platformAdmin.data));
  const isActive = (to: string) => loc.pathname === to || loc.pathname.startsWith(to + "/");
  const countFor = (b?: NavItem["badge"]) => (b === "inbox" ? counts.inbox : b === "notif" ? counts.notif : 0);

  useEffect(() => setMoreOpen(false), [loc.pathname]);

  // Register this device for push notifications (browser de-duplicates).
  useEffect(() => {
    if (!ws.userId) return;
    const t = setTimeout(() => { void subscribePush(); }, 3000);
    return () => clearTimeout(t);
  }, [ws.userId]);

  const inThread = loc.pathname === "/inbox" && !!(loc.search as { c?: string }).c;
  const pageTitle = NAV.find((n) => isActive(n.to))?.label ?? "TeamInbox";

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] md:flex", collapsed ? "w-[68px]" : "w-60")}>
        <div className="flex h-16 items-center justify-between px-3.5">
          {collapsed ? <BrandMark /> : <BrandLockup light />}
        </div>
        <nav className="scrollbar-none flex-1 overflow-y-auto px-2.5 py-2" aria-label="Main">
          {GROUPS.map((g) => {
            const groupItems = items.filter((n) => n.group === g);
            if (!groupItems.length) return null;
            return (
              <div key={g} className="mb-3 space-y-0.5">
                {collapsed ? <div className="mx-2 mb-2 h-px bg-sidebar-border" /> : (
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">{g}</div>
                )}
                {groupItems.map((n) => {
                  const active = isActive(n.to);
                  const c = countFor(n.badge);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      title={collapsed ? n.label : undefined}
                      className={cn(
                        "relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                        active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-elev before:absolute before:-left-2.5 before:h-5 before:w-1 before:rounded-r-full before:bg-sidebar-primary" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <n.icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{n.label}</span>}
                      {!collapsed ? <CountBadge n={c} /> : c > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />}
                    </Link>
                  );
                })}
              </div>
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
        {/* Desktop top bar */}
        <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-border-subtle bg-card/85 px-6 backdrop-blur-md md:flex">
          <h2 className="min-w-0 truncate font-display text-[15px] font-bold tracking-tight">{pageTitle}</h2>
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-auto flex h-9 w-72 items-center gap-2 rounded-lg border bg-surface-2 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Jump to…</span>
            <kbd className="rounded border bg-card px-1.5 text-[10px] font-semibold">Ctrl K</kbd>
          </button>
          <Link to="/notifications" className="relative flex size-9 items-center justify-center rounded-lg hover:bg-accent" aria-label="Notifications">
            <Bell className="size-[18px]" />
            {counts.notif > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-card" />}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">{initials(ws.fullName)}</span>
              <span className="max-w-32 truncate text-sm font-medium">{ws.fullName}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="truncate text-sm font-semibold">{ws.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{ROLE_LABEL[ws.role]} · {ws.workspaceName}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/settings"><Settings className="mr-2 size-4" />Settings</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/team"><UsersRound className="mr-2 size-4" />Team</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className="text-destructive"><LogOut className="mr-2 size-4" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-card/90 px-4 backdrop-blur-md md:hidden">
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-bold tracking-tight">{pageTitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => setSearchOpen(true)} className="pressable flex size-11 items-center justify-center rounded-full hover:bg-accent" aria-label="Search pages">
              <Search className="size-5" />
            </button>
            <Link to="/notifications" className="pressable relative flex size-11 items-center justify-center rounded-full hover:bg-accent" aria-label="Notifications">
              <Bell className="size-5" />
              {counts.notif > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-destructive ring-2 ring-card" />}
            </Link>
            <button onClick={() => setMoreOpen(true)} className="pressable flex size-11 items-center justify-center" aria-label="Account and menu">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">{initials(ws.fullName)}</span>
            </button>
          </div>
        </header>
        <main className={cn("min-w-0 flex-1 overflow-x-hidden md:pb-0", inThread ? "pb-0" : "pb-24")}>{children}</main>
        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} items={items} groups={GROUPS} />
      </div>

      {/* Mobile bottom nav */}
      <nav className={cn("pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-pop backdrop-blur-md md:hidden", inThread && "hidden")} aria-label="Main">
        <div className="grid grid-cols-5 px-1">
          {MOBILE_MAIN.map((to) => {
            const n = NAV.find((x) => x.to === to)!;
            const active = isActive(to);
            const c = countFor(n.badge);
            return (
              <Link key={to} to={to} className={cn("pressable relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <n.icon className="size-5" />
                </span>
                {n.short ?? n.label}
                {c > 0 && <span className="absolute left-1/2 top-1.5 ml-2 min-w-4 rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground ring-2 ring-card">{c > 99 ? "99+" : c}</span>}
              </Link>
            );
          })}
          <button onClick={() => setMoreOpen(true)} className={cn("pressable flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", !MOBILE_MAIN.some(isActive) ? "text-primary" : "text-muted-foreground")}>
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", !MOBILE_MAIN.some(isActive) && "bg-primary-soft")}><MoreHorizontal className="size-5" /></span>
            More
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-4 pb-8">
          <SheetHeader className="px-0 text-left">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initials(ws.fullName)}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{ws.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{ROLE_LABEL[ws.role]} · {ws.workspaceName}</div>
              </div>
            </div>
          </SheetHeader>
          {GROUPS.map((g) => {
            const groupItems = items.filter((n) => n.group === g && !MOBILE_MAIN.includes(n.to));
            if (!groupItems.length) return null;
            return (
              <div key={g} className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {groupItems.map((n) => (
                    <Link key={n.to} to={n.to} className={cn("pressable relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-[11px] font-medium leading-tight", isActive(n.to) ? "border-primary bg-primary-soft text-primary" : "bg-card")}>
                      <n.icon className="size-5" />
                      {n.label}
                      {countFor(n.badge) > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          <button onClick={signOut} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium text-destructive">
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
