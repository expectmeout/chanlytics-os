-- 00544 · Anthropic is told whom a call is for (decision 0097).
--
-- Without a profile on the request, one customer's flagged traffic can restrict the whole organization. One profile
-- stands for each signed-up person and one for each workspace, and its `uprof_` id is kept here, because creating one is
-- not idempotent: a second create makes a second profile.
--
--   anthropic_profiles          One row a person or a workspace: the id, and the enforcement Anthropic last said of it.
--                               The service role's alone. A person or a workspace that goes leaves its row with no
--                               subject (on delete set null), so whichever way it went, a press, a script or a hand in
--                               the database, the health sweep still deletes the profile at Anthropic, then the row.
--   anthropic_profile_claim     The service role's: the row made, once. Only the call that made it creates the profile.
--   anthropic_profiles_waiting  The service role's: who has no row yet, for the sweep to register a few at a time.
--
-- Deploy order: this migration first. Nothing reads the table until ANTHROPIC_PROFILES is 'on' on the edge, but for the
-- sweep's first read, which says so in the log, and Health's, which says it could not be read. Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.anthropic_profiles (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,
  user_id             uuid references auth.users (id) on delete set null,
  tenant_id           uuid references public.tenants (id) on delete set null,
  reference_id        text not null,
  profile_id          text unique,
  claimed_at          timestamptz not null default now(),
  enforcement_status  text not null default 'unrestricted',
  enforcement_actions jsonb not null default '[]'::jsonb,
  enforcement_at      timestamptz,
  constraint anthropic_profiles_kind_check check (kind = any (array['person', 'workspace'])),
  constraint anthropic_profiles_enforcement_status_check
    check (enforcement_status = any (array['unrestricted', 'pending', 'restricted', 'banned'])),
  constraint anthropic_profiles_one_subject
    check ((kind = 'person' and tenant_id is null) or (kind = 'workspace' and user_id is null))
);
comment on table public.anthropic_profiles is
  'Who Anthropic is told a model call is for (decision 0097): one row a signed-up person, one a workspace. A row whose subject went (both ids null) is the health sweep''s to delete at Anthropic, then here.';
comment on column public.anthropic_profiles.reference_id is
  'What the profile was created with as its reference_id (person:<id>, workspace:<id>): how a create whose answer was lost is found again.';
comment on column public.anthropic_profiles.profile_id is
  'Anthropic''s uprof_ id. Null while a create is in flight, or its answer was lost: the sweep adopts or lets go such a claim, and nothing creates a second.';
comment on column public.anthropic_profiles.enforcement_status is
  'What Anthropic last said (contracts enforcementStatusOf: a value it does not know reads restricted). Anything but unrestricted pauses the subject''s model calls.';
comment on column public.anthropic_profiles.enforcement_actions is
  'The open actions as Anthropic listed them: type, id, reason, action, opened_at, expires_at. No words of anyone''s.';
comment on column public.anthropic_profiles.enforcement_at is
  'When this platform last saw the status change.';

create unique index if not exists anthropic_profiles_person on public.anthropic_profiles (user_id)
  where user_id is not null;
create unique index if not exists anthropic_profiles_workspace on public.anthropic_profiles (tenant_id)
  where tenant_id is not null;

alter table public.anthropic_profiles enable row level security;
revoke all on public.anthropic_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.anthropic_profiles to service_role;

create or replace function public.anthropic_profile_claim(p_kind text, p_subject uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text := p_kind || ':' || p_subject;
  v_at    timestamptz;
  v_email text;
  v_id    uuid;
begin
  if p_kind = 'person' then
    select u.created_at, u.email into v_at, v_email from auth.users u where u.id = p_subject;
    if not found then return null; end if;
    insert into public.anthropic_profiles (kind, user_id, reference_id)
    values ('person', p_subject, v_ref)
    on conflict (user_id) where user_id is not null do nothing
    returning id into v_id;
  elsif p_kind = 'workspace' then
    select t.created_at into v_at from public.tenants t where t.id = p_subject and t.left_empty_at is null;
    if not found then return null; end if;
    insert into public.anthropic_profiles (kind, tenant_id, reference_id)
    values ('workspace', p_subject, v_ref)
    on conflict (tenant_id) where tenant_id is not null do nothing
    returning id into v_id;
  else
    raise exception 'anthropic_profile_claim: % is no kind', p_kind using errcode = '22023';
  end if;
  if v_id is null then return null; end if;
  return jsonb_build_object('id', v_id, 'reference_id', v_ref, 'onboarded_at', v_at, 'email', v_email);
end $$;
revoke execute on function public.anthropic_profile_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.anthropic_profile_claim(text, uuid) to service_role;
comment on function public.anthropic_profile_claim(text, uuid) is
  'The one way a profile begins (decision 0097): the row made, once a person or a workspace. Answers what the create needs to the call that made it, and null to any other, or for a subject that is gone.';

create or replace function public.anthropic_profiles_waiting(p_limit integer)
returns table (kind text, subject uuid)
language sql
stable
security definer
set search_path = public
as $$
  select w.kind, w.subject
    from (
      select 'person'::text as kind, m.user_id as subject
        from (select distinct user_id from public.memberships) m
       where not exists (select 1 from public.anthropic_profiles p where p.user_id = m.user_id)
      union all
      select 'workspace'::text, t.id
        from public.tenants t
       where t.left_empty_at is null
         and t.status <> 'preview'
         and not exists (select 1 from public.anthropic_profiles p where p.tenant_id = t.id)
    ) w
   limit greatest(coalesce(p_limit, 0), 0);
$$;
revoke execute on function public.anthropic_profiles_waiting(integer) from public, anon, authenticated;
grant execute on function public.anthropic_profiles_waiting(integer) to service_role;
comment on function public.anthropic_profiles_waiting(integer) is
  'Who has no profile yet: a person with a seat, a live workspace but a preview (a preview is registered by its first call).';
