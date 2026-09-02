-- A workspace could be joined, but never created.
--
-- Every tenant to date was inserted by a migration or by hand in SQL, so
-- onboarding a second business required an engineer. `provision_tenant`
-- (00017) already gives a new tenant its policy matrix and config row from an
-- AFTER INSERT trigger, and the invitation flow already brings colleagues in.
-- The missing primitive is the first step: creating the row, and making the
-- person who asked its owner.
--
-- WHY A FUNCTION RATHER THAN A ROUTE WRITING TWO ROWS.
--
-- `tenants` and `memberships` are SELECT-only under RLS — deliberately, since
-- an INSERT policy on tenants would let any signed-in user mint rows, and one
-- on memberships would let them join a workspace they were never invited to.
-- The alternatives were to reach for the service role in the request path, or
-- to make this one auditable, privileged boundary. This is the boundary.
--
-- Three properties it gets from being a function, that two REST calls could
-- not have had:
--
--   1. It is ONE transaction. A tenant whose membership insert failed would be
--      a workspace nobody can see, own or delete — invisible garbage that
--      still holds a slug. Here it rolls back.
--   2. The caller is `auth.uid()`, read inside the function. It is not a
--      parameter, so it cannot be spoofed by anyone who can call the RPC.
--   3. `security definer` + a pinned `search_path` means the privilege is
--      scoped to exactly this body, not handed to the request.

create or replace function public.create_workspace(
  p_name text,
  p_timezone text default null
)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_tz    text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_base  text;
  v_slug  text;
  v_try   int := 0;
  v_owned int;
  v_id    uuid;
begin
  -- The RPC is granted to `authenticated`, but a role can be held without a
  -- user (service contexts), and this function's whole model is "the caller
  -- becomes the owner". No caller, no workspace.
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;

  if length(v_name) < 2 then
    raise exception 'A workspace needs a name of at least 2 characters.' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'That name is too long — 120 characters at most.' using errcode = '22023';
  end if;

  -- An unreal zone is not a cosmetic mistake. The receptionist's clock is
  -- built with Intl in this timezone; an unknown one throws, the composer
  -- falls back to "you do not know what day it is", and the agent silently
  -- stops being able to answer "are you open right now?" — forever, with
  -- nothing on screen to say why. Reject it at the door.
  -- `pg_timezone_names.name` is qualified because this function RETURNS a
  -- column called `name`, and PL/pgSQL holds OUT parameters in scope for the
  -- whole body — an unqualified `name` here is ambiguous and fails at runtime,
  -- not at creation. The same applies to id, slug, status, timezone and
  -- locale: every table reference below is aliased for that reason.
  if v_tz is not null
     and not exists (select 1 from pg_timezone_names z where z.name = v_tz) then
    raise exception 'Unknown timezone: %', v_tz using errcode = '22023';
  end if;

  -- Anti-abuse, not a product limit. One signed-in account looping this call
  -- would otherwise fill the tenants table and exhaust the slug space.
  select count(*) into v_owned
    from public.memberships
   where user_id = v_user and role = 'owner';
  if v_owned >= 10 then
    raise exception 'This account already owns 10 workspaces.' using errcode = '54000';
  end if;

  -- Slug: lowercase ASCII, single dashes, no leading or trailing dash.
  -- `translate` folds the common accented Latin letters so "Café Lulu" becomes
  -- "cafe-lulu" rather than "caf-lulu"; anything else non-alphanumeric becomes
  -- a separator. unaccent() would be better but is an extension, and a slug is
  -- not worth a dependency.
  v_base := lower(v_name);
  v_base := translate(
    v_base,
    'àáâãäåāăąèéêëēĕėęěìíîïĩīĭįòóôõöøōŏőùúûüũūŭůñńçćčšž',
    'aaaaaaaaaeeeeeeeeeiiiiiiiiooooooooouuuuuuuunncccsz'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := left(v_base, 40);
  v_base := btrim(v_base, '-');  -- left() can strand a dash at the cut
  if v_base = '' then
    v_base := 'workspace';       -- a name of only punctuation still gets a slug
  end if;

  -- Collision handling that terminates. The counter is bounded and then falls
  -- back to randomness, so two businesses with the same name cannot spin here.
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

comment on function public.create_workspace(text, text) is
  'Create a workspace and make the calling user its owner, in one transaction. '
  'Caller is auth.uid(), never a parameter. Provisioning runs from the tenants insert trigger.';

-- `anon` must never mint a tenant; the function is for signed-in callers only.
revoke execute on function public.create_workspace(text, text) from public, anon;
grant  execute on function public.create_workspace(text, text) to authenticated;
