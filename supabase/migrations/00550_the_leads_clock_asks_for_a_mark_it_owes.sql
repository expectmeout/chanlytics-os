-- 00550 · The leads clock asks for a mark it owes.
--
-- The sweep's second try at a lead's mark (core markLeadsAgain) looks at the leads found five to ten minutes before its
-- slot, and this clock asked the sweep only while a run was live or a round had not ended. A small search is over in
-- about two minutes, so the try never ran for one (5 Nov 2026: two real searches, marks_due 0 at every tick). It asks
-- too while such a lead is waiting. Eleven minutes is that window and a late tick; leads_untouched_purge serves it.

create or replace function public.trigger_leads_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Any round that has not ended, not only one waiting or checking: a round
  -- whose lead_round_start job died before it wrote a run sits in 'queued'
  -- with no run at all, and nothing but the sweep can end it and give its
  -- allowance and budget back (lead_rounds_live serves this predicate).
  -- And a lead just found with a site and no mark, whose round has ended by
  -- the time the sweep's second try reaches it (leads_untouched_purge serves it).
  if exists (select 1 from public.lead_runs r where r.state in ('claimed', 'starting', 'running', 'unknown'))
     or exists (select 1 from public.lead_rounds r where r.state <> 'ended')
     or exists (
       select 1 from public.leads l
        where l.found_at >= now() - interval '11 minutes'
          and l.stage = 'ready'
          and l.contact_id is null
          and l.contacted_at is null
          and l.exported_at is null
          and l.erased_at is null
          and l.blanked_at is null
          and l.website_host is not null
          and l.mark_path is null
     ) then
    return public.request_sweep('leads', '/api/cron/leads');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('leads', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
comment on function public.trigger_leads_sweep() is
  'The lead finder''s clock. Calls the edge (/api/cron/leads) only when a run is live, a round has not ended -- a round whose start job died sits queued with no run, and its reservation comes back only when something ends it -- or a lead just found has a site and no mark, for the sweep''s second try; otherwise records that it looked, so sweep_health() can tell a quiet engine from a stopped clock.';
