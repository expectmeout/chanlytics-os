-- 00275 · A second model is asked in shadow, and its week of answers is one read.
--
-- Scorecard move 10, step 12 (decision 0023). TypeSafe's Jev makes calibrated decisions, not text, and is asked the
-- same closed-set questions the primary answers (the receptionist's class and stop questions, the reply reader's intent,
-- the lead judge's criteria) beside the primary, while TYPESAFE_SHADOW is 1 (or lists the workspace) and a key is set.
-- Its answers are never used.
-- Each shadow call is written to 00273's ledger, with the columns that name the port and say it was a shadow, and, for
-- each question it answered: the label the primary gave, the label the shadow gave, how sure it was, whether that cleared
-- the line (contracts SHADOW_CONFIDENT), and whether the two agree. Rows carry labels and numbers, never text.
--
--   ai_usage           gains port, shadow and the six columns above; a row the primary wrote carries none of them.
--   member policy      a member reads their workspace's calls, and not the platform's shadow rows.
--   usage_ledger       leaves shadow rows out: what a second opinion cost the platform is not what a workspace used.
--   ai_failures_hour   leaves shadow rows out: a second model failing pages nobody about a workspace.
--   ai_shadow_agreement  agreement per purpose and question over the last N days, plain and among the answers that
--                      cleared the line: what Ruben reads before any switch (service role only).
--
-- Additive: new columns with defaults, one index, and the redefinition of a policy, a view and a function. Every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the columns -- */

alter table public.ai_usage add column if not exists port text not null default 'anthropic';
alter table public.ai_usage add column if not exists shadow boolean not null default false;
alter table public.ai_usage add column if not exists question text;
alter table public.ai_usage add column if not exists primary_answer text;
alter table public.ai_usage add column if not exists shadow_answer text;
alter table public.ai_usage add column if not exists shadow_confidence numeric(4, 3);
alter table public.ai_usage add column if not exists confident boolean;
alter table public.ai_usage add column if not exists agrees boolean;

do $$
begin
  -- contracts MODEL_PORTS
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_port_check' and conrelid = 'public.ai_usage'::regclass) then
    alter table public.ai_usage add constraint ai_usage_port_check check (port in ('anthropic', 'typesafe'));
  end if;
  -- A shadow is another port's call; the columns that compare belong to a shadow row alone.
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_shadow_check' and conrelid = 'public.ai_usage'::regclass) then
    alter table public.ai_usage add constraint ai_usage_shadow_check check (
      (shadow and port <> 'anthropic')
      or (not shadow and question is null and primary_answer is null and shadow_answer is null
          and shadow_confidence is null and confident is null and agrees is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_shadow_words_check' and conrelid = 'public.ai_usage'::regclass) then
    alter table public.ai_usage add constraint ai_usage_shadow_words_check check (
      char_length(coalesce(question, '')) <= 80 and char_length(coalesce(primary_answer, '')) <= 80
      and char_length(coalesce(shadow_answer, '')) <= 80
      and (shadow_confidence is null or shadow_confidence between 0 and 1));
  end if;
end $$;

create index if not exists ai_usage_shadow_at on public.ai_usage (created_at) where shadow;

comment on column public.ai_usage.port is
  'The port the call left by (contracts MODEL_PORTS): anthropic for the primary, typesafe for a second model asked in shadow.';
comment on column public.ai_usage.shadow is
  'True for a call made in shadow (decision 0023): its answer is compared with the primary''s and never used.';
comment on column public.ai_usage.question is
  'A shadow row''s question (contracts SHADOW_QUESTIONS, or a lead criterion''s key); "call" for a call that got no answer.';
comment on column public.ai_usage.agrees is
  'Whether the shadow''s label is the primary''s; null when either gave none.';

/* ------------------------------------------------ 2. who reads a shadow row -- */

drop policy if exists ai_usage_member_select on public.ai_usage;
create policy ai_usage_member_select on public.ai_usage
  for select to authenticated
  using (
    not shadow
    and tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
  );

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
   where not u.shadow
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
       and not u.shadow
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
   -- The larger of the two, never their sum: one failed receptionist turn is a ledger row AND a brain_error escalation,
   -- so a sum counts it twice; the larger is the fewest distinct events the hour can have held.
   where greatest(coalesce(c.n, 0), coalesce(t.n, 0)) >= greatest(p_min, 1)
   order by greatest(coalesce(c.n, 0), coalesce(t.n, 0)) desc
   limit 50;
$$;

/* --------------------------------------------------- 3. the week of agreement -- */

create or replace function public.ai_shadow_agreement(p_days integer default 7)
returns table (
  purpose             text,
  question            text,
  port                text,
  compared            bigint,
  agree               bigint,
  agreement           numeric,
  confident           bigint,
  confident_agree     bigint,
  confident_agreement numeric,
  failed_calls        bigint,
  input_tokens        bigint,
  usd                 numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select u.purpose,
         u.question,
         u.port,
         count(*) filter (where u.agrees is not null),
         count(*) filter (where u.agrees),
         round((count(*) filter (where u.agrees))::numeric
               / nullif(count(*) filter (where u.agrees is not null), 0), 4),
         count(*) filter (where u.agrees is not null and u.confident),
         count(*) filter (where u.agrees and u.confident),
         round((count(*) filter (where u.agrees and u.confident))::numeric
               / nullif(count(*) filter (where u.agrees is not null and u.confident), 0), 4),
         count(*) filter (where u.outcome in ('rejected', 'unreachable', 'unreadable')),
         coalesce(sum(u.input_tokens), 0)::bigint,
         round(coalesce(sum(u.usd), 0), 6)
    from public.ai_usage u
   where u.shadow
     and u.created_at > now() - make_interval(days => greatest(p_days, 1))
   group by u.purpose, u.question, u.port
   order by u.purpose, u.question, u.port;
$$;

revoke execute on function public.ai_shadow_agreement(integer) from public, anon, authenticated;
grant execute on function public.ai_shadow_agreement(integer) to service_role;
comment on function public.ai_shadow_agreement(integer) is
  'A second model''s agreement with the primary over the last p_days, per purpose, question and port: the answers compared, how many agree, the same among the answers that cleared the confidence line, the answers that could not be had (a call that failed, or an answer of the wrong kind), and the input tokens and dollars spent. A call''s tokens and dollars are counted once, on its first question, so they are exact in total and per purpose but not per question. Service role only: shadow rows are the platform''s.';
