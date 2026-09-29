-- 00276 · Every model call is kept, in dollars.
--
-- Scorecard move 10 and category 39 (29 September 2026). A model call's tokens were an event purged at thirty days
-- (usage.llm_tokens, usage.ask_tokens), never priced, and four paths wrote none at all (the reply reader, the reach-out
-- check, the notes sweep, the review reply: defect 53). Every call now goes through one model port that writes one row
-- here: its purpose, the model asked and the model that answered, the four kinds of tokens, the dollars at list price
-- (contracts ai/usage.ts), and what became of it. The rows are kept four hundred days (contracts RETENTION_DAYS.ai_usage).
--
--   ai_usage          one row per model call. Members read their workspace's; only the service role writes.
--   usage_ledger      the owner's metering read: the model calls, the phone minutes and the WhatsApp conversations,
--                     one row per use, as the reports read them (security invoker: RLS decides).
--   ai_usage_month    a workspace's month from the ledger, by meter, purpose and model: the rollup the Usage read and
--                     an invoice would take.
--   ai_usage_purge    the ledger's rows past their keep, run by the health sweep (apps/edge/api/cron/health.ts).
--   ai_failures_hour  the workspaces whose model calls or receptionist turns failed at least p_min times in the last
--                     hour: calls that got no answer or no usable one, and brain_error escalations. The health sweep
--                     pages on it (the failure-rate alarm).
--
-- New tables and functions only; the lock guard is 00140's all the same. Every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* --------------------------------------------------------------- 1. the ledger -- */

create table if not exists public.ai_usage (
  id                 bigint generated always as identity primary key,
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  -- contracts MODEL_PURPOSES
  purpose            text not null check (purpose in (
                       'receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                       'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read')),
  model_asked        text not null check (char_length(model_asked) between 1 and 80),
  model              text not null check (char_length(model) between 1 and 80),
  -- contracts MODEL_CALL_OUTCOMES
  outcome            text not null check (outcome in (
                       'answered', 'fell_back', 'refused', 'rejected', 'unreachable', 'unreadable')),
  input_tokens       integer not null default 0 check (input_tokens >= 0),
  output_tokens      integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  -- List-price dollars; null when the model has no price in contracts.
  usd                numeric(12, 6) check (usd is null or usd >= 0),
  prompt_hash        text check (prompt_hash is null or prompt_hash ~ '^[0-9a-f]{16,64}$'),
  user_id            uuid references auth.users (id) on delete set null,
  subject_id         uuid,
  created_at         timestamptz not null default now()
);

create index if not exists ai_usage_tenant_at on public.ai_usage (tenant_id, created_at desc);
create index if not exists ai_usage_at on public.ai_usage (created_at);

alter table public.ai_usage enable row level security;
-- Members read their workspace's calls (the 00002 shape); nobody signed in writes one. Every write is the model port's,
-- as the service role.
drop policy if exists ai_usage_member_select on public.ai_usage;
create policy ai_usage_member_select on public.ai_usage
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
comment on table public.ai_usage is
  'One row per model call the platform made for a workspace (the model port, apps/edge/lib/model.ts): its purpose, the model asked and the one that answered, input, output, cache read and cache write tokens, list-price dollars, and what became of it. Kept 400 days (ai_usage_purge).';

/* ------------------------------------------------------- 2. the metering read -- */

create or replace view public.usage_ledger
with (security_invoker = true) as
  select u.tenant_id,
         u.created_at                                                   as at,
         'model'::text                                                  as meter,
         u.purpose,
         u.model,
         (u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens)::numeric as quantity,
         u.input_tokens,
         u.output_tokens,
         u.cache_read_tokens,
         u.cache_write_tokens,
         u.usd
    from public.ai_usage u
  union all
  select e.tenant_id,
         e.created_at,
         'voice_seconds',
         null,
         null,
         coalesce((e.data ->> 'seconds')::numeric, 0),
         0, 0, 0, 0,
         null
    from public.events e
   where e.kind = 'usage.voice_seconds'
  union all
  select e.tenant_id,
         e.created_at,
         'wa_conversation',
         null,
         null,
         1,
         0, 0, 0, 0,
         null
    from public.events e
   where e.kind = 'usage.wa_conversation';

revoke all on public.usage_ledger from anon, authenticated;
grant select on public.usage_ledger to authenticated;
grant select on public.usage_ledger to service_role;
comment on view public.usage_ledger is
  'A workspace''s metered use, one row per use: each model call (ai_usage, with its dollars), each call''s seconds and each WhatsApp conversation opened (the usage events the reports read). Security invoker: a member reads their own workspace''s rows.';

/* --------------------------------------------------------- 3. the month rolled -- */

create or replace function public.ai_usage_month(p_tenant_id uuid, p_month date)
returns table (
  meter              text,
  purpose            text,
  model              text,
  uses               bigint,
  quantity           numeric,
  input_tokens       bigint,
  output_tokens      bigint,
  cache_read_tokens  bigint,
  cache_write_tokens bigint,
  usd                numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.meter, l.purpose, l.model,
         count(*),
         sum(l.quantity),
         sum(l.input_tokens)::bigint,
         sum(l.output_tokens)::bigint,
         sum(l.cache_read_tokens)::bigint,
         sum(l.cache_write_tokens)::bigint,
         round(sum(l.usd), 4)
    from public.usage_ledger l
   where l.tenant_id = p_tenant_id
     and l.at >= date_trunc('month', p_month::timestamptz)
     and l.at < date_trunc('month', p_month::timestamptz) + interval '1 month'
   group by l.meter, l.purpose, l.model
   order by l.meter, l.purpose nulls first, l.model nulls first;
$$;

revoke execute on function public.ai_usage_month(uuid, date) from public, anon;
grant execute on function public.ai_usage_month(uuid, date) to authenticated, service_role;
comment on function public.ai_usage_month(uuid, date) is
  'A workspace''s month of metered use, by meter, purpose and model: uses, quantity, the four kinds of tokens and the list-price dollars. Security invoker: RLS decides whose rows it sums.';

/* ------------------------------------------------------------ 4. the keeping -- */

create or replace function public.ai_usage_purge(p_keep interval default '400 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.ai_usage where created_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.ai_usage_purge(interval) from public, anon, authenticated;
grant execute on function public.ai_usage_purge(interval) to service_role;
comment on function public.ai_usage_purge(interval) is
  'Drops ledger rows older than p_keep (default 400 days; contracts RETENTION_DAYS.ai_usage). Run by the health sweep.';

/* ------------------------------------------------------ 5. the failure rate -- */

create or replace function public.ai_failures_hour(p_min integer default 5)
returns table (tenant_id uuid, failed_calls bigint, brain_errors bigint)
language sql
stable
security definer
set search_path = public
as $$
  with calls as (
    select u.tenant_id, count(*) as n
      from public.ai_usage u
     where u.created_at > now() - interval '1 hour'
       and u.outcome in ('rejected', 'unreachable', 'unreadable')
     group by u.tenant_id
  ), turns as (
    select e.tenant_id, count(*) as n
      from public.escalations e
     where e.created_at > now() - interval '1 hour'
       and e.reason = 'brain_error'
     group by e.tenant_id
  )
  select coalesce(c.tenant_id, t.tenant_id), coalesce(c.n, 0), coalesce(t.n, 0)
    from calls c
    full join turns t on t.tenant_id = c.tenant_id
   where coalesce(c.n, 0) + coalesce(t.n, 0) >= greatest(p_min, 1)
   order by coalesce(c.n, 0) + coalesce(t.n, 0) desc
   limit 50;
$$;

revoke execute on function public.ai_failures_hour(integer) from public, anon, authenticated;
grant execute on function public.ai_failures_hour(integer) to service_role;
comment on function public.ai_failures_hour(integer) is
  'The workspaces whose model calls failed (no answer, a rejected request, an unusable answer) or whose receptionist turns ended in brain_error at least p_min times in the last hour, most first. The health sweep pages on it.';
