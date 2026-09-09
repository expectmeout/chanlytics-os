-- 00092 · The back office's query, checked when the migration runs rather than
--         when somebody opens the page.
--
-- 00091 put the cross-tenant join inside a plpgsql function. Postgres does not
-- parse a plpgsql body at CREATE time -- `check_function_bodies` validates
-- SQL-language bodies only -- so a mistyped column in there is not an error
-- until the first call. The first call is a person in support opening the back
-- office to answer "why isn't my receptionist answering?", which is the worst
-- possible moment to find out, and no test can reach it either: exercising it
-- needs a signed-in platform admin's session, which CI does not have.
--
-- So the join moves into a SQL-language function, where every column name is
-- resolved and type-checked as this migration applies. Get one wrong and the
-- deploy fails, which is the only time it is cheap.
--
-- The guard does not move. It stays the FIRST STATEMENT of the only function
-- anybody may call, and the inner one is reachable from nowhere else:
--
--   platform_overview()       definer, guarded, granted to authenticated
--   platform_overview_rows()  the join. NO privileges of its own and execute
--                             revoked from everyone -- it runs only as the
--                             effective user of the definer above it.

-- The join. security INVOKER deliberately: it has no authority by itself and
-- borrows the caller's, which in practice is only ever platform_overview()
-- running as its owner. A session that somehow reached it directly would be
-- refused by the EXECUTE revoke below, and would be refused again by RLS.
create or replace function public.platform_overview_rows()
returns table (
  tenant_id           uuid,
  slug                text,
  name                text,
  status              text,
  timezone            text,
  created_at          timestamptz,
  members             integer,
  billing_mode        text,
  billing_status      text,
  trial_end           timestamptz,
  current_period_end  timestamptz,
  line_e164           text,
  line_kind           text,
  voice_state         text,
  sms_state           text,
  reg_step            text,
  reg_mock            boolean,
  reg_sole_prop       boolean,
  line_error          text,
  whatsapp_number     text,
  whatsapp_active     boolean,
  voice_number        text,
  voice_active        boolean,
  last_inbound_at     timestamptz
)
language sql
set search_path = public
stable
as $$
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
  -- The workspace's own line. A forwarded number sorts last: it is a real line
  -- but it is somebody else's, and "is their line answering" is about the one
  -- we provisioned whenever there is one.
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
  -- Both use the tenant indexes these tables already carry, so this stays a
  -- lookup per workspace rather than a scan as the count grows.
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
$$;

comment on function public.platform_overview_rows() is
  'The back office join, in a SQL-language function so every column is validated when the migration applies. Not a door: execute is revoked from every role, and platform_overview() -- which carries the platform-admin check -- is the only caller.';

revoke execute on function public.platform_overview_rows() from public, anon, authenticated;

-- The door. Unchanged in behaviour: the check is still the first statement, and
-- it is still the only way to the rows.
create or replace function public.platform_overview()
returns table (
  tenant_id           uuid,
  slug                text,
  name                text,
  status              text,
  timezone            text,
  created_at          timestamptz,
  members             integer,
  billing_mode        text,
  billing_status      text,
  trial_end           timestamptz,
  current_period_end  timestamptz,
  line_e164           text,
  line_kind           text,
  voice_state         text,
  sms_state           text,
  reg_step            text,
  reg_mock            boolean,
  reg_sole_prop       boolean,
  line_error          text,
  whatsapp_number     text,
  whatsapp_active     boolean,
  voice_number        text,
  voice_active        boolean,
  last_inbound_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- THE guard, and the reason this is a function rather than a set of
  -- service-role reads in a route: a route can be added that forgets, and this
  -- cannot be reached without passing here first. Note that it turns the
  -- service role away too -- the check is about who is asking (auth.uid()),
  -- not about RLS -- so a key alone opens nothing.
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  return query select * from public.platform_overview_rows();
end $$;

comment on function public.platform_overview() is
  'Every workspace with the facts that answer most support questions: how it pays, whether its line answers, where its texting registration stands, and when a customer last reached it. Platform admins only -- the check is the first statement, which is why this is the only door to cross-tenant data.';

revoke execute on function public.platform_overview() from public, anon;
grant  execute on function public.platform_overview() to authenticated;
