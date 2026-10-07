-- 00202 · A partner brings a workspace: the partner, the attribution, and the membership that comes with it.
--
-- Decision 0012, P2. A partner is a person with an account and a code; their link (/p/<code>) leaves a cookie, and
-- a workspace made while the cookie is there is attributed to them, once, at creation, in the same transaction as
-- the tenant: a partner_tenants row and a 'partner' membership (00201). Nothing attributes a workspace later, and a
-- partner is never credited with a workspace they made themselves.
--
--   partners         one per account: the code, the standing (active · paused · closed), the share in basis points
--                    (2500 is 25%; read at each invoice in P3, never a constant in code), when the terms were agreed.
--   partner_tenants  one per workspace, for ever: which partner, through which code, when; and the standing the P3
--                    sweep decides (qualified · review · disqualified), null until it has looked.
--   partner_become   the caller becomes a partner: the code's shape checked here as contracts cleanPartnerCode
--                    checks it, one partner per account, the terms recorded.
--   create_workspace gains p_partner_code. The two-argument form is dropped: with a default on the third argument
--                    a two-argument call would be ambiguous between them. create_workspace_for carries the body.

-- ------------------------------------------------------------------------------------------------- partners

create table if not exists public.partners (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references auth.users (id) on delete cascade,
  code               text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$'),
  status             text not null default 'active' check (status in ('active', 'paused', 'closed')),
  share_bp           integer not null default 2500 check (share_bp between 0 and 10000),
  terms_accepted_at  timestamptz,
  -- How they are paid, by hand until Stripe Connect (0012, later): free-form, the platform's to fill.
  payout_facts       jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.partners is
  'A partner (0012): a person who brings workspaces to Chanlytics through their link, sets them up as a member of their team, and earns share_bp of what each pays. One per account.';

drop trigger if exists partners_moddatetime on public.partners;
create trigger partners_moddatetime before update on public.partners
  for each row execute function extensions.moddatetime('updated_at');

alter table public.partners enable row level security;
revoke all on public.partners from public, anon, authenticated;
-- A partner reads their own row (the pane); writes go through partner_become and the service role.
drop policy if exists partners_self_select on public.partners;
create policy partners_self_select on public.partners
  for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.partners to authenticated;

-- ------------------------------------------------------------------------------------------ partner_tenants

create table if not exists public.partner_tenants (
  tenant_id      uuid primary key references public.tenants (id) on delete cascade,
  partner_id     uuid not null references public.partners (id) on delete restrict,
  code_used      text not null,
  attributed_at  timestamptz not null default now(),
  -- What the sweep found (0012, P3): null until it has looked.
  standing       text check (standing in ('qualified', 'review', 'disqualified')),
  standing_why   text,
  standing_by    uuid references auth.users (id) on delete set null,
  standing_at    timestamptz,
  checks         jsonb not null default '{}'::jsonb
);
comment on table public.partner_tenants is
  'Which partner brought this workspace (0012), fixed when the workspace was made and never moved. standing is what the sweep decided about it; null until it has looked.';
create index if not exists partner_tenants_partner_idx on public.partner_tenants (partner_id);

alter table public.partner_tenants enable row level security;
revoke all on public.partner_tenants from public, anon, authenticated;
-- The partner reads the workspaces they brought; a workspace's owner reads who brought theirs.
drop policy if exists partner_tenants_partner_select on public.partner_tenants;
create policy partner_tenants_partner_select on public.partner_tenants
  for select to authenticated
  using (partner_id in (select p.id from public.partners p where p.user_id = (select auth.uid())));
drop policy if exists partner_tenants_owner_select on public.partner_tenants;
create policy partner_tenants_owner_select on public.partner_tenants
  for select to authenticated
  using (public.is_workspace_owner(tenant_id));
grant select on public.partner_tenants to authenticated;

-- ------------------------------------------------------------------------------------------- partner_become

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

comment on function public.partner_become(text) is
  'The calling session becomes a partner (0012) with this code, once. The code''s shape and the reserved words are contracts'' rule, restated here; the terms are recorded as agreed now.';

revoke execute on function public.partner_become(text) from public, anon;
grant execute on function public.partner_become(text) to authenticated;

-- ------------------------------------------------------------------------------- create_workspace, with a code

-- The two-argument forms go: with a default on the third argument a two-argument call would name both.
drop function if exists public.create_workspace_for(uuid, text, text);
drop function if exists public.create_workspace(text, text);

create or replace function public.create_workspace_for(
  p_user uuid,
  p_name text,
  p_timezone text default null,
  p_partner_code text default null
)
returns table (id uuid, slug text, name text, status text, timezone text, locale text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := p_user;
  v_name    text := btrim(coalesce(p_name, ''));
  v_tz      text := nullif(btrim(coalesce(p_timezone, '')), '');
  v_code    text := nullif(lower(btrim(coalesce(p_partner_code, ''))), '');
  v_base    text;
  v_slug    text;
  v_try     int := 0;
  v_owned   int;
  v_id      uuid;
  v_partner public.partners;
  v_why     text;
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

  -- The partner (0012): credited only when the code names an active partner who is not the caller, and only now.
  -- A code that names nobody creditable is recorded as ignored, with why, and the workspace is made all the same:
  -- the link is the partner's affair, never the business's problem.
  if v_code is not null then
    select p.* into v_partner from public.partners p where p.code = v_code;
    if v_partner.id is null then
      v_why := 'unknown';
    elsif v_partner.status <> 'active' then
      v_why := v_partner.status;
    elsif v_partner.user_id = v_user then
      v_why := 'self';
    end if;
    if v_why is null then
      insert into public.partner_tenants (tenant_id, partner_id, code_used)
      values (v_id, v_partner.id, v_code);
      insert into public.memberships (tenant_id, user_id, role)
      values (v_id, v_partner.user_id, 'partner');
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_id, 'partner.attributed', 'workspace', 'tenant', v_id,
              jsonb_build_object('partner_id', v_partner.id, 'code', v_code, 'by', v_user));
    else
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_id, 'partner.code_ignored', 'workspace', 'tenant', v_id,
              jsonb_build_object('code', v_code, 'why', v_why, 'by', v_user));
    end if;
  end if;

  return query
    select t.id, t.slug, t.name, t.status, t.timezone, t.locale
      from public.tenants t
     where t.id = v_id;
end $$;

comment on function public.create_workspace_for(uuid, text, text, text) is
  'Create a workspace and make p_user its owner, in one transaction; with p_partner_code, credit the partner it names and seat them on the team (0012). Service role only; create_workspace wraps it for signed-in callers.';

-- Service role alone: a signed-in caller must not name another user as owner.
revoke execute on function public.create_workspace_for(uuid, text, text, text) from public, anon, authenticated;

-- The signed-in wrapper: the caller is auth.uid(), never a parameter (00021's stand).
create or replace function public.create_workspace(
  p_name text,
  p_timezone text default null,
  p_partner_code text default null
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
      from public.create_workspace_for(auth.uid(), p_name, p_timezone, p_partner_code) w;
end $$;

comment on function public.create_workspace(text, text, text) is
  'Create a workspace and make the calling user its owner, in one transaction; p_partner_code credits the partner whose link brought them (0012). Caller is auth.uid(), never a parameter; the body lives in create_workspace_for.';

revoke execute on function public.create_workspace(text, text, text) from public, anon;
grant execute on function public.create_workspace(text, text, text) to authenticated;
