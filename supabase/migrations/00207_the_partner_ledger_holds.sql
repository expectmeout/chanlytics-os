-- 00207 · The partner ledger holds: what a review of 00201–00206 found, fixed in one place.
--
-- Decision 0012. None of 00201–00206 has been applied anywhere yet; this is forward-only all the same.
--
--   1. A partner may erase their account (00190 delete_my_account). partners.user_id cascaded from auth.users while
--      partner_tenants, partner_earnings and partner_payouts restricted the partner row, so erasure raised 23503 for
--      anyone who had brought a workspace. The row now outlives the person (user_id set null) and closes itself.
--   2. A refund or a dispute that arrives before its share (a retried invoice.paid, a dashboard replay) is kept in
--      partner_reversals_waiting and applied when the share is written, instead of being lost.
--   3. A partner who has become the workspace's owner earns nothing from it (0012: "a partner who is the workspace's
--      owner" is refused).
--   4. A workspace deleted after it paid leaves rows with no workspace: they mature for an active partner rather than
--      being held for ever, and no event is written for a workspace that is gone (events.tenant_id is not null).
--   5. Disqualifying voids what was payable as well as held (never a reversal: that is money owed back); a payout
--      settles only a qualified workspace's shares, and every reversal.
--   6. A payout locks and settles exactly the rows it totals, and refuses when the total is not the one the person
--      saw and sent (p_expected_cents).
--   7. partner_status_set keeps who, when and why on the partner; closing takes the partner off every team (the
--      00132 departure trigger releases what they held); a restore gives back only seats older than the pause.
--   8. The daily clock calls the edge only when something can actually mature, and forgets waiting reversals after
--      120 days.

-- ------------------------------------------------------------------------------------------------- 1. erasure

alter table public.partners alter column user_id drop not null;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'partners_user_id_fkey' and confdeltype <> 'n') then
    alter table public.partners drop constraint partners_user_id_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partners_user_id_fkey') then
    alter table public.partners
      add constraint partners_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;
  end if;
end $$;

alter table public.partners add column if not exists status_why text;
alter table public.partners add column if not exists status_by uuid references auth.users (id) on delete set null;
alter table public.partners add column if not exists status_at timestamptz;

create or replace function public.partner_closed_on_erasure() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The person erased their account: the row stays for the ledger, and nobody is left to pay or to seat.
  if new.user_id is null and old.user_id is not null then
    new.status := 'closed';
    new.status_why := 'The partner erased their account.';
    new.status_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.partner_closed_on_erasure() from public, anon, authenticated;

drop trigger if exists partners_closed_on_erasure on public.partners;
create trigger partners_closed_on_erasure
  before update of user_id on public.partners
  for each row execute function public.partner_closed_on_erasure();

-- ------------------------------------------------------------------------------------ 2. reversals that wait

create table if not exists public.partner_reversals_waiting (
  stripe_event_id    text primary key,
  stripe_invoice_id  text not null,
  kind               text not null check (kind in ('refund', 'dispute', 'dispute_won')),
  amount_cents       bigint not null check (amount_cents >= 0),
  created_at         timestamptz not null default now()
);
comment on table public.partner_reversals_waiting is
  'A refund or dispute of an invoice whose share is not written yet (0012): applied by partner_earn when the share arrives, forgotten after 120 days. The service role''s alone.';
create index if not exists partner_reversals_waiting_invoice_idx
  on public.partner_reversals_waiting (stripe_invoice_id, created_at);
alter table public.partner_reversals_waiting enable row level security;
revoke all on public.partner_reversals_waiting from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------- partner_reverse

create or replace function public.partner_reverse(
  p_invoice_id   text,
  p_event_id     text,
  p_kind         text,
  p_amount_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share   public.partner_earnings;
  v_all     bigint;
  v_same    bigint;
  v_target  bigint;
  v_delta   bigint;
  v_state   text;
  v_at      timestamptz;
  v_row     public.partner_earnings;
begin
  if p_kind not in ('refund', 'dispute', 'dispute_won') then
    raise exception 'Unknown reversal: %', p_kind using errcode = '22023';
  end if;
  select * into v_share from public.partner_earnings
   where stripe_invoice_id = p_invoice_id and kind = 'share'
   for update;
  if v_share.id is null then
    -- No share yet: it may still come (a retried invoice.paid, a replay). Kept, and applied when it is written.
    insert into public.partner_reversals_waiting (stripe_event_id, stripe_invoice_id, kind, amount_cents)
    values (p_event_id, p_invoice_id, p_kind, greatest(coalesce(p_amount_cents, 0), 0))
    on conflict (stripe_event_id) do nothing;
    return null;
  end if;
  select coalesce(sum(e.earned_cents), 0) into v_all
    from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind <> 'share';

  if p_kind = 'refund' then
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind = 'refund';
    v_target := -floor(greatest(p_amount_cents, 0)::numeric * v_share.share_bp / 10000);
    v_delta := v_target - v_same;
  elsif p_kind = 'dispute' then
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind in ('dispute', 'dispute_won');
    v_target := -floor(greatest(p_amount_cents, 0)::numeric * v_share.share_bp / 10000);
    v_delta := v_target - v_same;
  else
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind in ('dispute', 'dispute_won');
    v_delta := -v_same;
  end if;

  -- A refund or a dispute only ever takes (00203).
  if p_kind in ('refund', 'dispute') and v_delta >= 0 then
    return null;
  end if;
  if v_share.earned_cents + v_all + v_delta < 0 then
    v_delta := -(v_share.earned_cents + v_all);
  end if;
  if v_share.earned_cents + v_all + v_delta > v_share.earned_cents then
    v_delta := -v_all;
  end if;
  if v_delta = 0 then
    return null;
  end if;

  if v_share.state = 'held' then
    v_state := 'held';
    v_at := v_share.payable_at;
  elsif v_share.state = 'void' then
    v_state := 'void';
    v_at := v_share.payable_at;
  else
    v_state := 'payable';
    v_at := now();
  end if;

  insert into public.partner_earnings
    (partner_id, tenant_id, stripe_invoice_id, stripe_event_id, kind, amount_cents, currency, share_bp,
     earned_cents, paid_at, payable_at, state)
  values
    (v_share.partner_id, v_share.tenant_id, p_invoice_id, p_event_id, p_kind, greatest(p_amount_cents, 0),
     v_share.currency, v_share.share_bp, v_delta, now(), v_at, v_state)
  on conflict (stripe_event_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  -- A workspace deleted since has no events to write to (events.tenant_id is not null).
  if v_share.tenant_id is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_share.tenant_id, 'partner.reversed', 'billing', 'tenant', v_share.tenant_id,
            jsonb_build_object('partner_id', v_share.partner_id, 'invoice', p_invoice_id, 'kind', p_kind,
                               'earned_cents', v_delta, 'currency', v_share.currency));
  end if;
  return jsonb_build_object('id', v_row.id, 'earned_cents', v_delta, 'state', v_state);
end $$;

revoke execute on function public.partner_reverse(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.partner_reverse(text, text, text, bigint) to service_role;

-- ---------------------------------------------------------------------------------------------- partner_earn

create or replace function public.partner_earn(
  p_tenant_id    uuid,
  p_invoice_id   text,
  p_event_id     text,
  p_amount_cents bigint,
  p_currency     text,
  p_paid_at      timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link    public.partner_tenants;
  v_partner public.partners;
  v_earned  bigint;
  v_row     public.partner_earnings;
  v_wait    record;
begin
  select * into v_link from public.partner_tenants where tenant_id = p_tenant_id;
  if v_link.tenant_id is null then
    return null;
  end if;
  if v_link.standing = 'disqualified' or coalesce(p_amount_cents, 0) <= 0 then
    return null;
  end if;
  select * into v_partner from public.partners where id = v_link.partner_id;
  if v_partner.status = 'closed' then
    return null;
  end if;
  -- A partner who owns the workspace is paying themselves (0012, decision 5): nothing is earned.
  if exists (select 1 from public.memberships m
              where m.tenant_id = p_tenant_id and m.user_id = v_partner.user_id and m.role = 'owner') then
    return null;
  end if;
  v_earned := floor(p_amount_cents::numeric * v_partner.share_bp / 10000);
  if v_earned <= 0 then
    return null;
  end if;
  insert into public.partner_earnings
    (partner_id, tenant_id, stripe_invoice_id, stripe_event_id, kind, amount_cents, currency, share_bp,
     earned_cents, paid_at, payable_at)
  values
    (v_partner.id, p_tenant_id, p_invoice_id, p_event_id, 'share', p_amount_cents, lower(p_currency),
     v_partner.share_bp, v_earned, p_paid_at, p_paid_at + interval '30 days')
  on conflict do nothing
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'partner.earned', 'billing', 'tenant', p_tenant_id,
          jsonb_build_object('partner_id', v_partner.id, 'invoice', p_invoice_id, 'amount_cents', p_amount_cents,
                             'earned_cents', v_earned, 'currency', lower(p_currency)));
  -- What arrived before the share is applied now, in the order it arrived.
  for v_wait in
    select * from public.partner_reversals_waiting where stripe_invoice_id = p_invoice_id order by created_at
  loop
    perform public.partner_reverse(v_wait.stripe_invoice_id, v_wait.stripe_event_id, v_wait.kind, v_wait.amount_cents);
    delete from public.partner_reversals_waiting where stripe_event_id = v_wait.stripe_event_id;
  end loop;
  return jsonb_build_object('id', v_row.id, 'earned_cents', v_earned, 'payable_at', v_row.payable_at);
end $$;

revoke execute on function public.partner_earn(uuid, text, text, bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.partner_earn(uuid, text, text, bigint, text, timestamptz) to service_role;

-- ------------------------------------------------------------------------------------------------- the sweep

create or replace function public.partner_earnings_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link      record;
  v_same_card boolean;
  v_same_list boolean;
  v_judged    int := 0;
  v_review    int := 0;
  v_payable   int := 0;
  v_void      int := 0;
  v_forgot    int := 0;
begin
  -- 1. Standing, once a workspace has paid (00203, unchanged).
  for v_link in
    select pt.tenant_id, pt.partner_id, p.user_id as partner_user, t.created_at as made_at
      from public.partner_tenants pt
      join public.partners p on p.id = pt.partner_id
      join public.tenants t on t.id = pt.tenant_id
     where pt.standing is null
       and exists (select 1 from public.partner_earnings e
                    where e.tenant_id = pt.tenant_id and e.kind = 'share'
                      and (e.paid_at <= p_now - interval '7 days'
                           or exists (select 1 from public.billing_card_marks m where m.tenant_id = pt.tenant_id)))
     for update of pt skip locked
  loop
    select exists (
      select 1 from public.billing_card_marks mine
        join public.billing_card_marks theirs on theirs.card_fingerprint = mine.card_fingerprint
        join public.memberships m on m.tenant_id = theirs.tenant_id
       where mine.tenant_id = v_link.tenant_id
         and theirs.tenant_id <> v_link.tenant_id
         and m.user_id = v_link.partner_user and m.role = 'owner'
    ) into v_same_card;
    select exists (
      select 1 from public.google_listings mine
        join public.google_listings theirs on theirs.place_id = mine.place_id
        join public.tenants t on t.id = theirs.tenant_id
       where mine.tenant_id = v_link.tenant_id
         and theirs.tenant_id <> v_link.tenant_id
         and t.created_at < v_link.made_at
    ) into v_same_list;
    update public.partner_tenants
       set standing = case when v_same_card or v_same_list then 'review' else 'qualified' end,
           standing_why = case
             when v_same_card then 'The card that pays for it also pays for a workspace the partner owns.'
             when v_same_list then 'Its Google listing belongs to an older workspace.'
             else null end,
           standing_at = p_now,
           standing_by = null,
           checks = jsonb_build_object('same_card', v_same_card, 'same_listing', v_same_list)
     where tenant_id = v_link.tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_link.tenant_id, 'partner.standing_set', 'billing', 'tenant', v_link.tenant_id,
            jsonb_build_object('partner_id', v_link.partner_id,
                               'standing', case when v_same_card or v_same_list then 'review' else 'qualified' end,
                               'by', 'sweep'));
    v_judged := v_judged + 1;
    if v_same_card or v_same_list then v_review := v_review + 1; end if;
  end loop;

  -- 2. What is due matures, for an active partner: on a qualified workspace, or on one deleted since it paid (its
  --    standing went with it; a refund still reverses it).
  update public.partner_earnings e
     set state = 'payable'
    from public.partners p
   where e.state = 'held' and e.payable_at <= p_now
     and p.id = e.partner_id and p.status = 'active'
     and (e.tenant_id is null
          or exists (select 1 from public.partner_tenants pt
                      where pt.tenant_id = e.tenant_id and pt.standing = 'qualified'));
  get diagnostics v_payable = row_count;

  -- 3. What a disqualified workspace still held is void.
  update public.partner_earnings e
     set state = 'void'
    from public.partner_tenants pt
   where e.state = 'held' and pt.tenant_id = e.tenant_id and pt.standing = 'disqualified';
  get diagnostics v_void = row_count;

  -- 4. A reversal that waited 120 days for a share that never came is not coming.
  delete from public.partner_reversals_waiting where created_at < p_now - interval '120 days';
  get diagnostics v_forgot = row_count;

  return jsonb_build_object('judged', v_judged, 'review', v_review, 'payable', v_payable, 'void', v_void,
                            'forgot', v_forgot);
end $$;

revoke execute on function public.partner_earnings_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.partner_earnings_sweep(timestamptz) to service_role;

create or replace function public.trigger_partners_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only when something can be judged or can mature: a share held behind a review or a paused partner is not due,
  -- and asking the edge about it every day would be asking for nothing.
  if exists (select 1 from public.partner_tenants pt
              where pt.standing is null
                and exists (select 1 from public.partner_earnings e where e.tenant_id = pt.tenant_id))
     or exists (select 1 from public.partner_earnings e
                  join public.partners p on p.id = e.partner_id and p.status = 'active'
                 where e.state = 'held' and e.payable_at <= now()
                   and (e.tenant_id is null
                        or exists (select 1 from public.partner_tenants pt
                                    where pt.tenant_id = e.tenant_id and pt.standing in ('qualified', 'disqualified')))) then
    return public.request_sweep('partners', '/api/cron/partners', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('partners', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_partners_sweep() from public, anon, authenticated;

-- --------------------------------------------------------------------------------------- partner_standing_set

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
    -- Every share not yet paid is void, held or payable. A reversal stays: it is money owed back, not earned.
    update public.partner_earnings set state = 'void'
     where tenant_id = p_tenant and state in ('held', 'payable') and earned_cents > 0;
    get diagnostics v_voided = row_count;
  elsif p_standing = 'qualified' then
    update public.partner_earnings e
       set state = 'payable'
      from public.partners p
     where e.tenant_id = p_tenant and e.state = 'held' and e.payable_at <= now()
       and p.id = e.partner_id and p.status = 'active';
    get diagnostics v_matured = row_count;
  end if;

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

revoke execute on function public.partner_standing_set(uuid, text, text) from public, anon;
grant execute on function public.partner_standing_set(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------- partner_payout_mark

drop function if exists public.partner_payout_mark(uuid, text, text);

create or replace function public.partner_payout_mark(
  p_partner         uuid,
  p_currency        text,
  p_reference       text,
  p_expected_cents  bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
  v_cur      text := lower(btrim(coalesce(p_currency, '')));
  v_ids      uuid[];
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
  perform 1 from public.partners where id = p_partner for update;
  if not found then
    raise exception 'No such partner.' using errcode = 'P0002';
  end if;

  -- The rows are locked and counted in one statement, and exactly those are settled: a row the sweep, a standing
  -- or a refund makes payable meanwhile waits for the next payout. A share of a workspace under review or
  -- disqualified is not settled; every reversal is.
  select coalesce(array_agg(d.id), '{}'), coalesce(sum(d.earned_cents), 0), count(*), min(d.paid_at), max(d.paid_at)
    into v_ids, v_total, v_count, v_first, v_last
    from (select e.id, e.earned_cents, e.paid_at
            from public.partner_earnings e
           where e.partner_id = p_partner and e.currency = v_cur and e.state = 'payable'
             and (e.earned_cents < 0 or e.tenant_id is null
                  or exists (select 1 from public.partner_tenants pt
                              where pt.tenant_id = e.tenant_id and pt.standing = 'qualified'))
             for update of e) d;

  if p_expected_cents is not null and v_total <> p_expected_cents then
    -- What is payable moved since the page was read: nothing is recorded until the person sees the new number.
    return jsonb_build_object('paid', false, 'changed', true, 'total_cents', v_total, 'currency', v_cur);
  end if;
  if v_count = 0 or v_total <= 0 then
    return jsonb_build_object('paid', false, 'total_cents', v_total, 'currency', v_cur);
  end if;

  insert into public.partner_payouts
    (partner_id, currency, total_cents, earnings, period_start, period_end, reference, sent_by)
  values (p_partner, v_cur, v_total, v_count, v_first, v_last, v_ref, auth.uid())
  returning id into v_payout;

  update public.partner_earnings set state = 'paid', payout_id = v_payout where id = any (v_ids);

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

comment on function public.partner_payout_mark(uuid, text, text, bigint) is
  'A platform admin records a payout sent by hand to a partner (0012, P5): the payable shares of qualified workspaces and every reversal in the currency, locked and settled together. Refused (paid: false, changed: true) when the total is not p_expected_cents; nothing is written when the net is not above zero.';

revoke execute on function public.partner_payout_mark(uuid, text, text, bigint) from public, anon;
grant execute on function public.partner_payout_mark(uuid, text, text, bigint) to authenticated;

-- ----------------------------------------------------------------------------------------- partner_status_set

create or replace function public.partner_status_set(p_partner uuid, p_status text, p_why text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner   public.partners;
  v_why       text := nullif(btrim(coalesce(p_why, '')), '');
  v_tenants   uuid[];
  v_seats     int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Not a Chanlytics platform admin.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'closed') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;
  if v_why is null or length(v_why) > 500 then
    raise exception 'Say why, in at most 500 characters.' using errcode = '22023';
  end if;
  select * into v_partner from public.partners where id = p_partner for update;
  if v_partner.id is null then
    raise exception 'No such partner.' using errcode = 'P0002';
  end if;

  if p_status = 'paused' then
    -- Every partner seat becomes a viewer's, and the workspace remembers when; what they held is released (00132).
    with taken as (
      update public.memberships m
         set role = 'viewer'
        from public.partner_tenants pt
       where pt.partner_id = p_partner and m.tenant_id = pt.tenant_id
         and m.user_id = v_partner.user_id and m.role = 'partner'
      returning m.tenant_id
    )
    select coalesce(array_agg(tenant_id), '{}') into v_tenants from taken;
    update public.partner_tenants set seat_held_at = now()
     where partner_id = p_partner and tenant_id = any (v_tenants);
    update public.conversations set assignee_user_id = null
     where tenant_id = any (v_tenants) and assignee_user_id = v_partner.user_id;
    update public.conversations
       set control_kind = null, control_by = null, control_ref = null, control_until = null
     where tenant_id = any (v_tenants) and control_kind = 'person' and control_by = v_partner.user_id;
  elsif p_status = 'closed' then
    -- Off every team: their partner seats, and the viewer seats a pause left them. The departure trigger (00132)
    -- releases what they held. Nothing comes back from a close.
    with gone as (
      delete from public.memberships m
       using public.partner_tenants pt
       where pt.partner_id = p_partner and m.tenant_id = pt.tenant_id and m.user_id = v_partner.user_id
         and (m.role = 'partner'
              or (m.role = 'viewer' and pt.seat_held_at is not null and m.created_at <= pt.seat_held_at))
      returning m.tenant_id
    )
    select coalesce(array_agg(tenant_id), '{}') into v_tenants from gone;
    update public.partner_tenants set seat_held_at = null where partner_id = p_partner;
  else
    -- Restored: only the seats a pause took, still a viewer's, and made before the pause. A person the owner
    -- removed and invited back since is the owner's choice, not the pause's.
    with given as (
      update public.memberships m
         set role = 'partner'
        from public.partner_tenants pt
       where pt.partner_id = p_partner and pt.seat_held_at is not null and m.tenant_id = pt.tenant_id
         and m.user_id = v_partner.user_id and m.role = 'viewer' and m.created_at <= pt.seat_held_at
      returning m.tenant_id
    )
    select coalesce(array_agg(tenant_id), '{}') into v_tenants from given;
    update public.partner_tenants set seat_held_at = null where partner_id = p_partner and seat_held_at is not null;
  end if;
  v_seats := coalesce(array_length(v_tenants, 1), 0);

  update public.partners
     set status = p_status, status_why = v_why, status_by = auth.uid(), status_at = now()
   where id = p_partner;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  select t, 'platform.acted', 'platform', 'tenant', t,
         jsonb_build_object('action', 'partner_status', 'status', p_status, 'from', v_partner.status,
                            'by', auth.uid())
    from unnest(v_tenants) as t;

  return jsonb_build_object('partner_id', p_partner, 'status', p_status, 'from', v_partner.status, 'seats', v_seats);
end $$;

comment on function public.partner_status_set(uuid, text, text) is
  'A platform admin pauses, closes or restores a partner (0012), with why, kept on the partner row. A pause makes each partner seat a viewer''s and releases what they held; a close takes them off every team; a restore gives back only the seats a pause took, made before it.';

revoke execute on function public.partner_status_set(uuid, text, text) from public, anon;
grant execute on function public.partner_status_set(uuid, text, text) to authenticated;
