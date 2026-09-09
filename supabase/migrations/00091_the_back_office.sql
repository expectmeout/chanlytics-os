-- 00091 · A back office: one place that can see across workspaces, and one
--         check that decides who may.
--
-- `public.platform_admins` was created in 00001 and NOTHING has ever read it.
-- An empty table waiting for a purpose, while every support question --
-- "why isn't my receptionist answering?" -- was answered by writing SQL by
-- hand. Everything done for the Chanlytics workspace this week was a one-off
-- script and none of it is repeatable by anyone else.
--
-- This is the one surface in the product that deliberately crosses tenant
-- boundaries, so the authorization lives HERE rather than in a route:
--
--   * is_platform_admin() answers only about the caller, so it is safe to
--     grant to every session -- the app needs it to decide whether to show the
--     tab at all.
--   * platform_overview() is the cross-tenant read, and its FIRST statement is
--     the check. There is no way to reach the data that does not go through it.
--
-- Read-only, both of them. Actions across tenants come later, and only ones
-- that already exist as a workspace's own verb.

-- ------------------------------------------------------------ who is asking
--
-- Granted to `authenticated` on purpose. It reveals one bit about the caller
-- and nothing about anybody else: a customer calling it learns "no", which
-- they already knew. The app needs that bit to decide whether the back-office
-- tab exists, and the alternative -- an env var or a hardcoded list in the
-- client -- is a second answer to the same question that can disagree with
-- this one.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

comment on function public.is_platform_admin() is
  'Whether the calling session is a Chanlytics platform admin. Answers only about the caller, which is why every session may ask; platform_overview() is what the answer unlocks.';

revoke execute on function public.is_platform_admin() from public, anon;
grant  execute on function public.is_platform_admin() to authenticated;

-- --------------------------------------------------------- every workspace
--
-- One row per workspace, carrying the facts that answer most support
-- questions without a second query: is it paying, is its line answering, is
-- its texting registered, and when did it last do anything.
--
-- Every column already exists somewhere. None of them are joined anywhere
-- today, which is the entire defect: the facts were never the problem, the
-- absence of one place to read them together was.
create or replace function public.platform_overview()
returns table (
  tenant_id           uuid,
  slug                text,
  name                text,
  status              text,
  timezone            text,
  created_at          timestamptz,
  members             integer,
  -- How it pays. Null when no billing row exists at all, which is its own
  -- fact: a workspace nobody has put on an arrangement.
  billing_mode        text,
  billing_status      text,
  trial_end           timestamptz,
  current_period_end  timestamptz,
  -- Its own line: the provisioned one when there is one, a forwarded number
  -- last. Every state in the same words the workspace's own pages use.
  line_e164           text,
  line_kind           text,
  voice_state         text,
  sms_state           text,
  reg_step            text,
  reg_mock            boolean,
  reg_sole_prop       boolean,
  line_error          text,
  -- The channels the receptionist actually answers on.
  whatsapp_number     text,
  whatsapp_active     boolean,
  voice_number        text,
  voice_active        boolean,
  -- The last time a customer of theirs reached them, by either channel. This
  -- is the "is anything happening here" column, and a null on a workspace
  -- that is weeks old is the most useful thing on the page.
  last_inbound_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- THE guard, and the reason this function exists rather than a set of
  -- service-role reads in a route: a route can be added that forgets, and this
  -- cannot be reached without passing here first.
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;

  return query
    select
      t.id,
      t.slug,
      t.name,
      t.status,
      t.timezone,
      t.created_at,
      (select count(*)::integer from public.memberships m where m.tenant_id = t.id),
      b.mode,
      b.status,
      b.trial_end,
      b.current_period_end,
      l.e164,
      l.kind,
      l.voice_state,
      l.sms_state,
      l.reg_step,
      l.reg_mock,
      l.reg_sole_prop,
      l.last_error,
      wa.number_e164,
      (wa.status = 'active'),
      vo.number_e164,
      (vo.status = 'active'),
      greatest(msg.at, call.at)
    from public.tenants t
    left join public.billing_accounts b on b.tenant_id = t.id
    -- The workspace's own line. A forwarded number sorts last: it is a real
    -- line but it is somebody else's, and the question "is their line
    -- answering" is about the one we provisioned when there is one.
    left join lateral (
      select ln.e164, ln.kind, ln.voice_state, ln.sms_state, ln.reg_step, ln.reg_mock, ln.reg_sole_prop, ln.last_error
        from public.lines ln
       where ln.tenant_id = t.id
       order by (ln.kind = 'forwarded'), ln.created_at
       limit 1
    ) l on true
    left join lateral (
      select c.number_e164, c.status from public.tenant_channels c
       where c.tenant_id = t.id and c.kind = 'whatsapp' order by c.created_at limit 1
    ) wa on true
    left join lateral (
      select c.number_e164, c.status from public.tenant_channels c
       where c.tenant_id = t.id and c.kind = 'voice' order by c.created_at limit 1
    ) vo on true
    -- Both use the tenant/created indexes these tables already carry, so this
    -- stays a lookup per workspace rather than a scan as the count grows.
    left join lateral (
      select coalesce(m.channel_ts, m.created_at) as at from public.messages m
       where m.tenant_id = t.id and m.direction = 'inbound'
       order by coalesce(m.channel_ts, m.created_at) desc limit 1
    ) msg on true
    left join lateral (
      select c.started_at as at from public.calls c
       where c.tenant_id = t.id and c.direction = 'inbound'
       order by c.started_at desc nulls last limit 1
    ) call on true
    order by t.created_at;
end $$;

comment on function public.platform_overview() is
  'Every workspace with the facts that answer most support questions: how it pays, whether its line answers, where its texting registration stands, and when a customer last reached it. Platform admins only -- the check is the first statement, which is why this is the only door to cross-tenant data.';

revoke execute on function public.platform_overview() from public, anon;
grant  execute on function public.platform_overview() to authenticated;

-- ------------------------------------------------------------------- seed
--
-- The list starts with the person who runs Chanlytics, by email, because a
-- back office nobody can open is the same as no back office. Both of Ruben's
-- accounts, because he signs in as either and a tab that appears for one of
-- them looks broken from the other.
--
-- `hi@chanlytics.agency` is deliberately NOT here, though it owns the
-- Chanlytics workspace: owning a workspace does not imply reading every other
-- one, and cross-tenant access is a decision a person makes, not a
-- consequence of a membership. One insert adds it if that is the intent.
do $$
declare
  v_email text;
  v_id    uuid;
begin
  foreach v_email in array array['billing@rjcapital.io', 'ruben@rjcapital.io'] loop
    select u.id into v_id from auth.users u where lower(u.email) = v_email;
    if v_id is null then
      raise notice '00091: no account for %, so no platform admin seeded for it', v_email;
    else
      insert into public.platform_admins (user_id) values (v_id) on conflict (user_id) do nothing;
    end if;
  end loop;
end $$;
