-- 00340 · A write's answer is kept a day.
--
-- Decision 0035: route() answers any write in a workspace that carries an Idempotency-Key once, keeping the first answer
-- on idempotency_keys (00004) under `req:<key>` with the request's hash, as it keeps an Ask card's under `card:` and core
-- a reply's under `<member>:<key>`. Nothing ever removed a row, so every key and every answer was kept for ever. Now a
-- nightly clock keeps a day of them, every row whatever its prefix, a card's and a reply's too (Ruben, 6 October 2026):
-- the longest retry a person makes is minutes, a day covers a phone that was offline, and core's own reply window is
-- thirty seconds. contracts RETENTION_DAYS.idempotency_keys says it, and the privacy page with it.
--
--   purge_idempotency_keys(p_keep)  deletes rows claimed more than a day ago, a thousand at a time, and answers how
--                                   many; created_at is the claim's stamp, which a takeover moves on. On its registered
--                                   clock, judged by its run, like the other purges (00107, 00215, 00336).
--   idempotency_keys_created_at     the index it reads by.
--
-- Either deploy order: a purge of rows no reader keeps past a day. Re-runnable: the index if not exists, the function
-- replaced, the job unscheduled and made again, the clock's row upserted.

set local lock_timeout = '3s';

create index if not exists idempotency_keys_created_at on public.idempotency_keys (created_at);

create or replace function public.purge_idempotency_keys(p_keep interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    delete from public.idempotency_keys k
     where k.id in (select c.id from public.idempotency_keys c where c.created_at < now() - p_keep limit 1000);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 1000;
  end loop;
  return v_total;
end $$;
revoke all on function public.purge_idempotency_keys(interval) from public, anon, authenticated;
grant execute on function public.purge_idempotency_keys(interval) to service_role;
comment on function public.purge_idempotency_keys(interval) is
  'Nightly. Deletes the keys writes were answered under (cards, replies, requests) a day after their claim (contracts RETENTION_DAYS.idempotency_keys; decision 0035), a thousand at a time. Answers how many.';

select cron.unschedule('purge-idempotency-keys') where exists (select 1 from cron.job where jobname = 'purge-idempotency-keys');
select cron.schedule('purge-idempotency-keys', '52 4 * * *', $$select public.purge_idempotency_keys()$$);

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_idempotency_keys', 'purge-idempotency-keys', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;
