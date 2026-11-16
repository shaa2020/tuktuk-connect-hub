-- 0034 Inbox snooze. Non-destructive and idempotent.
-- A snoozed conversation is hidden from the working inbox views until snoozed_until passes;
-- it then reappears by itself (the list filters on time, no job needed). A new customer
-- message wakes it immediately so nobody misses a reply.
alter table public.conversations add column if not exists snoozed_until timestamptz;
create index if not exists conversations_snoozed_idx on public.conversations(workspace_id, snoozed_until)
  where snoozed_until is not null;

create or replace function public.wake_snoozed_on_inbound()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'inbound' then
    update public.conversations set snoozed_until = null
      where id = new.conversation_id and snoozed_until is not null;
  end if;
  return new;
end $$;
revoke all on function public.wake_snoozed_on_inbound() from public, anon, authenticated;

drop trigger if exists trg_wake_snoozed on public.messages;
create trigger trg_wake_snoozed after insert on public.messages
  for each row execute function public.wake_snoozed_on_inbound();

-- "conv:<uuid>" topics are allowed only for people who can see that conversation.
create or replace function public.realtime_conv_allowed(_topic text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if _topic is null or _topic !~ '^conv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.can_view_conversation_id(substr(_topic, 6)::uuid);
end $$;
revoke all on function public.realtime_conv_allowed(text) from public, anon;
grant execute on function public.realtime_conv_allowed(text) to authenticated;

-- Who's viewing / typing: private Realtime presence channels named "conv:<conversation id>".
-- Only people who may see that conversation can join or broadcast (Realtime Authorization).
-- Skipped where the Realtime schema isn't present (plain Postgres test harness).
do $$ begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute 'drop policy if exists "inbox presence read" on realtime.messages';
    execute 'drop policy if exists "inbox presence write" on realtime.messages';
    execute $p$create policy "inbox presence read" on realtime.messages for select to authenticated
      using (extension = 'presence' and public.realtime_conv_allowed(realtime.topic()))$p$;
    execute $p$create policy "inbox presence write" on realtime.messages for insert to authenticated
      with check (extension = 'presence' and public.realtime_conv_allowed(realtime.topic()))$p$;
  end if;
end $$;
