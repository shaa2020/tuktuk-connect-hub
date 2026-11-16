-- 0035 AI knowledge from uploaded documents. Non-destructive and idempotent.
-- Documents may now be long (uploaded PDFs/Word/text, up to 200k characters). They are split into
-- chunks by a trigger; the AI gets the whole knowledge base when it is small, otherwise only the
-- passages most relevant to the conversation (full-text ranking, 'simple' config = any language).

alter table public.knowledge_documents add column if not exists source_name text;
alter table public.knowledge_documents drop constraint if exists kd_source_name_len;
alter table public.knowledge_documents add constraint kd_source_name_len
  check (source_name is null or char_length(source_name) <= 255);
-- Relaxes the old 20,000-character limit (existing rows always satisfy the new one).
alter table public.knowledge_documents drop constraint if exists kd_content_len;
alter table public.knowledge_documents add constraint kd_content_len
  check (content is null or char_length(content) <= 200000);

alter table public.knowledge_chunks add column if not exists seq int not null default 0;
alter table public.knowledge_chunks add column if not exists tsv tsvector
  generated always as (to_tsvector('simple', content)) stored;
create index if not exists knowledge_chunks_tsv_idx on public.knowledge_chunks using gin(tsv);
create index if not exists knowledge_chunks_doc_idx on public.knowledge_chunks(document_id, seq);

-- Paragraph-aware chunking (~1,200 characters per chunk; very long paragraphs are cut).
create or replace function public.rebuild_knowledge_chunks(_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d record; para text; buf text := ''; n int := 0;
begin
  delete from public.knowledge_chunks where document_id = _doc;
  select id, workspace_id, content into d from public.knowledge_documents where id = _doc;
  if not found or coalesce(btrim(d.content), '') = '' then return; end if;
  for para in select btrim(p) from regexp_split_to_table(d.content, E'\\n\\s*\\n') p loop
    continue when para = '';
    while char_length(para) > 1500 loop
      if buf <> '' then
        insert into public.knowledge_chunks(workspace_id, document_id, content, seq) values (d.workspace_id, d.id, buf, n);
        n := n + 1; buf := '';
      end if;
      insert into public.knowledge_chunks(workspace_id, document_id, content, seq) values (d.workspace_id, d.id, substr(para, 1, 1200), n);
      n := n + 1; para := btrim(substr(para, 1201));
    end loop;
    continue when para = '';
    if buf <> '' and char_length(buf) + char_length(para) > 1200 then
      insert into public.knowledge_chunks(workspace_id, document_id, content, seq) values (d.workspace_id, d.id, buf, n);
      n := n + 1; buf := '';
    end if;
    buf := case when buf = '' then para else buf || E'\n\n' || para end;
  end loop;
  if buf <> '' then
    insert into public.knowledge_chunks(workspace_id, document_id, content, seq) values (d.workspace_id, d.id, buf, n);
  end if;
end $$;
revoke all on function public.rebuild_knowledge_chunks(uuid) from public, anon, authenticated;

create or replace function public.knowledge_chunks_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.rebuild_knowledge_chunks(new.id);
  return new;
end $$;
revoke all on function public.knowledge_chunks_sync() from public, anon, authenticated;
drop trigger if exists trg_knowledge_chunks on public.knowledge_documents;
create trigger trg_knowledge_chunks after insert or update of content on public.knowledge_documents
  for each row execute function public.knowledge_chunks_sync();

-- Backfill documents that have no chunks yet.
do $$ declare r record; begin
  for r in select d.id from public.knowledge_documents d
           where not exists (select 1 from public.knowledge_chunks c where c.document_id = d.id) loop
    perform public.rebuild_knowledge_chunks(r.id);
  end loop;
end $$;

-- What the AI reads. SECURITY INVOKER: RLS still applies to signed-in callers (members only);
-- server jobs call it with the service role. _terms come from the conversation (sanitised in
-- src/lib/knowledge.ts and again here). Returns whole documents when everything fits _budget.
create or replace function public.knowledge_context(_ws uuid, _terms text[], _budget int default 24000)
returns table(title text, category text, content text, whole boolean)
language plpgsql stable set search_path = public as $$
declare total bigint; q tsquery;
begin
  _budget := least(greatest(coalesce(_budget, 24000), 2000), 60000);
  select coalesce(sum(char_length(coalesce(d.content, ''))), 0) into total
    from public.knowledge_documents d where d.workspace_id = _ws;
  if total <= _budget then
    return query select d.title, d.category, coalesce(d.content, ''), true
      from public.knowledge_documents d where d.workspace_id = _ws order by d.updated_at desc;
    return;
  end if;
  select to_tsquery('simple', string_agg(quote_literal(lower(t)) || ':*', ' | ')) into q
    from unnest(coalesce(_terms, '{}'::text[])) t
    where char_length(t) between 2 and 40 and t !~ '[\s''"\\:&|!()<>*]';
  return query
  with cand as (
    select d.title, d.category, c.content, c.seq, d.updated_at,
           (case when q is null then 0 else ts_rank(c.tsv, q) end)
           + (case when q is not null and to_tsvector('simple', d.title) @@ q then 0.2 else 0 end) as r
      from public.knowledge_chunks c join public.knowledge_documents d on d.id = c.document_id
     where c.workspace_id = _ws
  ), ordered as (
    select cand.*, sum(char_length(cand.content)) over (order by cand.r desc, cand.updated_at desc, cand.seq) as run
      from cand
  )
  select o.title, o.category, o.content, false from ordered o where o.run <= _budget
   order by o.r desc, o.updated_at desc, o.seq;
end $$;
revoke all on function public.knowledge_context(uuid, text[], int) from public, anon;
grant execute on function public.knowledge_context(uuid, text[], int) to authenticated, service_role;
