import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI Assistant — Tuk Tuk 24 Lisbon" }, { name: "description", content: "AI Assistant" }] }),
  component: () => (
    <ComingSoon title="AI Assistant" icon={<Sparkles />} description="Draft replies, translate messages and summarise conversations — always as suggestions you review before sending." needs={['Your business instructions and tone of voice', 'Knowledge Base content (tours, prices, meeting points) so answers are accurate']} />
  ),
});
