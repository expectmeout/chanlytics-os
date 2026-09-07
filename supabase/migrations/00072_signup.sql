-- 00072: self-serve sign-up.
--
-- A stranger types a business name and a work email; the dashboard creates
-- the auth user with the service role and needs to give that user a
-- workspace BEFORE they have ever signed in — so auth.uid() is null when it
-- happens. The body of create_workspace (00021) moves into
-- create_workspace_for(p_user, p_name, p_timezone), callable by the service
-- role alone; create_workspace keeps its signature and becomes the signed-in
-- wrapper over it. Nothing else changes: the slug, the timezone check, the
-- ten-workspace cap per account, the provisioning trigger.

create or replace function public.create_workspace_for(
  p_user uuid,
  p_name text,
  p_timezone text default null
)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := p_user;
  v_name  text := btrim(coalesce(p_name, ''));
  v_tz    text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_base  text;
  v_slug  text;
  v_try   int := 0;
  v_owned int;
  v_id    uuid;
begin
  -- No user, no workspace: the whole model is "this person becomes the owner".
  if v_user is null then
    raise exception 'A user is required.' using errcode = '28000';
  end if;

  if length(v_name) < 2 then
    raise exception 'A workspace needs a name of at least 2 characters.' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'That name is too long — 120 characters at most.' using errcode = '22023';
  end if;

  -- An unreal zone is not a cosmetic mistake (see 00021). Rejected at the door.
  -- `pg_timezone_names.name` is qualified because this function RETURNS a
  -- column called `name`; every table reference below is aliased for the same
  -- reason.
  if v_tz is not null
     and not exists (select 1 from pg_timezone_names z where z.name = v_tz) then
    raise exception 'Unknown timezone: %', v_tz using errcode = '22023';
  end if;

  -- Anti-abuse, not a product limit.
  select count(*) into v_owned
    from public.memberships m
   where m.user_id = v_user and m.role = 'owner';
  if v_owned >= 10 then
    raise exception 'This account already owns 10 workspaces.' using errcode = '54000';
  end if;

  -- Slug: lowercase ASCII, single dashes, no leading or trailing dash.
  v_base := lower(v_name);
  v_base := translate(
    v_base,
    'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįòóôõöøōŏőùúûüũūŭůñńçćčšž',
    'aaaaaaaaaeeeeeeeeeiiiiiiiiooooooooouuuuuuuunncccsz'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := left(v_base, 40);
  v_base := btrim(v_base, '-');
  if v_base = '' then
    v_base := 'workspace';
  end if;

  -- Collision handling that terminates.
  v_slug := v_base;
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_try := v_try + 1;
    if v_try > 50 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_slug := v_base || '-' || v_try::text;
  end loop;

  -- The AFTER INSERT trigger from 00017 provisions policies + config here.
  insert into public.tenants (slug, name, timezone)
  values (v_slug, v_name, coalesce(v_tz, 'America/New_York'))
  returning tenants.id into v_id;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_id, v_user, 'owner');

  return query
    select t.id, t.slug, t.name, t.status, t.timezone, t.locale
      from public.tenants t
     where t.id = v_id;
end $$;

comment on function public.create_workspace_for(uuid, text, text) is
  'Create a workspace and make p_user its owner, in one transaction. Service role only: '
  'the sign-up route calls it for a user who has not signed in yet. create_workspace wraps it for signed-in callers.';

-- Service role alone: a signed-in caller must not name another user as owner.
revoke execute on function public.create_workspace_for(uuid, text, text) from public, anon, authenticated;

-- The signed-in wrapper: same signature, same grants (00021's stand), one line of body.
create or replace function public.create_workspace(
  p_name text,
  p_timezone text default null
)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  return query
    select w.id, w.slug, w.name, w.status, w.timezone, w.locale
      from public.create_workspace_for(auth.uid(), p_name, p_timezone) w;
end $$;

comment on function public.create_workspace(text, text) is
  'Create a workspace and make the calling user its owner, in one transaction. '
  'Caller is auth.uid(), never a parameter; the body lives in create_workspace_for.';
