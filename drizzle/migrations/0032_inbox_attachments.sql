-- 0032 Inbox attachments: private storage bucket + access rules. Files live at
-- attachments/<workspace_id>/<conversation_id>/<uuid>-<name>; only people who can see the
-- conversation can read or upload them. Idempotent; storage parts run only where Supabase Storage exists.

alter table public.message_attachments add column if not exists file_name text check (file_name is null or char_length(file_name) <= 200);
alter table public.message_attachments add column if not exists kind text not null default 'file' check (kind in ('image','video','audio','file'));

-- Is this storage path inside a conversation the caller may see (and in that conversation's workspace)?
create or replace function public.attachment_path_allowed(_path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare _parts text[] := string_to_array(_path, '/'); _ws uuid; _conv uuid;
begin
  if array_length(_parts, 1) <> 3 or _parts[1] !~ '^[0-9a-f-]{36}$' or _parts[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  _ws := _parts[1]::uuid; _conv := _parts[2]::uuid;
  return exists (select 1 from public.conversations c where c.id = _conv and c.workspace_id = _ws and public.can_view_conversation(c.workspace_id, c.assigned_to));
end $$;
grant execute on function public.attachment_path_allowed(text) to authenticated;

grant insert on public.message_attachments to authenticated;
drop policy if exists "att insert" on public.message_attachments;
create policy "att insert" on public.message_attachments for insert to authenticated
  with check (
    public.is_member(workspace_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.workspace_id = message_attachments.workspace_id
                and public.can_view_conversation_id(m.conversation_id)
                and split_part(storage_path, '/', 2) = m.conversation_id::text)
    and split_part(storage_path, '/', 1) = workspace_id::text
  );
drop trigger if exists trg_same_workspace on public.message_attachments;
create trigger trg_same_workspace before insert or update on public.message_attachments for each row execute function public.enforce_same_workspace('message_id', 'messages');

do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('attachments', 'attachments', false, 15728640, array[
      'image/jpeg','image/png','image/webp','image/gif','image/heic',
      'video/mp4','video/quicktime','video/3gpp',
      'audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/amr','audio/webm','audio/wav',
      'application/pdf','text/plain','text/csv',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
    on conflict (id) do nothing;
    execute 'drop policy if exists "attachments read" on storage.objects';
    execute 'create policy "attachments read" on storage.objects for select to authenticated using (bucket_id = ''attachments'' and public.attachment_path_allowed(name))';
    execute 'drop policy if exists "attachments upload" on storage.objects';
    execute 'create policy "attachments upload" on storage.objects for insert to authenticated with check (bucket_id = ''attachments'' and public.attachment_path_allowed(name))';
  end if;
end $$;
