-- 00205 · A partner is paid by hand, and a person decides what the sweep held for review.
--
-- Decision 0012, P5. Two platform verbs, the first the back office takes across workspaces that are not a workspace's
-- own (00091 reserved those; these are the platform's), each checked in the function as platform_overview is (00092):
--
--   partner_payouts               one row per payout a platform admin sent by hand: the partner, the currency, the
--                                 total, the reference, who sent it and when. The partner reads their own.
--   partner_standing_set          a person's decision on a workspace a partner brought: qualified, review or
--                                 disqualified, with why. Disqualified voids what it still held; qualified matures
--                                 what is already due, so the balance moves when the decision does, not a day later.
--   partner_payout_mark           every payable earning of one partner in one currency into one payout, refunds after
--                                 an earlier payout netted in. Nothing is paid when the net is not above zero.
--   platform_partner_balances     the back office's list: each partner, their workspaces, how many are under review,
--                                 and what they have held, payable and paid, per currency.
--   platform_partner_workspaces   the back office's column: who brought each workspace, and its standing.

-- ------------------------------------------------------------------------------------------------ partner_payouts

create table if not exists public.partner_payouts (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners (id) on delete restrict,
  currency      text not null check (currency ~ '^[a-z]{3}$'),
  total_cents   bigint not null check (total_cents > 0),
  -- How many ledger rows it settled, and the payments they came from: the first and the last.
  earnings      integer not null check (earnings > 0),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  -- What the person who sent it can find it by: the bank's or the provider's reference.
  reference     text not null check (length(btrim(reference)) between 1 and 200),
  sent_at       timestamptz not null default now(),
  sent_by       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
comment on table public.partner_payouts is
  'A payout sent to a partner by hand (0012, P5): every payable earning of theirs in one currency, netted, settled at once by partner_payout_mark. Stripe Connect replaces the hand later; the ledger stays.';
create index if not exists partner_payouts_partner_idx on public.partner_payouts (partner_id, sent_at desc);

alter table public.partner_payouts enable row level security;
revoke all on public.partner_payouts from public, anon, authenticated;
-- A partner reads their own payouts; only partner_payout_mark writes one.
drop policy if exists partner_payouts_partner_select on public.partner_payouts;
create policy partner_payouts_partner_select on public.partner_payouts
  for select to authenticated
  using (partner_id in (select p.id from public.partners p where p.user_id = (select auth.uid())));
grant select on public.partner_payouts to authenticated;

-- The earning names the payout that settled it (00203 left the column for this), and a paid earning always has one.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_earnings_payout_id_fkey') then
    alter table public.partner_earnings
      add constraint partner_earnings_payout_id_fkey
      foreign key (payout_id) references public.partner_payouts (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_earnings_paid_has_payout') then
    alter table public.partner_earnings
      add constraint partner_earnings_paid_has_payout check ((state = 'paid') = (payout_id is not null));
  end if;
end $$;
create index if not exists partner_earnings_payout_idx on public.partner_earnings (payout_id) where payout_id is not null;

-- ------------------------------------------------------------------------------------------- partner_standing_set

create or replace function public.partner_standing_set(p_tenant uuid, p_standing text, p_why text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link     public.partner_tenants;
  v_why      text := nullif(btrim(coalesce(p_why, '')), '');
  v_voided   int := 0;
  v_matured  int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  if p_standing is null or p_standing not in ('qualified', 'review', 'disqualified') then
    raise exception 'Unknown standing: %', p_standing using errcode = '22023';
  end if;
  -- A person's decision says why: the partner is written to about it, and the next person reads it.
  if v_why is null or length(v_why) > 500 then
    raise exception 'Say why, in at most 500 characters.' using errcode = '22023';
  end if;

  select * into v_link from public.partner_tenants where tenant_id = p_tenant for update;
  if v_link.tenant_id is null then
    raise exception 'No partner brought that workspace.' using errcode = 'P0002';
  end if;

  update public.partner_tenants
     set standing = p_standing, standing_why = v_why, standing_by = auth.uid(), standing_at = now()
   where tenant_id = p_tenant;

  if p_standing = 'disqualified' then
    -- What it still held is void, as the sweep would do tonight; what was paid stays paid (0012: never clawed back
    -- over a review).
    update public.partner_earnings set state = 'void' where tenant_id = p_tenant and state = 'held';
    get diagnostics v_voided = row_count;
  elsif p_standing = 'qualified' then
    -- What is already past its thirty days is payable now, for an active partner, as the sweep would do tonight.
    update public.partner_earnings e
       set state = 'payable'
      from public.partners p
     where e.tenant_id = p_tenant and e.state = 'held' and e.payable_at <= now()
       and p.id = e.partner_id and p.status = 'active';
    get diagnostics v_matured = row_count;
  end if;

  -- Recorded against the person, as every back-office action is (platform.acted), and as the workspace's own
  -- partner event, which says the same thing the sweep's does.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values
    (p_tenant, 'platform.acted', 'platform', 'tenant', p_tenant,
     jsonb_build_object('action', 'partner_standing', 'standing', p_standing, 'from', v_link.standing,
                        'by', auth.uid())),
    (p_tenant, 'partner.standing_set', 'billing', 'tenant', p_tenant,
     jsonb_build_object('partner_id', v_link.partner_id, 'standing', p_standing, 'from', v_link.standing,
                        'by', 'person', 'voided', v_voided, 'matured', v_matured));

  return jsonb_build_object('tenant_id', p_tenant, 'standing', p_standing, 'from', v_link.standing,
                            'voided', v_voided, 'matured', v_matured);
end $$;

comment on function public.partner_standing_set(uuid, text, text) is
  'A platform admin decides the standing of a workspace a partner brought (0012, P5), with why. Disqualified voids what it held; qualified makes what is past its hold payable. Recorded as platform.acted and partner.standing_set on the workspace.';

revoke execute on function public.partner_standing_set(uuid, text, text) from public, anon;
grant execute on function public.partner_standing_set(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- partner_payout_mark

create or replace function public.partner_payout_mark(p_partner uuid, p_currency text, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
  v_cur      text := lower(btrim(coalesce(p_currency, '')));
  v_total    bigint;
  v_count    int;
  v_first    timestamptz;
  v_last     timestamptz;
  v_payout   uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  if v_ref is null or length(v_ref) > 200 then
    raise exception 'Give the payment''s reference, in at most 200 characters.' using errcode = '22023';
  end if;
  if v_cur !~ '^[a-z]{3}$' then
    raise exception 'Unknown currency: %', p_currency using errcode = '22023';
  end if;
  -- The partner, locked: two admins marking the same partner paid write one payout, not two.
  perform 1 from public.partners where id = p_partner for update;
  if not found then
    raise exception 'No such partner.' using errcode = 'P0002';
  end if;

  select coalesce(sum(earned_cents), 0), count(*), min(paid_at), max(paid_at)
    into v_total, v_count, v_first, v_last
    from public.partner_earnings
   where partner_id = p_partner and currency = v_cur and state = 'payable';
  if v_count = 0 or v_total <= 0 then
    -- Nothing is sent for a net that is not above zero: refunds after the last payout wait for the next share.
    return jsonb_build_object('paid', false, 'total_cents', v_total, 'currency', v_cur);
  end if;

  insert into public.partner_payouts
    (partner_id, currency, total_cents, earnings, period_start, period_end, reference, sent_by)
  values (p_partner, v_cur, v_total, v_count, v_first, v_last, v_ref, auth.uid())
  returning id into v_payout;

  update public.partner_earnings
     set state = 'paid', payout_id = v_payout
   where partner_id = p_partner and currency = v_cur and state = 'payable';

  -- One event per workspace the payout came from, with that workspace's part. No reference and no total: a
  -- workspace's members read its events, and the partner's other workspaces are not theirs to know.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select e.tenant_id, 'partner.paid', 'billing', 'tenant', e.tenant_id,
         jsonb_build_object('partner_id', p_partner, 'payout_id', v_payout, 'earned_cents', sum(e.earned_cents),
                            'currency', v_cur, 'by', auth.uid())
    from public.partner_earnings e
   where e.payout_id = v_payout and e.tenant_id is not null
   group by e.tenant_id;

  return jsonb_build_object('paid', true, 'payout_id', v_payout, 'total_cents', v_total, 'earnings', v_count,
                            'currency', v_cur);
end $$;

comment on function public.partner_payout_mark(uuid, text, text) is
  'A platform admin records a payout sent by hand to a partner (0012, P5): every payable earning in the currency into one partner_payouts row, netted. Nothing is written when the net is not above zero.';

revoke execute on function public.partner_payout_mark(uuid, text, text) from public, anon;
grant execute on function public.partner_payout_mark(uuid, text, text) to authenticated;

-- -------------------------------------------------------------------------------------- the back office's two reads

create or replace function public.platform_partner_balances()
returns table (
  partner_id     uuid,
  code           text,
  email          text,
  status         text,
  share_bp       integer,
  joined_at      timestamptz,
  workspaces     integer,
  under_review   integer,
  currency       text,
  held_cents     bigint,
  payable_cents  bigint,
  paid_cents     bigint,
  last_paid_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  return query
  with money as (
    select e.partner_id, e.currency,
           coalesce(sum(e.earned_cents) filter (where e.state = 'held'), 0)::bigint as held,
           coalesce(sum(e.earned_cents) filter (where e.state = 'payable'), 0)::bigint as payable,
           coalesce(sum(e.earned_cents) filter (where e.state = 'paid'), 0)::bigint as paid
      from public.partner_earnings e
     group by e.partner_id, e.currency
  )
  select p.id, p.code, u.email::text, p.status, p.share_bp, p.created_at,
         (select count(*)::int from public.partner_tenants pt where pt.partner_id = p.id),
         (select count(*)::int from public.partner_tenants pt where pt.partner_id = p.id and pt.standing = 'review'),
         m.currency,
         coalesce(m.held, 0)::bigint, coalesce(m.payable, 0)::bigint, coalesce(m.paid, 0)::bigint,
         (select max(o.sent_at) from public.partner_payouts o where o.partner_id = p.id
             and (m.currency is null or o.currency = m.currency))
    from public.partners p
    left join auth.users u on u.id = p.user_id
    left join money m on m.partner_id = p.id
   order by coalesce(m.payable, 0) desc, p.created_at;
end $$;

comment on function public.platform_partner_balances() is
  'Every partner for the back office (0012, P5): their workspaces, how many are under review, and per currency what is held, payable and paid. Platform admins only.';

revoke execute on function public.platform_partner_balances() from public, anon;
grant execute on function public.platform_partner_balances() to authenticated;

create or replace function public.platform_partner_workspaces()
returns table (
  tenant_id      uuid,
  partner_id     uuid,
  code           text,
  attributed_at  timestamptz,
  standing       text,
  standing_why   text,
  standing_at    timestamptz,
  decided_by     text,
  checks         jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  return query
  select pt.tenant_id, pt.partner_id, p.code, pt.attributed_at, pt.standing, pt.standing_why, pt.standing_at,
         case when pt.standing is null then null when pt.standing_by is null then 'sweep' else 'person' end,
         pt.checks
    from public.partner_tenants pt
    join public.partners p on p.id = pt.partner_id
   order by (pt.standing = 'review') desc nulls last, pt.attributed_at desc;
end $$;

comment on function public.platform_partner_workspaces() is
  'Who brought each workspace, and its standing, for the back office (0012, P5). Platform admins only.';

revoke execute on function public.platform_partner_workspaces() from public, anon;
grant execute on function public.platform_partner_workspaces() to authenticated;
