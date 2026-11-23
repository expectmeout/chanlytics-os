-- 00684 · A deal marked won is a moment a campaign starts on.
--
-- The only moment that came after something was a kept visit (the thank-you the day after, which may ask for a review,
-- decision 0123). A business that sells by proposal has deals and no visits, so it had no moment to thank a customer in,
-- or to ask for a review. This is that moment for it: `deal_won`, an occasion's (decision 0119). The deal's own event,
-- which deal_record writes with the fact, enrols the person; their step is due the next day at the campaign's hour, once
-- for the deal, and only while the record still says the deal is won.
--
--   sequence_steps_trigger_check   takes deal_won.
--   sequence_steps_due             never hands the hourly sweep a step on it: it runs for each person at their own time,
--                                  as the three an occasion already starts do (00637's form otherwise).
--   event_subscriptions            deal.won is delivered to `occasion_enrol` (core events/subscribers.ts), in the bulk
--                                  lane with its other deliveries. A subscriber every build since 00599 knows: one that
--                                  does not know this kind yet reads it as nothing to enrol, and answers.
--
-- Deploy order: this first, then the build, the usual way. Until the build is live no campaign can be made on the moment
-- (no page offers it), so a deal won meanwhile enrols nobody. The build without this would offer a moment the check
-- refuses. Re-runnable.

set local lock_timeout = '3s';

alter table public.sequence_steps drop constraint if exists sequence_steps_trigger_check;
alter table public.sequence_steps add constraint sequence_steps_trigger_check check (trigger in (
  'quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed',
  'saved_list', 'proposal_waiting', 'lead_first', 'after_step', 'slot_opened',
  'visit_soon', 'visit_missed', 'asked_no_booking', 'deal_won'));

-- 00637's form, but for one moment more that an occasion starts: the hourly sweep never runs it.
create or replace function public.sequence_steps_due(
  p_kind text, p_at timestamp with time zone, p_last_hour integer, p_limit integer, p_tenant_id uuid default null::uuid
)
returns table (step jsonb, timezone text, due_total bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select to_jsonb(s) || jsonb_build_object('mode', q.mode), z.tz, count(*) over ()
    from public.sequence_steps s
    join public.sequence_steps r on r.id = s.sequence_id
    join public.sequences q on q.id = s.sequence_id
    join public.tenants t on t.id = s.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
    cross join lateral (select p_at at time zone z.tz as clock) l
   where s.state = 'running' and s.kind = p_kind
     -- A freed time's step runs when an appointment frees a time (decision 0082, 00498), never by the hour; nor does a
     -- step an occasion starts (0119), which runs for each person at their own time.
     and s.trigger not in ('slot_opened', 'visit_soon', 'visit_missed', 'asked_no_booking', 'deal_won')
     and (s.kind = 'reach_out' or (r.state = 'running' and q.state = 'on'))
     and t.status <> 'paused'
     and t.sending_stopped_at is null
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between s.run_hour and p_last_hour
     and s.last_run_for is distinct from l.clock::date
   order by s.last_run_at nulls first, s.created_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

insert into public.event_subscriptions (kind, subscriber, lane) values
  ('deal.won', 'occasion_enrol', 2)
on conflict (kind, subscriber) do nothing;
