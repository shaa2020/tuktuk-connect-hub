// Pure: decides which onboarding steps are done from real workspace data (tested).
export type SetupFacts = {
  connectedChannels: number;
  teamSize: number;
  pendingInvites: number;
  aiEnabled: boolean;
  knowledgeDocs: number;
};
export type SetupStep = { key: string; label: string; hint: string; to: string; done: boolean };

export function setupSteps(f: SetupFacts): SetupStep[] {
  return [
    {
      key: "channel",
      label: "Connect your first channel",
      hint: "WhatsApp, Instagram, Messenger or email",
      to: "/integrations",
      done: f.connectedChannels > 0,
    },
    {
      key: "team",
      label: "Invite your team",
      hint: "Add the people who answer customers",
      to: "/team",
      done: f.teamSize > 1 || f.pendingInvites > 0,
    },
    {
      key: "knowledge",
      label: "Add your business information",
      hint: "Prices, opening hours, policies — the AI uses this",
      to: "/knowledge",
      done: f.knowledgeDocs > 0,
    },
    {
      key: "ai",
      label: "Set up the AI assistant",
      hint: "Tone, instructions and languages",
      to: "/ai",
      done: f.aiEnabled,
    },
    {
      key: "plan",
      label: "Review your plan",
      hint: "See what's included and your usage",
      to: "/billing",
      done: false,
    },
  ];
}

/** Required steps (the plan review is informational). */
export function setupProgress(steps: SetupStep[]): { done: number; total: number } {
  const req = steps.filter((s) => s.key !== "plan");
  return { done: req.filter((s) => s.done).length, total: req.length };
}
