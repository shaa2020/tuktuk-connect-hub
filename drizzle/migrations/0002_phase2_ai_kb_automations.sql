
grant insert, update, delete on public.knowledge_documents to authenticated;
grant insert, update on public.ai_settings to authenticated;
grant insert, update, delete on public.automation_rules to authenticated;

alter table public.knowledge_documents add column if not exists category text not null default 'general';
alter table public.knowledge_documents add column if not exists updated_at timestamptz not null default now();
alter table public.knowledge_documents add constraint kd_title_len check (char_length(title) between 1 and 200);
alter table public.knowledge_documents add constraint kd_content_len check (content is null or char_length(content) <= 20000);
create trigger t_upd before update on public.knowledge_documents for each row execute function public.touch_updated_at();

create policy "kd write" on public.knowledge_documents for insert to authenticated
  with check (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "kd update" on public.knowledge_documents for update to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));
create policy "kd delete" on public.knowledge_documents for delete to authenticated
  using (public.has_ws_role(workspace_id, array['admin','manager']::public.app_role[]));

alter table public.ai_settings add constraint ai_instr_len check (instructions is null or char_length(instructions) <= 5000);
create policy "ai insert" on public.ai_settings for insert to authenticated
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));
create policy "ai update" on public.ai_settings for update to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

create policy "ar insert" on public.automation_rules for insert to authenticated
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));
create policy "ar update" on public.automation_rules for update to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]))
  with check (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));
create policy "ar delete" on public.automation_rules for delete to authenticated
  using (public.has_ws_role(workspace_id, array['admin']::public.app_role[]));

-- Auto-assign rule: trigger = {"event":"conversation_created","channel":"<channel|any>"}, actions = {"assign_to":"<user uuid>"}
create or replace function public.apply_automation_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; _uid uuid;
begin
  if new.assigned_to is not null then return new; end if;
  for r in select * from automation_rules where workspace_id = new.workspace_id and enabled
           and trigger->>'event' = 'conversation_created'
           and (trigger->>'channel' = 'any' or trigger->>'channel' = new.channel::text)
           order by created_at loop
    _uid := nullif(r.actions->>'assign_to','')::uuid;
    if _uid is not null and exists (select 1 from workspace_members where workspace_id = new.workspace_id and user_id = _uid and active) then
      new.assigned_to := _uid;
      insert into automation_runs(workspace_id, rule_id, status, detail) values (new.workspace_id, r.id, 'applied', 'Assigned new conversation');
      exit;
    else
      insert into automation_runs(workspace_id, rule_id, status, detail) values (new.workspace_id, r.id, 'skipped', 'Assignee is not an active member');
    end if;
  end loop;
  return new;
end $$;
create trigger trg_apply_automation before insert on public.conversations for each row execute function public.apply_automation_rules();
