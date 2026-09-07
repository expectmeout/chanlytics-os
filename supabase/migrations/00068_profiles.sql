-- 00068 · profiles: the name a person gives, shown wherever a person is shown.
--
-- The app never invents a name from an email ("hi@" is not "Hi"), so until now
-- the sidebar wore the workspace's name and the team card wore email local
-- parts. A profile is one row per account: the display name, nothing else
-- yet. You write yours through profile_set; the members of a workspace you
-- share may read it, so the roster shows who someone is.

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  updated_at   timestamptz not null default now()
);
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime('updated_at');

alter table public.profiles enable row level security;
create policy profiles_member_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (
      select m2.user_id
        from public.memberships m1
        join public.memberships m2 on m2.tenant_id = m1.tenant_id
       where m1.user_id = (select auth.uid())
    )
  );
grant select on public.profiles to authenticated;
comment on table public.profiles is
  'A person''s own name. Readable by the members of any workspace they share; written only by them, through profile_set.';

create or replace function public.profile_set(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, display_name)
  values (v_uid, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name;
  return jsonb_build_object('display_name', v_name);
end $$;
revoke all on function public.profile_set(text) from public, anon;
grant execute on function public.profile_set(text) to authenticated;
comment on function public.profile_set(text) is
  'Your own display name, trimmed, at most 80 characters; empty clears it. The only write path to profiles.';

-- The roster carries the name beside the email. The return type changes, so
-- the function is recreated; its guard and grants are unchanged.
drop function if exists public.team_roster(uuid);
create function public.team_roster(p_tenant_id uuid)
returns table (membership_id uuid, member_user_id uuid, email text, role text, joined_at timestamptz, display_name text)
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

  -- Every reference is qualified: the OUT parameters are in scope for the
  -- whole body, and an unqualified `email` or `display_name` is ambiguous at
  -- call time.
  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at, coalesce(p.display_name, '')::text
      from public.memberships m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.user_id = m.user_id
     where m.tenant_id = p_tenant_id
     order by m.created_at;
end $$;
comment on function public.team_roster(uuid) is
  'Members of a workspace with their emails and the names they gave, in one query. Caller must belong to the workspace.';
revoke execute on function public.team_roster(uuid) from public, anon;
grant  execute on function public.team_roster(uuid) to authenticated;
