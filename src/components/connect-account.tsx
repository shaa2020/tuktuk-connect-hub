import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Facebook, Globe, Instagram, Linkedin, Mail, MessageCircle, Music2, Plus, Send, ExternalLink } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { websiteStatus } from "@/lib/website.functions";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/kit";
import { cn } from "@/lib/utils";
import { providerState, type ProviderKey } from "@/lib/connect-providers";

type Provider = {
  key: ProviderKey;
  name: string;
  blurb: string;
  icon: React.ReactNode;
  group: "Messaging & social" | "Email" | "Coming soon";
  /** Official page that opens the provider's own app on phones when installed, else its web sign-in. */
  appLink?: { label: string; href: string };
};

const PROVIDERS: Provider[] = [
  { key: "whatsapp", name: "WhatsApp Business", blurb: "Reply to guests on your business numbers.", icon: <MessageCircle className="size-5" />, group: "Messaging & social",
    appLink: { label: "Open WhatsApp Manager", href: "https://business.facebook.com/wa/manage/phone-numbers/" } },
  { key: "instagram", name: "Instagram", blurb: "Direct messages from your Instagram business accounts.", icon: <Instagram className="size-5" />, group: "Messaging & social",
    appLink: { label: "Open Meta Business Suite", href: "https://business.facebook.com/latest/settings/instagram_account_v2" } },
  { key: "messenger", name: "Facebook Messenger", blurb: "Messages sent to your Facebook Pages.", icon: <Facebook className="size-5" />, group: "Messaging & social",
    appLink: { label: "Open Meta Business Suite", href: "https://business.facebook.com/latest/settings/pages" } },
  { key: "email", name: "Gmail", blurb: "Add as many Gmail inboxes as you need.", icon: <Mail className="size-5" />, group: "Email",
    appLink: { label: "Open Google account", href: "https://myaccount.google.com/apppasswords" } },
  { key: "outlook", name: "Outlook / Microsoft 365", blurb: "Not available yet.", icon: <Mail className="size-5" />, group: "Coming soon" },
  { key: "telegram", name: "Telegram", blurb: "Not available yet.", icon: <Send className="size-5" />, group: "Coming soon" },
  { key: "tiktok", name: "TikTok", blurb: "Needs TikTok partner approval.", icon: <Music2 className="size-5" />, group: "Coming soon" },
  { key: "linkedin", name: "LinkedIn", blurb: "Needs LinkedIn partner approval.", icon: <Linkedin className="size-5" />, group: "Coming soon" },
];

/** Website card: status comes from a live check of the website API, never assumed. */
function WebsiteCard({ open, isAdmin, go }: { open: boolean; isAdmin: boolean; go: () => void }) {
  const { workspaceId } = useWorkspace();
  const status = useServerFn(websiteStatus);
  const q = useQuery({ enabled: open, queryKey: ["website-status", workspaceId], queryFn: () => status({ data: { workspaceId } }) });
  const ok = q.data?.ok === true;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website</div>
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Globe className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">tuktuk24lisbon.com</div>
            <div className="text-xs text-muted-foreground">{q.data?.ok ? `${q.data.tourCount} live tours · bookings import automatically` : "Tours, prices and bookings from your website."}</div>
          </div>
          <ToneBadge tone={ok ? "success" : q.isLoading ? "muted" : "danger"}>{q.isLoading ? "…" : ok ? "Connected" : "Check"}</ToneBadge>
        </div>
        {isAdmin && <Button size="sm" className="mt-3 min-h-10 w-full" onClick={go}>{ok ? "Sync now" : "Open"}</Button>}
      </div>
    </div>
  );
}

export function ConnectAccountButton({ className, label = "Connect account", size = "sm" }: { className?: string; label?: string; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} className={className} onClick={() => setOpen(true)} aria-label="Connect account"><Plus /><span className={size === "sm" ? "hidden sm:inline" : undefined}>{label}</span></Button>
      <ConnectAccountSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ConnectAccountSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { workspaceId, role } = useWorkspace();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const q = useQuery({
    enabled: open,
    queryKey: ["connect-sheet", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("channel_connections").select("id, channel, status").eq("workspace_id", workspaceId);
      if (error) throw error;
      return data;
    },
  });
  const groups = ["Messaging & social", "Email", "Coming soon"] as const;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "max-h-[90dvh] rounded-t-2xl" : "w-full sm:max-w-md")}>
        <SheetHeader className="text-left">
          <SheetTitle>Connect an account</SheetTitle>
          <SheetDescription>Pick where your guests message you. You can connect several accounts of each.</SheetDescription>
        </SheetHeader>
        {!isAdmin && <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Only a Business Admin can connect accounts. Ask your admin to add one.</p>}
        <div className="mt-4 space-y-5 pb-4">
          <WebsiteCard open={open} isAdmin={isAdmin} go={() => { onOpenChange(false); navigate({ to: "/integrations", search: { connect: "website" } }); }} />
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</div>
              <div className="space-y-2">
                {PROVIDERS.filter((p) => p.group === g).map((p) => {
                  const st = providerState(p.key, q.data ?? []);
                  const soon = st.kind === "soon";
                  return (
                    <div key={p.key} className={cn("rounded-xl border bg-card p-3", soon && "opacity-60")}>
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">{p.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.blurb}</div>
                        </div>
                        <ToneBadge tone={st.kind === "connected" ? "success" : st.kind === "attention" ? "danger" : "muted"}>{st.badge}</ToneBadge>
                      </div>
                      {!soon && isAdmin && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" className="min-h-10 flex-1" onClick={() => { onOpenChange(false); navigate({ to: "/integrations", search: { connect: p.key as "whatsapp" } }); }}>
                            {st.action}
                          </Button>
                          {p.appLink && (
                            <Button size="sm" variant="outline" className="min-h-10" asChild>
                              <a href={p.appLink.href} target="_blank" rel="noopener noreferrer"><ExternalLink />{p.appLink.label}</a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">The “Open” buttons launch the official app on your phone if it's installed, otherwise its sign-in page. We never ask for your social media passwords.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
