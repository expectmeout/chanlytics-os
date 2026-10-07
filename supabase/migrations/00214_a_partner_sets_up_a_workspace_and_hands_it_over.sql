-- 00214 · A partner sets up a workspace and hands it to its owner.
--
-- Decision 0016. A partner makes a workspace for a business, sits on it as 'partner' (never owner), and hands it to
-- the owner by address; the owner accepts, and only then owns it, pays for it, and the share runs as for a link.
--
--   partner_tenants          gains origin ('link' · 'handover') and the handover: to whom, when sent, until when,
--                            accepted by whom and when, declined when. The handover lives here and not in invitations:
--                            one per workspace by the table's own key, and a dashboard that seats every open
--                            invitation (acceptOpenInvites) can never seat an owner without asking, whichever version
--                            of it is deployed.
--   create_workspace_for_business  the calling (active) partner makes a workspace for a business: create_workspace_for
--                            makes it, the partner's seat becomes 'partner', and the handover is written at creation,
--                            as 00202 writes a link's attribution. At most ten waiting for an owner per partner.
--   partner_handover_resend  the partner sends it again, to the same address or another, for fourteen more days.
--   handovers_mine           the open handovers addressed to the caller's confirmed address, for the accept screen.
--   handover_accept          the addressee becomes the owner, the first and only one.
--   handover_decline         the addressee says no; the partner hears it in their letter and may send it elsewhere.
--   partner_earnings_sweep   gains checks.same_domain: a handover accepted from the partner's own mail domain (a
--                            company's, never a public mailbox's) is held for a person to review.
--   partner_letters_due      a handover is news when its owner accepts or declines it; "brought" stays the link's.

-- -------------------------------------------------------------------------------------- partner_tenants

alter table public.partner_tenants add column if not exists origin text not null default 'link';
alter table public.partner_tenants drop constraint if exists partner_tenants_origin_check;
alter table public.partner_tenants add constraint partner_tenants_origin_check check (origin in ('link', 'handover'));

alter table public.partner_tenants add column if not exists handover_email text;
alter table public.partner_tenants add column if not exists handover_sent_at timestamptz;
alter table public.partner_tenants add column if not exists handover_expires_at timestamptz;
alter table public.partner_tenants add column if not exists handover_accepted_at timestamptz;
alter table public.partner_tenants
  add column if not exists handover_accepted_by uuid references auth.users (id) on delete set null;
alter table public.partner_tenants add column if not exists handover_declined_at timestamptz;

-- A link's row has no handover; a handover's has its address, when it went, and until when.
alter table public.partner_tenants drop constraint if exists partner_tenants_handover_check;
alter table public.partner_tenants add constraint partner_tenants_handover_check check (
  (origin = 'link' and handover_email is null and handover_sent_at is null and handover_expires_at is null
     and handover_accepted_at is null and handover_declined_at is null)
  or (origin = 'handover' and handover_email is not null and handover_email = lower(handover_email)
     and handover_sent_at is not null and handover_expires_at is not null)
);

comment on column public.partner_tenants.origin is
  'How the partner came to this workspace (0016): link, the business made it through their link (0012); handover, the partner made it and handed it to its owner.';
comment on column public.partner_tenants.handover_email is
  'The address the workspace is handed to (0016), lower case. Only its owner by that address may accept it.';

-- The accept screen's lookup: open handovers by address.
create index if not exists partner_tenants_handover_open_idx on public.partner_tenants (handover_email)
  where origin = 'handover' and handover_accepted_at is null and handover_declined_at is null;

-- ------------------------------------------------------------------------------- create_workspace_for_business

create or replace function public.create_workspace_for_business(
  p_name        text,
  p_timezone    text,
  p_owner_email text
)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_email   text := lower(btrim(coalesce(p_owner_email, '')));
  v_mine    text;
  v_partner public.partners;
  v_waiting int;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select p.* into v_partner from public.partners p where p.user_id = v_user for update;
  if v_partner.id is null then
    raise exception 'Only a partner can set a workspace up for a business.' using errcode = '42501';
  end if;
  if v_partner.status <> 'active' then
    raise exception 'Your partner account is %, so it cannot set up a workspace.', v_partner.status
      using errcode = '42501';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter the business owner''s email address.' using errcode = '22023';
  end if;
  select lower(u.email) into v_mine from auth.users u where u.id = v_user;
  if v_email = v_mine then
    raise exception 'That is your own address. Enter the business owner''s.' using errcode = '22023';
  end if;
  -- Anti-abuse, as create_workspace_for's ten owned: a workspace nobody owns is the platform's to keep. The partner's
  -- row is locked above, so two presses at once count each other.
  select count(*) into v_waiting
    from public.partner_tenants pt
   where pt.partner_id = v_partner.id and pt.origin = 'handover' and pt.handover_accepted_at is null;
  if v_waiting >= 10 then
    raise exception 'Ten workspaces are already waiting for their owners. When one is accepted, set up the next.'
      using errcode = '54000';
  end if;

  -- The name, the zone, the slug and the workspace's provisioning are create_workspace_for's, once; the partner's
  -- seat it makes is an owner's, and becomes a partner's in the same transaction.
  select w.id into v_id from public.create_workspace_for(v_user, p_name, p_timezone, null) w;
  update public.memberships m set role = 'partner' where m.tenant_id = v_id and m.user_id = v_user;

  insert into public.partner_tenants
    (tenant_id, partner_id, code_used, origin, handover_email, handover_sent_at, handover_expires_at)
  values
    (v_id, v_partner.id, v_partner.code, 'handover', v_email, now(), now() + interval '14 days');
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_id, 'partner.handover_sent', 'workspace', 'tenant', v_id,
          jsonb_build_object('partner_id', v_partner.id, 'by', v_user));

  return query
    select t.id, t.slug, t.name, t.status, t.timezone, t.locale
      from public.tenants t
     where t.id = v_id;
end $$;

comment on function public.create_workspace_for_business(text, text, text) is
  'The calling partner makes a workspace for a business (0016): seated as partner, never owner, credited at creation, and the workspace handed to p_owner_email for fourteen days. At most ten waiting for an owner.';

revoke execute on function public.create_workspace_for_business(text, text, text) from public, anon;
grant execute on function public.create_workspace_for_business(text, text, text) to authenticated;

-- ------------------------------------------------------------------------------------- partner_handover_resend

create or replace function public.partner_handover_resend(p_tenant uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_mine    text;
  v_partner public.partners;
  v_row     public.partner_tenants;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select p.* into v_partner from public.partners p where p.user_id = v_user;
  if v_partner.id is null then
    raise exception 'Only a partner can hand a workspace over.' using errcode = '42501';
  end if;
  if v_partner.status <> 'active' then
    raise exception 'Your partner account is %, so it cannot hand a workspace over.', v_partner.status
      using errcode = '42501';
  end if;
  select pt.* into v_row
    from public.partner_tenants pt
   where pt.tenant_id = p_tenant and pt.partner_id = v_partner.id and pt.origin = 'handover'
   for update;
  if v_row.tenant_id is null then
    raise exception 'That is not a workspace you set up.' using errcode = 'P0002';
  end if;
  if v_row.handover_accepted_at is not null then
    raise exception 'That workspace already has its owner.' using errcode = '55000';
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter the business owner''s email address.' using errcode = '22023';
  end if;
  select lower(u.email) into v_mine from auth.users u where u.id = v_user;
  if v_email = v_mine then
    raise exception 'That is your own address. Enter the business owner''s.' using errcode = '22023';
  end if;
  update public.partner_tenants pt
     set handover_email = v_email,
         handover_sent_at = now(),
         handover_expires_at = now() + interval '14 days',
         handover_declined_at = null
   where pt.tenant_id = p_tenant
  returning pt.* into v_row;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.handover_sent', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_partner.id, 'by', v_user, 'again', true));
  return jsonb_build_object('tenant_id', v_row.tenant_id, 'email', v_row.handover_email,
                            'sent_at', v_row.handover_sent_at, 'expires_at', v_row.handover_expires_at);
end $$;

comment on function public.partner_handover_resend(uuid, text) is
  'The calling partner sends the handover of a workspace they set up again (0016), to the same address or another, open for fourteen more days. Refused once the workspace has its owner.';

revoke execute on function public.partner_handover_resend(uuid, text) from public, anon;
grant execute on function public.partner_handover_resend(uuid, text) to authenticated;

-- --------------------------------------------------------------------------------------------- handovers_mine

create or replace function public.handovers_mine()
returns table (tenant_id uuid, workspace text, partner_code text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select pt.tenant_id, t.name, p.code, pt.handover_expires_at
    from auth.users u
    join public.partner_tenants pt
      on pt.handover_email = lower(u.email)
     and pt.origin = 'handover'
     and pt.handover_accepted_at is null
     and pt.handover_declined_at is null
     and pt.handover_expires_at > now()
    join public.tenants t on t.id = pt.tenant_id
    join public.partners p on p.id = pt.partner_id
   where u.id = auth.uid()
     -- A proved address only: an account that has not confirmed its email is not yet the person it names.
     and u.email_confirmed_at is not null
     and p.user_id is distinct from u.id
   order by pt.handover_sent_at
$$;

comment on function public.handovers_mine() is
  'The open handovers (0016) addressed to the caller''s confirmed email: which workspace, from which partner, open until when. The accept screen reads it at boot.';

revoke execute on function public.handovers_mine() from public, anon;
grant execute on function public.handovers_mine() to authenticated;

-- -------------------------------------------------------------------------------------------- handover_accept

create or replace function public.handover_accept(p_tenant uuid)
returns table (id uuid, slug text, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_email text;
  v_row   public.partner_tenants;
  v_by    uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  select pt.* into v_row
    from public.partner_tenants pt
   where pt.tenant_id = p_tenant and pt.origin = 'handover'
   for update;
  -- Not found, and not "not yours": whether a workspace waits for an address is its addressee's to know.
  if v_row.tenant_id is null or v_email is null or v_row.handover_email <> v_email then
    raise exception 'There is no workspace waiting for you there.' using errcode = 'P0002';
  end if;
  select p.user_id into v_by from public.partners p where p.id = v_row.partner_id;
  if v_by = v_user then
    raise exception 'A partner cannot take over a workspace they set up.' using errcode = '42501';
  end if;
  if v_row.handover_accepted_at is not null then
    raise exception 'This workspace already has its owner.' using errcode = '55000';
  end if;
  if v_row.handover_declined_at is not null then
    raise exception 'You declined this workspace. Ask your partner to send it again.' using errcode = '55000';
  end if;
  if v_row.handover_expires_at <= now() then
    raise exception 'This invitation has expired. Ask your partner to send it again.' using errcode = '55000';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (p_tenant, v_user, 'owner')
  on conflict (user_id, tenant_id) do update set role = 'owner';
  update public.partner_tenants pt
     set handover_accepted_at = now(), handover_accepted_by = v_user
   where pt.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.handover_accepted', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_row.partner_id, 'by', v_user));

  return query select t.id, t.slug, t.name from public.tenants t where t.id = p_tenant;
end $$;

comment on function public.handover_accept(uuid) is
  'The caller, by the confirmed address a workspace was handed to (0016), becomes its owner: the first, with billing and the team. Never the partner who set it up; never after it was declined or expired.';

revoke execute on function public.handover_accept(uuid) from public, anon;
grant execute on function public.handover_accept(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------- handover_decline

create or replace function public.handover_decline(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_email text;
  v_row   public.partner_tenants;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user and u.email_confirmed_at is not null;
  select pt.* into v_row
    from public.partner_tenants pt
   where pt.tenant_id = p_tenant and pt.origin = 'handover'
   for update;
  if v_row.tenant_id is null or v_email is null or v_row.handover_email <> v_email
     or v_row.handover_accepted_at is not null then
    raise exception 'There is no workspace waiting for you there.' using errcode = 'P0002';
  end if;
  if v_row.handover_declined_at is not null then
    return;
  end if;
  update public.partner_tenants pt set handover_declined_at = now() where pt.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.handover_declined', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_row.partner_id, 'by', v_user));
end $$;

comment on function public.handover_decline(uuid) is
  'The addressee of a handover (0016) says no. The workspace stays with the partner, who hears it in their letter and may send it again.';

revoke execute on function public.handover_decline(uuid) from public, anon;
grant execute on function public.handover_decline(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------------- the sweep

-- 00207's sweep, with one more check at judgement: a handover accepted from the partner's own company domain.
create or replace function public.partner_earnings_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link        record;
  v_same_card   boolean;
  v_same_list   boolean;
  v_same_domain boolean;
  v_held        boolean;
  v_judged      int := 0;
  v_review      int := 0;
  v_payable     int := 0;
  v_void        int := 0;
  v_forgot      int := 0;
begin
  -- 1. Standing, once a workspace has paid (00203).
  for v_link in
    select pt.tenant_id, pt.partner_id, p.user_id as partner_user, t.created_at as made_at,
           pt.origin, pt.handover_accepted_by
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
    -- A public mailbox's domain says nothing about who is behind it; a company's says they work together.
    select coalesce(v_link.origin = 'handover' and exists (
      select 1 from auth.users owner_u
        join auth.users partner_u on partner_u.id = v_link.partner_user
       where owner_u.id = v_link.handover_accepted_by
         and split_part(lower(owner_u.email), '@', 2) = split_part(lower(partner_u.email), '@', 2)
         and split_part(lower(partner_u.email), '@', 2) not in (
           'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com',
           'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
           'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'fastmail.com', 'hey.com')
    ), false) into v_same_domain;
    v_held := v_same_card or v_same_list or v_same_domain;
    update public.partner_tenants
       set standing = case when v_held then 'review' else 'qualified' end,
           standing_why = case
             when v_same_card then 'The card that pays for it also pays for a workspace the partner owns.'
             when v_same_list then 'Its Google listing belongs to an older workspace.'
             when v_same_domain then 'Its owner accepted it from the partner''s own email domain.'
             else null end,
           standing_at = p_now,
           standing_by = null,
           checks = jsonb_build_object('same_card', v_same_card, 'same_listing', v_same_list,
                                       'same_domain', v_same_domain)
     where tenant_id = v_link.tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_link.tenant_id, 'partner.standing_set', 'billing', 'tenant', v_link.tenant_id,
            jsonb_build_object('partner_id', v_link.partner_id,
                               'standing', case when v_held then 'review' else 'qualified' end,
                               'by', 'sweep'));
    v_judged := v_judged + 1;
    if v_held then v_review := v_review + 1; end if;
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

-- ---------------------------------------------------------------------------------------- partner_letters_due

-- 00209's, with a handover's news: accepted or declined by its owner. A link's workspace alone is "brought".
create or replace function public.partner_letters_due(p_now timestamptz default now())
returns table (
  partner_id  uuid,
  email       text,
  code        text,
  status      text,
  since       timestamptz,
  through     timestamptz,
  news        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with who as (
    select p.id, u.email::text as email, p.code, p.status, p.status_why, p.status_at, p.written_through as since
      from public.partners p
      join auth.users u on u.id = p.user_id
     where p.letters
       and p.written_through < p_now
       and coalesce(u.email, '') <> ''
       -- A closed partner hears one thing more: that they were closed.
       and (p.status <> 'closed' or p.status_at > p.written_through)
  ),
  written as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'currency', e.currency,
                                                 'count', e.n, 'cents', e.cents)
                              order by e.kind, e.currency) filter (where e.kind is not null), '[]') as rows
      from who w
      left join lateral (
        select x.kind, x.currency, count(*)::int as n, sum(x.earned_cents)::bigint as cents
          from public.partner_earnings x
         where x.partner_id = w.id and x.created_at > w.since and x.created_at <= p_now and x.state <> 'void'
         group by x.kind, x.currency
      ) e on true
     group by w.id
  ),
  matured as (
    -- Rows that were written before the last letter and became payable since: the thirty days, or a person's yes.
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', m.currency, 'cents', m.cents)
                              order by m.currency) filter (where m.currency is not null), '[]') as rows
      from who w
      left join lateral (
        select x.currency, sum(x.earned_cents)::bigint as cents
          from public.partner_earnings x
         where x.partner_id = w.id and x.state = 'payable'
           and x.created_at <= w.since and x.updated_at > w.since and x.updated_at <= p_now
         group by x.currency
      ) m on true
     group by w.id
  ),
  voided as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', v.currency, 'cents', v.cents)
                              order by v.currency) filter (where v.currency is not null), '[]') as rows
      from who w
      left join lateral (
        select x.currency, sum(x.earned_cents)::bigint as cents
          from public.partner_earnings x
         where x.partner_id = w.id and x.state = 'void' and x.earned_cents > 0
           and x.updated_at > w.since and x.updated_at <= p_now
         group by x.currency
      ) v on true
     group by w.id
  ),
  paid as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', o.currency, 'cents', o.total_cents,
                                                 'reference', o.reference, 'sent_at', o.sent_at)
                              order by o.sent_at) filter (where o.id is not null), '[]') as rows
      from who w
      left join public.partner_payouts o
        on o.partner_id = w.id and o.sent_at > w.since and o.sent_at <= p_now
     group by w.id
  ),
  standing as (
    -- A workspace held for review, or a person's decision on one. The sweep's own "qualified" is the ordinary path,
    -- not news; a person's is the answer to a review.
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('workspace', t.name, 'standing', pt.standing,
                                                 'why', case when pt.standing_by is not null then pt.standing_why end)
                              order by pt.standing_at) filter (where pt.tenant_id is not null), '[]') as rows
      from who w
      left join public.partner_tenants pt
        on pt.partner_id = w.id and pt.standing_at > w.since and pt.standing_at <= p_now
       and (pt.standing in ('review', 'disqualified') or pt.standing_by is not null)
      left join public.tenants t on t.id = pt.tenant_id
     group by w.id
  ),
  brought as (
    select w.id,
           coalesce(jsonb_agg(t.name order by pt.attributed_at) filter (where pt.tenant_id is not null), '[]') as rows
      from who w
      left join public.partner_tenants pt
        on pt.partner_id = w.id and pt.origin = 'link'
       and pt.attributed_at > w.since and pt.attributed_at <= p_now
      left join public.tenants t on t.id = pt.tenant_id
     group by w.id
  ),
  -- A handover is news when its owner answers it (0016), not when the partner made it: they know that already.
  accepted as (
    select w.id,
           coalesce(jsonb_agg(t.name order by pt.handover_accepted_at) filter (where pt.tenant_id is not null), '[]')
             as rows
      from who w
      left join public.partner_tenants pt
        on pt.partner_id = w.id and pt.origin = 'handover'
       and pt.handover_accepted_at > w.since and pt.handover_accepted_at <= p_now
      left join public.tenants t on t.id = pt.tenant_id
     group by w.id
  ),
  declined as (
    select w.id,
           coalesce(jsonb_agg(t.name order by pt.handover_declined_at) filter (where pt.tenant_id is not null), '[]')
             as rows
      from who w
      left join public.partner_tenants pt
        on pt.partner_id = w.id and pt.origin = 'handover'
       and pt.handover_declined_at > w.since and pt.handover_declined_at <= p_now
      left join public.tenants t on t.id = pt.tenant_id
     group by w.id
  ),
  now_stand as (
    select w.id,
           coalesce(jsonb_agg(jsonb_build_object('currency', b.currency, 'held', b.held, 'payable', b.payable,
                                                 'paid', b.paid, 'next_payable_at', b.next_at)
                              order by b.currency) filter (where b.currency is not null), '[]') as rows
      from who w
      left join lateral (
        select x.currency,
               coalesce(sum(x.earned_cents) filter (where x.state = 'held'), 0)::bigint as held,
               coalesce(sum(x.earned_cents) filter (where x.state = 'payable'), 0)::bigint as payable,
               coalesce(sum(x.earned_cents) filter (where x.state = 'paid'), 0)::bigint as paid,
               min(x.payable_at) filter (where x.state = 'held') as next_at
          from public.partner_earnings x
         where x.partner_id = w.id and x.state <> 'void'
         group by x.currency
      ) b on true
     group by w.id
  )
  select w.id, w.email, w.code, w.status, w.since, p_now,
         jsonb_build_object(
           'written', wr.rows,
           'matured', m.rows,
           'voided', v.rows,
           'paid', pd.rows,
           'standing', s.rows,
           'brought', br.rows,
           'accepted', ac.rows,
           'declined', dc.rows,
           'status', case when w.status_at > w.since and w.status_at <= p_now
                          then jsonb_build_object('status', w.status, 'why', w.status_why) end,
           'balance', ns.rows)
    from who w
    join written wr on wr.id = w.id
    join matured m on m.id = w.id
    join voided v on v.id = w.id
    join paid pd on pd.id = w.id
    join standing s on s.id = w.id
    join brought br on br.id = w.id
    join accepted ac on ac.id = w.id
    join declined dc on dc.id = w.id
    join now_stand ns on ns.id = w.id
   where jsonb_array_length(wr.rows) > 0
      or jsonb_array_length(m.rows) > 0
      or jsonb_array_length(v.rows) > 0
      or jsonb_array_length(pd.rows) > 0
      or jsonb_array_length(s.rows) > 0
      or jsonb_array_length(br.rows) > 0
      or jsonb_array_length(ac.rows) > 0
      or jsonb_array_length(dc.rows) > 0
      or (w.status_at > w.since and w.status_at <= p_now)
   order by w.id
$$;

comment on function public.partner_letters_due(timestamptz) is
  'For the edge alone (0014): each partner with letters on, an address, and a change to their ledger since written_through -- shares and reversals written, shares that became payable or void, payouts sent, workspaces brought through the link, handovers accepted or declined, held for review or decided by a person, their own status -- with where they stand now.';

revoke execute on function public.partner_letters_due(timestamptz) from public, anon, authenticated;
grant execute on function public.partner_letters_due(timestamptz) to service_role;
