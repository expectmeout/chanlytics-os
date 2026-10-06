-- 00333 · A fact's event reaches its subscribers after the commit.
--
-- Decision 0031, steps 1 to 3 (the SQL half; the kind's handler, its caller and the audit subscriber ride with it in
-- packages/jobs and apps/edge). The events ledger had no reader that acts: no table named a subscriber of a kind, and
-- no trigger woke a reader. Now:
--
--   events.aggregate_version   the record's version the event was written at, for a projector that applies by version
--                              (nullable: only a mutable record has one; nothing writes it yet);
--   events.causation_id        the event this one was written in answer to (nullable; nothing writes it yet);
--   event_subscriptions        who reacts to a kind: (kind, subscriber, lane, paused), platform-wide rows, never code in
--                              a door;
--   event_outbox               one small row per event of a subscribed kind, written by events_outbox_copy in the
--                              writer's own transaction: one insert with no rule of a subscriber's that could fail it;
--   event_deliveries           one row per event and subscriber, (event_id, subscriber) its key: retried, failed and
--                              re-driven apart from every other subscriber;
--   relay_events(p_limit)      the first step of every tick: drains the outbox under skip locked with no cursor (an
--                              event whose transaction committed late is never skipped), writes one delivery per
--                              subscriber and one event_deliver job each, keyed 'deliver:<event>:<subscriber>' so a
--                              second relay of the same event writes none (jobs.dedupe_key, 00332), and takes the row
--                              off the outbox;
--   event_deliver              the job kind that carries a delivery: its lane is the subscription's, read from the
--                              payload (jobs.lane is generated, so the column is made again with one more case);
--   event_deliveries_redrive   a failed or paused delivery scheduled again, for a subscriber, by the service role;
--   the wake                   an outbox row written asks for the tick as a due job does (ask_for_tick, shared with
--                              jobs_wake from 00332), and the poll knocks when the outbox is not empty too, so a lost
--                              knock costs ten seconds and never a stuck relay;
--   relay_lag_ms               the day's number (00331) is written now: how long an event waited for its deliveries,
--                              from the delivery row's own clock against the event's, kept on the row (event_at).
--
-- One subscriber is seeded, 'audit' on message.received in lane 2: it does nothing but settle, so the relay's lag is
-- measured on real traffic before any subscriber that acts arrives (0031 step 3). A kind or a subscriber the running
-- edge does not know is kept and alarmed as an unknown job kind is today (packages/jobs ledger.ts).
--
-- The floor: the three tables are the platform's. RLS on with no policy, so only the service role reaches them, as
-- sweep_status; event_deliveries and event_outbox follow their workspace (tenant_id cascades), event_subscriptions has
-- none. Either deploy order: two nullable columns and three tables neither app reads until the edge that relays is
-- deployed, and an older edge keeps an event_deliver row it does not know. Re-runnable throughout.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------- 1. the envelope -- */

alter table public.events add column if not exists aggregate_version integer;
alter table public.events add column if not exists causation_id uuid;
comment on column public.events.aggregate_version is
  'The version of the record this event is about, as the door left it (decision 0031): a projector applies a delivery only when it is newer than what it holds. Null for a kind about nothing mutable, and for every row written before 00333.';
comment on column public.events.causation_id is
  'The event this one was written in answer to, where a reaction wrote it (decision 0031). Null for a fact that arrived from outside, and for every row written before 00333.';

/* ---------------------------------------------------------------------------- 2. the tables -- */

create table if not exists public.event_subscriptions (
  kind        text not null,
  subscriber  text not null,
  lane        smallint not null check (lane in (0, 1, 2)),
  paused      boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (kind, subscriber)
);
alter table public.event_subscriptions enable row level security;
revoke all on public.event_subscriptions from anon, authenticated;
grant all on public.event_subscriptions to service_role;
comment on table public.event_subscriptions is
  'Who reacts to an event kind (decision 0031): a subscriber''s name, the lane its deliveries run in, and whether it is paused. Platform-wide rows, written by a migration or the service role; a door never names a subscriber. RLS on with no policy: the service role alone.';

create table if not exists public.event_outbox (
  event_id   uuid primary key,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  kind       text not null,
  event_at   timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists event_outbox_created on public.event_outbox (created_at);
alter table public.event_outbox enable row level security;
revoke all on public.event_outbox from anon, authenticated;
grant all on public.event_outbox to service_role;
comment on table public.event_outbox is
  'One row per event of a subscribed kind, written in the event''s own transaction by events_outbox_copy (decision 0031), and taken off by relay_events once its deliveries are written. Empty when the relay is caught up. RLS on with no policy: the service role alone.';

create table if not exists public.event_deliveries (
  event_id    uuid not null,
  subscriber  text not null,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  kind        text not null,
  event_at    timestamptz not null,
  state       text not null default 'scheduled' check (state in ('scheduled', 'done', 'failed', 'paused')),
  job_id      uuid,
  attempts    integer not null default 0 check (attempts >= 0),
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (event_id, subscriber)
);
create index if not exists event_deliveries_tenant_created on public.event_deliveries (tenant_id, created_at);
create index if not exists event_deliveries_open on public.event_deliveries (subscriber, state) where state <> 'done';
alter table public.event_deliveries enable row level security;
revoke all on public.event_deliveries from anon, authenticated;
grant all on public.event_deliveries to service_role;
drop trigger if exists event_deliveries_set_updated_at on public.event_deliveries;
create trigger event_deliveries_set_updated_at before update on public.event_deliveries
  for each row execute function extensions.moddatetime('updated_at');
comment on table public.event_deliveries is
  'One row per event and subscriber (decision 0031): scheduled when the relay writes it and its job, done when the subscriber ran, failed when its job gave up, paused when the subscriber was paused as it ran. event_at is the event''s own clock, so relay lag is one subtraction. RLS on with no policy: the service role alone.';

/* ------------------------------------------------------------------------------ 3. the copy -- */

-- In the writer's transaction: one insert, with no rule of a subscriber's that could refuse the writer.
create or replace function public.events_outbox_copy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.event_subscriptions s where s.kind = new.kind and not s.paused) then
    insert into public.event_outbox (event_id, tenant_id, kind, event_at)
         values (new.id, new.tenant_id, new.kind, new.created_at)
    on conflict (event_id) do nothing;
  end if;
  return null;
end $$;
revoke all on function public.events_outbox_copy() from public, anon, authenticated;
grant execute on function public.events_outbox_copy() to service_role;
comment on function public.events_outbox_copy() is
  'After each event: a row on event_outbox when a subscription names its kind and is not paused (decision 0031). One insert, no subscriber''s rule, so a bad subscriber can never roll back a customer''s message.';

drop trigger if exists events_outbox_copy on public.events;
create trigger events_outbox_copy
  after insert on public.events
  for each row
  execute function public.events_outbox_copy();

/* ------------------------------------------------------------------------------ 4. the wake -- */

-- The ask, shared by every row that wants the tick: one a second, never waiting (00332's jobs_wake, now in one place).
create or replace function public.ask_for_tick()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
     from public.sweep_status s
    where s.sweep = 'jobs' and (s.woken_at is null or s.woken_at < now() - interval '1 second')
      for update skip locked;
  if not found then
    return false;
  end if;
  update public.sweep_status set woken_at = now() where sweep = 'jobs';
  perform public.request_sweep('jobs', '/api/jobs/tick');
  return true;
end $$;
revoke all on function public.ask_for_tick() from public, anon, authenticated;
grant execute on function public.ask_for_tick() to service_role;
comment on function public.ask_for_tick() is
  'Asks the edge for one tick through request_sweep, at most once a second (sweep_status.woken_at) and never waiting on another asker (00332, 00333). True when it asked.';

create or replace function public.jobs_wake()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from new_rows r where r.state = 'scheduled' and r.due_at <= now() + interval '2 seconds') then
    perform public.ask_for_tick();
  end if;
  return null;
end $$;

revoke all on function public.jobs_wake() from public, anon, authenticated;
grant execute on function public.jobs_wake() to service_role;

create or replace function public.event_outbox_wake()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ask_for_tick();
  return null;
end $$;
revoke all on function public.event_outbox_wake() from public, anon, authenticated;
grant execute on function public.event_outbox_wake() to service_role;
comment on function public.event_outbox_wake() is
  'After a statement writes event_outbox: the relay runs first in every tick, so an outbox row asks for one (00333).';

drop trigger if exists event_outbox_wake on public.event_outbox;
create trigger event_outbox_wake
  after insert on public.event_outbox
  referencing new table as new_rows
  for each statement
  execute function public.event_outbox_wake();

-- The poll knocks when the outbox is not empty too: a knock pg_net lost costs ten seconds, never a stuck relay.
create or replace function public.trigger_jobs_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (
    select 1 from public.jobs
     where (state = 'scheduled' and due_at <= now())
        or (state = 'fired' and lease_until < now())
  ) or exists (select 1 from public.event_outbox) then
    return public.request_sweep('jobs', '/api/jobs/tick');
  end if;
  -- Nothing due: the look itself is the evidence. requested_at moves;
  -- request_id and note stay as the last real call left them, so a failed
  -- answer or a missing Vault secret stays visible until a call succeeds.
  insert into public.sweep_status (sweep, requested_at) values ('jobs', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

/* ------------------------------------------------------------------------------ 5. the kind -- */

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver'));

-- The lane is generated, so the column is made again with one more case: a delivery runs in its subscription's lane.
alter table public.jobs drop column if exists lane;
alter table public.jobs add column lane smallint generated always as (
  case
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
) stored;
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read), 2 bulk. Generated from kind and payload; an event_deliver runs in its subscription''s lane (payload.lane, 00333); null for a kind the case does not name, claimed last.';

/* ----------------------------------------------------------------------------- 6. the relay -- */

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
    insert into public.event_deliveries (event_id, subscriber, tenant_id, kind, event_at)
    select r.event_id, s.subscriber, r.tenant_id, r.kind, r.event_at
      from public.event_subscriptions s
     where s.kind = r.kind and not s.paused
    on conflict do nothing;
    -- One job per delivery, keyed so a second relay of the same event writes none (00332).
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
  'The first step of every tick (decision 0031): takes up to p_limit outbox rows under skip locked, oldest first and with no cursor, writes one delivery per unpaused subscriber and one event_deliver job each (keyed, so a second relay writes none), and takes the rows off the outbox. Answers how many events it relayed.';

create or replace function public.event_deliveries_redrive(p_subscriber text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  d record;
  v_job uuid;
begin
  for d in
    select x.event_id, x.subscriber, x.tenant_id, x.kind, s.lane
      from public.event_deliveries x
      join public.event_subscriptions s on s.kind = x.kind and s.subscriber = x.subscriber
     where x.subscriber = p_subscriber and x.state in ('failed', 'paused')
       for update of x skip locked
  loop
    insert into public.jobs (tenant_id, kind, due_at, payload, dedupe_key)
    values (d.tenant_id, 'event_deliver', now(),
            jsonb_build_object('event_id', d.event_id, 'subscriber', d.subscriber, 'kind', d.kind, 'lane', d.lane::text),
            'deliver:' || d.event_id::text || ':' || d.subscriber)
    on conflict do nothing
    returning id into v_job;
    if v_job is not null then
      update public.event_deliveries
         set state = 'scheduled', job_id = v_job, last_error = null
       where event_id = d.event_id and subscriber = d.subscriber;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.event_deliveries_redrive(text) from public, anon, authenticated;
grant execute on function public.event_deliveries_redrive(text) to service_role;
comment on function public.event_deliveries_redrive(text) is
  'Every failed or paused delivery of one subscriber, scheduled again with a fresh event_deliver job (decision 0031): the re-drive, the service role''s. Answers how many.';

/* ------------------------------------------------------------------ 7. the first subscriber -- */

-- The audit subscriber settles and does nothing else, so the relay's lag is measured on real traffic first.
insert into public.event_subscriptions (kind, subscriber, lane)
values ('message.received', 'audit', 2)
on conflict (kind, subscriber) do nothing;

/* -------------------------------------------------------------------------- 8. the day's number -- */

create or replace function public.platform_metrics_roll(p_day date default ((now() at time zone 'utc')::date - 1))
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_t0 timestamptz := p_day::timestamp at time zone 'utc';
  v_t1 timestamptz := (p_day + 1)::timestamp at time zone 'utc';
  v_n  integer;
  v_new integer;
begin
  -- The first statement is 00277's, byte for byte in what it counts.
  with
  -- Workspace by workspace, so each read is its (tenant_id, created_at) index's day (00016), never the whole table.
  msg_counts as (
    select t.id as tenant_id, m.channel,
           count(*) filter (where m.direction = 'inbound' and m.sender = 'customer') as n_in,
           count(*) filter (where m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read')) as n_out
      from public.tenants t
      join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
     where coalesce(m.meta->>'backfill', 'false') <> 'true'
     group by t.id, m.channel
  ),
  msg as (
    select c.tenant_id,
           coalesce(jsonb_object_agg(c.channel, c.n_in) filter (where c.n_in > 0), '{}'::jsonb) as messages_in,
           coalesce(jsonb_object_agg(c.channel, c.n_out) filter (where c.n_out > 0), '{}'::jsonb) as messages_out
      from msg_counts c
     group by c.tenant_id
  ),
  -- The receptionist's own record of each reply (usage.llm_tokens with its quality signal): handed off, held for the
  -- veto window or low confidence, or answered at once. A reach-out reply's draft carries no `held` and is not one.
  replies as (
    select e.tenant_id,
           count(*) filter (where e.data->>'escalate' = 'true') as handed_off,
           count(*) filter (where coalesce(e.data->>'escalate', 'false') <> 'true' and e.data->>'held' is not null)
             as held,
           count(*) filter (where coalesce(e.data->>'escalate', 'false') <> 'true' and e.data->>'held' is null)
             as answered,
           percentile_cont(0.95) within group (
             order by case when e.data->>'latency_ms' ~ '^[0-9]+(\.[0-9]+)?$' then (e.data->>'latency_ms')::numeric end
           ) as p95
      from public.events e
     where e.kind = 'usage.llm_tokens' and e.created_at >= v_t0 and e.created_at < v_t1 and e.data ? 'held'
     group by e.tenant_id
  ),
  tokens as (
    select e.tenant_id,
           sum(case when e.data->>'input_tokens' ~ '^[0-9]+$' then (e.data->>'input_tokens')::bigint else 0 end
             + case when e.data->>'output_tokens' ~ '^[0-9]+$' then (e.data->>'output_tokens')::bigint else 0 end)
             as tokens
      from public.events e
     where e.kind in ('usage.llm_tokens', 'usage.ask_tokens') and e.created_at >= v_t0 and e.created_at < v_t1
     group by e.tenant_id
  ),
  -- A send that failed, by what it came to (channels providerFetch's outcomes): `unknown` is said on the row; of the
  -- rest, the provider's "not now" (408, 429) and no answer at all are calls that left nothing, any other 4xx a refusal.
  failure_rows as (
    select e.tenant_id,
           coalesce(e.data->>'outcome',
                    case when e.data->>'http_status' in ('408', '429') then 'retryable'
                         when e.data->>'http_status' ~ '^4[0-9][0-9]$' then 'refused'
                         when coalesce(e.data->>'http_status', '0') = '0' then 'retryable'
                         else 'unknown' end) as outcome
      from public.events e
     where e.kind = 'message.send_failed' and e.created_at >= v_t0 and e.created_at < v_t1
  ),
  failures as (
    select f.tenant_id, jsonb_object_agg(f.outcome, f.n) as provider_failures
      from (select tenant_id, outcome, count(*) as n from failure_rows group by tenant_id, outcome) f
     group by f.tenant_id
  ),
  active as (
    select tenant_id from msg union select tenant_id from replies
    union select tenant_id from tokens union select tenant_id from failures
  ),
  -- Customers' messages that day and whether anyone answered them (first_replies, the reports' one definition).
  asked as (
    select a.tenant_id, count(r.asked_at) as asks, count(r.asked_at) filter (where r.who in ('ai', 'you')) as answered
      from active a
      left join lateral public.first_replies(a.tenant_id, v_t0) r on r.asked_at < v_t1
     group by a.tenant_id
  ),
  written as (
    insert into public.platform_metrics as pm (
      tenant_id, day, messages_in, messages_out, asks, answered, replies_answered, replies_held, replies_handed_off,
      brain_p95_ms, provider_failures, tokens, rolled_at)
    select a.tenant_id, p_day,
           coalesce(m.messages_in, '{}'::jsonb), coalesce(m.messages_out, '{}'::jsonb),
           coalesce(q.asks, 0), coalesce(q.answered, 0),
           coalesce(r.answered, 0), coalesce(r.held, 0), coalesce(r.handed_off, 0),
           round(r.p95)::integer, coalesce(f.provider_failures, '{}'::jsonb), coalesce(t.tokens, 0), now()
      from active a
      left join msg m on m.tenant_id = a.tenant_id
      left join replies r on r.tenant_id = a.tenant_id
      left join tokens t on t.tenant_id = a.tenant_id
      left join failures f on f.tenant_id = a.tenant_id
      left join asked q on q.tenant_id = a.tenant_id
     where exists (select 1 from public.tenants x where x.id = a.tenant_id)
    on conflict (tenant_id, day) do update
       set messages_in = excluded.messages_in, messages_out = excluded.messages_out, asks = excluded.asks,
           answered = excluded.answered, replies_answered = excluded.replies_answered,
           replies_held = excluded.replies_held, replies_handed_off = excluded.replies_handed_off,
           brain_p95_ms = excluded.brain_p95_ms, provider_failures = excluded.provider_failures,
           tokens = excluded.tokens, rolled_at = excluded.rolled_at
    returning 1
  )
  select count(*)::integer into v_n from written;

  -- The second keeps what the lenses read, and fails alone.
  begin
    with
    stamped as (
      select t.id as tenant_id, m.meta ->> 'handled' as handled, count(*) as n
        from public.tenants t
        join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
       where m.direction = 'inbound' and m.sender = 'customer'
         and coalesce(m.meta ->> 'backfill', 'false') <> 'true'
         and m.meta ->> 'handled' in ('ai', 'held', 'handoff', 'blocked')
       group by t.id, m.meta ->> 'handled'
    ),
    handled as (
      select s.tenant_id, jsonb_object_agg(s.handled, s.n) as counts from stamped s group by s.tenant_id
    ),
    asked_about as (
      select t.id as tenant_id, m.meta ->> 'intent' as topic, count(*) as n
        from public.tenants t
        join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
       where m.direction = 'inbound' and m.sender = 'customer'
         and coalesce(m.meta ->> 'backfill', 'false') <> 'true'
         and m.meta ->> 'intent' in ('booking', 'pricing', 'money', 'hours', 'services', 'location', 'complaint', 'smalltalk', 'other')
       group by t.id, m.meta ->> 'intent'
      union all
      select t.id, c.analysis ->> 'topic', count(*)
        from public.tenants t
        join public.calls c on c.tenant_id = t.id and c.started_at >= v_t0 and c.started_at < v_t1
       where c.direction = 'inbound' and public.call_connected(c.status, c.duration_ms)
         and c.analysis ->> 'topic' in ('booking', 'pricing', 'money', 'hours', 'services', 'location', 'complaint', 'smalltalk', 'other')
       group by t.id, c.analysis ->> 'topic'
    ),
    topics as (
      select a.tenant_id, jsonb_object_agg(a.topic, a.n) as counts
        from (select tenant_id, topic, sum(n)::bigint as n from asked_about group by tenant_id, topic) a
       group by a.tenant_id
    ),
    ledger as (
      select u.tenant_id, u.purpose,
             sum(u.input_tokens::bigint + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens)::bigint as tokens,
             sum(u.usd) as usd
        from public.ai_usage u
       where u.created_at >= v_t0 and u.created_at < v_t1 and not u.shadow
       group by u.tenant_id, u.purpose
    ),
    ai as (
      select l.tenant_id,
             sum(l.tokens)::bigint as tokens,
             jsonb_object_agg(l.purpose, l.tokens) as tokens_by,
             jsonb_object_agg(l.purpose, round(l.usd, 6)) filter (where l.usd is not null) as usd_by
        from ledger l
       group by l.tenant_id
    ),
    voice as (
      select t.id as tenant_id, round(sum(public.call_cost_usd(c.cost)), 6) as usd
        from public.tenants t
        join public.calls c on c.tenant_id = t.id and c.started_at >= v_t0 and c.started_at < v_t1
       where public.call_cost_usd(c.cost) is not null
       group by t.id
    ),
    lenses as (
      select tenant_id from handled union select tenant_id from topics
      union select tenant_id from ai union select tenant_id from voice
    ),
    kept as (
      insert into public.platform_metrics as pm (tenant_id, day, handled, topics, ai_tokens, ai_usd, voice_usd, tokens, rolled_at)
      select l.tenant_id, p_day, h.counts, tp.counts, ai.tokens_by, ai.usd_by, vc.usd, coalesce(ai.tokens, 0), now()
        from lenses l
        left join handled h on h.tenant_id = l.tenant_id
        left join topics tp on tp.tenant_id = l.tenant_id
        left join ai on ai.tenant_id = l.tenant_id
        left join voice vc on vc.tenant_id = l.tenant_id
       where exists (select 1 from public.tenants x where x.id = l.tenant_id)
      on conflict (tenant_id, day) do update
         set handled = excluded.handled, topics = excluded.topics, ai_tokens = excluded.ai_tokens,
             ai_usd = excluded.ai_usd, voice_usd = excluded.voice_usd,
             -- the ledger's total where it holds the day, the events' count (the first statement's) where it does not
             tokens = case when excluded.ai_tokens is not null then excluded.tokens else pm.tokens end,
             rolled_at = excluded.rolled_at
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted)::integer into v_new from kept;
    v_n := v_n + coalesce(v_new, 0);
  exception when others then
    raise warning 'platform_metrics_roll: the lenses'' columns were not kept for %: %', p_day, sqlerrm;
  end;

  -- The third keeps the spine's numbers (00331, decision 0030's Phase 0; relay lag since 00333), and fails alone too.
  begin
    with
    -- How long a job waited for the ledger past its due time, by lane, at the 95th percentile: a first claim only
    -- (attempts = 1), since a later claim is a retry or a lease that ran out, not a wait in the queue, and the row keeps
    -- only its newest claim's time (jobs.fired_at). A kind with no lane is 'none'.
    waited as (
      select j.tenant_id, coalesce(j.lane::text, 'none') as lane,
             percentile_cont(0.95) within group (order by extract(epoch from (j.fired_at - j.due_at)) * 1000) as p95
        from public.jobs j
       where j.fired_at >= v_t0 and j.fired_at < v_t1 and j.attempts = 1
       group by j.tenant_id, j.lane
    ),
    waits as (
      select w.tenant_id, jsonb_object_agg(w.lane, greatest(round(w.p95)::integer, 0)) as counts
        from waited w
       group by w.tenant_id
    ),
    -- How long a customer waited for the first answer in their thread, by channel, at the 95th percentile: the next
    -- outbound row after each of their messages, whoever wrote it. An ask nobody ever answered is asks less answered,
    -- not a wait here.
    answered_in as (
      select t.id as tenant_id, m.channel,
             percentile_cont(0.95) within group (order by extract(epoch from (a.created_at - m.created_at)) * 1000) as p95
        from public.tenants t
        join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
        join lateral (
          select o.created_at
            from public.messages o
           where o.conversation_id = m.conversation_id and o.direction = 'outbound' and o.created_at > m.created_at
           order by o.created_at
           limit 1
        ) a on true
       where m.direction = 'inbound' and m.sender = 'customer'
         and coalesce(m.meta ->> 'backfill', 'false') <> 'true'
       group by t.id, m.channel
    ),
    first_answer as (
      select a.tenant_id, jsonb_object_agg(a.channel, greatest(round(a.p95)::integer, 0)) as counts
        from answered_in a
       group by a.tenant_id
    ),
    -- The same words sent to one thread within a minute of the last time: the later send is the duplicate. The minute
    -- before the day is read too, so a pair across midnight is counted once, in the day of its second.
    sent as (
      select t.id as tenant_id, m.created_at,
             lag(m.created_at) over (partition by m.conversation_id, m.body order by m.created_at) as prev_at
        from public.tenants t
        join public.messages m
          on m.tenant_id = t.id and m.created_at >= v_t0 - interval '1 minute' and m.created_at < v_t1
       where m.direction = 'outbound' and coalesce(m.body, '') <> ''
    ),
    doubled as (
      select s.tenant_id,
             count(*) filter (where s.prev_at is not null and s.created_at - s.prev_at < interval '1 minute')::integer as n
        from sent s
       where s.created_at >= v_t0
       group by s.tenant_id
    ),
    -- The jobs that died that day, by kind: failed is final (jobs_guard), so a failed row's newest change is its death.
    died as (
      select d.tenant_id, jsonb_object_agg(d.kind, d.n) as counts
        from (select j.tenant_id, j.kind, count(*)::integer as n
                from public.jobs j
               where j.state = 'failed' and j.updated_at >= v_t0 and j.updated_at < v_t1
               group by j.tenant_id, j.kind) d
       group by d.tenant_id
    ),
    -- How long an event waited for the relay to write its deliveries, at the 95th percentile (00333, decision 0031):
    -- the delivery row's own clock against the event's, kept on the row so the day's read joins no partition.
    relayed as (
      select d.tenant_id,
             percentile_cont(0.95) within group (order by extract(epoch from (d.created_at - d.event_at)) * 1000) as p95
        from public.event_deliveries d
       where d.created_at >= v_t0 and d.created_at < v_t1
       group by d.tenant_id
    ),
    spine as (
      select tenant_id from waits union select tenant_id from first_answer
      union select tenant_id from doubled union select tenant_id from died
      union select tenant_id from relayed
    ),
    kept as (
      insert into public.platform_metrics as pm
        (tenant_id, day, job_lag_ms, first_answer_ms, duplicate_sends, dead_letters, relay_lag_ms, rolled_at)
      select s.tenant_id, p_day, w.counts, f.counts, d.n, x.counts,
             case when rl.p95 is null then null else greatest(round(rl.p95)::integer, 0) end, now()
        from spine s
        left join waits w on w.tenant_id = s.tenant_id
        left join first_answer f on f.tenant_id = s.tenant_id
        left join doubled d on d.tenant_id = s.tenant_id
        left join died x on x.tenant_id = s.tenant_id
        left join relayed rl on rl.tenant_id = s.tenant_id
       where exists (select 1 from public.tenants y where y.id = s.tenant_id)
      on conflict (tenant_id, day) do update
         set job_lag_ms = excluded.job_lag_ms, first_answer_ms = excluded.first_answer_ms,
             duplicate_sends = excluded.duplicate_sends, dead_letters = excluded.dead_letters,
             relay_lag_ms = excluded.relay_lag_ms, rolled_at = excluded.rolled_at
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted)::integer into v_new from kept;
    v_n := v_n + coalesce(v_new, 0);
  exception when others then
    raise warning 'platform_metrics_roll: the spine''s numbers were not kept for %: %', p_day, sqlerrm;
  end;
  return v_n;
end $$;
revoke all on function public.platform_metrics_roll(date) from public, anon, authenticated;
grant execute on function public.platform_metrics_roll(date) to service_role;
comment on function public.platform_metrics_roll(date) is
  'Counts one UTC day (yesterday by default) for every workspace that did anything in it into platform_metrics, replacing the day''s rows (00277), then keeps what the lenses read (00316), then the spine''s five numbers (00331; relay lag since 00333): how each customer message ended, what they asked about, the model''s tokens and dollars by purpose and what the calls cost (00316), in a block that fails alone. Answers how many rows it wrote. The nightly clock''s, and the service role''s to re-run a day: not a day older than the events'' thirty, whose event-derived columns it would empty.';
