import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TeamInbox — Staff Only" },
      { name: "description", content: "Private internal workspace. Authorised staff only." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "TeamInbox — Staff Only" },
      { property: "og:description", content: "Private internal workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);
  return <div className="min-h-screen" />;
}
