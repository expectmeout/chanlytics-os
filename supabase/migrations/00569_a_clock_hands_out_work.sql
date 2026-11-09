-- 00569 · A clock hands out work (layer 10, decision 0115).
--
-- The hourly sweeps did their work themselves, inside one sixty-second function, so each had a fixed ceiling: 25 campaign
-- moments and 25 reach-out steps an hour across every business, 40 calendars and 40 Google listings. Now a sweep finds
-- which workspaces have work due and hands each one a job, and the ledger gives that work its turn, its retries and Health.
--
--   job_kinds                 campaign_moments, reach_out_steps, calendar_read, google_read, in the bulk lane, each once
--                             per workspace while one waits or runs: a workspace's moments run against one read of it, so
--                             two of them keep the week's breath between them, and a customer's reply still goes first.
--   jobs_hand_out             The service role's: one job of a kind per workspace named, each due within the spread by a
--                             hash of its workspace, so nine o'clock is not one herd. Answers how many it wrote: a
--                             workspace with one already waiting or running writes none.
--   sequence_steps_hand_out   The service role's: a job for each workspace with a step of that kind due (sequence_steps_due
--                             judges, the one rule for what is due).
--   calendars_hand_out        The service role's: a calendar_read for each workspace whose calendar is due (calendars_due).
--
-- Deploy order: either. With this first, the old edge's sweeps go on as they did and nothing writes the new kinds. With the
-- edge first, its sweep answers 500 until this is on, which sweep_health says, and nothing is lost: what is due stays due.
-- Re-runnable.

set local lock_timeout = '3s';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('campaign_moments', 2, array['@tenant'], false),
  ('reach_out_steps', 2, array['@tenant'], false),
  ('calendar_read', 2, array['@tenant'], false),
  ('google_read', 2, array['@tenant'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

create or replace function public.jobs_hand_out(p_kind text, p_tenants uuid[], p_spread_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handed integer;
begin
  -- The kind's own key (job_kinds, the workspace) holds one per workspace while one waits or runs.
  insert into public.jobs (tenant_id, kind, due_at, payload)
  select t.id, p_kind,
         now() + make_interval(secs => abs(hashtext(t.id::text)::bigint) % greatest(p_spread_seconds, 1)),
         '{}'::jsonb
    from unnest(p_tenants) as t(id)
  on conflict do nothing;
  get diagnostics v_handed = row_count;
  return v_handed;
end $$;
revoke all on function public.jobs_hand_out(text, uuid[], integer) from public, anon, authenticated;
grant execute on function public.jobs_hand_out(text, uuid[], integer) to service_role;
comment on function public.jobs_hand_out(text, uuid[], integer) is
  'One job of a kind per workspace named, each due within the spread by a hash of its workspace, unless one already waits or runs (00569, decision 0115). Answers how many it wrote. The service role''s: a sweep hands out what it found due.';

create or replace function public.sequence_steps_hand_out(
  p_kind text, p_job_kind text, p_at timestamptz, p_last_hour integer, p_spread_seconds integer
)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.jobs_hand_out(
    p_job_kind,
    array(
      select distinct (d.step ->> 'tenant_id')::uuid
        from public.sequence_steps_due(p_kind, p_at, p_last_hour, 2147483647) d
    ),
    p_spread_seconds
  );
$$;
revoke all on function public.sequence_steps_hand_out(text, text, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.sequence_steps_hand_out(text, text, timestamptz, integer, integer) to service_role;
comment on function public.sequence_steps_hand_out(text, text, timestamptz, integer, integer) is
  'A job for each workspace with a step of that kind due, judged by sequence_steps_due (00569, decision 0115). Answers how many it wrote.';

create or replace function public.calendars_hand_out(p_before timestamptz, p_spread_seconds integer)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.jobs_hand_out(
    'calendar_read',
    array(select d.tenant_id from public.calendars_due(p_before, 2147483647) d),
    p_spread_seconds
  );
$$;
revoke all on function public.calendars_hand_out(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.calendars_hand_out(timestamptz, integer) to service_role;
comment on function public.calendars_hand_out(timestamptz, integer) is
  'A calendar_read for each workspace whose calendar is due, judged by calendars_due (00569, decision 0115). Answers how many it wrote.';
