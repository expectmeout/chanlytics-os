-- 00082 · The sweeper snooze_wake never had.
--
-- 00006 records this exact lesson for pauses: a timed edge whose only mechanism
-- is a job is an edge that stops for ever when the job is lost. It gave pauses
-- a cheap sweeper covering every pause regardless of who set it. Snoozes never
-- got one.
--
-- conversations.snooze_until is cleared by exactly three things: the
-- snooze_wake job, an inbound customer message (00005), and opt-out
-- enforcement (00013). So a snooze whose job never arrives -- QStash dropping
-- it, the signing keys rotating, the sweep in api/cron/jobs.ts finally giving
-- up on it -- keeps a real customer's conversation out of the inbox
-- permanently, with the timer showing an hour that passed days ago. Nobody is
-- told, because nothing is watching a row that looks exactly like a snooze
-- someone set a moment ago.
--
-- This does what snoozeWake in packages/jobs/src/handlers.ts does, and
-- deliberately no more: state 'snoozed', timer expired, reopen and clear. It
-- carries no escalation guard because the handler carries none -- the point is
-- to be the same edge, arriving late, not a second policy that disagrees with
-- the first one.
--
-- Every fifteen minutes, on the same grid as 00006 rather than offset off it.
-- The offsets elsewhere exist so a pg_net sweep does not judge another sweep's
-- work seconds after it was enqueued; this one makes no request and nothing
-- reads its freshness, and its sibling is the sweeper it is modelled on.

create or replace function public.wake_stale_snoozes() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with woken as (
    update conversations c
       set state = 'open', snooze_until = null
     where c.state = 'snoozed'
       and c.snooze_until is not null
       and c.snooze_until < now()
    returning c.id, c.tenant_id
  )
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  select tenant_id, 'conversation.snooze_expired', 'conversation', 'conversation', id, '{}'::jsonb
    from woken;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.wake_stale_snoozes() from public, anon, authenticated;

comment on function public.wake_stale_snoozes() is
  'Reopens conversations whose snooze ran out, whoever set it and whatever became of the snooze_wake job. The sibling of expire_stale_pauses() (00006).';

select cron.schedule('wake-stale-snoozes', '*/15 * * * *', $$select public.wake_stale_snoozes()$$);
