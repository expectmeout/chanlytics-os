-- 00219 · An existing workspace brings in a partner.
--
-- Decision 0018. A partner (0012) came onto a workspace two ways: the business signed up through their link, or the
-- partner set it up and handed it over (0016). A workspace that already exists can now ask a partner to join it: its
-- owner names the partner by their code, and the partner accepts, on a session that showed its second factor (0013).
-- Credit follows who brings the paying customer: a workspace that has never paid credits the partner who joins it as
-- if they had brought it, and one that was already paying seats them with no share, recorded as the standing
-- 'disqualified' with its reason in words, which a platform admin may change as for any other (00207).
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
  if not exists (select 1 from public.memberships m
                  where m.tenant_id = p_tenant and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only an owner can bring in a partner.' using errcode = '42501';
  end if;
  if exists (select 1 from public.partner_tenants pt where pt.tenant_id = p_tenant) then
    raise exception 'This workspace already has a partner.' using errcode = '55000';
  end if;
  select p.* into v_partner from public.partners p where p.code = v_code;
  if v_partner.id is null then
    raise exception 'No partner has that code. Check it with them: it is the end of their link.' using errcode = 'P0002';
  end if;
  if v_partner.user_id = v_user then
    raise exception 'That is your own partner code: a partner is someone else who works with you.'
      using errcode = '22023';
  end if;
  if v_partner.status <> 'active' then
    raise exception 'That partner cannot take on a workspace right now.' using errcode = '55000';
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
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.invited', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_partner.id, 'by', v_user));
  return jsonb_build_object('code', v_partner.code, 'sent_at', v_row.sent_at, 'expires_at', v_row.expires_at);
end $$;

comment on function public.partner_invite(uuid, text) is
  'The workspace''s owner asks the partner with this code to join it (0018), for fourteen days; a second invitation replaces the first. Refused when the workspace has a partner, the code names nobody active, or it is the caller''s own.';

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
  if not exists (select 1 from public.memberships m
                  where m.tenant_id = p_tenant and m.user_id = v_user and m.role = 'owner') then
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
  if v_user is null or not exists (select 1 from public.memberships m
                                    where m.tenant_id = p_tenant and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only an owner can see this.' using errcode = '42501';
  end if;
  select pt.code_used as code, pt.origin, pt.attributed_at as since,
         exists (select 1 from public.memberships m
                  where m.tenant_id = p_tenant and m.user_id = p.user_id) as seated
    into v_link
    from public.partner_tenants pt join public.partners p on p.id = pt.partner_id
   where pt.tenant_id = p_tenant;
  select p.code, i.sent_at, i.expires_at, i.declined_at into v_open
    from public.partner_invitations i join public.partners p on p.id = i.partner_id
   where i.tenant_id = p_tenant;
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
     and i.declined_at is null
     and i.expires_at > now()
     and not exists (select 1 from public.partner_tenants pt where pt.tenant_id = i.tenant_id)
   order by i.sent_at
$$;

comment on function public.partner_invitations_mine() is
  'The open invitations (0018) to the calling partner: which workspace asked, when, and until when. The partner pane reads it.';

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
  if exists (select 1 from public.memberships m
              where m.tenant_id = p_tenant and m.user_id = v_user and m.role = 'owner') then
    raise exception 'You own this workspace, so you cannot be its partner.' using errcode = '55000';
  end if;

  -- Credit follows who brings the paying customer: a workspace that has paid before, or pays outside Stripe, was not
  -- brought by this partner. The standing says so, as a person's decision would, and a platform admin may change it.
  select coalesce(b.mode = 'direct' or b.last_paid_at is not null, false) into v_paying
    from public.billing_accounts b where b.tenant_id = p_tenant;
  v_paying := coalesce(v_paying, false);

  insert into public.memberships (tenant_id, user_id, role)
  values (p_tenant, v_user, 'partner')
  on conflict (user_id, tenant_id) do update set role = 'partner';
  insert into public.partner_tenants (tenant_id, partner_id, code_used, origin, standing, standing_why, standing_at)
  values (p_tenant, v_partner.id, v_partner.code, 'invite',
          case when v_paying then 'disqualified' end,
          case when v_paying then 'It was already paying for its plan when the partner joined, so it earns no share.' end,
          case when v_paying then now() end);
  delete from public.partner_invitations i where i.tenant_id = p_tenant;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant, 'partner.invite_accepted', 'workspace', 'tenant', p_tenant,
          jsonb_build_object('partner_id', v_partner.id, 'by', v_user, 'earns', not v_paying));

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
