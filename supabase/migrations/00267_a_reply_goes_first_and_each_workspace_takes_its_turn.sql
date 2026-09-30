-- 00267 · A reply goes first, and each workspace takes its turn.
--
-- Decision 0018, steps 2 and 3 (docs/decisions/0018-a-reply-goes-first.md). claim_due_jobs (00098) took every job
-- first due, first served, whatever it was and whoever it was for: a customer's reply waited behind every broadcast
-- batch and lead job due before it, and one workspace's broadcast held every other workspace's bulk work until it was
-- through.
--
-- 1. Each job has a lane, a column generated from its kind and payload, so every writer keeps writing what it writes
--    and the rule has one home:
--      0  a reply: someone is waiting on it (outbound_send that is not outreach, email_ingest, push_send);
--      1  someone is waiting, but not on the receptionist: an owner on a line being bought (line_provision), and a
--         lead who wrote back to a reach-out, whose reply is read so a member hears of it (reply_read, which came
--         after the note);
--      2  bulk: nobody in particular (broadcast_send, outreach, the lead finder's three, push_receipts).
--    A kind the case does not name has no lane and is claimed last. jobs/jobs-lanes.db.test.mjs fails a kind the
--    jobs.kind CHECK allows without one, so a kind arrives with its lane, as with its handler, its caller and the CHECK.
-- 2. The claim takes the lowest lane first. Within bulk, a job of a workspace with no bulk work running goes before a
--    job of one with some. Then the earliest due. Running is claimed within the lease the runner passes and still held:
--    a run that threw and was kept for a later try (deferJob) counts until its claim's lease would have ended, and a
--    row whose lease ran out, which the claim takes back, never counts. The order never leaves a runner idle: a
--    workspace's second bulk job runs when nothing else is due.
--
-- The claim reads the workspaces with bulk work running once, from the last lease of jobs_fired_at_idx, and sorts the
-- due rows as it did before. On a ledger of 100,000 finished rows (Postgres 17), a backlog of 3,000 due rows is claimed
-- in 2.2 ms, where it took 1.0, and 30,000 in 31 ms, where it took 22. A look per due row, as the note had it, took
-- 8 and 95. So neither index the note named is built: the claim sorts what is due either way, so (lane, due_at) would
-- never be read, and the running work is one short range of an index the ledger has.
--
-- Every statement re-runs. The column rewrites jobs under a lock that holds every claim and every write while it runs.
-- 00215 keeps about a week of rows, so the rewrite is short, and the lock guard of 00140 fails this migration, to be
-- run again, rather than queue the heartbeat behind a busy ledger. Apply it off-peak.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. a job's lane -- */

alter table public.jobs add column if not exists lane smallint generated always as (
  case
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts') then 2
  end
) stored;
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read), 2 bulk. Generated from kind and payload; null for a kind it does not name, which is claimed last. A new kind names its lane with its handler, its caller and the jobs.kind CHECK.';

/* ------------------------------------------------------------ 2. the claim -- */

create or replace function public.claim_due_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  with due as (
    select c.id
      from public.jobs c
     where (c.state = 'scheduled' and c.due_at <= now())
        or (c.state = 'fired' and c.lease_until < now())
     order by c.lane nulls last,
              -- false before true: a workspace with no bulk work running first. Read once and hashed, not per row.
              c.lane = 2 and c.tenant_id in (
                select r.tenant_id
                  from public.jobs r
                 where r.state = 'fired'
                   and r.lane = 2
                   and r.fired_at > now() - make_interval(secs => p_lease_seconds)
                   and r.lease_until >= now()),
              c.due_at
     limit p_limit
     for update of c skip locked
  )
  update public.jobs j
     set state       = 'fired',
         fired_at    = now(),
         attempts    = j.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds)
    from due
   where j.id = due.id
  returning j.*
$$;
revoke execute on function public.claim_due_jobs(integer, integer) from public, anon, authenticated;
comment on function public.claim_due_jobs(integer, integer) is
  'The only way a job becomes fired. Concurrent ticks take disjoint rows (SKIP LOCKED): the lowest lane first; within bulk, a workspace with no bulk job running before one with one (running: claimed within p_lease_seconds and still held); then the earliest due (decision 0018). attempts counts claims: 1 is the first run; more means a lease ran out before a run reported back.';
