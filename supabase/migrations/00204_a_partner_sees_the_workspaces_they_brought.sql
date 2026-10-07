-- 00204 · A partner sees the workspaces they brought: the back office's row, for theirs alone, and what each earned.
--
-- Decision 0012, P4. The partner's table is the back office's (00094 platform_overview_rows): the same row, judged by
-- the same verdicts (contracts platformRows), for the workspaces they brought and still sit on the team of. One body,
-- two callers: the join moves into platform_overview_rows_for(tenant ids), the back office asks it for every
-- workspace, and partner_overview for the caller's. An empty or missing list is no rows, never every row.
--
--   platform_overview_rows_for  00094's body with the one filter. Owner-only, as its caller was (00093's rule).
--   platform_overview_rows      every workspace, through it: the back office's door (00092) is unchanged.
--   partner_overview            the caller's workspaces as partner, where they still hold the partner seat: a partner
--                               the owner removed keeps their share, not a view of the business.
--   partner_workspace_money     for every workspace the caller brought, on the team or not: its standing, and what it
--                               earned them, held, payable and paid, and from this month's payments.

-- ------------------------------------------------------------------------------------------------ the one join

create or replace function public.platform_overview_rows_for(p_tenants uuid[])
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
    wa.active,
    vo.number_e164,
    vo.active
    ,greatest(msg.at, call.at)
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
  -- The channels: active if ANY row of that kind is active, and the number of the row that is (00094).
  left join lateral (
    select bool_or(c.status = 'active') as active,
           (array_agg(c.number_e164 order by (c.status <> 'active'), c.created_at desc))[1] as number_e164
      from public.tenant_channels c
     where c.tenant_id = t.id and c.kind = 'whatsapp'
  ) wa on true
  left join lateral (
    select bool_or(c.status = 'active') as active,
           (array_agg(c.number_e164 order by (c.status <> 'active'), c.created_at desc))[1] as number_e164
      from public.tenant_channels c
     where c.tenant_id = t.id and c.kind = 'voice'
  ) vo on true
  -- Ordered on the plain, indexed column (00094's reason); the coalesce chooses the value, not the order.
  left join lateral (
    select coalesce(m.channel_ts, m.created_at) as at from public.messages m
     where m.tenant_id = t.id and m.direction = 'inbound'
     order by m.created_at desc limit 1
  ) msg on true
  left join lateral (
    select c.started_at as at from public.calls c
     where c.tenant_id = t.id and c.direction = 'inbound'
     order by c.started_at desc nulls last limit 1
  ) call on true
  -- The one filter. A null or empty list matches nothing: every caller names the workspaces it may see.
  where t.id = any(coalesce(p_tenants, '{}'::uuid[]))
  order by t.created_at;
$$;

comment on function public.platform_overview_rows_for(uuid[]) is
  'One row per named workspace: is it paying, is its line answering, is its texting registered, when did it last hear from a customer. The one join behind the back office and the partner''s table (0012). Owner-only: the doors that call it decide which workspaces.';

revoke execute on function public.platform_overview_rows_for(uuid[]) from public, anon, authenticated, service_role;

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
  select * from public.platform_overview_rows_for(array(select t.id from public.tenants t));
$$;

revoke execute on function public.platform_overview_rows() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------- partner_overview

create or replace function public.partner_overview()
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
stable
as $$
begin
  -- The caller's own workspaces as partner, and only while the partner seat is theirs: the list is the check.
  return query
    select * from public.platform_overview_rows_for(array(
      select pt.tenant_id
        from public.partner_tenants pt
        join public.partners p on p.id = pt.partner_id
        join public.memberships m on m.tenant_id = pt.tenant_id and m.user_id = p.user_id and m.role = 'partner'
       where p.user_id = (select auth.uid())
    ));
end $$;

comment on function public.partner_overview() is
  'The back office''s row (platform_overview_rows_for) for each workspace the calling partner brought and still sits on the team of (0012, P4). A caller who is no partner, or holds no seat, gets no rows.';

revoke execute on function public.partner_overview() from public, anon;
grant execute on function public.partner_overview() to authenticated;

-- --------------------------------------------------------------------------------- partner_workspace_money

create or replace function public.partner_workspace_money()
returns table (
  tenant_id      uuid,
  name           text,
  on_team        boolean,
  standing       text,
  currency       text,
  held_cents     bigint,
  payable_cents  bigint,
  paid_cents     bigint,
  month_cents    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select pt.tenant_id,
         t.name,
         exists (select 1 from public.memberships m
                  where m.tenant_id = pt.tenant_id and m.user_id = p.user_id and m.role = 'partner'),
         pt.standing,
         coalesce(e.currency, 'usd'),
         coalesce(e.held, 0)::bigint,
         coalesce(e.payable, 0)::bigint,
         coalesce(e.paid, 0)::bigint,
         coalesce(e.month, 0)::bigint
    from public.partner_tenants pt
    join public.partners p on p.id = pt.partner_id
    join public.tenants t on t.id = pt.tenant_id
    left join lateral (
      select x.currency,
             sum(x.earned_cents) filter (where x.state = 'held') as held,
             sum(x.earned_cents) filter (where x.state = 'payable') as payable,
             sum(x.earned_cents) filter (where x.state = 'paid') as paid,
             sum(x.earned_cents) filter (where x.kind = 'share' and x.state <> 'void'
                                           and x.paid_at >= date_trunc('month', now())) as month
        from public.partner_earnings x
       where x.tenant_id = pt.tenant_id and x.partner_id = pt.partner_id
       group by x.currency
    ) e on true
   where p.user_id = (select auth.uid())
   order by t.name, e.currency
$$;

comment on function public.partner_workspace_money() is
  'For each workspace the calling partner brought (0012, P4), on its team or not: whether they still sit on it, its standing, and its earnings held, payable, paid, and from this month''s payments, by currency. Answers about the caller alone.';

revoke execute on function public.partner_workspace_money() from public, anon;
grant execute on function public.partner_workspace_money() to authenticated;

-- -------------------------------------------------------------------------- the row types agree at DEPLOY

-- 00094's reason: plpgsql checks a RETURN QUERY against its declared type only on the first call.
do $$
begin
  if pg_get_function_result('public.platform_overview'::regproc)
     is distinct from pg_get_function_result('public.platform_overview_rows_for'::regproc)
     or pg_get_function_result('public.partner_overview'::regproc)
     is distinct from pg_get_function_result('public.platform_overview_rows_for'::regproc) then
    raise exception 'the back office, the partner''s table and their join no longer return the same row type';
  end if;
end $$;

-- 00094's other proof, for the new join: executable by its owner and nobody else.
do $$
declare
  v_others text;
begin
  select string_agg(distinct coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC'), ', ')
    into v_others
    from pg_proc f
    join pg_namespace n on n.oid = f.pronamespace and n.nspname = 'public'
    cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
   where f.proname in ('platform_overview_rows_for', 'platform_overview_rows')
     and a.privilege_type = 'EXECUTE'
     and a.grantee is distinct from f.proowner;
  if v_others is not null then
    raise exception '00204: the back office''s join is executable by %, which makes it a door to every workspace', v_others;
  end if;
end $$;
