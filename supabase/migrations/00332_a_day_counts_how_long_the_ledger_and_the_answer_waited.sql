-- 00332 · A day counts how long the ledger and the answer waited, the sends that doubled and the jobs that died.
--
-- Decision 0031 (records, events, reactions and doors), Phase 0: five numbers in SQL before anything moves, so Phase 1's
-- spine is measured against a day it can be compared with. Each is a column of platform_metrics (00277: one UTC day of
-- one workspace, rolled nightly on its registered clock), read by the back office beside the day's other counts:
--
--   job_lag_ms       {lane: ms}     how long a job waited for the ledger past its due time, by lane (jobs.lane, 00281),
--                                   at the 95th percentile, counting first claims only: the row keeps its newest claim's
--                                   time, and a later claim is a retry or a lease that ran out, not a wait in the queue;
--   first_answer_ms  {channel: ms}  how long a customer waited for the first answer in their thread, by channel, at the
--                                   95th percentile, whoever answered; an ask nobody answered is asks less answered;
--   duplicate_sends  n              outbound rows with the same words to one thread within a minute of the last: the
--                                   later one is the duplicate, and a pair across midnight counts once, on its second's day;
--   dead_letters     {kind: n}      the jobs that died that day, by kind (state failed, which jobs_guard keeps final);
--   relay_lag_ms     ms             how long an event waited for its deliveries (decision 0032): the column is here so
--                                   the day has its place; the relay's own migration writes it, and until then it is null.
--
-- A day nothing said anything about is null, never zero or {} (00316's rule); a workspace that sent and sent nothing
-- twice has 0 duplicates. The roll is three statements now: 00277's day and 00316's lenses unchanged, then this one in a
-- block that traps its own failure, so a surprising row costs these columns alone. platform_metrics_read answers the five
-- beside the rest; its return type grows, so it is dropped and made again with the same grants (service role only).
--
-- Re-runnable: columns and comments if not exists, the functions replaced, the drop guarded.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------- 1. the columns -- */

alter table public.platform_metrics add column if not exists job_lag_ms      jsonb   check (job_lag_ms      is null or jsonb_typeof(job_lag_ms)      = 'object');
alter table public.platform_metrics add column if not exists first_answer_ms jsonb   check (first_answer_ms is null or jsonb_typeof(first_answer_ms) = 'object');
alter table public.platform_metrics add column if not exists duplicate_sends integer check (duplicate_sends is null or duplicate_sends >= 0);
alter table public.platform_metrics add column if not exists dead_letters    jsonb   check (dead_letters    is null or jsonb_typeof(dead_letters)    = 'object');
alter table public.platform_metrics add column if not exists relay_lag_ms    integer check (relay_lag_ms    is null or relay_lag_ms >= 0);

comment on column public.platform_metrics.job_lag_ms is
  'How long a job waited for the ledger past its due time that day, by lane (jobs.lane: 0 a reply, 1 someone waiting, 2 bulk, none), at the 95th percentile in milliseconds, first claims only (00332). Null for a day with no claim.';
comment on column public.platform_metrics.first_answer_ms is
  'How long a customer waited for the first answer in their thread that day, by channel, at the 95th percentile in milliseconds, whoever answered (00332). Null for a day no customer was answered in.';
comment on column public.platform_metrics.duplicate_sends is
  'Outbound rows that day with the same words to one thread within a minute of the last: the later one is the duplicate (00332). Null for a day nothing was sent in.';
comment on column public.platform_metrics.dead_letters is
  'The jobs that died that day, by kind: state failed, which jobs_guard keeps final (00332). Null for a day none died in.';
comment on column public.platform_metrics.relay_lag_ms is
  'How long an event waited for its deliveries that day, at the 95th percentile in milliseconds (decision 0032): written by the relay''s own migration, null until then (00332).';

/* ---------------------------------------------------------------------------- 2. the roll -- */

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

  -- The third keeps the spine's numbers (00332, decision 0031's Phase 0), and fails alone too.
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
    spine as (
      select tenant_id from waits union select tenant_id from first_answer
      union select tenant_id from doubled union select tenant_id from died
    ),
    kept as (
      insert into public.platform_metrics as pm
        (tenant_id, day, job_lag_ms, first_answer_ms, duplicate_sends, dead_letters, rolled_at)
      select s.tenant_id, p_day, w.counts, f.counts, d.n, x.counts, now()
        from spine s
        left join waits w on w.tenant_id = s.tenant_id
        left join first_answer f on f.tenant_id = s.tenant_id
        left join doubled d on d.tenant_id = s.tenant_id
        left join died x on x.tenant_id = s.tenant_id
       where exists (select 1 from public.tenants y where y.id = s.tenant_id)
      on conflict (tenant_id, day) do update
         set job_lag_ms = excluded.job_lag_ms, first_answer_ms = excluded.first_answer_ms,
             duplicate_sends = excluded.duplicate_sends, dead_letters = excluded.dead_letters,
             rolled_at = excluded.rolled_at
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
  'Counts one UTC day (yesterday by default) for every workspace that did anything in it into platform_metrics, replacing the day''s rows (00277), then keeps what the lenses read (00316), then the spine''s five numbers (00332): how each customer message ended, what they asked about, the model''s tokens and dollars by purpose and what the calls cost (00316), in a block that fails alone. Answers how many rows it wrote. The nightly clock''s, and the service role''s to re-run a day: not a day older than the events'' thirty, whose event-derived columns it would empty.';


/* ---------------------------------------------------------------------------- 3. the read -- */

-- The return type grows, so the function is made again: the same body, the same grants, five more columns.
drop function if exists public.platform_metrics_read(integer);
create function public.platform_metrics_read(p_days integer default 7)
returns table (
  tenant_id uuid, name text, day date, messages_in jsonb, messages_out jsonb, asks integer, answered integer,
  replies_answered integer, replies_held integer, replies_handed_off integer, brain_p95_ms integer,
  provider_failures jsonb, tokens bigint,
  job_lag_ms jsonb, first_answer_ms jsonb, duplicate_sends integer, dead_letters jsonb, relay_lag_ms integer)
language sql
stable
set search_path = public
as $$
  select pm.tenant_id, t.name, pm.day, pm.messages_in, pm.messages_out, pm.asks, pm.answered, pm.replies_answered,
         pm.replies_held, pm.replies_handed_off, pm.brain_p95_ms, pm.provider_failures, pm.tokens,
         pm.job_lag_ms, pm.first_answer_ms, pm.duplicate_sends, pm.dead_letters, pm.relay_lag_ms
    from public.platform_metrics pm
    join public.tenants t on t.id = pm.tenant_id
   where pm.day > (now() at time zone 'utc')::date - greatest(least(coalesce(p_days, 7), 90), 1) - 1
   order by pm.day desc, pm.asks desc, t.name
$$;
revoke all on function public.platform_metrics_read(integer) from public, anon, authenticated;
grant execute on function public.platform_metrics_read(integer) to service_role;
comment on function public.platform_metrics_read(integer) is
  'The back office''s read of platform_metrics (00277): the last p_days rolled days (at most 90), each workspace''s row with its name, newest day first, the spine''s five numbers beside the rest (00332).';
