-- 00191 · A partner earns a share: the ledger, held thirty days, reversed by a refund or a dispute.
--
-- Decision 0011, P3. What a partner earns is written from what Stripe collected, never from a plan's price, and
-- never by anything but the Stripe webhook (the service role). Every row carries the Stripe event that wrote it, and
-- that id is unique, so a delivery replayed writes nothing.
--
--   partner_earnings        one row per movement: a share of a paid plan invoice, a refund's reversal, a dispute's,
--                           a won dispute's reinstatement. A share is held until paid_at + 30 days; the sweep makes it
--                           payable once the workspace's standing is qualified and the partner is active. Reversals
--                           are capped at the share they reverse and mature with it, so a held share and its refund
--                           net out together, and a reversal of a share already payable or paid nets from the next
--                           payout. `void` is a held row of a workspace found disqualified.
--   billing_card_marks      the card fingerprint a workspace's subscription pays with, kept apart from billing_accounts
--                           (which every member reads) because only the sweep needs it: service role only.
--   partner_earn            the webhook's invoice.paid: a share for an attributed workspace's plan invoice.
--   partner_reverse         the webhook's charge.refunded and charge.dispute.*: a reversal of that invoice's share.
--   partner_earnings_sweep  the daily clock: judges a workspace's standing once it has paid, and matures what is due.
--   partner_balance         the caller's own totals, by currency and state, for the pane.

-- ----------------------------------------------------------------------------------------- partner_earnings

create table if not exists public.partner_earnings (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.partners (id) on delete restrict,
  -- Kept when a workspace is deleted, as billing_events is: money owed or paid outlives the workspace it came from.
  tenant_id          uuid references public.tenants (id) on delete set null,
  stripe_invoice_id  text not null,
  stripe_event_id    text not null unique,
  kind               text not null check (kind in ('share', 'refund', 'dispute', 'dispute_won')),
  -- What Stripe said: the invoice's amount paid, the refund's running total, or the amount disputed.
  amount_cents       bigint not null check (amount_cents >= 0),
  currency           text not null check (currency ~ '^[a-z]{3}$'),
  share_bp           integer not null check (share_bp between 0 and 10000),
  -- Positive for a share or a reinstatement, negative for a reversal.
  earned_cents       bigint not null,
  paid_at            timestamptz not null,
  payable_at         timestamptz not null,
  state              text not null default 'held' check (state in ('held', 'payable', 'paid', 'void')),
  -- The payout that settled it (0011, P5).
  payout_id          uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.partner_earnings is
  'What a partner earned (0011), one row per movement, written only by the Stripe webhook through partner_earn and partner_reverse. held until payable_at, then payable once the workspace qualifies; void when it is disqualified while held.';

-- One share per invoice, whatever delivers it.
create unique index if not exists partner_earnings_share_idx on public.partner_earnings (stripe_invoice_id)
  where kind = 'share';
create index if not exists partner_earnings_partner_idx on public.partner_earnings (partner_id, state);
create index if not exists partner_earnings_due_idx on public.partner_earnings (payable_at) where state = 'held';

drop trigger if exists partner_earnings_moddatetime on public.partner_earnings;
create trigger partner_earnings_moddatetime before update on public.partner_earnings
  for each row execute function extensions.moddatetime('updated_at');

alter table public.partner_earnings enable row level security;
revoke all on public.partner_earnings from public, anon, authenticated;
-- A partner reads their own rows; nothing else reads or writes them but the service role.
drop policy if exists partner_earnings_partner_select on public.partner_earnings;
create policy partner_earnings_partner_select on public.partner_earnings
  for select to authenticated
  using (partner_id in (select p.id from public.partners p where p.user_id = (select auth.uid())));
grant select on public.partner_earnings to authenticated;

-- ---------------------------------------------------------------------------------------- billing_card_marks

create table if not exists public.billing_card_marks (
  tenant_id         uuid primary key references public.tenants (id) on delete cascade,
  card_fingerprint  text not null,
  seen_at           timestamptz not null default now()
);
comment on table public.billing_card_marks is
  'The fingerprint of the card a workspace''s subscription pays with, as Stripe gives it (0011). Read by the partner sweep alone, to see a partner paying for a workspace they claim to have brought. No member reads it.';
create index if not exists billing_card_marks_fingerprint_idx on public.billing_card_marks (card_fingerprint);

alter table public.billing_card_marks enable row level security;
revoke all on public.billing_card_marks from public, anon, authenticated;

-- --------------------------------------------------------------------------------------------- partner_earn

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
begin
  select * into v_link from public.partner_tenants where tenant_id = p_tenant_id;
  if v_link.tenant_id is null then
    return null; -- nobody brought this workspace: the common case, answered first
  end if;
  if v_link.standing = 'disqualified' or coalesce(p_amount_cents, 0) <= 0 then
    return null;
  end if;
  select * into v_partner from public.partners where id = v_link.partner_id;
  if v_partner.status = 'closed' then
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
    return null; -- this invoice, or this delivery, was written already
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'partner.earned', 'billing', 'tenant', p_tenant_id,
          jsonb_build_object('partner_id', v_partner.id, 'invoice', p_invoice_id, 'amount_cents', p_amount_cents,
                             'earned_cents', v_earned, 'currency', lower(p_currency)));
  return jsonb_build_object('id', v_row.id, 'earned_cents', v_earned, 'payable_at', v_row.payable_at);
end $$;

comment on function public.partner_earn(uuid, text, text, bigint, text, timestamptz) is
  'A share of a paid plan invoice for the partner who brought this workspace (0011), at the partner''s share_bp, held thirty days. Null when nobody brought it, it is disqualified, or the invoice or delivery was written already.';

revoke execute on function public.partner_earn(uuid, text, text, bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.partner_earn(uuid, text, text, bigint, text, timestamptz) to service_role;

-- ------------------------------------------------------------------------------------------ partner_reverse

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
  -- The share, locked: two deliveries about one invoice are written one after the other.
  select * into v_share from public.partner_earnings
   where stripe_invoice_id = p_invoice_id and kind = 'share'
   for update;
  if v_share.id is null then
    return null; -- no share for this invoice: nobody brought the workspace, or it earned nothing
  end if;
  select coalesce(sum(e.earned_cents), 0) into v_all
    from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind <> 'share';

  if p_kind = 'refund' then
    -- Stripe says how much of the charge is refunded so far; the reversal is what that total takes, less what the
    -- refunds before it took.
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
    -- A dispute won gives back what its dispute took.
    select coalesce(sum(e.earned_cents), 0) into v_same
      from public.partner_earnings e where e.stripe_invoice_id = p_invoice_id and e.kind in ('dispute', 'dispute_won');
    v_delta := -v_same;
  end if;

  -- Never more than the share: a refund and a dispute of the same charge take it once.
  if v_share.earned_cents + v_all + v_delta < 0 then
    v_delta := -(v_share.earned_cents + v_all);
  end if;
  -- And a reinstatement never above it.
  if v_share.earned_cents + v_all + v_delta > v_share.earned_cents then
    v_delta := -v_all;
  end if;
  if v_delta = 0 then
    return null;
  end if;

  -- It matures with the share while the share is held; otherwise it nets from the next payout.
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
    return null; -- this delivery was written already
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_share.tenant_id, 'partner.reversed', 'billing', 'tenant', v_share.tenant_id,
          jsonb_build_object('partner_id', v_share.partner_id, 'invoice', p_invoice_id, 'kind', p_kind,
                             'earned_cents', v_delta, 'currency', v_share.currency));
  return jsonb_build_object('id', v_row.id, 'earned_cents', v_delta, 'state', v_state);
end $$;

comment on function public.partner_reverse(text, text, text, bigint) is
  'A refund, a dispute or a won dispute of an invoice a partner earned a share of (0011): the difference it makes to the share, capped so the share is taken at most once and given back at most once. Null when there is no share or nothing changes.';

revoke execute on function public.partner_reverse(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.partner_reverse(text, text, text, bigint) to service_role;

-- -------------------------------------------------------------------------------------------- the card mark

create or replace function public.billing_card_mark(p_tenant_id uuid, p_fingerprint text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.billing_card_marks (tenant_id, card_fingerprint, seen_at)
  values (p_tenant_id, p_fingerprint, now())
  on conflict (tenant_id) do update set card_fingerprint = excluded.card_fingerprint, seen_at = excluded.seen_at;
$$;
revoke execute on function public.billing_card_mark(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_card_mark(uuid, text) to service_role;

-- ------------------------------------------------------------------------------------ the sweep's two passes

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
begin
  -- 1. Standing, once a workspace has paid: a week after its first share, or as soon as its card is known. The card
  --    of a workspace the partner owns, or a Google listing an older workspace already has, is held for a person to
  --    look at; anything else qualifies. Judged once: a person moves it after that (0011, P5).
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
                               'same_card', v_same_card, 'same_listing', v_same_list, 'by', 'sweep'));
    v_judged := v_judged + 1;
    if v_same_card or v_same_list then v_review := v_review + 1; end if;
  end loop;

  -- 2. What is due matures: past its date, on a qualified workspace, for an active partner.
  update public.partner_earnings e
     set state = 'payable'
    from public.partner_tenants pt, public.partners p
   where e.state = 'held' and e.payable_at <= p_now
     and pt.tenant_id = e.tenant_id and pt.standing = 'qualified'
     and p.id = e.partner_id and p.status = 'active';
  get diagnostics v_payable = row_count;

  -- 3. What a disqualified workspace still held is void.
  update public.partner_earnings e
     set state = 'void'
    from public.partner_tenants pt
   where e.state = 'held' and pt.tenant_id = e.tenant_id and pt.standing = 'disqualified';
  get diagnostics v_void = row_count;

  return jsonb_build_object('judged', v_judged, 'review', v_review, 'payable', v_payable, 'void', v_void);
end $$;

comment on function public.partner_earnings_sweep(timestamptz) is
  'The partner clock (0011): judges the standing of each attributed workspace once it has paid, makes held earnings past their date payable on a qualified workspace for an active partner, and voids what a disqualified one held.';

revoke execute on function public.partner_earnings_sweep(timestamptz) from public, anon, authenticated;
grant execute on function public.partner_earnings_sweep(timestamptz) to service_role;

-- ------------------------------------------------------------------------------------------ partner_balance

create or replace function public.partner_balance()
returns table (currency text, state text, earned_cents bigint, next_payable_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.currency, e.state, sum(e.earned_cents)::bigint, min(e.payable_at) filter (where e.state = 'held')
    from public.partner_earnings e
    join public.partners p on p.id = e.partner_id
   where p.user_id = (select auth.uid()) and e.state <> 'void'
   group by e.currency, e.state
$$;

comment on function public.partner_balance() is
  'The calling partner''s totals by currency and state (held, payable, paid), and when the next held one is due. Answers about the caller alone.';

revoke execute on function public.partner_balance() from public, anon;
grant execute on function public.partner_balance() to authenticated;

-- ------------------------------------------------------------------------------------------------ the clock

create or replace function public.trigger_partners_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only when there is something to judge or to mature; otherwise it records that it looked.
  if exists (select 1 from public.partner_tenants pt
              where pt.standing is null
                and exists (select 1 from public.partner_earnings e where e.tenant_id = pt.tenant_id))
     or exists (select 1 from public.partner_earnings e where e.state = 'held' and e.payable_at <= now()) then
    return public.request_sweep('partners', '/api/cron/partners', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('partners', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_partners_sweep() from public, anon, authenticated;
comment on function public.trigger_partners_sweep() is
  'The partner clock (0011, P3). Calls the edge once a day when a workspace awaits its standing or an earning is due; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- daily, recording itself each time: two days is a missed day and then some.
  ('partners', 'partners-sweep', interval '2 days', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('partners-sweep') where exists (select 1 from cron.job where jobname = 'partners-sweep');
select cron.schedule('partners-sweep', '17 7 * * *', $$select public.trigger_partners_sweep()$$);
