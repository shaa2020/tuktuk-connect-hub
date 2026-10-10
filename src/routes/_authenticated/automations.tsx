import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automations — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Automations" }] }),
  component: () => (
    <ComingSoon title="Automations" icon={<Workflow />} description="Rules like auto-assigning WhatsApp chats or reminding the team when a lead goes quiet." needs={['At least one connected channel so automations have real messages to act on', 'A background job runner for scheduled checks']} />
  ),
});
