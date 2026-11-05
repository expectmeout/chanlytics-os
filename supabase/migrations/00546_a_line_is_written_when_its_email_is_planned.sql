-- 00546 · A line is written when its email is planned (decision 0098; 5 Nov 2026, over an email due tomorrow whose sheet
-- said "A line about them, written before it goes": "perhaps the dynamic line written has to be written and ready at an
-- earlier step").
--
-- The check took a send in a run that goes ahead only within two hours of its time, and a run is placed over up to seven
-- days, so there was nothing to read or change until the last moment. Now every planned send is checked as soon as it is
-- planned, or put back to be checked, whatever its day.
--
--   sequence_unchecked             No send waits for its day. What p_ahead_minutes names goes first in its workspace's turn
--                                  and says so (due_soon), so an email days off never keeps one due today waiting, and the
--                                  edge can treat the two apart.
--   trigger_reach_out_check_sweep  Asks the edge for any send waiting to be checked, by the same rule.
--
-- Deploy order: either. An edge from before this reads no due_soon and writes the lines early, which holds a far email only
-- after an hour of a model's failures; an edge after it over the function before it takes what it always took, and reads a
-- missing due_soon as due soon. Re-runnable.

set local lock_timeout = '3s';

drop function if exists public.sequence_unchecked(integer, integer, integer, uuid, uuid[]);
create or replace function public.sequence_unchecked(p_limit integer, p_per_workspace integer, p_ahead_minutes integer,
                                                    p_tenant_id uuid default null, p_send_ids uuid[] default null)
returns table(send jsonb, check_gen integer, template_id uuid, template_language text, signed_by text,
              included_for text[], business_name text, category text, city text, region text, rating numeric,
              reviews integer, website_host text, hours jsonb, about text, email text, why_it_fits text,
              what_you_asked text, site_listings integer, name_listings integer, email_domain_shared boolean,
              reviews_dist jsonb, claimed boolean, due_soon boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
  v_soon timestamptz := now() + make_interval(mins => greatest(coalesce(p_ahead_minutes, 0), 0));
begin
  if coalesce(p_limit, 0) <= 0 or coalesce(p_per_workspace, 0) <= 0 then
    return;
  end if;
  with candidates as (
    select s.id,
           -- Those due soon first (decision 0098): an email days off never keeps one due today waiting.
           row_number() over (partition by s.tenant_id
                              order by (b.state = 'pending_approval' or s.send_at <= v_soon) desc,
                                       coalesce(s.check_after, s.created_at), s.send_at, s.id) as turn,
           coalesce(s.check_after, s.created_at) as waiting_since
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
      join public.sequence_steps p on p.id = s.step_id
      join public.sequence_steps r on r.id = s.sequence_id
     where s.lead_id is not null and s.state = 'planned' and s.checked_at is null
       and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
       and (s.check_after is null or s.check_after <= now())
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
       and (p_send_ids is null or s.id = any (p_send_ids))
  ), picked as (
    select c.id from candidates c
     where c.turn <= p_per_workspace
     order by c.turn, c.waiting_since, c.id
     limit p_limit
  ), locked as (
    select s.id from public.sequence_sends s
     where s.id in (select id from picked)
     for update of s skip locked
  ), leased as (
    update public.sequence_sends s
       set check_started_at = now()
      from locked
     where s.id = locked.id and s.state = 'planned' and s.checked_at is null
       and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from leased;

  return query
  select to_jsonb(s), s.check_gen, p.template_id, p.template_language, r.signed_by,
         array(select distinct x
                 from public.sequence_sends o, unnest(o.included_for) as x
                where o.tenant_id = s.tenant_id and o.sequence_id = s.sequence_id and o.lead_id = s.lead_id
                order by x),
         rec.business_name, rec.category, rec.city, rec.region, rec.rating, rec.reviews, rec.website_host,
         rec.hours, rec.about, rec.email, rec.why_it_fits, rec.what_you_asked,
         rec.site_listings, rec.name_listings, rec.email_domain_shared, rec.reviews_dist, rec.claimed,
         (b.state = 'pending_approval' or s.send_at <= v_soon)
    from public.sequence_sends s
    join public.sequence_batches b on b.id = s.batch_id
    join public.sequence_steps p on p.id = s.step_id
    join public.sequence_steps r on r.id = s.sequence_id
    cross join lateral public.reach_out_record(s.tenant_id, r.lead_search_id, s.lead_id) rec
   where s.id = any (v_ids)
   order by s.send_at, s.id;
end $$;

comment on function public.sequence_unchecked(integer, integer, integer, uuid, uuid[]) is
  'The sends to leads the check clock takes this tick, leased under their row locks, round-robin by workspace, every planned send whatever its day (decision 0098): those waiting for their owner or due within p_ahead_minutes first, and saying so (due_soon), each with its words'' step, the name its sequence signs with, the holds its owner included it past and its business''s record (00197 reach_out_unchecked over sequence_sends); with p_send_ids, those sends alone (00505: the check of a pressed rewrite). Service role only (0060).';

revoke all on function public.sequence_unchecked(integer, integer, integer, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.sequence_unchecked(integer, integer, integer, uuid, uuid[]) to service_role;

create or replace function public.trigger_reach_out_check_sweep()
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
begin
  if exists (
       select 1 from public.sequence_sends s
         join public.sequence_batches b on b.id = s.batch_id
         join public.sequence_steps p on p.id = s.step_id
         join public.sequence_steps r on r.id = s.sequence_id
        where s.lead_id is not null and ( s.state = 'planned' and s.checked_at is null
          and b.state in ('pending_approval', 'scheduled', 'sending') and p.state = 'running' and r.state = 'running'
          and (s.check_after is null or s.check_after <= now())
          and (s.check_started_at is null or s.check_started_at < now() - interval '2 minutes')))
     or exists (select 1 from public.sequence_sends
                 where sequence_sends.lead_id is not null and ( state = 'held' and reason = 'check_unavailable' and hold_detail is null
                   and updated_at < now() - interval '1 hour')) then
    return public.request_sweep('reach_out_check', '/api/cron/reach-out-check', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out_check', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

comment on function public.trigger_reach_out_check_sweep() is
  'The reach-out check clock (Reach out, Part 4). Calls the edge only when a send waits to be checked, whatever its day (decision 0098), or a check_unavailable hold is an hour old; otherwise records that it looked.';
