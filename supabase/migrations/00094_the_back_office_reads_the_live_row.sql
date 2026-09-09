-- 00094 · Four things the back office got wrong about its own reads, and the
--         door that lets a fresh database have an admin at all.
--
-- Written after an adversarial pass over 00090-00093. Each of these was found by
-- reading, not by anything failing, which is the point: this surface answers
-- questions about OTHER people's businesses, so "it looked right" is not a
-- standard it gets to be held to.
--
--   1. The channel laterals took the OLDEST row per kind and ignored `status`,
--      so a workspace that reconnected WhatsApp reads as not answering.
--   2. The last-inbound lateral on `messages` orders by an EXPRESSION that no
--      index covers, so it sorts every inbound message of every workspace on
--      every page load. The comment claimed the opposite.
--   3. `platform_overview` re-declares the same 24 columns as
--      `platform_overview_rows` and plpgsql checks that agreement at CALL time,
--      which is the very failure mode 00092 existed to move to deploy time.
--   4. 00093's proof-of-closure excluded PUBLIC -- the one grantee that would
--      make the second door world-callable -- from the check it performs.
--
-- And the door: 00091 seeds platform admins by looking two emails up in
-- auth.users. On a database built from migrations alone -- a fresh project, a DR
-- rebuild, `db reset` -- auth.users is empty at that moment, so nobody is
-- seeded and there is no other way in. A back office nobody can open is the same
-- as no back office.

-- ------------------------------------------------ 1 + 2. the reads themselves
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
  -- The channels. `tenant_channels` has no unique constraint on (tenant_id,
  -- kind) and the product ADDS a row rather than replacing one -- a reconnected
  -- WhatsApp number, a second voice channel -- so taking the oldest row and
  -- ignoring `status` reported a live workspace as answering nothing. Aggregate
  -- instead of picking: active if ANY row of that kind is active, and show the
  -- number of the row that is.
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
  -- Ordered on the plain column, which IS indexed, rather than on
  -- coalesce(channel_ts, created_at), which is not: the expression form made
  -- this a sort of every inbound message per workspace on every page load. The
  -- coalesce still chooses the VALUE returned -- a WhatsApp row's channel_ts is
  -- the truer timestamp -- it just no longer decides the order.
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
  order by t.created_at;
$$;

revoke execute on function public.platform_overview_rows() from public;

-- ------------------------------------- 3. the two row types agree at DEPLOY
--
-- plpgsql checks a RETURN QUERY against the declared row type on the first CALL,
-- so the duplicated column list left exactly the failure 00092 set out to move
-- to deploy time. Assert the agreement here instead.
do $$
begin
  if pg_get_function_result('public.platform_overview'::regproc)
     is distinct from pg_get_function_result('public.platform_overview_rows'::regproc) then
    raise exception 'the back office door and its join no longer return the same row type';
  end if;
  raise notice '00094: platform_overview and platform_overview_rows agree';
end $$;

-- --------------------------------------------- 4. the proof, with PUBLIC in it
--
-- 00093 built the revoke from pg_roles (right) and then proved it with a check
-- that excluded PUBLIC (wrong) -- the single grantee that would make the inner
-- join callable by anyone at all. Read the ACL directly this time: pg_proc's
-- proacl is the authority, information_schema is a view over it, and aclexplode
-- names PUBLIC as grantee 0 rather than omitting it.
do $$
declare
  v_others text;
begin
  select string_agg(distinct coalesce(nullif(a.grantee::regrole::text, '-'), 'PUBLIC'), ', ')
    into v_others
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where p.proname = 'platform_overview_rows'
     and a.privilege_type = 'EXECUTE'
     and a.grantee is distinct from p.proowner;
  if v_others is not null then
    raise exception '00094: platform_overview_rows() is executable by %, which makes it a second door to cross-tenant data', v_others;
  end if;
  raise notice '00094: platform_overview_rows() is owner-only';
end $$;

-- --------------------------------------------------- the index the read wants
--
-- Newest inbound per workspace, which is the only question asked of messages
-- here. Partial, because inbound is a fraction of the table and outbound rows
-- are never the answer.
create index if not exists messages_tenant_inbound_recent
  on public.messages (tenant_id, created_at desc)
  where direction = 'inbound';

comment on index public.messages_tenant_inbound_recent is
  'The back office asks "when did a customer last reach this workspace" once per workspace per page load. Without this it is a sort of every inbound message the workspace has ever had.';

-- ------------------------------------------------- a repeatable way to add one
--
-- Service-role only, by email, and it says what it did. A migration seed cannot
-- do this job on a fresh database because auth.users is empty when migrations
-- run; this can be called the moment an account exists.
create or replace function public.platform_admin_add(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_id is null then
    return format('no account for %s — nothing added', p_email);
  end if;
  insert into public.platform_admins (user_id) values (v_id) on conflict (user_id) do nothing;
  return format('%s may now open the back office', p_email);
end $$;

comment on function public.platform_admin_add(text) is
  'Adds a Chanlytics platform admin by email. Service-role only, and deliberately not reachable from the app: who may read every workspace is a decision a person makes at a console, not a button. Answers in words rather than raising, so a typo is not an outage.';

revoke execute on function public.platform_admin_add(text) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from public.platform_admins) then
    raise notice '00094: platform_admins is empty — nobody can open the back office. Add one with: select public.platform_admin_add(''you@example.com'');';
  end if;
end $$;
