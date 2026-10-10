-- 00382 · A paused subscription keeps what it would have been handed.
--
-- Decision 0032 (4): "A paused subscriber keeps its deliveries; a re-drive door replays them." What 00334 built dropped
-- them instead: the copy wrote no outbox row for a kind whose only subscriptions were paused, and the relay wrote no
-- delivery for a paused one, so every event of the pause was lost to that subscriber for good, and nothing said so
-- (0031's review of 9 October). Now the copy keeps an outbox row whenever a subscription names the kind, and the relay
-- writes a paused subscription's delivery as paused, with no job; event_deliveries_redrive (00334), which already
-- schedules a subscriber's paused and failed deliveries, replays them once the subscription runs again. A delivery whose
-- job finds its subscription paused is settled paused, as it was.
--
-- events_outbox_copy and relay_events are re-created whole from 00334 with those two lines changed. Either deploy
-- order works: nothing outside the database reads a paused delivery. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.events_outbox_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Paused or not: a paused subscription keeps what it would have been handed (decision 0032, 4).
  if exists (select 1 from public.event_subscriptions s where s.kind = new.kind) then
    insert into public.event_outbox (event_id, tenant_id, kind, event_at)
         values (new.id, new.tenant_id, new.kind, new.created_at)
    on conflict (event_id) do nothing;
  end if;
  return null;
end $$;
revoke all on function public.events_outbox_copy() from public, anon, authenticated;
grant execute on function public.events_outbox_copy() to service_role;
comment on function public.events_outbox_copy() is
  'After each event: a row on event_outbox when a subscription names its kind, paused or not (decision 0032, 4; 00382). One insert, no subscriber''s rule, so a bad subscriber can never roll back a customer''s message.';

create or replace function public.relay_events(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  r record;
  d record;
  v_job uuid;
begin
  for r in
    select o.event_id, o.tenant_id, o.kind, o.event_at
      from public.event_outbox o
     order by o.created_at
     limit greatest(coalesce(p_limit, 500), 1)
       for update skip locked
  loop
    -- Every subscription of the kind has its delivery; a paused one's waits, paused and with no job, until a re-drive
    -- (event_deliveries_redrive) schedules it once the subscription runs again (decision 0032, 4).
    insert into public.event_deliveries (event_id, subscriber, tenant_id, kind, event_at, state)
    select r.event_id, s.subscriber, r.tenant_id, r.kind, r.event_at,
           case when s.paused then 'paused' else 'scheduled' end
      from public.event_subscriptions s
     where s.kind = r.kind
    on conflict do nothing;
    -- One job per delivery, keyed so a second relay of the same event writes none (00333).
    for d in
      select x.subscriber, s.lane
        from public.event_deliveries x
        join public.event_subscriptions s on s.kind = r.kind and s.subscriber = x.subscriber
       where x.event_id = r.event_id and x.state = 'scheduled' and x.job_id is null
    loop
      insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
      values (r.tenant_id, 'event_deliver', now(),
              jsonb_build_object('event_id', r.event_id, 'subscriber', d.subscriber, 'kind', r.kind, 'lane', d.lane::text),
              'deliver:' || r.event_id::text || ':' || d.subscriber)
      on conflict do nothing
      returning id into v_job;
      if v_job is not null then
        update public.event_deliveries set job_id = v_job where event_id = r.event_id and subscriber = d.subscriber;
      end if;
    end loop;
    delete from public.event_outbox where event_id = r.event_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.relay_events(integer) from public, anon, authenticated;
grant execute on function public.relay_events(integer) to service_role;
comment on function public.relay_events(integer) is
  'The first step of every tick (decision 0032): takes up to p_limit outbox rows under skip locked, oldest first and with no cursor, writes one delivery per subscriber, a paused one''s held as paused with no job until a re-drive (00382), and one event_deliver job for each other (keyed, so a second relay writes none), and takes the rows off the outbox. Answers how many events it relayed.';
