import type { ReactNode } from "react";
import { PageContainer } from "@/components/app-shell";
import { PageHeader, Panel } from "@/components/states";

export function ComingSoon({ title, icon, description, needs }: { title: string; icon: ReactNode; description: string; needs: string[] }) {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={title} />
      <Panel className="p-6">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary [&_svg]:size-6">{icon}</div>
        <h2 className="text-base font-semibold">Coming in Phase 2</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <h3 className="mt-5 text-sm font-semibold">What's needed to switch it on</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{needs.map((n) => <li key={n}>{n}</li>)}</ul>
      </Panel>
    </PageContainer>
  );
}
