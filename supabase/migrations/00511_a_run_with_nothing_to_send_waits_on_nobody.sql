-- 00511 · A run with nothing to send waits on nobody (3 Nov 2026).
--
-- A run made to wait for its owner's OK (pending_approval) ends only by their word: approved, it is released; skipped, it
-- is canceled. Nothing else ever closes one. The reach-out clock finishes a run that went (reach_out_finishable: scheduled
-- or sending, with no send left open), and the playbooks' sweep skips a customer's run past its day, leaving reach-outs
-- alone. So a waiting run whose every email left it before anyone answered (its leads moved to another sequence, taken
-- out, stopped, written back, erased) stayed waiting for good: Today and the sequence's page kept asking for an OK on
-- nothing (contracts runWaitsOnYou, reach_out_search_lines waiting_run_id), and the chain planned no further run while it
-- stood (run-context.ts chainWaits). Seen 3 Nov 2026 on a reach-out whose seven leads were moved, one by one, to another.
--
--   sequence_sends_end_emptied_runs   A trigger, once a statement, over the sends whose state a statement changed: each
--                                     run of theirs still waiting for an OK with no send left to go (planned, held,
--                                     claimed, queued or drafted) is canceled, through the runs' own moves
--                                     (sequence_batches_guard), so what a cancel does follows: its notice closes
--                                     (batch_closes_its_notices) and a customer's run gives back its places
--                                     (sequence_batches_cut_off). Its end is recorded as the system's decision, as the
--                                     sweep's skip of a late run is (core cancel.ts: cancel_broadcast, reason
--                                     nothing_to_send), which the Activity page words. A run with one email still
--                                     planned keeps waiting. Every road that skips a send is covered, now and later: the
--                                     one leave every door takes (sequence_enrollments_leave), Leave out, Stop writing,
--                                     a reply, an erasure.
--
-- Then, once, the runs already waiting on nothing are ended the same way, each with its decision.
--
-- Deploy order: either. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.sequence_sends_end_emptied_runs() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- The runs of the sends whose state moved (a transition table takes no column list, so the statement is any update),
  -- each ended with the system's decision beside it, as the sweep's skip of a late run is recorded (core cancel.ts:
  -- cancel_broadcast, its name, what it was, and why), so the Activity page and the run's sheet say why it ended.
  with ended as (
    update public.sequence_batches b
       set state = 'canceled'
     where b.state = 'pending_approval'
       and b.id in (select distinct c.batch_id
                      from changed_sends c
                      join sends_were w on w.id = c.id
                     where c.batch_id is not null and c.state is distinct from w.state)
       and not exists (select 1 from public.sequence_sends s
                        where s.batch_id = b.id
                          and s.state in ('planned', 'held', 'claimed', 'queued', 'drafted'))
    returning b.id, b.tenant_id, b.name
  )
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  select e.tenant_id, 'broadcast', e.id, 'cancel_broadcast', 'system', null,
         jsonb_build_object('name', e.name, 'was', 'pending_approval', 'reason', 'nothing_to_send')
    from ended e;
  return null;
end $$;

comment on function public.sequence_sends_end_emptied_runs() is
  'A run waiting for an OK with no send left to go is canceled (00511): once a statement, over the sends whose state it changed, each waiting run of theirs with nothing planned, held, claimed, queued or drafted ends through the runs'' own moves, so its notice closes and a customer''s run gives back its places, with the system''s decision beside it (cancel_broadcast, reason nothing_to_send), as the sweep''s skip of a late run is recorded. One with an email still planned keeps waiting.';

revoke all on function public.sequence_sends_end_emptied_runs() from public, anon, authenticated;

drop trigger if exists sequence_sends_end_emptied_runs on public.sequence_sends;
create trigger sequence_sends_end_emptied_runs after update on public.sequence_sends
  referencing old table as sends_were new table as changed_sends
  for each statement execute function public.sequence_sends_end_emptied_runs();

-- Once: the runs already waiting on nothing, ended the same way, each with its decision. A run that was never given a
-- send is left alone.
with ended as (
  update public.sequence_batches b
     set state = 'canceled'
   where b.state = 'pending_approval'
     and exists (select 1 from public.sequence_sends s where s.batch_id = b.id)
     and not exists (select 1 from public.sequence_sends s
                      where s.batch_id = b.id
                        and s.state in ('planned', 'held', 'claimed', 'queued', 'drafted'))
  returning b.id, b.tenant_id, b.name
)
insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
select e.tenant_id, 'broadcast', e.id, 'cancel_broadcast', 'system', null,
       jsonb_build_object('name', e.name, 'was', 'pending_approval', 'reason', 'nothing_to_send')
  from ended e;
