import { createFileRoute } from "@tanstack/react-router";

// Meta sends the owner back here after "Allow". The encrypted, expiring state proves who started it.
export const Route = createFileRoute("/api/public/oauth/meta/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (q: Record<string, string>) => Response.redirect(`${url.origin}/integrations?${new URLSearchParams(q)}`, 302);
        const rawState = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!rawState) return back({ meta_error: "Missing connection details." });
        try {
          const { readState, finishLogin } = await import("@/lib/meta-oauth.server");
          const state = await readState(rawState);
          if (!code) return back({ meta_error: url.searchParams.get("error_description") || "Permission was not granted." });
          const nonce = await finishLogin(state, code);
          return back({ meta_pick: nonce, meta_channel: state.ch });
        } catch (e) {
          return back({ meta_error: (e as Error).message.slice(0, 200) });
        }
      },
    },
  },
});
