-- 0029 AI: conversation classification (intent, sentiment, summary) and an approval queue for
-- AI-drafted replies (sent only after a human approves). Idempotent.

alter table public.ai_settings add column if not exists auto_classify boolean not null default false;
alter table public.conversations add column if not exists ai_intent text check (ai_intent is null or ai_intent in ('booking','pricing','availability','support','complaint','cancellation','other'));
alter table public.conversations add column if not exists ai_sentiment text check (ai_sentiment is null or ai_sentiment in ('positive','neutral','negative'));
alter table public.conversations add column if not exists ai_summary text check (ai_summary is null or char_length(ai_summary) <= 500);
alter table public.conversations add column if not exists ai_classified_message_id uuid;
alter table public.conversations add column if not exists ai_classified_at timestamptz;

create table if not exists public.ai_reply_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4096),
  source text not null default 'ai_operator',
  status text not null default 'pending' check (status in ('pending','sent','discarded')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_reply_drafts_conv on public.ai_reply_drafts(conversation_id) where status = 'pending';
grant select on public.ai_reply_drafts to authenticated;
grant all on public.ai_reply_drafts to service_role;
alter table public.ai_reply_drafts enable row level security;
drop policy if exists "drafts read" on public.ai_reply_drafts;
create policy "drafts read" on public.ai_reply_drafts for select to authenticated using (public.can_view_conversation_id(conversation_id));
drop trigger if exists trg_same_workspace on public.ai_reply_drafts;
create trigger trg_same_workspace before insert or update on public.ai_reply_drafts for each row execute function public.enforce_same_workspace('conversation_id', 'conversations');

-- Discard (sending goes through the normal send path, then mark_ai_draft_sent).
create or replace function public.decide_ai_draft(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.ai_reply_drafts;
begin
  if _status not in ('sent','discarded') then raise exception 'Invalid status'; end if;
  select * into d from public.ai_reply_drafts where id = _id for update;
  if not found or not public.can_view_conversation_id(d.conversation_id) then raise exception 'Not allowed'; end if;
  if d.status <> 'pending' then return; end if;
  update public.ai_reply_drafts set status = _status, decided_by = auth.uid(), decided_at = now() where id = _id;
end $$;
revoke all on function public.decide_ai_draft(uuid, text) from public, anon;
grant execute on function public.decide_ai_draft(uuid, text) to authenticated;
