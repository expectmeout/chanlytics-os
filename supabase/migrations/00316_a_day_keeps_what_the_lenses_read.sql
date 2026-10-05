-- 00316 · A day keeps what the lenses read.
--
-- The Reports lenses spec, K10, and the first clause of K8. The nightly roll (00277) counted a workspace's day from
-- events that are purged at thirty days, and kept nothing the receptionist did: how each customer's message ended, what
-- they asked about, what the model's tokens went on, what the day's calls cost. Five columns now keep them, read from rows
-- that last: handled (messages.meta.handled, K1: ai, held, handoff or blocked), topics (messages.meta.intent and a
-- connected inbound call's analysis.topic, K1 and K2: the nine words of contracts BRAIN_INTENTS), ai_tokens and ai_usd
-- (the ledger, 00273, by purpose, the workspace's own calls and never a shadow's), and voice_usd (calls.cost: Retell's
-- call_cost.combined_cost is in cents, and call_cost_usd is the one place the product says what a call cost in dollars).
-- The dollars are the operator's, and stay in this service-role table: workspace_days (00317) is what an owner may read.
--
-- tokens now reads the ledger where the ledger holds the day for the workspace, so it counts a call once, and the events'
-- count otherwise (a day before the ledger reads as it did). It RISES on the first night after this lands: the events
-- never counted every model call (four paths wrote no usage event, which is why the ledger exists), and the ledger does.
-- A step up in a back-office chart that night is the true number, not a fault.
--
-- A day nothing said anything about is null, never {} and never zero; no word outside its closed set becomes a key; a
-- call cost that is not a number, is below nothing or is past a hundred thousand dollars is no cost. SQL repeats two
-- closed sets here (the four handled words, the nine topics); a database test holds them to contracts' sets, so a new
-- topic in contracts fails it until the roll's list is widened in a new migration.
--
-- The roll is two statements. The first is 00277's day, unchanged: the operator's answer-silence alarm and the back
-- office's card read it, and neither may ever depend on the new columns. The second keeps the five columns, in a block
-- that traps its own failure, so a surprising row costs the new columns alone: the block raises a warning and the roll
-- still answers (a database test forces that failure and proves the day's existing columns are written). A workspace
-- with only new facts (a day of calls and nothing else) gets its row from the second statement, and the answer counts it
-- the run that makes it; a re-run of that day updates the row and does not count it again.
--
-- Old days read absent, never zero: nothing is backfilled, a row rolled before this migration has null in all five and
-- tokens as the events counted it, and nothing here re-runs the roll for an old day. Re-running a day replaces the five
-- columns of every workspace that still has something to say that day (one whose sources were erased since keeps what
-- it kept), and the first statement's columns with what the events still say: the event-derived columns (replies_*,
-- brain_p95_ms, provider_failures, and tokens where the ledger is empty) cannot be re-rolled for a day older than
-- thirty, since their events are purged: re-run one and they are replaced with nothing. The five can be re-rolled for
-- any day whose messages, calls and ledger rows still exist. The nightly roll rolls yesterday only. Days are UTC, as
-- 00277: a lens in a workspace's own zone cannot re-bucket a day, so a month-on-month is exact to the day's edge, not
-- to the minute.
--
-- Either deploy order works (nothing reads the columns yet). platform_metrics is written once a night: its lock is
-- brief and the guard of 00259 is set.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------- 1. the columns -- */

alter table public.platform_metrics add column if not exists handled   jsonb check (handled   is null or jsonb_typeof(handled)   = 'object');
alter table public.platform_metrics add column if not exists topics    jsonb check (topics    is null or jsonb_typeof(topics)    = 'object');
alter table public.platform_metrics add column if not exists ai_tokens jsonb check (ai_tokens is null or jsonb_typeof(ai_tokens) = 'object');
alter table public.platform_metrics add column if not exists ai_usd    jsonb check (ai_usd    is null or jsonb_typeof(ai_usd)    = 'object');
alter table public.platform_metrics add column if not exists voice_usd numeric(12, 6) check (voice_usd is null or voice_usd >= 0);

comment on column public.platform_metrics.handled is
  'How the day''s customer messages ended (K10): counts of meta.handled (ai, held, handoff, blocked) on inbound customer messages, a key only where its count is above zero. Null where no message of the day was stamped (a day before K1 included).';
comment on column public.platform_metrics.topics is
  'What the day''s customers asked about (K10): counts by the nine BRAIN_INTENTS words, from texts'' meta.intent and connected inbound calls'' analysis.topic. Null where nothing said.';
comment on column public.platform_metrics.ai_tokens is
  'The model''s tokens of the day by purpose (K10), all four kinds, from the ledger (ai_usage), the workspace''s own calls and never a shadow''s. Null where the ledger holds none.';
comment on column public.platform_metrics.ai_usd is
  'The same by purpose in list-price dollars (K10): the operator''s, never an owner''s. A purpose with no priced call is left out; null where none was priced.';
comment on column public.platform_metrics.voice_usd is
  'What the day''s calls cost in dollars (K8): the sum of call_cost_usd over calls.cost of the calls that started that day, whatever their direction or ending. The operator''s. Null where no call carried a cost.';

/* ------------------------------------------------------------------------ 2. what a call cost -- */

create or replace function public.call_cost_usd(p_cost jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Retell's call_cost.combined_cost is in cents (its get-call reference). Not a number, below nothing, or past a hundred
  -- thousand dollars for one call is no cost: never an error and never a zero that is not the call's.
  select case when jsonb_typeof(p_cost -> 'combined_cost') = 'number'
              then case when (p_cost ->> 'combined_cost')::numeric between 0 and 9999900
                        then round((p_cost ->> 'combined_cost')::numeric / 100, 6) end
         end
$$;
revoke all on function public.call_cost_usd(jsonb) from public, anon;
grant execute on function public.call_cost_usd(jsonb) to authenticated, service_role;
comment on function public.call_cost_usd(jsonb) is
  'A call''s cost in dollars from the provider''s own call_cost (K8): combined_cost, in cents, divided by a hundred; null for anything that is not a plausible cost. The one place the product says it.';

/* ------------------------------------------------------------------------------ 3. the roll -- */

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
  return v_n;
end $$;
revoke all on function public.platform_metrics_roll(date) from public, anon, authenticated;
grant execute on function public.platform_metrics_roll(date) to service_role;
comment on function public.platform_metrics_roll(date) is
  'Counts one UTC day (yesterday by default) for every workspace that did anything in it into platform_metrics, replacing the day''s rows (00277), then keeps what the lenses read: how each customer message ended, what they asked about, the model''s tokens and dollars by purpose and what the calls cost (00316), in a block that fails alone. Answers how many rows it wrote. The nightly clock''s, and the service role''s to re-run a day: not a day older than the events'' thirty, whose event-derived columns it would empty.';
