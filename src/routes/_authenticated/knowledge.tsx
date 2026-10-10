import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Knowledge Base — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Knowledge Base" }] }),
  component: () => (
    <ComingSoon title="Knowledge Base" icon={<BookOpen />} description="A library of tour descriptions, prices, FAQs and policies the AI assistant uses to suggest accurate replies." needs={['Your tour list, prices, meeting points and cancellation policy']} />
  ),
});
