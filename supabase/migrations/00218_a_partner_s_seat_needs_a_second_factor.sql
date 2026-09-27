-- 00218 · A partner's seat needs a session that showed its second factor.
--
-- Merged as 00216 (#1195). Production had already recorded 00216 for the
-- throttled broadcast's release (#1175), and the CLI applies by version, so this
-- one was skipped there and never applied. Renumbered, statements unchanged; every
-- one of them is re-runnable, so a database that did run it runs it again harmlessly.
--
-- Decision 0013, M3, with no grace (Ruben's answer). A partner (0012) sits on the team of every workspace they
-- brought, so a stolen password must not open any of them: a session acts from a partner's seat only once it has
-- shown the code from its authenticator app, which Supabase Auth writes in its token as aal2. The dashboard refuses
-- the same session at its door (memberContext, seatNeedsSecondFactor); this is the floor under it, for a session that
-- talks to the database directly.
--
--   session_shows_second_factor  whether the calling session's token says aal2: the one reading of the claim.
--   memberships                  a restrictive read policy: a caller's own partner seat is not visible until then. Every
--                                row policy that reads "the caller's workspaces" through memberships (the tenants,
--                                the threads, the people, and the rest) stops seeing that workspace with it.
--   is_acting_member             admits a partner only then. It is read inside definer functions, where the policy
--                                above does not apply, so it says so itself.
--   caller_has_permission        the same, for the settings, disconnect and find doors (00201).
--   partner_become, create_workspace_for_business, partner_handover_resend
--                                the partner account's own doors ask for it too: becoming one, and setting a workspace
--                                up for a business, which seats the partner on it.
--
-- has_permission (the service role's, about any user) is unchanged: the dashboard asks it after its own door.

-- ---------------------------------------------------------------------------------------------- the one reading

create or replace function public.session_shows_second_factor()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

comment on function public.session_shows_second_factor() is
  'Whether the calling session showed its second factor (0013): its token says aal2. contracts secondFactorShown is the same reading.';

-- Left to every role, as is_acting_member is, which reads it: it answers about the caller's own token and nothing
-- else, and a row policy or a definer function that asks it must never meet a permission error instead.

-- ------------------------------------------------------------------------------------- a partner's seat, hidden

drop policy if exists memberships_partner_seat_needs_second_factor on public.memberships;
create policy memberships_partner_seat_needs_second_factor on public.memberships
  as restrictive
  for select to authenticated
  using (role <> 'partner' or (select public.session_shows_second_factor()));

-- --------------------------------------------------------------------------------------------- a partner acts

create or replace function public.is_acting_member(p_tenant uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid())
       and m.tenant_id = p_tenant
       and (m.role in ('owner', 'operator') or (m.role = 'partner' and public.session_shows_second_factor()))
  );
$$;

comment on function public.is_acting_member(uuid) is
  'True when the caller may COMMIT changes in this tenant: an owner or an operator, or a partner on a session that showed its second factor (0013). Viewers read only.';

create or replace function public.caller_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission((select auth.uid()), p_tenant_id, p_permission)
     and not exists (
       select 1 from public.memberships m
        where m.user_id = (select auth.uid()) and m.tenant_id = p_tenant_id and m.role = 'partner'
          and not public.session_shows_second_factor()
     );
$$;

comment on function public.caller_has_permission(uuid, text) is
  'has_permission for the calling session: whether the caller may do this in this workspace, a partner only on a session that showed its second factor (0013). Answers only about the caller, which is why every session may ask.';

revoke execute on function public.caller_has_permission(uuid, text) from public, anon;
grant execute on function public.caller_has_permission(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------ the partner account's own doors

create or replace function public.partner_become(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_row  public.partners;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.session_shows_second_factor() then
    raise exception 'Enter the code from your authenticator app first: a partner signs in with two steps.'
      using errcode = '42501';
  end if;
  -- The shape contracts cleanPartnerCode checks, checked again where the row is written.
  if v_code !~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$' then
    raise exception 'A code is 3 to 24 letters, digits or dashes, starting and ending with a letter or digit.'
      using errcode = '22023';
  end if;
  if v_code in ('chanlytics', 'admin', 'support', 'signup', 'login', 'partner', 'partners') then
    raise exception 'That code is reserved. Try another.' using errcode = '22023';
  end if;
  if exists (select 1 from public.partners p where p.user_id = v_user) then
    raise exception 'You are already a partner.' using errcode = '23505';
  end if;
  begin
    insert into public.partners (user_id, code, terms_accepted_at)
    values (v_user, v_code, now())
    returning * into v_row;
  exception when unique_violation then
    raise exception 'That code is taken. Try another.' using errcode = '23505';
  end;
  return to_jsonb(v_row) - 'payout_facts' - 'user_id' - 'updated_at';
end $$;

revoke execute on function public.partner_become(text) from public, anon;
grant execute on function public.partner_become(text) to authenticated;

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
  if not public.session_shows_second_factor() then
    raise exception 'Enter the code from your authenticator app first: a partner signs in with two steps.'
      using errcode = '42501';
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

revoke execute on function public.create_workspace_for_business(text, text, text) from public, anon;
grant execute on function public.create_workspace_for_business(text, text, text) to authenticated;

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
  if not public.session_shows_second_factor() then
    raise exception 'Enter the code from your authenticator app first: a partner signs in with two steps.'
      using errcode = '42501';
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

revoke execute on function public.partner_handover_resend(uuid, text) from public, anon;
grant execute on function public.partner_handover_resend(uuid, text) to authenticated;
