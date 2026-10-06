-- 00337 · A day counts how long a provider's delivery waited to be taken in.
--
-- Decision 0032, step 4's last part: the intake ledger (provider_events, 00336) makes intake lag a number. A column of
-- platform_metrics (00277: one UTC day of one workspace, rolled nightly on its registered clock), read by the back
-- office beside the spine's other numbers:
--
--   intake_lag_ms  {provider: ms}  how long after the provider's own clock said a thing happened a door kept the
--                                  delivery that told of it, by provider, at the 95th percentile. Counted where the
--                                  provider stamps its event and the delivery names a workspace: Meta's message and
--                                  status times, by the number each came to; Retell's call times; Resend's created_at.
--                                  Twilio stamps nothing it sends, so texts and their receipts are not counted.
--
-- It measures the provider's queue and its retries as much as this edge: a door that was down shows as a wait when
-- the provider tries again. A day nothing stamped arrived in is null (00316's rule), and a provider's clock ahead of ours
-- reads as no wait. The roll gains a fourth block that traps its own failure, so a body it cannot read costs this column
-- alone; 00277's, 00316's and 00332's statements are unchanged. The roll is copied from its latest migration (00334)
-- with only that block and its comment changed. platform_metrics_read answers the column beside the rest; its return
-- type grows, so it is dropped and made again with the same grants (service role only).
--
-- Either deploy order: a column nobody reads until the dashboard's reader names it, and a reader that answers one more.
-- Re-runnable: the column and its comment if not exists, the functions replaced, the drop guarded.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------ 1. the column -- */

alter table public.platform_metrics add column if not exists intake_lag_ms jsonb
  check (intake_lag_ms is null or jsonb_typeof(intake_lag_ms) = 'object');

comment on column public.platform_metrics.intake_lag_ms is
  'How long after the provider''s own clock said it happened a door kept its delivery that day, by provider (meta, retell, resend), at the 95th percentile in milliseconds, from the intake ledger (00337, decision 0032). Twilio stamps nothing, so texts are not counted. Null for a day no stamped delivery arrived in.';

/* -------------------------------------------------------------------------------- 2. the roll -- */

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

  -- The third keeps the spine's numbers (00332, decision 0031's Phase 0; relay lag since 00334), and fails alone too.
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
    -- How long an event waited for the relay to write its deliveries, at the 95th percentile (00334, decision 0032):
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
  -- The fourth keeps intake lag (00337, decision 0032): how long after the provider's own clock said it happened a door
  -- kept its delivery, by provider, at the 95th percentile, read from the deliveries the intake ledger keeps a week
  -- (provider_events, 00336). Meta's message and status times, by the number each came to (tenant_channels keys a
  -- WhatsApp number on its id); Retell's call times, a start for a call that started and the end for one that ended or
  -- was analysed; Resend's created_at. Twilio stamps nothing it sends, so a text or its receipt is not counted, and
  -- neither is a body that is not the provider's JSON. A provider's clock ahead of ours reads as no wait. A day re-run
  -- after the week's purge finds nothing and leaves the number it kept. It fails alone too.
  begin
    with
    kept as materialized (
      select e.provider, e.provider_event_id, e.door, e.tenant_id, e.received_at, e.body::jsonb as doc
        from public.provider_events e
       where e.received_at >= v_t0 and e.received_at < v_t1
         and e.provider in ('meta', 'retell', 'resend')
         and e.body is json object
    ),
    met as (
      select k.received_at, v.value -> 'metadata' ->> 'phone_number_id' as number_id, t.ts
        from kept k
        cross join lateral jsonb_path_query(k.doc, 'lax $.entry[*].changes[*].value') as v(value)
        cross join lateral (
          select m.value ->> 'timestamp' as ts
            from jsonb_array_elements(case when jsonb_typeof(v.value -> 'messages') = 'array'
                                           then v.value -> 'messages' else '[]'::jsonb end) m
          union all
          select s.value ->> 'timestamp'
            from jsonb_array_elements(case when jsonb_typeof(v.value -> 'statuses') = 'array'
                                           then v.value -> 'statuses' else '[]'::jsonb end) s
        ) t
       where k.provider = 'meta' and jsonb_typeof(v.value) = 'object'
    ),
    called as (
      select k.tenant_id, k.received_at,
             k.doc -> 'call' ->> (case when k.provider_event_id like 'call_started:%' then 'start_timestamp'
                                       else 'end_timestamp' end) as ts
        from kept k
       where k.provider = 'retell' and k.door = '/api/retell-webhook' and k.tenant_id is not null
         and jsonb_typeof(k.doc -> 'call') = 'object'
    ),
    told as (
      select k.tenant_id, k.received_at, k.doc ->> 'created_at' as ts
        from kept k
       where k.provider = 'resend' and k.tenant_id is not null
    ),
    stamped as (
      select c.tenant_id, 'meta'::text as provider,
             extract(epoch from (m.received_at - to_timestamp(m.ts::double precision))) * 1000 as ms
        from met m
        join public.tenant_channels c on c.kind = 'whatsapp' and c.external_id = m.number_id
       where m.ts ~ '^[0-9]{9,11}$'
      union all
      select c.tenant_id, 'retell',
             extract(epoch from (c.received_at - to_timestamp(c.ts::double precision / 1000))) * 1000
        from called c
       where c.ts ~ '^[0-9]{12,14}$'
      union all
      select o.tenant_id, 'resend', extract(epoch from (o.received_at - o.ts::timestamptz)) * 1000
        from told o
       where o.ts ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
    ),
    waited as (
      select s.tenant_id, s.provider,
             percentile_cont(0.95) within group (order by greatest(s.ms, 0)) as p95
        from stamped s
       group by s.tenant_id, s.provider
    ),
    intake as (
      select w.tenant_id, jsonb_object_agg(w.provider, round(w.p95)::integer) as counts
        from waited w
       group by w.tenant_id
    ),
    written as (
      insert into public.platform_metrics as pm (tenant_id, day, intake_lag_ms, rolled_at)
      select i.tenant_id, p_day, i.counts, now()
        from intake i
       where exists (select 1 from public.tenants y where y.id = i.tenant_id)
      on conflict (tenant_id, day) do update
         set intake_lag_ms = excluded.intake_lag_ms, rolled_at = excluded.rolled_at
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted)::integer into v_new from written;
    v_n := v_n + coalesce(v_new, 0);
  exception when others then
    raise warning 'platform_metrics_roll: intake lag was not kept for %: %', p_day, sqlerrm;
  end;
  return v_n;
end $$;
revoke all on function public.platform_metrics_roll(date) from public, anon, authenticated;
grant execute on function public.platform_metrics_roll(date) to service_role;
comment on function public.platform_metrics_roll(date) is
  'Counts one UTC day (yesterday by default) for every workspace that did anything in it into platform_metrics, replacing the day''s rows (00277), then keeps what the lenses read (00316), then the spine''s five numbers (00332; relay lag since 00334): how each customer message ended, what they asked about, the model''s tokens and dollars by purpose and what the calls cost (00316), in a block that fails alone, then intake lag by provider (00337) in another. Answers how many rows it wrote. The nightly clock''s, and the service role''s to re-run a day: not a day older than the events'' thirty, whose event-derived columns it would empty; past the deliveries'' week, intake lag is left as it was kept.';


/* -------------------------------------------------------------------------------- 3. the read -- */

-- The return type grows, so the function is made again: the same body, the same grants, one more column.
drop function if exists public.platform_metrics_read(integer);
create function public.platform_metrics_read(p_days integer default 7)
returns table (
  tenant_id uuid, name text, day date, messages_in jsonb, messages_out jsonb, asks integer, answered integer,
  replies_answered integer, replies_held integer, replies_handed_off integer, brain_p95_ms integer,
  provider_failures jsonb, tokens bigint,
  job_lag_ms jsonb, first_answer_ms jsonb, duplicate_sends integer, dead_letters jsonb, relay_lag_ms integer,
  intake_lag_ms jsonb)
language sql
stable
set search_path = public
as $$
  select pm.tenant_id, t.name, pm.day, pm.messages_in, pm.messages_out, pm.asks, pm.answered, pm.replies_answered,
         pm.replies_held, pm.replies_handed_off, pm.brain_p95_ms, pm.provider_failures, pm.tokens,
         pm.job_lag_ms, pm.first_answer_ms, pm.duplicate_sends, pm.dead_letters, pm.relay_lag_ms, pm.intake_lag_ms
    from public.platform_metrics pm
    join public.tenants t on t.id = pm.tenant_id
   where pm.day > (now() at time zone 'utc')::date - greatest(least(coalesce(p_days, 7), 90), 1) - 1
   order by pm.day desc, pm.asks desc, t.name
$$;
revoke all on function public.platform_metrics_read(integer) from public, anon, authenticated;
grant execute on function public.platform_metrics_read(integer) to service_role;
comment on function public.platform_metrics_read(integer) is
  'The back office''s read of platform_metrics (00277): the last p_days rolled days (at most 90), each workspace''s row with its name, newest day first, the spine''s five numbers (00332) and intake lag (00337) beside the rest.';
