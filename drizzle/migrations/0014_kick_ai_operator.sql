create or replace function public.kick_ai_operator(_ws uuid)
returns void language plpgsql security definer set search_path = public, net as $$
begin
  perform net.http_post(
    url := 'https://project--133f9183-9d83-4d21-85ed-38bd33238705.lovable.app/api/public/hooks/background-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select token from public.internal_job_tokens where name='background_sync')),
    body := jsonb_build_object('operatorOnly', true, 'workspace', _ws::text),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.kick_ai_operator(uuid) from public, anon, authenticated;
grant execute on function public.kick_ai_operator(uuid) to service_role;

select cron.alter_job(jobid, command := $c$
  select net.http_post(
    url := 'https://project--133f9183-9d83-4d21-85ed-38bd33238705.lovable.app/api/public/hooks/background-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select token from public.internal_job_tokens where name='background_sync')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$c$) from cron.job where jobname = 'tt24-background-sync';

update public.ai_operator_settings set lock_until = null;
delete from public.ai_operator_marks where conversation_id = '3fdd1618-6097-4a7e-b2b1-63b31428c208' and handed_off = false;