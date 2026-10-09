import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Inbox, Users, CalendarCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tuk Tuk 24 Lisbon — Team Workspace" },
      { name: "description", content: "One workspace for Tuk Tuk 24 Lisbon guest conversations, leads, bookings and tasks." },
      { property: "og:title", content: "Tuk Tuk 24 Lisbon — Team Workspace" },
      { property: "og:description", content: "Guest conversations, leads, bookings and tasks in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <BrandLockup light />
        <Button asChild variant="secondary" size="sm"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-12 md:px-10">
        <h1 className="font-display text-4xl font-extrabold leading-tight text-navy-foreground md:text-5xl">
          Every guest conversation,<br />one calm workspace.
        </h1>
        <p className="mt-4 max-w-xl text-base text-sidebar-foreground">
          The private team workspace for Tuk Tuk 24 Lisbon: conversations, leads, bookings and follow-ups, on your phone or at your desk.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg"><Link to="/auth">Sign in to your workspace</Link></Button>
        </div>
        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Inbox, t: "Unified inbox", d: "Assign, prioritise and track every enquiry." },
            { icon: Users, t: "Leads & contacts", d: "A lightweight CRM built for tours." },
            { icon: CalendarCheck, t: "Bookings & tasks", d: "Know what's next, never miss a follow-up." },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="rounded-xl border border-sidebar-border bg-sidebar-accent p-4">
              <I className="size-5 text-primary" />
              <div className="mt-2 text-sm font-semibold text-navy-foreground">{t}</div>
              <div className="mt-1 text-xs text-sidebar-foreground">{d}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
