-- 00279 · What happened is named, audited and counted (the road to ten, observe lane).
--
-- 1. An event says which request wrote it: events.request_id. The TypeScript writer stamps the request it serves
--    (packages/db events.ts); a SQL function's rows take it from the header the database client sends on every call
--    (packages/db observe.ts, x-chanlytics-request-id), which PostgREST hands to SQL as request.headers.
-- 2. Playing a call's recording is on the ledger: a decision, open_recording, once per member per call per hour.
-- 3. A team change and its audit row are one transaction. The role change, the removal and the invitation wrote the
--    ledger afterwards on another client, and a failed audit row was only a log line.
-- 4. A day per workspace, counted: platform_metrics, rolled up nightly on a registered clock, read by the back office,
--    and the workspaces whose customers got no answer all day, for the health sweep to page.
--
-- Re-runnable: every statement is `if not exists`, `create or replace`, or checks before it changes a constraint.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------- 1. the request, on the ledger -- */

-- The request this statement runs for, as the database client named it; null outside one (pg_cron, a migration,
-- psql) or when the header is not a request's name. Never fails an insert: a header it cannot read is no name.
create or replace function public.request_id_of_caller()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_id text;
begin
  v_id := nullif(current_setting('request.headers', true), '')::json ->> 'x-chanlytics-request-id';
  return case when v_id ~ '^[A-Za-z0-9._:-]{8,128}$' then v_id end;
exception when others then
  return null;
end $$;
revoke all on function public.request_id_of_caller() from public, anon;
-- A column's default runs as the role that inserts: every role that writes events may read its own request's name.
grant execute on function public.request_id_of_caller() to authenticated, service_role;
comment on function public.request_id_of_caller() is
  'The request the calling statement serves (00279): the x-chanlytics-request-id header the database client sent, when it is a request''s name, else null. events.request_id''s default.';

-- Additive and null for every row already written: no rewrite. On the partitioned parent, so every partition has it.
alter table public.events add column if not exists request_id text;
alter table public.events alter column request_id set default public.request_id_of_caller();
comment on column public.events.request_id is
  'The request this row was written in (00279): the name withRoute, an edge door or a job gave it, the one its log lines carry. Null for a row written outside a request.';

/* ----------------------------------------------------------- 2. a recording played is on the ledger -- */

-- One verb added to the ledger's list, as 00170 added import: appended to what the database holds, never a literal
-- list that would erase another migration's verbs.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conname = 'decisions_verb_check' and c.conrelid = 'public.decisions'::regclass;
  if v_def is null then
    raise exception '00279: decisions_verb_check is missing, so there is no list of verbs to add open_recording to';
  end if;
  if position('''open_recording''::text' in v_def) > 0 then
    return;
  end if;
  if v_def !~ '::text\]\)\)\)$' then
    raise exception '00279: decisions_verb_check is not the verb = ANY (ARRAY[...]) it appends to: %', v_def;
  end if;
  v_def := regexp_replace(v_def, '::text\]\)\)\)$', '::text, ''open_recording''::text])))');
  execute 'alter table public.decisions drop constraint decisions_verb_check';
  execute 'alter table public.decisions add constraint decisions_verb_check ' || v_def;
end $$;

-- The recording's door (GET calls/:id/recording) records who opened it. The thread's player asks for the recording
-- when it loads its length and again at a seek, so the ledger keeps one row per member per call per hour: the
-- question an audit asks is who listened, not how often the player asked. Any member may listen (the route reads the
-- call under RLS), and a viewer may not write decisions under RLS, so this is the definer's, and checks membership
-- itself, as team_roster does: a partner's seat counts only on a session that showed its second factor (00218).
-- Answers whether a row was written.
create or replace function public.recording_opened(p_call_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_tenant uuid;
begin
  if v_actor is null then
    raise exception 'recording_opened: no session' using errcode = '42501';
  end if;
  select c.tenant_id into v_tenant
    from public.calls c
   where c.id = p_call_id
     and exists (
       select 1 from public.memberships m
        where m.tenant_id = c.tenant_id and m.user_id = v_actor
          and (m.role <> 'partner' or public.session_shows_second_factor()));
  if v_tenant is null then
    raise exception 'recording_opened: no such call for this member' using errcode = 'P0002';
  end if;
  -- The player asks twice at once (its length, and a seek): the second waits for the first's row and reads it, so the
  -- hour holds one row and not two.
  perform pg_advisory_xact_lock(hashtextextended('recording_opened:' || v_actor::text || ':' || p_call_id::text, 0));
  if exists (
    select 1 from public.decisions d
     where d.tenant_id = v_tenant and d.subject_type = 'call' and d.subject_id = p_call_id
       and d.verb = 'open_recording' and d.actor_user_id = v_actor
       and d.created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (v_tenant, 'call', p_call_id, 'open_recording', 'user', v_actor, '{}'::jsonb);
  return true;
end $$;
revoke all on function public.recording_opened(uuid) from public, anon;
grant execute on function public.recording_opened(uuid) to authenticated;
comment on function public.recording_opened(uuid) is
  'A member opened a call''s recording (00279): one open_recording decision per member per call per hour, as the member. Refuses a call the caller is not a member of. Answers whether a row was written.';

/* ------------------------------------------------ 3. a team change and its audit, one transaction -- */

-- Shared by the doors below. team_owner_or_refuse: the actor owns the workspace. team_take_turn: the workspace's team
-- changes take turns. It is the lock the last-owner trigger takes at a transaction's end (00271), taken at the start of
-- a change that counts owners, so the second of two changes counts what the first did and finds its own actor as the
-- first left it. The doors count under it and never lock the owners' rows one after another: two owners demoting each
-- other each held the row they were changing and waited for the other's, and the database ended one with a deadlock.
-- team_decision: the change's row, with the undo it reverses dropped when no such decision exists (a stale tab's
-- link, dropped as recordDecision drops it, and the answer says so).
create or replace function public.team_owner_or_refuse(p_tenant_id uuid, p_actor uuid)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_actor is null or not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = p_actor and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;
revoke all on function public.team_owner_or_refuse(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_owner_or_refuse(uuid, uuid) to service_role;

create or replace function public.team_take_turn(p_tenant_id uuid, p_actor uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('memberships_keep_an_owner:' || p_tenant_id::text, 0));
  -- After the wait, so an actor an earlier change demoted or removed is refused, not served on the state it left.
  perform public.team_owner_or_refuse(p_tenant_id, p_actor);
end $$;
revoke all on function public.team_take_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_take_turn(uuid, uuid) to service_role;

create or replace function public.team_decision(
  p_tenant_id uuid,
  p_actor uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_verb text,
  p_payload jsonb,
  p_via text,
  p_undo_of uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_undo uuid := p_undo_of;
  v_id   uuid;
begin
  if v_undo is not null and not exists (select 1 from public.decisions d where d.id = v_undo) then
    v_undo := null;
  end if;
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload, undo_of)
  values (p_tenant_id, p_subject_type, p_subject_id, p_verb, 'user', p_actor,
          coalesce(p_payload, '{}'::jsonb)
            || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end,
          v_undo)
  returning id into v_id;
  return jsonb_build_object('decision_id', v_id, 'undo_dropped', p_undo_of is not null and v_undo is null);
end $$;
revoke all on function public.team_decision(uuid, uuid, text, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.team_decision(uuid, uuid, text, uuid, text, jsonb, text, uuid) to service_role;

-- A role change and its row. The last owner stays one: the change takes its turn on the workspace's team before it
-- counts the owners, so two owners demoting each other at once leave one, and the second is refused.
create or replace function public.team_change_role(
  p_tenant_id uuid,
  p_actor uuid,
  p_membership_id uuid,
  p_role text,
  p_via text default null,
  p_undo_of uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_prev   text;
  v_owners integer;
  v_audit  jsonb;
begin
  perform public.team_owner_or_refuse(p_tenant_id, p_actor);
  select m.role into v_prev from public.memberships m
   where m.tenant_id = p_tenant_id and m.id = p_membership_id
   for update;
  if v_prev is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.team_take_turn(p_tenant_id, p_actor);
  if p_role <> 'owner' and v_prev = 'owner' then
    select count(*) into v_owners from public.memberships m where m.tenant_id = p_tenant_id and m.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  update public.memberships set role = p_role where tenant_id = p_tenant_id and id = p_membership_id;
  v_audit := public.team_decision(p_tenant_id, p_actor, 'membership', p_membership_id, 'change_role',
                                  jsonb_build_object('from', v_prev, 'to', p_role), p_via, p_undo_of);
  return jsonb_build_object('membership_id', p_membership_id, 'role', p_role) || v_audit;
end $$;
revoke all on function public.team_change_role(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.team_change_role(uuid, uuid, uuid, text, text, uuid) to service_role;
comment on function public.team_change_role(uuid, uuid, uuid, text, text, uuid) is
  'An owner changes a member''s role (00279): the change and its change_role decision in one transaction; the last owner stays (last_owner). Service role: the route passes the session''s verified user as p_actor, and this checks it owns the workspace.';

-- A removal, of an open invitation or of a member, and its row. Nobody removes themself; the last owner stays.
create or replace function public.team_remove(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_via text default null,
  p_undo_of uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_invite uuid;
  v_member public.memberships%rowtype;
  v_owners integer;
  v_audit  jsonb;
begin
  perform public.team_owner_or_refuse(p_tenant_id, p_actor);
  update public.invitations set revoked_at = now()
   where tenant_id = p_tenant_id and id = p_id and accepted_at is null
  returning id into v_invite;
  if v_invite is not null then
    v_audit := public.team_decision(p_tenant_id, p_actor, 'invitation', v_invite, 'revoke_invite', '{}'::jsonb,
                                    p_via, p_undo_of);
    return jsonb_build_object('revoked_invite', true) || v_audit;
  end if;
  select * into v_member from public.memberships m where m.tenant_id = p_tenant_id and m.id = p_id for update;
  if v_member.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.team_take_turn(p_tenant_id, p_actor);
  if v_member.user_id = p_actor then
    raise exception 'self_remove' using errcode = 'P0001';
  end if;
  -- Backstop: an actor who owns the workspace and removes another owner means two exist, so the count below is
  -- reached only if a turn was skipped. The trigger of 00271 judges the same at the transaction's end.
  if v_member.role = 'owner' then
    select count(*) into v_owners from public.memberships m where m.tenant_id = p_tenant_id and m.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last_owner' using errcode = 'P0001';
    end if;
  end if;
  delete from public.memberships where id = v_member.id;
  -- Carrying the role they held: the membership row is gone, so this is the only surviving record of it.
  v_audit := public.team_decision(p_tenant_id, p_actor, 'membership', v_member.id, 'remove_member',
                                  jsonb_build_object('removed_user_id', v_member.user_id, 'had_role', v_member.role),
                                  p_via, p_undo_of);
  return jsonb_build_object('removed', true) || v_audit;
end $$;
revoke all on function public.team_remove(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.team_remove(uuid, uuid, uuid, text, uuid) to service_role;
comment on function public.team_remove(uuid, uuid, uuid, text, uuid) is
  'An owner revokes an open invitation or removes a member (00279), and its decision, in one transaction; nobody removes themself (self_remove), the last owner stays (last_owner). Service role, as team_change_role.';

-- A known account joins at the role, and its row: the lookup that found it is the platform's (00121), so the id
-- comes from the server, never from a session.
create or replace function public.team_join(
  p_tenant_id uuid,
  p_actor uuid,
  p_user_id uuid,
  p_role text,
  p_email text,
  p_via text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id    uuid;
  v_audit jsonb;
begin
  perform public.team_owner_or_refuse(p_tenant_id, p_actor);
  insert into public.memberships (tenant_id, user_id, role) values (p_tenant_id, p_user_id, p_role)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('already_member', true);
  end if;
  v_audit := public.team_decision(p_tenant_id, p_actor, 'membership', v_id, 'invite',
                                  jsonb_build_object('email', p_email, 'role', p_role, 'joined_existing_account', true),
                                  p_via, null);
  return jsonb_build_object('added', true, 'membership_id', v_id) || v_audit;
end $$;
revoke all on function public.team_join(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.team_join(uuid, uuid, uuid, text, text, text) to service_role;
comment on function public.team_join(uuid, uuid, uuid, text, text, text) is
  'An owner adds an existing account at a role (00279): the membership and its invite decision in one transaction; an account already on the team is already_member. Service role: the account''s id is the platform''s lookup''s.';

-- An invitation by email and its row, before the mail goes. The mail cannot be part of a transaction, so a mail that
-- could not go takes both back (team_invite_withdraw): the ledger never says an invitation went that did not.
create or replace function public.team_invite(
  p_tenant_id uuid,
  p_actor uuid,
  p_email text,
  p_role text,
  p_via text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_id    uuid;
  v_audit jsonb;
begin
  perform public.team_owner_or_refuse(p_tenant_id, p_actor);
  begin
    insert into public.invitations (tenant_id, email, role, invited_by)
    values (p_tenant_id, p_email, p_role, p_actor)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('already_invited', true);
  end;
  v_audit := public.team_decision(p_tenant_id, p_actor, 'invitation', v_id, 'invite',
                                  jsonb_build_object('email', p_email, 'role', p_role), p_via, null);
  return jsonb_build_object('invitation_id', v_id) || v_audit;
end $$;
revoke all on function public.team_invite(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.team_invite(uuid, uuid, text, text, text) to service_role;
comment on function public.team_invite(uuid, uuid, text, text, text) is
  'An owner invites an address at a role (00279): the invitation and its invite decision in one transaction, before the mail; already_invited for an open one. team_invite_withdraw takes both back when the mail cannot go.';

create or replace function public.team_invite_withdraw(p_tenant_id uuid, p_invitation_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Only an invitation still open is taken back, and its row with it: one accepted or revoked in the meantime is
  -- somebody's, and keeps the decision that says how it began.
  delete from public.invitations
   where tenant_id = p_tenant_id and id = p_invitation_id and accepted_at is null and revoked_at is null
  returning id into v_id;
  if v_id is not null then
    delete from public.decisions
     where tenant_id = p_tenant_id and subject_type = 'invitation' and subject_id = v_id and verb = 'invite';
  end if;
end $$;
revoke all on function public.team_invite_withdraw(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_invite_withdraw(uuid, uuid) to service_role;
comment on function public.team_invite_withdraw(uuid, uuid) is
  'An invitation whose mail could not go, taken back with its decision (00279), in one transaction.';

/* ------------------------------------------------------------ 4. a day per workspace, counted -- */

create table if not exists public.platform_metrics (
  tenant_id          uuid        not null references public.tenants (id) on delete cascade,
  day                date        not null,
  messages_in        jsonb       not null default '{}'::jsonb,
  messages_out       jsonb       not null default '{}'::jsonb,
  asks               integer     not null default 0 check (asks >= 0),
  answered           integer     not null default 0 check (answered >= 0),
  replies_answered   integer     not null default 0 check (replies_answered >= 0),
  replies_held       integer     not null default 0 check (replies_held >= 0),
  replies_handed_off integer     not null default 0 check (replies_handed_off >= 0),
  brain_p95_ms       integer     check (brain_p95_ms >= 0),
  provider_failures  jsonb       not null default '{}'::jsonb,
  tokens             bigint      not null default 0 check (tokens >= 0),
  rolled_at          timestamptz not null default now(),
  primary key (tenant_id, day)
);
create index if not exists platform_metrics_day on public.platform_metrics (day);
alter table public.platform_metrics enable row level security;
revoke all on public.platform_metrics from anon, authenticated;
comment on table public.platform_metrics is
  'One UTC day of one workspace, counted (00279): messages in and out by channel, customers'' messages (asks) and how many got an answer from anyone, the receptionist''s replies answered, held and handed off, its 95th-percentile latency, sends that failed by outcome, and model tokens. Rolled up nightly (platform_metrics_roll); service role only, read by the back office.';

-- The day's rollup, for every workspace that did anything that day. Re-running a day replaces its rows.
create or replace function public.platform_metrics_roll(p_day date default ((now() at time zone 'utc')::date - 1))
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_t0 timestamptz := p_day::timestamp at time zone 'utc';
  v_t1 timestamptz := (p_day + 1)::timestamp at time zone 'utc';
  v_n  integer;
begin
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
  return v_n;
end $$;
revoke all on function public.platform_metrics_roll(date) from public, anon, authenticated;
grant execute on function public.platform_metrics_roll(date) to service_role;
comment on function public.platform_metrics_roll(date) is
  'Counts one UTC day (yesterday by default) for every workspace that did anything in it into platform_metrics, replacing the day''s rows (00279). Answers how many rows it wrote. The nightly clock''s, and the service role''s to re-run a day.';

-- The back office's read: the last days, every workspace, the workspace's name beside its row.
create or replace function public.platform_metrics_read(p_days integer default 7)
returns table (
  tenant_id uuid, name text, day date, messages_in jsonb, messages_out jsonb, asks integer, answered integer,
  replies_answered integer, replies_held integer, replies_handed_off integer, brain_p95_ms integer,
  provider_failures jsonb, tokens bigint)
language sql
stable
set search_path = public
as $$
  select pm.tenant_id, t.name, pm.day, pm.messages_in, pm.messages_out, pm.asks, pm.answered, pm.replies_answered,
         pm.replies_held, pm.replies_handed_off, pm.brain_p95_ms, pm.provider_failures, pm.tokens
    from public.platform_metrics pm
    join public.tenants t on t.id = pm.tenant_id
   where pm.day > (now() at time zone 'utc')::date - greatest(least(coalesce(p_days, 7), 90), 1) - 1
   order by pm.day desc, pm.asks desc, t.name
$$;
revoke all on function public.platform_metrics_read(integer) from public, anon, authenticated;
grant execute on function public.platform_metrics_read(integer) to service_role;
comment on function public.platform_metrics_read(integer) is
  'The back office''s read of platform_metrics (00279): the last p_days rolled days (at most 90), each workspace''s row with its name, newest day first.';

-- The alarm: active workspaces whose customers wrote on the day and got no answer from anyone.
create or replace function public.platform_answer_silence(p_day date default ((now() at time zone 'utc')::date - 1))
returns table (tenant_id uuid, name text, asks integer)
language sql
stable
set search_path = public
as $$
  select pm.tenant_id, t.name, pm.asks
    from public.platform_metrics pm
    join public.tenants t on t.id = pm.tenant_id
   where pm.day = p_day and pm.asks > 0 and pm.answered = 0 and t.status = 'active'
   order by pm.asks desc, t.name
$$;
revoke all on function public.platform_answer_silence(date) from public, anon, authenticated;
grant execute on function public.platform_answer_silence(date) to service_role;
comment on function public.platform_answer_silence(date) is
  'The active workspaces whose answer rate was zero on the day (00279): customers wrote, and nobody answered. The health sweep pages the platform with them.';

select cron.unschedule('platform-metrics-roll') where exists (select 1 from cron.job where jobname = 'platform-metrics-roll');
select cron.schedule('platform-metrics-roll', '17 0 * * *', $$select public.platform_metrics_roll()$$);

-- Judged on its runs, like the purges (00107): a night it does not run is a clock the health sweep names.
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('platform_metrics_roll', 'platform-metrics-roll', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;
