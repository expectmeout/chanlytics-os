-- Reading a team cost one admin API call per member, and finding one person by
-- email cost a scan of the whole platform.
--
-- Both came from the same place: `memberships_self_select` is
-- `user_id = auth.uid()`, so a caller can see their OWN membership row and no
-- one else's, and emails live in `auth.users` which PostgREST does not expose
-- at all. With no way to read a roster on the session client, the service role
-- was the only door — and once you are holding it, the shape of the code
-- follows from what the JS admin API happens to offer:
--
--   * teamRoster looped `auth.admin.getUserById` once per member, SEQUENTIALLY.
--     Twenty people is twenty round trips, on every Settings load.
--
--   * inviteMember called `auth.admin.listUsers({ perPage: 1000 })` to find one
--     address, because @supabase/supabase-js has no getUserByEmail. That is
--     O(every user on the platform) per invite, and past a thousand accounts it
--     is silently WRONG: an existing user on page two reads as new, the invite
--     email then fails because the account exists, and the invitation row is
--     rolled back. The owner sees an error they cannot act on and the person
--     never gets added.
--
-- Two definer functions replace both. Each is one indexed query, and each
-- checks the CALLER's standing itself — which is what makes them safe to call
-- from the session client rather than from a service-role context.

/* ---------------------------------------------------------------- roster -- */

create or replace function public.team_roster(p_tenant_id uuid)
returns table (membership_id uuid, member_user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- THE guard. A definer function that reads auth.users and does not check who
  -- is asking is an email-enumeration endpoint for every workspace at once.
  if not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;

  -- Every reference is qualified. This function returns columns called `email`
  -- and `role`, and PL/pgSQL keeps OUT parameters in scope for the whole body,
  -- so an unqualified one is ambiguous — and it fails when CALLED, not when
  -- created. That exact mistake shipped in 00021.
  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = p_tenant_id
     order by m.created_at;
end $$;

comment on function public.team_roster(uuid) is
  'Members of a workspace with their emails, in one query. Caller must belong to the workspace.';

revoke execute on function public.team_roster(uuid) from public, anon;
grant  execute on function public.team_roster(uuid) to authenticated;

/* ------------------------------------------------------ invite lookup ----- */

create or replace function public.lookup_user_for_invite(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- OWNER, not merely a member. This answers "does this address have an
  -- account", which is an enumeration oracle — so it is restricted to the one
  -- role that can already invite that address and learn the same thing from
  -- the outcome.
  if not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.role = 'owner'
  ) then
    raise exception 'Only an owner can invite people.' using errcode = '42501';
  end if;

  -- auth.users.email is stored lowercased, but the caller's input is not
  -- guaranteed to be, and a case mismatch here would re-create the bug this
  -- function exists to fix: a known account read as new.
  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1;

  return v_id;
end $$;

comment on function public.lookup_user_for_invite(uuid, text) is
  'The user id behind an email, or null. Owner-only: it answers whether an address has an account.';

revoke execute on function public.lookup_user_for_invite(uuid, text) from public, anon;
grant  execute on function public.lookup_user_for_invite(uuid, text) to authenticated;
