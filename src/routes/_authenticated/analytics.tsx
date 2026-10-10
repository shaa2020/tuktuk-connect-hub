import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics & Reports — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Analytics & Reports" }] }),
  component: () => (
    <ComingSoon title="Analytics & Reports" icon={<BarChart3 />} description="Response-time trends, channel performance and lead conversion reports with export. The Home dashboard already shows live figures from your data." needs={['A few weeks of real conversation history for meaningful trends']} />
  ),
});
