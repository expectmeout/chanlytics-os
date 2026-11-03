-- A workspace's setup choices are its own (decision 0091, the onboarding PRD of 3 Nov 2026).
--
-- What the first run's Where it answers chose (the number kept, moved or new, and how calls reach it; where WhatsApp
-- answers) and the first run's marks that say a step was done (its receptionist met, its rehearsal skipped, Where it
-- answers seen with no number to choose) were kept in the member's own saved view (memberships.views.setup, 00113). So
-- a partner who set a workspace up handed its owner a first run with nothing chosen, two owners stood at two steps, the
-- back office read a step nobody stood at, and nothing on the server knew what number to buy once the plan started. Now
-- they are the workspace's: one row in setup_choices, read by every member under RLS and by the service role, written
-- through setup_choice_set (a member with the settings permission, the version compared so a race is refused), its
-- change told as settings.changed. What a member puts off for a week or for good stays theirs, in their view.
--
-- The copy: each workspace's choices are taken once from its owner's view, else a partner's, the newest first; a
-- workspace with none has no row until something is chosen. Deploy order: this first. A dashboard before it reads and
-- writes the member's view as it always did; one after it, over a database before this, finds no table and reads the
-- view. Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.setup_choices (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  -- contracts SetupPhoneWant: {way: keep|move|new|none, number?, mode?, rings?, company?}; read by setupPhoneWantOf.
  phone      jsonb,
  whatsapp   text,
  marks      text[] not null default '{}',
  version    integer not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint setup_choices_phone_shape check (phone is null or (jsonb_typeof(phone) = 'object' and phone ? 'way')),
  constraint setup_choices_whatsapp check (whatsapp is null or whatsapp in ('same', 'own', 'later')),
  constraint setup_choices_marks check (marks <@ array['receptionist-met', 'rehearse-skipped', 'channels-seen']::text[])
);
comment on table public.setup_choices is
  'What the first run chose for the workspace (00513, decision 0091): the number and how calls reach it (phone, contracts SetupPhoneWant), where WhatsApp answers, and the marks that say a step was done (marks: receptionist-met, rehearse-skipped, channels-seen). One row a workspace; members read it, setup_choice_set writes it, and the edge reads it to buy the number once the plan starts.';

alter table public.setup_choices enable row level security;
drop policy if exists setup_choices_member_select on public.setup_choices;
create policy setup_choices_member_select on public.setup_choices for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.setup_choices from anon, authenticated;
grant select on public.setup_choices to authenticated;
grant select, insert, update, delete on public.setup_choices to service_role;

-- The member's door. Each argument left null keeps what is there; p_marks adds to the marks, never takes one away;
-- p_clear_phone takes the number's choice away. The version is compared when it is given, so a tab that read an older
-- row is refused (stale) rather than writing over a choice another tab made.
create or replace function public.setup_choice_set(
  p_tenant_id uuid,
  p_phone jsonb default null,
  p_whatsapp text default null,
  p_marks text[] default null,
  p_clear_phone boolean default false,
  p_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.setup_choices;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_user, p_tenant_id, 'settings') then
    raise exception 'Only an owner can set the workspace up.' using errcode = '42501';
  end if;
  insert into public.setup_choices (tenant_id) values (p_tenant_id) on conflict (tenant_id) do nothing;
  select * into v_row from public.setup_choices where tenant_id = p_tenant_id for update;
  if p_version is not null and v_row.version <> p_version then
    return jsonb_build_object('error', 'stale', 'version', v_row.version);
  end if;
  update public.setup_choices
     set phone      = case when p_clear_phone then null else coalesce(p_phone, phone) end,
         whatsapp   = coalesce(p_whatsapp, whatsapp),
         marks      = (select coalesce(array_agg(distinct x order by x), '{}')
                         from unnest(marks || coalesce(p_marks, '{}')) as x),
         version    = version + 1,
         updated_by = v_user,
         updated_at = now()
   where tenant_id = p_tenant_id
  returning * into v_row;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'settings.changed', 'system', 'workspace', p_tenant_id,
          jsonb_build_object('fields', jsonb_build_array('setup_choices'), 'by', v_user, 'version', v_row.version));
  return jsonb_build_object('phone', v_row.phone, 'whatsapp', v_row.whatsapp, 'marks', to_jsonb(v_row.marks),
                            'version', v_row.version);
end $$;
revoke all on function public.setup_choice_set(uuid, jsonb, text, text[], boolean, integer) from public, anon;
grant execute on function public.setup_choice_set(uuid, jsonb, text, text[], boolean, integer) to authenticated, service_role;
comment on function public.setup_choice_set(uuid, jsonb, text, text[], boolean, integer) is
  'A member with the settings permission (an owner, or the partner who brought it) keeps what the first run chose for the workspace (00513, decision 0091): the number''s choice (or p_clear_phone to take it away), where WhatsApp answers, and marks added. p_version, when given, must be the row''s, else {error: stale, version}. Writes settings.changed (fields setup_choices). Returns the row as it now stands.';

-- The copy from the views, once: the owner's, else a partner's, the newest membership first.
insert into public.setup_choices (tenant_id, phone, whatsapp, marks, version, updated_at)
select distinct on (m.tenant_id)
       m.tenant_id,
       case when jsonb_typeof(m.views -> 'setup' -> 'phone') = 'object' and (m.views -> 'setup' -> 'phone') ? 'way'
            then m.views -> 'setup' -> 'phone' end,
       case when m.views -> 'setup' ->> 'whatsapp' in ('same', 'own', 'later') then m.views -> 'setup' ->> 'whatsapp' end,
       coalesce((select array_agg(distinct x order by x)
                   from jsonb_array_elements_text(case when jsonb_typeof(m.views -> 'setup' -> 'later') = 'array'
                                                       then m.views -> 'setup' -> 'later' else '[]'::jsonb end) as x
                  where x in ('receptionist-met', 'rehearse-skipped', 'channels-seen')), '{}'),
       1,
       now()
  from public.memberships m
 where m.role in ('owner', 'partner')
   and jsonb_typeof(m.views -> 'setup') = 'object'
   and (jsonb_typeof(m.views -> 'setup' -> 'phone') = 'object'
        or m.views -> 'setup' ->> 'whatsapp' in ('same', 'own', 'later')
        or (jsonb_typeof(m.views -> 'setup' -> 'later') = 'array'
            and (m.views -> 'setup' -> 'later') ?| array['receptionist-met', 'rehearse-skipped', 'channels-seen']))
 order by m.tenant_id, (m.role = 'owner') desc, m.created_at desc
on conflict (tenant_id) do nothing;
