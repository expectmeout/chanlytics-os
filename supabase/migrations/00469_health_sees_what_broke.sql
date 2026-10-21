-- 00469 · Health sees what broke (decision 0068): our own workspaces are counted apart from customers', a model call
-- that failed keeps what the API said, the errors pages hit are kept a month, and every clock is read beside pg_cron's
-- own record of its runs.
--
--   tenants.ours                 A workspace of ours: the nightly suite's, the smoke test, a trial we run by hand. Its
--                                numbers are counted apart from customers' on Health, and the pager leaves it out. Not
--                                status 'test', which also takes a workspace's public pages away: the nightly suite
--                                opens its own workspace's desk sign. Every status 'test' workspace is ours.
--   ai_usage.error_type,         What the API said of a call that got no answer: its error's type (invalid_request_error,
--   ai_usage.error_message       overloaded_error, "timeout") and its first words. Before this a refused round said
--                                nothing once the log that held its reason was gone.
--   client_errors                What a page hit in a member's browser, as its boundary caught it: its fingerprint, page,
--                                build and device, kept thirty days (purge-client-errors). Never the person's words; the
--                                member is a short hash, so Health counts people without knowing who.
--   platform_clocks()            Every registered clock with its schedule and pg_cron's own count of its runs and its
--                                failures in the last seven days: Health's Background work. Service role only.
--   platform_answer_silence()    Leaves our own workspaces out, as the pager does.
--
-- Deploy order: either. A dashboard or edge from before this reads and writes none of the new columns; this one writes
-- them, and a column it writes that is not there yet is a failed usage row, logged and never thrown. Re-runnable.

set local lock_timeout = '3s';

-- ------------------------------------------------------------------------------------------------- ours

alter table public.tenants add column if not exists ours boolean not null default false;
comment on column public.tenants.ours is
  'A workspace of ours (00469, decision 0068): the nightly suite''s, the smoke test, a trial we run by hand. Counted apart from customers on the Console''s Health, and left out of the pager. Every status test workspace is ours; ours does not take public pages away, as test does.';
update public.tenants set ours = true where status = 'test' and not ours;

-- --------------------------------------------------------------------------------- what a failed call said

alter table public.ai_usage add column if not exists error_type text;
alter table public.ai_usage add column if not exists error_message text;
alter table public.ai_usage drop constraint if exists ai_usage_error_message_short;
alter table public.ai_usage
  add constraint ai_usage_error_message_short check (error_message is null or char_length(error_message) <= 300);
comment on column public.ai_usage.error_type is
  'For a call that got no answer (outcome rejected or unreachable): the API''s error type (invalid_request_error, overloaded_error), or timeout or network when no answer came (00469).';
comment on column public.ai_usage.error_message is
  'For a call that got no answer: the first 300 characters of what the API said, or of the network''s words (00469).';

-- ------------------------------------------------------------------------------------------- browser errors

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  fingerprint text not null,
  boundary text not null,
  page text,
  name text not null,
  message text not null,
  build text,
  device text,
  member_key text,
  constraint client_errors_fingerprint_short check (char_length(fingerprint) <= 64),
  constraint client_errors_message_short check (char_length(message) <= 300),
  constraint client_errors_name_short check (char_length(name) <= 120)
);
comment on table public.client_errors is
  'What a page hit in a member''s browser, as the boundary that caught it reported it (POST /api/v1/client-errors, 00469; decision 0068): the error''s fingerprint (its name, first line and page), the page, the build, the device. Never the person''s words nor a workspace: member_key is a short hash of who, so Health counts people without knowing who. Kept 30 days (purge-client-errors).';
comment on column public.client_errors.member_key is
  'The first 16 hex of sha256 of the member''s id: who, counted and never named.';

create index if not exists client_errors_fingerprint_at on public.client_errors (fingerprint, at desc);
create index if not exists client_errors_at on public.client_errors (at desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;
grant select, insert, update, delete on public.client_errors to service_role;

select cron.unschedule('purge-client-errors') where exists (select 1 from cron.job where jobname = 'purge-client-errors');
select cron.schedule('purge-client-errors', '33 4 * * *', $$delete from public.client_errors where at < now() - interval '30 days'$$);

-- Judged on its runs, like the other purges (00107).
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('purge_client_errors', 'purge-client-errors', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

-- -------------------------------------------------------------------------------------------- the clocks

create or replace function public.platform_clocks(p_days integer default 7)
returns table (
  sweep text,
  jobname text,
  schedule text,
  judged_by text,
  max_silence interval,
  last_run timestamptz,
  runs integer,
  failed integer,
  last_failure text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.sweep, s.jobname, j.schedule, s.judged_by, s.max_silence,
         r.last_run, coalesce(r.runs, 0)::integer, coalesce(r.failed, 0)::integer, r.last_failure
    from public.sweep_status s
    left join cron.job j on j.jobname = s.jobname
    left join lateral (
      select max(d.start_time) as last_run,
             count(*) as runs,
             count(*) filter (where d.status <> 'succeeded') as failed,
             (array_agg(left(d.return_message, 200) order by d.start_time desc)
                filter (where d.status <> 'succeeded'))[1] as last_failure
        from cron.job_run_details d
       where d.jobid = j.jobid and d.start_time > now() - make_interval(days => greatest(1, least(p_days, 14)))
    ) r on true
   order by s.sweep
$$;
revoke all on function public.platform_clocks(integer) from public, anon, authenticated;
grant execute on function public.platform_clocks(integer) to service_role;
comment on function public.platform_clocks(integer) is
  'Every registered clock (sweep_status) with its pg_cron schedule and, over the last p_days (at most 14, the history kept), how many times it ran, how many of those failed, and the newest failure''s words: the Console''s Health (00469, decision 0068). Service role.';

-- ---------------------------------------------------------------------------------- the silence alarm

create or replace function public.platform_answer_silence(p_day date default (((now() at time zone 'utc'::text))::date - 1))
returns table (tenant_id uuid, name text, asks integer)
language sql
stable
set search_path = public
as $$
  select pm.tenant_id, t.name, pm.asks
    from public.platform_metrics pm
    join public.tenants t on t.id = pm.tenant_id
   where pm.day = p_day and pm.asks > 0 and pm.answered = 0 and t.status = 'active' and not t.ours
   order by pm.asks desc, t.name
$$;
revoke all on function public.platform_answer_silence(date) from public;
grant execute on function public.platform_answer_silence(date) to service_role;
comment on function public.platform_answer_silence(date) is
  'The active customers'' workspaces whose answer rate was zero on the day (00277; ours left out, 00469): customers wrote, and nobody answered. The health sweep pages the platform with them.';

-- ------------------------------------------------------------------------------------------- every part

-- One read of every part Health draws, over the last p_days (at most 90): each row keyed by whether its workspace is
-- ours, so the page splits customers from ours; the percentiles here, as page_vitals_p75 does them. Nobody's words: a
-- send's failure is its provider's code and title, Ask's answers are their timings, a failure is Ask's own sentence.
create or replace function public.platform_health_parts(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  win as (select now() - make_interval(days => greatest(1, least(p_days, 90))) as since,
                 now() - make_interval(days => greatest(1, least(p_days, 7))) as week),
  ws as (select t.id, t.ours from public.tenants t),
  sends as (
    select coalesce(w.ours, false) as ours, m.channel, m.status, count(*)::integer as n
      from win, public.messages m left join ws w on w.id = m.tenant_id
     where m.direction = 'outbound' and m.created_at > win.since
     group by 1, 2, 3),
  send_errors as (
    select coalesce(w.ours, false) as ours, m.channel,
           coalesce(m.error->>'code', m.error->'errors'->0->>'code', m.error->>'reason', 'unknown') as code,
           max(left(coalesce(m.error->>'title', m.error->'errors'->0->>'title', m.error->>'message', ''), 120)) as title,
           count(*)::integer as n, max(m.created_at) as last_at
      from win, public.messages m left join ws w on w.id = m.tenant_id
     where m.direction = 'outbound' and m.status = 'failed' and m.created_at > win.since
     group by 1, 2, 3
     order by n desc
     limit 20),
  calls as (
    select coalesce(w.ours, false) as ours, c.status, coalesce(c.disconnection_reason, '') as reason,
           count(*)::integer as n, max(c.created_at) as last_at
      from win, public.calls c left join ws w on w.id = c.tenant_id
     where c.created_at > win.since
     group by 1, 2, 3),
  webhooks as (
    select coalesce(w.ours, false) as ours, p.provider, p.door, count(*)::integer as n,
           count(*) filter (where not p.verified)::integer as unverified, max(p.received_at) as last_at
      from win, public.provider_events p left join ws w on w.id = p.tenant_id
     where p.received_at > win.week
     group by 1, 2, 3),
  billing as (
    select b.type, b.state, count(*)::integer as n, max(b.received_at) as last_at
      from win, public.billing_events b
     where b.received_at > win.since
     group by 1, 2),
  model as (
    select coalesce(w.ours, false) as ours, a.purpose, a.outcome, count(*)::integer as n,
           round(coalesce(sum(a.usd), 0)::numeric, 4) as usd
      from win, public.ai_usage a left join ws w on w.id = a.tenant_id
     where a.created_at > win.since and not a.shadow
     group by 1, 2, 3),
  model_ws as (
    select a.tenant_id, coalesce(w.ours, false) as ours, a.purpose, count(*)::integer as n,
           round(coalesce(sum(a.usd), 0)::numeric, 4) as usd
      from win, public.ai_usage a left join ws w on w.id = a.tenant_id
     where a.created_at > win.since and not a.shadow
     group by 1, 2, 3
     order by usd desc
     limit 40),
  model_failures as (
    select a.created_at as at, a.tenant_id, coalesce(w.ours, false) as ours, a.purpose, a.model, a.outcome,
           a.error_type, a.error_message
      from win, public.ai_usage a left join ws w on w.id = a.tenant_id
     where a.created_at > win.since and a.outcome in ('rejected', 'unreachable')
     order by a.created_at desc
     limit 20),
  deliveries as (
    select coalesce(w.ours, false) as ours, d.subscriber, d.state, count(*)::integer as n, max(d.updated_at) as last_at
      from win, public.event_deliveries d left join ws w on w.id = d.tenant_id
     where d.created_at > win.since
     group by 1, 2, 3),
  delivery_failed as (
    select d.event_id, d.subscriber, d.kind, d.tenant_id, coalesce(w.ours, false) as ours, d.attempts,
           left(coalesce(d.last_error, ''), 200) as last_error, d.updated_at
      from win, public.event_deliveries d left join ws w on w.id = d.tenant_id
     where d.state = 'failed' and d.updated_at > win.since
     order by d.updated_at desc
     limit 30),
  answers as (
    select coalesce(w.ours, false) as ours, m.tenant_id, m.created_at,
           nullif(m.content->>'latency_ms', '')::numeric as latency,
           coalesce((m.content->>'failed')::boolean, false) as failed,
           coalesce((m.content->>'ungrounded')::boolean, false) as ungrounded,
           m.content->>'failure' as failure,
           left(coalesce(m.content->>'text', ''), 160) as said,
           case when jsonb_typeof(m.content->'shape') = 'object' then m.content->'shape' end as shape
      from win, public.ask_messages m left join ws w on w.id = m.tenant_id
     where m.role = 'assistant' and m.created_at > win.since),
  traced as (
    select a.ours, a.shape,
           nullif(a.shape->>'first_text_ms', '')::numeric as first_text,
           nullif(a.shape->>'context_ms', '')::numeric as context,
           nullif(a.shape->>'first_byte_ms', '')::numeric as first_byte,
           nullif(a.shape->>'final_ms', '')::numeric as final,
           (select sum(x::numeric) from jsonb_array_elements_text(coalesce(a.shape->'rounds_ms', '[]'::jsonb)) x) as rounds_ms,
           (select coalesce(sum((t->>'ms')::numeric), 0) from jsonb_array_elements(coalesce(a.shape->'tools_ms', '[]'::jsonb)) t) as tools_ms,
           nullif(a.shape->>'rounds', '')::integer as rounds,
           nullif(a.shape->>'cache_hit', '')::numeric as cache_hit,
           a.shape->>'speed' as speed
      from answers a
     where a.shape is not null),
  ask as (
    select a.ours, count(*)::integer as answers,
           count(*) filter (where a.failed)::integer as failed,
           count(*) filter (where a.ungrounded)::integer as ungrounded,
           percentile_cont(0.5) within group (order by a.latency) as latency_p50,
           percentile_cont(0.95) within group (order by a.latency) as latency_p95,
           max(a.latency) as latency_max
      from answers a
     group by grouping sets ((a.ours), ())),
  ask_traced as (
    select t.ours, count(*)::integer as traced,
           percentile_cont(0.5) within group (order by t.first_text) as first_text_p50,
           percentile_cont(0.95) within group (order by t.first_text) as first_text_p95,
           percentile_cont(0.5) within group (order by t.context) as context_p50,
           percentile_cont(0.95) within group (order by t.context) as context_p95,
           percentile_cont(0.5) within group (order by t.first_byte) as first_byte_p50,
           percentile_cont(0.95) within group (order by t.first_byte) as first_byte_p95,
           percentile_cont(0.5) within group (order by t.rounds_ms) as rounds_p50,
           percentile_cont(0.95) within group (order by t.rounds_ms) as rounds_p95,
           percentile_cont(0.5) within group (order by t.tools_ms) as tools_p50,
           percentile_cont(0.95) within group (order by t.tools_ms) as tools_p95,
           percentile_cont(0.5) within group (order by t.final) as final_p50,
           percentile_cont(0.95) within group (order by t.final) as final_p95,
           count(*) filter (where t.rounds = 1)::integer as one_round,
           count(*) filter (where t.rounds = 2)::integer as two_rounds,
           count(*) filter (where t.rounds >= 3)::integer as more_rounds,
           avg(t.cache_hit) as cache_hit,
           count(*) filter (where t.speed = 'fast')::integer as fast
      from traced t
     group by grouping sets ((t.ours), ())),
  ask_tools as (
    select t.ours, x->>'name' as name, count(*)::integer as n,
           avg((x->>'ms')::numeric) as avg_ms, max((x->>'ms')::numeric) as max_ms
      from traced t, jsonb_array_elements(coalesce(t.shape->'tools_ms', '[]'::jsonb)) x
     group by 1, 2
     order by avg_ms desc
     limit 24),
  ask_ws as (
    select a.tenant_id, a.ours, count(*)::integer as answers
      from answers a
     group by 1, 2),
  ask_failures as (
    select a.created_at as at, a.tenant_id, a.ours, a.failure, a.said
      from answers a
     where a.failed
     order by a.created_at desc
     limit 20),
  threads as (
    select coalesce(w.ours, false) as ours, count(*)::integer as n
      from win, public.ask_threads t left join ws w on w.id = t.tenant_id
     where t.created_at > win.since
     group by 1),
  troubled_lines as (
    select l.tenant_id, coalesce(w.ours, false) as ours, l.kind, l.voice_state, l.sms_state, l.whatsapp_state,
           left(coalesce(l.last_error, ''), 200) as error, l.state_since as since
      from public.lines l left join ws w on w.id = l.tenant_id
     where l.last_error is not null or l.voice_state = 'failed' or l.whatsapp_state = 'failed'),
  troubled_channels as (
    select c.tenant_id, coalesce(w.ours, false) as ours, c.kind, c.status, c.updated_at
      from public.tenant_channels c left join ws w on w.id = c.tenant_id
     where c.status <> 'active'),
  troubled_google as (
    select g.tenant_id, coalesce(w.ours, false) as ours, left(g.sync_error, 200) as error, g.last_synced_at
      from public.google_connections g left join ws w on w.id = g.tenant_id
     where g.sync_error is not null),
  troubled_mailboxes as (
    select b.tenant_id, coalesce(w.ours, false) as ours, b.provider, b.state, b.held_why,
           left(coalesce(b.last_error, ''), 200) as error, b.last_error_at
      from public.mailbox_connections b left join ws w on w.id = b.tenant_id
     where b.removed_at is null and b.state in ('reconnect', 'paused', 'held'))
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 90)),
    'sends', coalesce((select jsonb_agg(to_jsonb(s)) from sends s), '[]'::jsonb),
    'send_errors', coalesce((select jsonb_agg(to_jsonb(s)) from send_errors s), '[]'::jsonb),
    'calls', coalesce((select jsonb_agg(to_jsonb(c)) from calls c), '[]'::jsonb),
    'webhooks', coalesce((select jsonb_agg(to_jsonb(h)) from webhooks h), '[]'::jsonb),
    'billing', coalesce((select jsonb_agg(to_jsonb(b)) from billing b), '[]'::jsonb),
    'model', coalesce((select jsonb_agg(to_jsonb(m)) from model m), '[]'::jsonb),
    'model_by_workspace', coalesce((select jsonb_agg(to_jsonb(m)) from model_ws m), '[]'::jsonb),
    'model_failures', coalesce((select jsonb_agg(to_jsonb(f)) from model_failures f), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d)) from deliveries d), '[]'::jsonb),
    'delivery_failures', coalesce((select jsonb_agg(to_jsonb(d)) from delivery_failed d), '[]'::jsonb),
    'ask', coalesce((select jsonb_agg(to_jsonb(a)) from ask a), '[]'::jsonb),
    'ask_traced', coalesce((select jsonb_agg(to_jsonb(a)) from ask_traced a), '[]'::jsonb),
    'ask_tools', coalesce((select jsonb_agg(to_jsonb(a)) from ask_tools a), '[]'::jsonb),
    'ask_by_workspace', coalesce((select jsonb_agg(to_jsonb(a)) from ask_ws a), '[]'::jsonb),
    'ask_failures', coalesce((select jsonb_agg(to_jsonb(a)) from ask_failures a), '[]'::jsonb),
    'ask_threads', coalesce((select jsonb_agg(to_jsonb(t)) from threads t), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from troubled_lines l), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(to_jsonb(c)) from troubled_channels c), '[]'::jsonb),
    'google', coalesce((select jsonb_agg(to_jsonb(g)) from troubled_google g), '[]'::jsonb),
    'mailboxes', coalesce((select jsonb_agg(to_jsonb(b)) from troubled_mailboxes b), '[]'::jsonb)
  )
$$;
revoke all on function public.platform_health_parts(integer) from public, anon, authenticated;
grant execute on function public.platform_health_parts(integer) to service_role;
comment on function public.platform_health_parts(integer) is
  'Every part the Console''s Health draws, over the last p_days (at most 90; webhooks a week, as provider_events keeps): sends by channel and status with the providers'' failure codes, calls by outcome, webhooks by provider, billing events, model calls by purpose and outcome and by workspace with the failures'' reasons, event deliveries by subscriber, Ask''s answers with their percentiles, tools, failures and threads, and the lines, channels, Google syncs and mailboxes that are not healthy. Each keyed by whether its workspace is ours (00469, decision 0068). Nobody''s words. Service role.';
