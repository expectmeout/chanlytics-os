-- 00222 · An existing workspace brings in a partner.
--
-- Decision 0018. A partner (0012) came onto a workspace two ways: the business signed up through their link, or the
-- partner set it up and handed it over (0016). A workspace that already exists can now ask a partner to join it: its
-- owner names the partner by their code, and the partner accepts, on a session that showed its second factor (0013).
-- Credit follows who brings the paying customer: a workspace that has never paid credits the partner who joins it as
-- if they had brought it, and one that was already paying seats them with no share, recorded as the standing
-- 'disqualified' with its reason in words, which a platform admin may change as for any other (00207). A payment is
-- a last_paid_at from the trial's end on, none while it runs: the edge stamped a trial's $0 first invoice until now.
--
--   partner_invitations          one open invitation per workspace: to which partner, by whom, open fourteen days,
--                                declined when. Written only through the functions below.
--   partner_tenants.origin       admits 'invite', which carries no handover (00214's check).
--   partner_invite               the owner names a partner by code; a second invitation replaces the first.
--   partner_invite_withdraw      the owner takes it back before it is answered.
--   workspace_partner            the owner's card: the workspace's partner, and the invitation waiting.
--   partner_invitations_mine     the partner's open invitations, for their pane.
--   partner_invite_accept        the partner joins: the seat, the credit (or none) and the event, in one transaction.
--   partner_invite_decline       the partner says no; the owner sees it and may ask another.
--   partner_earnings_sweep       holds for review an invitation asked from the partner's own company domain, as
--                                00214 holds a handover accepted from it; partner_tenants.invited_by keeps who asked.
--   partner_invitations_lapse    a partner who stops being active loses the invitations waiting for them.
--   partner_letters_due          00214's letter, leaving out the standing decided as a partner joined.
--   platform_partner_workspaces  00205's back office list, with the origin, and 'joining' beside the sweep and a person.
--
-- An invitation stands while the owner who sent it is an owner of the workspace. Either deploy order: the old
-- dashboard reads none of this, and the new one says a function it cannot find is not there yet.

-- ------------------------------------------------------------------------------------------- the invitations

create table if not exists public.partner_invitations (
  tenant_id   uuid primary key references public.tenants (id) on delete cascade,
  partner_id  uuid not null references public.partners (id) on delete cascade,
  invited_by  uuid references auth.users (id) on delete set null,
  sent_at     timestamptz not null default now(),
  expires_at  timestamptz not null,
  declined_at timestamptz
);
comment on table public.partner_invitations is
  'A workspace''s owner asking a partner to join it (0018): one open invitation per workspace, fourteen days. Accepted, it becomes the workspace''s partner_tenants row (origin invite) and is removed.';
create index if not exists partner_invitations_partner_idx on public.partner_invitations (partner_id);

alter table public.partner_invitations enable row level security;
revoke all on public.partner_invitations from public, anon, authenticated;
grant select on public.partner_invitations to authenticated;
drop policy if exists partner_invitations_read on public.partner_invitations;
create policy partner_invitations_read on public.partner_invitations
  for select to authenticated
  using (
    public.is_workspace_owner(tenant_id)
    or partner_id in (select p.id from public.partners p where p.user_id = (select auth.uid()))
  );

alter table public.partner_tenants drop constraint if exists partner_tenants_origin_check;
alter table public.partner_tenants
  add constraint partner_tenants_origin_check check (origin in ('link', 'handover', 'invite'));
-- Who asked for the partner, on an invitation's row: the nightly check compares their address's domain with the
-- partner's, as it does the owner who accepted a handover (00214).
alter table public.partner_tenants
  add column if not exists invited_by uuid references auth.users (id) on delete set null;

-- An invitation carries no handover, as a link does not (00214's check, with invite beside link).
alter table public.partner_tenants drop constraint if exists partner_tenants_handover_check;
alter table public.partner_tenants add constraint partner_tenants_handover_check check (
  (origin in ('link', 'invite') and handover_email is null and handover_sent_at is null and handover_expires_at is null
     and handover_accepted_at is null and handover_declined_at is null)
  or (origin = 'handover' and handover_email is not null and handover_email = lower(handover_email)
     and handover_sent_at is not null and handover_expires_at is not null)
);
comment on column public.partner_tenants.origin is
  'How the partner came to this workspace: link, the business made it through their link (0012); handover, the partner made it and handed it to its owner (0016); invite, its owner asked the partner to join it (0018).';

-- ------------------------------------------------------------------------------------------- partner_invite

create or replace function public.partner_invite(p_tenant uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_code    text := lower(btrim(coalesce(p_code, '')));
  v_partner public.partners;
  v_row     public.partner_invitations;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.is_workspace_owner(p_tenant) then
    raise exception 'Only an owner can bring in a partner.' using errcode = '42501';
  end if;
  if exists (select 1 from public.partner_tenants pt where pt.tenant_id = p_tenant) then
    raise exception 'This workspace already has a partner.' using errcode = '55000';
  end if;
  select p.* into v_partner from public.partners p where p.code = v_code;
  -- One refusal for a code that names nobody and one whose partner is paused or closed: which codes exist is not the
  -- caller's to learn a code at a time, as the /p/ page answers every code alike (0012).
  if v_partner.id is null or v_partner.status <> 'active' then
    raise exception 'No active partner has that code. Check it with them: it is the end of their link.'
      using errcode = 'P0002';
  end if;
  if v_partner.user_id = v_user then
    raise exception 'That is your own partner code: a partner is someone else who works with you.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m
              where m.tenant_id = p_tenant and m.user_id = v_partner.user_id and m.role = 'owner') then
    raise exception 'That partner owns this workspace already.' using errcode = '55000';
  end if;

  insert into public.partner_invitations (tenant_id, partner_id, invited_by, sent_at, expires_at, declined_at)
  values (p_tenant, v_partner.id, v_user, now(), now() + interval '14 days', null)
  on conflict (tenant_id) do update
    set partner_id = excluded.partner_id, invited_by = excluded.invited_by, sent_at = excluded.sent_at,
        expires_at = excluded.expires_at, declined_at = null
  returning * into v_row;
  -- Asked while the partner was joining: their accept held this row, took the seat and removed the invitation, and
  -- the insert above then wrote a new one for a workspace that has its partner now.
  if exists (select 1 from public.partner_tenants pt where pt.tenant_id = p_tenant) then
    raise exception 'This workspace already has a partner.' using errcode = '55000';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.invited', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_partner.id, 'by', v_user));
  return jsonb_build_object('code', v_partner.code, 'sent_at', v_row.sent_at, 'expires_at', v_row.expires_at);
end $$;

comment on function public.partner_invite(uuid, text) is
  'The workspace''s owner asks the partner with this code to join it (0018), for fourteen days; a second invitation replaces the first. Refused when the workspace has a partner, the code names nobody active (one refusal, whichever), or it is the caller''s own.';

revoke execute on function public.partner_invite(uuid, text) from public, anon;
grant execute on function public.partner_invite(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------- partner_invite_withdraw

create or replace function public.partner_invite_withdraw(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.partner_invitations;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.is_workspace_owner(p_tenant) then
    raise exception 'Only an owner can take back an invitation.' using errcode = '42501';
  end if;
  delete from public.partner_invitations i where i.tenant_id = p_tenant returning * into v_row;
  if v_row.tenant_id is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant, 'partner.invite_withdrawn', 'workspace', 'tenant', p_tenant,
            jsonb_build_object('partner_id', v_row.partner_id, 'by', v_user));
  end if;
end $$;

comment on function public.partner_invite_withdraw(uuid) is
  'The workspace''s owner takes back the invitation to a partner (0018) before it is answered. Nothing to take back is not an error.';

revoke execute on function public.partner_invite_withdraw(uuid) from public, anon;
grant execute on function public.partner_invite_withdraw(uuid) to authenticated;

-- ----------------------------------------------------------------------------------------- workspace_partner

create or replace function public.workspace_partner(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_link record;
  v_open record;
begin
  if v_user is null or not public.is_workspace_owner(p_tenant) then
    raise exception 'Only an owner can see this.' using errcode = '42501';
  end if;
  select pt.code_used as code, pt.origin, pt.attributed_at as since,
         exists (select 1 from public.memberships m
                  where m.tenant_id = p_tenant and m.user_id = p.user_id) as seated
    into v_link
    from public.partner_tenants pt join public.partners p on p.id = pt.partner_id
   where pt.tenant_id = p_tenant;
  -- An invitation stands while the owner who sent it is an owner here (partner_invite_accept): one they no longer are
  -- is waiting for nobody, and asking again replaces it.
  select p.code, i.sent_at, i.expires_at, i.declined_at into v_open
    from public.partner_invitations i join public.partners p on p.id = i.partner_id
   where i.tenant_id = p_tenant
     and exists (select 1 from public.memberships m
                  where m.tenant_id = i.tenant_id and m.user_id = i.invited_by and m.role = 'owner');
  return jsonb_build_object(
    'partner', case when v_link.code is null then null
                    else jsonb_build_object('code', v_link.code, 'origin', v_link.origin, 'since', v_link.since,
                                            'seated', v_link.seated) end,
    'invitation', case when v_open.code is null then null
                       else jsonb_build_object('code', v_open.code, 'sent_at', v_open.sent_at,
                                               'expires_at', v_open.expires_at, 'declined_at', v_open.declined_at) end
  );
end $$;

comment on function public.workspace_partner(uuid) is
  'The owner''s view of the workspace''s partner (0018): who it is, by their code, whether they are still on the team, and the invitation waiting, if any. The owner alone.';

revoke execute on function public.workspace_partner(uuid) from public, anon;
grant execute on function public.workspace_partner(uuid) to authenticated;

-- -------------------------------------------------------------------------------- partner_invitations_mine

create or replace function public.partner_invitations_mine()
returns table (tenant_id uuid, workspace text, sent_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.tenant_id, t.name, i.sent_at, i.expires_at
    from public.partners p
    join public.partner_invitations i on i.partner_id = p.id
    join public.tenants t on t.id = i.tenant_id
   where p.user_id = auth.uid()
     and p.status = 'active'
     and i.declined_at is null
     and i.expires_at > now()
     and not exists (select 1 from public.partner_tenants pt where pt.tenant_id = i.tenant_id)
     and exists (select 1 from public.memberships m
                  where m.tenant_id = i.tenant_id and m.user_id = i.invited_by and m.role = 'owner')
   order by i.sent_at
$$;

comment on function public.partner_invitations_mine() is
  'The invitations (0018) the calling partner can join: open, unanswered, from an owner who still is one, to a workspace with no partner, while the partner is active. Which workspace asked, when, and until when; the partner pane reads it.';

revoke execute on function public.partner_invitations_mine() from public, anon;
grant execute on function public.partner_invitations_mine() to authenticated;

-- ----------------------------------------------------------------------------------- partner_invite_accept

create or replace function public.partner_invite_accept(p_tenant uuid)
returns table (id uuid, slug text, name text, earns boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_partner public.partners;
  v_row     public.partner_invitations;
  v_paying  boolean;
  v_was     text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A partner's seat needs a session that showed its second factor (0013, 00218); joining one does too.
  if not public.session_shows_second_factor() then
    raise exception 'Enter the code from your authenticator app first: a partner signs in with two steps.'
      using errcode = '42501';
  end if;
  select p.* into v_partner from public.partners p where p.user_id = v_user;
  select i.* into v_row from public.partner_invitations i where i.tenant_id = p_tenant for update;
  -- Not found, and not "not yours": whether a workspace asked someone else is theirs to know.
  if v_partner.id is null or v_row.tenant_id is null or v_row.partner_id <> v_partner.id then
    raise exception 'There is no invitation for you there.' using errcode = 'P0002';
  end if;
  if v_partner.status <> 'active' then
    raise exception 'Your partner account is %, so it cannot join a workspace.', v_partner.status using errcode = '42501';
  end if;
  if v_row.declined_at is not null then
    raise exception 'You declined this invitation. Ask the owner to send it again.' using errcode = '55000';
  end if;
  if v_row.expires_at <= now() then
    raise exception 'This invitation has expired. Ask the owner to send it again.' using errcode = '55000';
  end if;
  if exists (select 1 from public.partner_tenants pt where pt.tenant_id = p_tenant) then
    raise exception 'This workspace already has a partner.' using errcode = '55000';
  end if;
  if public.is_workspace_owner(p_tenant) then
    raise exception 'You own this workspace, so you cannot be its partner.' using errcode = '55000';
  end if;
  -- An invitation stands while the owner who sent it is an owner here: one who left the team, was made something
  -- else, or deleted their account asks nobody now, and a workspace its owner left has no one to answer to.
  if v_row.invited_by is null or not exists (
       select 1 from public.memberships m
        where m.tenant_id = p_tenant and m.user_id = v_row.invited_by and m.role = 'owner') then
    raise exception 'The owner who asked you is no longer its owner. Ask the workspace to send it again.'
      using errcode = '55000';
  end if;

  -- Credit follows who brings the paying customer: a workspace that has paid for its plan, or pays outside Stripe,
  -- was not brought by this partner. The standing says so, marked as decided when they joined, and a platform admin
  -- may change it. A payment is a last_paid_at from the trial's end on, and none while the trial runs: until this
  -- change the edge stamped a trial's $0 first invoice too, at the trial's start, before the trial_end Stripe keeps on
  -- the row after a cancel; a workspace with no trial on record has no such stamp to discount.
  select coalesce(b.mode = 'direct'
                  or (b.last_paid_at is not null
                      and b.status <> 'trialing'
                      and b.last_paid_at >= coalesce(b.trial_end, '-infinity'::timestamptz)), false)
    into v_paying
    from public.billing_accounts b where b.tenant_id = p_tenant;
  v_paying := coalesce(v_paying, false);

  -- Someone already on the team (an operator, a viewer) becomes its partner: the owner asked for exactly them, and the
  -- event keeps the role they had.
  select m.role into v_was from public.memberships m where m.tenant_id = p_tenant and m.user_id = v_user;
  -- Never an owner's seat: one made an owner since the check above keeps it, and joins nothing.
  insert into public.memberships (tenant_id, user_id, role)
  values (p_tenant, v_user, 'partner')
  on conflict (user_id, tenant_id) do update set role = 'partner' where memberships.role <> 'owner';
  if not found then
    raise exception 'You own this workspace, so you cannot be its partner.' using errcode = '55000';
  end if;
  insert into public.partner_tenants
    (tenant_id, partner_id, code_used, origin, invited_by, standing, standing_why, standing_at, checks)
  values (p_tenant, v_partner.id, v_partner.code, 'invite', v_row.invited_by,
          case when v_paying then 'disqualified' end,
          case when v_paying then 'It was already paying for its plan when the partner joined, so it earns no share.' end,
          case when v_paying then now() end,
          case when v_paying then jsonb_build_object('already_paying', true) else '{}'::jsonb end);
  if v_paying then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant, 'partner.standing_set', 'billing', 'tenant', p_tenant,
            jsonb_build_object('partner_id', v_partner.id, 'standing', 'disqualified', 'by', 'joining'));
  end if;
  delete from public.partner_invitations i where i.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.invite_accepted', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_partner.id, 'by', v_user, 'earns', not v_paying, 'was', v_was));

  return query select t.id, t.slug, t.name, not v_paying from public.tenants t where t.id = p_tenant;
end $$;

comment on function public.partner_invite_accept(uuid) is
  'The invited partner joins the workspace (0018), on a session that showed its second factor: seated as partner, credited as its partner, and earning from its plan unless it was already paying when they joined.';

revoke execute on function public.partner_invite_accept(uuid) from public, anon;
grant execute on function public.partner_invite_accept(uuid) to authenticated;

-- ---------------------------------------------------------------------------------- partner_invite_decline

create or replace function public.partner_invite_decline(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.partner_invitations;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select i.* into v_row
    from public.partner_invitations i join public.partners p on p.id = i.partner_id
   where i.tenant_id = p_tenant and p.user_id = v_user
   for update of i;
  if v_row.tenant_id is null then
    raise exception 'There is no invitation for you there.' using errcode = 'P0002';
  end if;
  if v_row.declined_at is not null then
    return;
  end if;
  update public.partner_invitations i set declined_at = now() where i.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.invite_declined', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_row.partner_id, 'by', v_user));
end $$;

comment on function public.partner_invite_decline(uuid) is
  'The invited partner says no (0018). The owner sees it on their card and may ask again, or ask someone else.';

revoke execute on function public.partner_invite_decline(uuid) from public, anon;
grant execute on function public.partner_invite_decline(uuid) to authenticated;

-- ------------------------------------------------------------------------------------------------- the sweep

-- 00214's sweep, with the invitation beside the handover at judgement: an owner who asked for a partner from the
-- partner's own company domain is held for a person to review, as one who accepted a handover from it is.
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
           pt.origin, pt.handover_accepted_by, pt.invited_by
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
    -- The owner who took the workspace from the partner (a handover), or who asked for the partner (an invitation).
    select coalesce(v_link.origin in ('handover', 'invite') and exists (
      select 1 from auth.users owner_u
        join auth.users partner_u on partner_u.id = v_link.partner_user
       where owner_u.id = case v_link.origin when 'handover' then v_link.handover_accepted_by
                                            else v_link.invited_by end
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
             when v_same_domain and v_link.origin = 'invite'
               then 'Its owner asked for the partner from the partner''s own email domain.'
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

-- ------------------------------------------------------------------------------ a partner who cannot answer

-- A partner paused, closed or erased cannot join anything (partner_invite_accept), so the invitations waiting for them
-- go: the owner's card stops saying it waits, and the owner may ask someone else. A declined one stays for the owner
-- to read.
create or replace function public.partner_invitations_lapse() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.partner_invitations i where i.partner_id = new.id and i.declined_at is null;
  return new;
end $$;

-- A definer function is not a session's to call, trigger or not (00132; privileges.db.test.mjs).
revoke execute on function public.partner_invitations_lapse() from public, anon, authenticated;

drop trigger if exists partners_invitations_lapse on public.partners;
create trigger partners_invitations_lapse
  after update of status on public.partners
  for each row when (old.status = 'active' and new.status <> 'active')
  execute function public.partner_invitations_lapse();

comment on function public.partner_invitations_lapse() is
  'A partner who stops being active (paused, closed) loses the invitations waiting for them (0018): they could not join, and the owners who asked may ask someone else.';

-- -------------------------------------------------------------------------------- the partner's daily letter

-- 00214's letter, with one thing left out: the standing decided as a partner joined a workspace that was already
-- paying. They were told when they joined, and the letter's "a workspace you brought" is not what happened.
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
       -- Decided as the partner joined at an invitation (0018): they were told then, as they know a handover they made.
       and not (pt.standing_by is null and pt.checks ? 'already_paying')
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
  'For the edge alone (0014): each partner with letters on, an address, and a change to their ledger since written_through -- shares and reversals written, shares that became payable or void, payouts sent, workspaces brought through the link, handovers accepted or declined, held for review or decided by a person (not what was decided as they joined a workspace that asked them, 0018), their own status -- with where they stand now.';

revoke execute on function public.partner_letters_due(timestamptz) from public, anon, authenticated;
grant execute on function public.partner_letters_due(timestamptz) to service_role;

-- ---------------------------------------------------------------------------------------------- back office

-- 00205's list, with how each partner came (the origin) and a third answer to who decided the standing: 'joining',
-- the rule 0018 applies as a partner joins a workspace that was already paying, which is neither the nightly check nor
-- a person. The columns change, so the function is made again.
drop function if exists public.platform_partner_workspaces();
create function public.platform_partner_workspaces()
returns table (
  tenant_id      uuid,
  partner_id     uuid,
  code           text,
  attributed_at  timestamptz,
  standing       text,
  standing_why   text,
  standing_at    timestamptz,
  decided_by     text,
  checks         jsonb,
  origin         text
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
         case when pt.standing is null then null
              when pt.standing_by is not null then 'person'
              when pt.checks ? 'already_paying' then 'joining'
              else 'sweep' end,
         pt.checks, pt.origin
    from public.partner_tenants pt
    join public.partners p on p.id = pt.partner_id
   order by (pt.standing = 'review') desc nulls last, pt.attributed_at desc;
end $$;

comment on function public.platform_partner_workspaces() is
  'Who brought each workspace, how (link, handover or invite), and its standing with who decided it (the nightly check, a person, or the rule as the partner joined), for the back office (0012, P5; 0018). Platform admins only.';

revoke execute on function public.platform_partner_workspaces() from public, anon;
grant execute on function public.platform_partner_workspaces() to authenticated;

comment on table public.partner_tenants is
  'Which partner brought this workspace (0012), one row per workspace and never moved to another partner: through their link when it was made, set up and handed over (0016), or asked for by its owner (0018), as origin says. standing is what the sweep, a person, or the rule as an invited partner joined decided about it; null until one has.';
