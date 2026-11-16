-- Run after upgrading. Every statement must succeed (ON_ERROR_STOP) and assertions raise on failure.
do $$ declare ws uuid; cv uuid; b uuid; n int; begin
  select id into ws from public.workspaces limit 1;
  if not (select platform_connectors from public.workspaces where id = ws) then raise exception 'operator workspace lost platform connectors'; end if;
  if (select plan from public.workspaces where id = ws) <> 'professional' then raise exception 'legacy plan not mapped'; end if;
  if (select owner_id from public.workspaces where id = ws) is null then raise exception 'owner not backfilled'; end if;
  if (select onboarding_completed_at from public.workspaces where id = ws) is null then raise exception 'operator onboarding not marked complete'; end if;
  select id into cv from public.conversations where workspace_id = ws limit 1;
  -- everyday server operations still work on old rows
  insert into public.messages(workspace_id, conversation_id, direction, body, status, external_id) values (ws, cv, 'outbound', 'Reply', 'sent', 'wamid.' || gen_random_uuid());
  insert into public.messages(workspace_id, conversation_id, direction, body, status, external_id) values (ws, cv, 'inbound', 'Thanks', 'delivered', 'wamid.' || gen_random_uuid());
  update public.conversations set status = 'resolved' where id = cv;
  select id into b from public.bookings where workspace_id = ws limit 1;
  update public.bookings set notes = 'edited', status = 'completed' where id = b;
  update public.social_posts set title = 'Old post edited' where workspace_id = ws;
  delete from public.bookings where id = b;
  if not exists (select 1 from public.website_booking_ignores where workspace_id = ws and external_reference = 'ABC12345') then raise exception 'website tombstone missing'; end if;
  insert into public.leads(workspace_id, title) values (ws, 'New lead after upgrade');
  insert into public.invitations(workspace_id, email, invited_by) values (ws, 'new@tuktuk.test', (select owner_id from public.workspaces where id = ws));
  perform public.trigger_background_sync_fanout();
  perform public.kick_ai_operator(ws);
  select count(*) into n from net.calls where url like '%/api/public/hooks/background-sync';
  if n < 2 then raise exception 'background job calls not made (got %)', n; end if;
  if (select count(*) from cron.job where jobname = 'tt24-background-sync') <> 1 then raise exception 'cron job duplicated or missing'; end if;
  raise notice 'UPGRADE CHECKS PASSED';
end $$;
