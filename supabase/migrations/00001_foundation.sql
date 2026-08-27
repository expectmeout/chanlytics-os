-- Slice 0 / migration 0001 — foundation: tenants, memberships, platform_admins.
-- Conventions (Blueprint v3.0 §3): text + CHECK for closed sets (never native enums),
-- timestamptz, moddatetime updated_at on mutable tables, RLS on everything,
-- app-plane access through session-scoped clients so RLS is the enforcement.

create extension if not exists moddatetime with schema extensions;

-- ---------------------------------------------------------------- tenants
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  status      text not null default 'active' check (status in ('active','paused','test')),
  timezone    text not null default 'America/New_York',
  locale      text not null default 'en',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function extensions.moddatetime('updated_at');

-- ------------------------------------------------------------ memberships
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','staff')),
  created_at  timestamptz not null default now(),
  unique (user_id, tenant_id)
);

-- -------------------------------------------------------- platform_admins
-- Chanlytics concierge role. No client-facing policies: service-role only.
create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;

-- §8 policy template: membership-scoped reads for authenticated sessions.
create policy tenants_member_select on public.tenants
  for select to authenticated
  using (id in (select m.tenant_id
                from public.memberships m
                where m.user_id = (select auth.uid())));

create policy memberships_self_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policies on any of these tables: tenant lifecycle
-- and membership management are service-role (concierge) operations for now.

-- ---------------------------------------------------------------- seed
-- Tenant #1. Channel rows (routing keys) land with Slice 1's migration.
insert into public.tenants (slug, name, status, timezone, locale)
values ('melanys-beauty-salon', 'Melany''s Beauty Salon', 'active', 'America/New_York', 'en')
on conflict (slug) do nothing;
