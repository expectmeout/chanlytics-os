-- A view is the workspace's, not the device's.
--
-- What the People page remembered between visits -- the sort, the attention
-- tab -- lived in the browser's localStorage: the same person on their phone
-- saw the page as if for the first time, and two people sharing a laptop
-- shared a view. It lives on the membership now: one small object per page,
-- per member, per workspace, written through one door that judges the
-- caller's own membership. Read through the row the member may already read
-- (memberships_self_select, 00001).

alter table public.memberships add column if not exists views jsonb not null default '{}'::jsonb;

comment on column public.memberships.views is
  'What this member''s pages remember in this workspace, per page: {"people": {"sortBy": "last", ...}}. Written through member_view_set; never read by the receptionist.';

create or replace function public.member_view_set(p_tenant_id uuid, p_page text, p_view jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_views jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_page is null or p_page !~ '^[a-z][a-z0-9_-]{0,31}$' then
    raise exception 'A page is a short lowercase name.' using errcode = '22023';
  end if;
  if p_view is null or jsonb_typeof(p_view) <> 'object' or pg_column_size(p_view) > 4096 then
    raise exception 'A view is a small object.' using errcode = '22023';
  end if;
  update public.memberships
     set views = coalesce(views, '{}'::jsonb) || jsonb_build_object(p_page, p_view)
   where tenant_id = p_tenant_id and user_id = v_user
  returning views into v_views;
  if v_views is null then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;
  return v_views;
end $$;

comment on function public.member_view_set(uuid, text, jsonb) is
  'Remembers one page''s view for the caller in one workspace: their own membership row, judged by auth.uid(), a small object per page.';

revoke execute on function public.member_view_set(uuid, text, jsonb) from public, anon;
grant execute on function public.member_view_set(uuid, text, jsonb) to authenticated;
