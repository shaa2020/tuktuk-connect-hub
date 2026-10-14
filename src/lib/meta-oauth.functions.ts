import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, workspaceId: string) {
  const { data, error } = await supabase.rpc("has_ws_role", { _ws: workspaceId, _roles: ["admin"] });
  if (error || data !== true) throw new Error("Only a Business Admin can do this.");
}
const origin = () => new URL(getRequest().url).origin;
const ws = z.string().uuid();
const ch = z.enum(["messenger", "instagram"]);
const nonce = z.string().uuid();

export const metaAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: ws }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { appCreds, callbackPath } = await import("./meta-oauth.server");
    return { ready: !!(await appCreds(data.workspaceId)), redirectUri: `${origin()}${callbackPath}` };
  });

export const saveMetaApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, appId: z.string().trim().regex(/^\d{5,25}$/, "App ID is a number"), appSecret: z.string().trim().regex(/^[0-9a-f]{20,64}$/i, "App Secret looks wrong") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { saveAppAndSubscribe } = await import("./meta-oauth.server");
    try { return { ok: true as const, ...(await saveAppAndSubscribe(data.workspaceId, data.appId, data.appSecret, origin(), context.userId)) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

export const startMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, channel: ch }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { appCreds, makeState, callbackPath, META_SCOPES } = await import("./meta-oauth.server");
    const creds = await appCreds(data.workspaceId);
    if (!creds) return { ok: false as const, error: "Finish the one-time Meta setup first." };
    const redirect = `${origin()}${callbackPath}`;
    const state = await makeState({ ws: data.workspaceId, uid: context.userId, ch: data.channel, redirect });
    const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${creds.id}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&response_type=code&scope=${META_SCOPES}`;
    return { ok: true as const, url };
  });

export const listMetaChoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, nonce }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { listChoices } = await import("./meta-oauth.server");
    try { return { ok: true as const, choices: await listChoices(data.workspaceId, data.nonce, context.userId) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

export const connectMetaChoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, nonce, channel: ch, pageId: z.string().regex(/^\d{3,30}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { connectChoice } = await import("./meta-oauth.server");
    try { return { ok: true as const, name: await connectChoice(data.workspaceId, data.nonce, context.userId, data.channel, data.pageId) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

export const finishMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: ws, nonce }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { dropPending } = await import("./meta-oauth.server");
    await dropPending(data.workspaceId, data.nonce);
    return { ok: true as const };
  });
