-- 00466 · The Console (decision 0066): the platform's own place, its staff in three roles behind a second factor, every
-- act they take written down with its reason before it runs, what customers report, and the clock the data-deletion
-- page promises.
--
--   platform_admins.role         owner, support or billing. The two who are staff today stay owners until an owner says
--                                otherwise (platform_admin_add with the role, after the deploy).
--   platform_staff_state()       The caller's role once their session showed its second factor; 'needs_second_factor'
--                                before; 'none' for everybody else. Answers about the caller alone.
--   platform_role()              The caller's role, on a session that showed its second factor; null otherwise.
--   is_platform_admin()          Asks for the second factor too, so every door behind it asks for it (Ruben, 21 Oct 2026:
--                                no grace). The roles are held at the dashboard's route (contracts CONSOLE_ACTS), which
--                                also writes the log: the partner functions of 00205-00217 still ask this alone, so a
--                                member of staff calling one with their own session passes as any role.
--   platform_admin_add(email, role)  Staff, by email, at the database alone: adds, or changes the role. Service role
--                                only.
--   platform_acts                Every act the team takes: who, their role, the act, the workspace, the target, the
--                                reason, then what came of it. Kept after the workspace and the person are gone.
--   support_reports              Report a problem: a customer's words, the page and the last error, numbered R-1001 up.
--   privacy_requests             A request the data-deletion page promises an answer to within thirty days, and its steps.
--                                Kept after the workspace it was about is deleted.
--   platform_claims              Who on the team has taken a workspace, until when.
--   platform_model_spend(days)   What each workspace's model calls cost lately: Home's number, the Workspaces column.
--   platform_find(q)             One box over every workspace: names, owners' addresses, lines, a caller's whole number
--                                (the workspace only), reports.
--
-- Deploy order: applied before the dashboard that reads these (the merge lands with --applied). The dashboard that runs
-- now calls is_platform_admin() and platform_overview(), which keep their shapes; between this and the deploy, its back
-- office refuses a session that has not shown a second factor, which is the platform's staff alone. Re-runnable.

set local lock_timeout = '3s';

-- ------------------------------------------------------------------------------------------------ the three roles

alter table public.platform_admins add column if not exists role text not null default 'owner';
alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins add constraint platform_admins_role_check check (role in ('owner', 'support', 'billing'));
comment on column public.platform_admins.role is
  'What the person may do in the Console (00466, decision 0066): owner (everything), support (the workspaces'' work), billing (the money). Set at the database alone (platform_admin_add).';

create or replace function public.platform_staff_state()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
           when a.user_id is null then 'none'
           when not public.session_shows_second_factor() then 'needs_second_factor'
           else a.role
         end
    from (select 1) as one
    left join public.platform_admins a on a.user_id = auth.uid();
$$;

comment on function public.platform_staff_state() is
  'The calling session in the Console (00466): its role once it showed its second factor, needs_second_factor before, none for everybody else. Answers about the caller alone, so every session may ask.';

revoke execute on function public.platform_staff_state() from public, anon;
grant execute on function public.platform_staff_state() to authenticated;

create or replace function public.platform_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select a.role
    from public.platform_admins a
   where a.user_id = auth.uid()
     and public.session_shows_second_factor();
$$;

comment on function public.platform_role() is
  'The calling session''s role in the Console (00466), on a session that showed its second factor; null otherwise. Answers about the caller alone.';

revoke execute on function public.platform_role() from public, anon;
grant execute on function public.platform_role() to authenticated;

-- The one gate, now with the second factor (00091's body and this condition).
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
     and public.session_shows_second_factor();
$$;

comment on function public.is_platform_admin() is
  'Whether the calling session is Chanlytics staff and showed its second factor (00466, decision 0066: no grace). Answers only about the caller, which is why every session may ask; platform_overview() and the Console''s doors are what the answer unlocks.';

revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Staff, by email, at the database alone: who may read every workspace is a decision a person makes at a console.
drop function if exists public.platform_admin_add(text);

create or replace function public.platform_admin_add(p_email text, p_role text default 'support')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
begin
  if p_role is null or p_role not in ('owner', 'support', 'billing') then
    return format('%s is not a role: owner, support or billing', coalesce(p_role, 'nothing'));
  end if;
  select u.id into v_id from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_id is null then
    return format('no account for %s — nothing added', p_email);
  end if;
  select a.role into v_role from public.platform_admins a where a.user_id = v_id;
  if v_role = p_role then
    return format('%s is staff already, as %s — nothing changed', p_email, v_role);
  end if;
  insert into public.platform_admins (user_id, role) values (v_id, p_role)
    on conflict (user_id) do update set role = excluded.role;
  if v_role is not null then
    return format('%s was %s, now %s', p_email, v_role, p_role);
  end if;
  return format('%s may now open the Console, as %s', p_email, p_role);
end $$;

comment on function public.platform_admin_add(text, text) is
  'Adds a person to the Console''s staff by email with a role, or changes the role of one who is staff already (00466). Service-role only, and deliberately not reachable from the app. Answers in words rather than raising, so a typo is not an outage. Removing someone is a delete from platform_admins at the same console.';

revoke execute on function public.platform_admin_add(text, text) from public, anon, authenticated;
grant execute on function public.platform_admin_add(text, text) to service_role;

-- ----------------------------------------------------------------------------------------- what the team did

create table if not exists public.platform_acts (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  -- Who: kept by address too, so the log still says who after their account is gone.
  actor_id      uuid references auth.users (id) on delete set null,
  actor_email   text check (actor_email is null or char_length(actor_email) <= 320),
  actor_role    text not null check (actor_role in ('owner', 'support', 'billing')),
  -- The act, one of contracts CONSOLE_ACTS: a new act needs no migration, and an unknown one is said as its key.
  act           text not null check (act ~ '^[a-z][a-z_]{1,39}$'),
  -- The workspace it was taken on, when it was one; kept as null once the workspace is deleted.
  tenant_id     uuid references public.tenants (id) on delete set null,
  target_kind   text not null check (target_kind in ('workspace', 'line', 'job', 'waitlist', 'partner', 'request', 'platform')),
  target_id     uuid,
  reason_kind   text not null check (reason_kind in ('ticket', 'call', 'found', 'cleanup')),
  ticket        text check (ticket is null or char_length(ticket) between 1 and 40),
  note          text check (note is null or char_length(note) between 1 and 500),
  outcome       text not null default 'running' check (outcome in ('running', 'done', 'refused', 'failed')),
  outcome_note  text check (outcome_note is null or char_length(outcome_note) <= 500),
  finished_at   timestamptz,
  constraint platform_acts_ticket_named check (reason_kind <> 'ticket' or ticket is not null),
  constraint platform_acts_finished check ((outcome = 'running') = (finished_at is null))
);
comment on table public.platform_acts is
  'Every act the Console''s staff take (00466, decision 0066), written before the act runs (an act that cannot be written does not run), then what came of it. The service role alone reads and writes it; nothing deletes a row.';

create index if not exists platform_acts_at on public.platform_acts (at desc);
create index if not exists platform_acts_tenant_at on public.platform_acts (tenant_id, at desc) where tenant_id is not null;
create index if not exists platform_acts_actor_at on public.platform_acts (actor_id, at desc);

alter table public.platform_acts enable row level security;
revoke all on public.platform_acts from public, anon, authenticated;
-- The house grant (00339): the four commands. The guard below holds what the grant cannot: the log is written forward.
grant select, insert, update, delete on public.platform_acts to service_role;

-- The log is written forward, whoever holds the key: a row is added running and finished once, and after that nothing
-- in it changes and it is never deleted. A workspace or an account deleted leaves its rows, the key set null (the
-- foreign keys' own update), which is the one change a row takes after it is finished.
create or replace function public.platform_acts_forward() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'the Admin log keeps every row (platform_acts %)', OLD.id using errcode = 'check_violation';
  end if;
  if NEW.id is distinct from OLD.id or NEW.at is distinct from OLD.at
     or NEW.actor_email is distinct from OLD.actor_email or NEW.actor_role is distinct from OLD.actor_role
     or NEW.act is distinct from OLD.act or NEW.target_kind is distinct from OLD.target_kind
     or NEW.target_id is distinct from OLD.target_id or NEW.reason_kind is distinct from OLD.reason_kind
     or NEW.ticket is distinct from OLD.ticket or NEW.note is distinct from OLD.note
     or (NEW.tenant_id is distinct from OLD.tenant_id and NEW.tenant_id is not null)
     or (NEW.actor_id is distinct from OLD.actor_id and NEW.actor_id is not null) then
    raise exception 'an Admin log row says who did what, where and why once (platform_acts %)', OLD.id
      using errcode = 'check_violation';
  end if;
  if OLD.outcome <> 'running' and (NEW.outcome is distinct from OLD.outcome
     or NEW.outcome_note is distinct from OLD.outcome_note or NEW.finished_at is distinct from OLD.finished_at) then
    raise exception 'an Admin log row is finished once (platform_acts %: %)', OLD.id, OLD.outcome
      using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
revoke all on function public.platform_acts_forward() from public, anon, authenticated;
drop trigger if exists platform_acts_forward on public.platform_acts;
create trigger platform_acts_forward before update or delete on public.platform_acts
  for each row execute function public.platform_acts_forward();

-- -------------------------------------------------------------------------------------------- what customers report

create table if not exists public.support_reports (
  id             uuid primary key default gen_random_uuid(),
  number         integer generated by default as identity (start with 1001) unique,
  -- The workspace the tab held, when the member belongs to it; deleted with the workspace, as the page promises.
  tenant_id      uuid references public.tenants (id) on delete cascade,
  -- The member who wrote it; their account deleted takes their reports with it.
  user_id        uuid not null references auth.users (id) on delete cascade,
  email          text check (email is null or char_length(email) <= 320),
  page           text check (page is null or page ~ '^[a-z][a-z0-9-]{0,31}$'),
  error_id       text check (error_id is null or error_id ~ '^[0-9a-f]{1,8}$'),
  error_name     text check (error_name is null or char_length(error_name) <= 60),
  error_message  text check (error_message is null or char_length(error_message) <= 300),
  words          text not null check (char_length(words) between 1 and 2000),
  created_at     timestamptz not null default now(),
  mailed_at      timestamptz,
  mail_error     text check (mail_error is null or char_length(mail_error) <= 300)
);
comment on table public.support_reports is
  'Report a problem (00466, decision 0066): what a member wrote, the page and the last error it hit, numbered R-1001 and up, then whether the mail to the support inbox left. Nothing of their customers. The service role alone reads and writes it.';

create index if not exists support_reports_created on public.support_reports (created_at desc);
create index if not exists support_reports_tenant_created on public.support_reports (tenant_id, created_at desc) where tenant_id is not null;
create index if not exists support_reports_error on public.support_reports (error_id, created_at desc) where error_id is not null;

alter table public.support_reports enable row level security;
revoke all on public.support_reports from public, anon, authenticated;
grant select, insert, update, delete on public.support_reports to service_role;
grant usage, select on sequence public.support_reports_number_seq to service_role;

-- --------------------------------------------------------------------------------------- the promise's clock

create table if not exists public.privacy_requests (
  id          uuid primary key default gen_random_uuid(),
  number      integer generated by default as identity (start with 101) unique,
  kind        text not null check (kind in ('delete_workspace', 'delete_person', 'copy')),
  -- The workspace it is about, by key while it stands and by the name and address it had when filed, after.
  tenant_id   uuid references public.tenants (id) on delete set null,
  slug        text not null check (char_length(slug) between 1 and 63),
  name        text not null check (char_length(name) between 1 and 200),
  asked_by    text not null check (char_length(asked_by) between 3 and 200),
  asked_at    timestamptz not null,
  ticket      text check (ticket is null or char_length(ticket) between 1 and 40),
  note        text check (note is null or char_length(note) between 1 and 500),
  -- The page's thirty days from the ask (contracts requestDueAt).
  due_at      timestamptz not null,
  -- Each step done, and when: {"confirmed": "2026-10-13T…", …}; contracts REQUEST_STEPS names a kind's.
  steps       jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object' and octet_length(steps::text) <= 4000),
  closed_at   timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint privacy_requests_due_after_asked check (due_at > asked_at)
);
comment on table public.privacy_requests is
  'A request the data-deletion page promises an answer to (00466, decision 0066): a workspace to delete within thirty days of its owner asking, a person''s request passed to the business, a copy of everything; with its steps. Outlives the workspace it was about. The service role alone reads and writes it.';

create index if not exists privacy_requests_open on public.privacy_requests (due_at) where closed_at is null;

alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from public, anon, authenticated;
grant select, insert, update, delete on public.privacy_requests to service_role;
grant usage, select on sequence public.privacy_requests_number_seq to service_role;

-- ------------------------------------------------------------------------------------------------- who has it

create table if not exists public.platform_claims (
  tenant_id   uuid primary key references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Their address as their session said it, so a row can say who is on it.
  email       text check (email is null or char_length(email) <= 320),
  claimed_at  timestamptz not null default now(),
  until       timestamptz not null,
  constraint platform_claims_until check (until > claimed_at)
);
comment on table public.platform_claims is
  'Who on the Console''s staff has taken a workspace, until when (00466, decision 0066: four hours, or until let go), so two people do not mend one thing at once. The service role alone reads and writes it.';

alter table public.platform_claims enable row level security;
revoke all on public.platform_claims from public, anon, authenticated;
grant select, insert, update, delete on public.platform_claims to service_role;

-- ------------------------------------------------------------------------------------------------ Home's spend

-- What each workspace's model calls cost in the last days, at list price: Home's number and the Workspaces column no
-- workspace's row carries. Summed here so a month of calls is not sent to be added up. The service role alone.
create or replace function public.platform_model_spend(p_days integer default 30)
returns table (tenant_id uuid, usd numeric)
language sql
stable
set search_path = public
as $$
  select u.tenant_id, coalesce(sum(u.usd), 0)
    from public.ai_usage u
   where u.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 400)))
   group by u.tenant_id;
$$;

comment on function public.platform_model_spend(integer) is
  'The Console (00466, decision 0066): what each workspace''s model calls cost over the last days (ai_usage.usd, list price). The service role alone.';

revoke execute on function public.platform_model_spend(integer) from public, anon, authenticated;
grant execute on function public.platform_model_spend(integer) to service_role;

-- --------------------------------------------------------------------------------------------------------- Find

-- One box over every workspace. Staff only: the session's own gate, as platform_overview() asks it. A caller's number is
-- matched whole (its last ten digits) and answers with the workspace alone, never the person who called.
create or replace function public.platform_find(p_q text)
returns table (kind text, tenant_id uuid, slug text, name text, label text, detail text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_like text;
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_number boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 80 then
    return;
  end if;
  v_like := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_number := char_length(v_digits) >= 4 and v_q ~ '^[0-9\s()+.-]+$';

  return query
    (select 'workspace'::text, t.id, t.slug, t.name, t.name, t.slug
       from public.tenants t
      where lower(t.name) like v_like or t.slug like v_like
      order by t.name
      limit 8)
    union all
    (select 'owner'::text, t.id, t.slug, t.name, u.email::text, 'Owner of ' || t.name
       from public.memberships m
       join auth.users u on u.id = m.user_id
       join public.tenants t on t.id = m.tenant_id
      where m.role = 'owner' and lower(u.email) like v_like
      order by u.email
      limit 8)
    union all
    (select 'line'::text, t.id, t.slug, t.name, l.e164, t.name || '''s line'
       from public.lines l
       join public.tenants t on t.id = l.tenant_id
      where v_number and l.e164 is not null and regexp_replace(l.e164, '\D', '', 'g') like '%' || v_digits || '%'
      order by l.e164
      limit 5)
    union all
    (select distinct on (t.id) 'caller'::text, t.id, t.slug, t.name, v_q, 'Called ' || t.name
       from public.contacts c
       join public.tenants t on t.id = c.tenant_id
      where v_number and char_length(v_digits) >= 10 and c.erased_at is null and c.phone_e164 is not null
        and right(regexp_replace(c.phone_e164, '\D', '', 'g'), 10) = right(v_digits, 10)
      order by t.id
      limit 5)
    union all
    (select 'report'::text, r.tenant_id, t.slug, t.name, 'R-' || r.number, left(r.words, 120)
       from public.support_reports r
       left join public.tenants t on t.id = r.tenant_id
      where lower(r.words) like v_like or ('r-' || r.number) = lower(v_q)
      order by r.created_at desc
      limit 5);
end $$;

comment on function public.platform_find(text) is
  'The Console''s Find (00466, decision 0066): workspaces by name or address, owners by email, lines by number, a caller''s whole number (the workspace only, never who called), reports by their words or R-number. Staff on a session that showed its second factor; anyone else is refused.';

revoke execute on function public.platform_find(text) from public, anon;
grant execute on function public.platform_find(text) to authenticated;
