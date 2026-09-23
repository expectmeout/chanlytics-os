-- 00157 · A note is a record.
--
-- docs/decisions/0007-person-notes.md. A person's notes were one 600-character
-- field (00054), overwritten by every save: no history, no author, no date on
-- the page, and every word of it read by the receptionist. Each note is now a
-- row: its words, who wrote it (a member, or the receptionist), when, the
-- member it is for, and whether it is for the team only. The receptionist
-- reads the kept notes that are not for the team only; its own notes are
-- suggestions until a member keeps them, so nothing a caller says reaches its
-- instructions unread by a person.
--
-- contacts.notes stays, unread by the new code, and 00054's door keeps
-- writing it and now adds a row too, so a page loaded before this deploy loses
-- nothing. The existing notes move in as each person's first note, credited to
-- whoever last saved them. An erasure takes every note (the words go; 00054's
-- field was left on the erased row, which this also clears).

/* ------------------------------------------------------------- 1. the table -- */

create table if not exists public.person_notes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 600),
  -- Who wrote it: a member at the desk, or the receptionist after a call or a thread.
  author_kind    text not null default 'member' check (author_kind in ('member', 'receptionist')),
  author_user_id uuid references auth.users (id) on delete set null,
  -- The member it is for ("For Maria"); null is for everyone.
  for_user_id    uuid references auth.users (id) on delete set null,
  -- For the team only: the receptionist never reads it.
  team_only      boolean not null default false,
  -- A receptionist's note is suggested until a member keeps it; a member's note is kept as it is written.
  state          text not null default 'kept' check (state in ('kept', 'suggested')),
  -- Where it came from: the page, People's bulk note, the field it moved from (00054), a call, a thread.
  source         text not null default 'page' check (source in ('page', 'bulk', 'moved', 'call', 'thread')),
  -- The call or the conversation a receptionist's note came from.
  source_id      uuid,
  kept_by        uuid references auth.users (id) on delete set null,
  kept_at        timestamptz,
  version        integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint person_notes_author_check check (
    (author_kind = 'member' and state = 'kept') or author_kind = 'receptionist'
  )
);
comment on table public.person_notes is
  'A person''s notes (0007), one row each: the words, who wrote them (a member, or the receptionist), when, the member they are for, and whether they are for the team only. The receptionist reads kept notes that are not team_only; its own notes are suggested until a member keeps them. Written only by the person_note_* doors. Never sent to the customer.';

create index if not exists person_notes_contact on public.person_notes (tenant_id, contact_id, created_at desc);
create index if not exists person_notes_for on public.person_notes (tenant_id, for_user_id) where for_user_id is not null;

drop trigger if exists person_notes_set_updated_at on public.person_notes;
create trigger person_notes_set_updated_at before update on public.person_notes
  for each row execute function extensions.moddatetime('updated_at');

alter table public.person_notes enable row level security;
drop policy if exists person_notes_member_select on public.person_notes;
create policy person_notes_member_select on public.person_notes
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.person_notes from anon;
revoke insert, update, delete on public.person_notes from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'person_notes'
  ) then
    alter publication supabase_realtime add table public.person_notes;
  end if;
end $$;

/* -------------------------------------------------------------- 2. the doors -- */

-- A member writes a note. Acting members only (owner or operator); the member
-- it is for must be on the team. Answers {note} or {error}.
create or replace function public.person_note_add(
  p_contact_id  uuid,
  p_body        text,
  p_for_user_id uuid default null,
  p_team_only   boolean default false,
  p_source      text default 'page'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_body   text := nullif(btrim(coalesce(p_body, '')), '');
  v_row    public.person_notes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_body is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  if p_source is null or p_source not in ('page', 'bulk') then
    return jsonb_build_object('error', 'bad_source');
  end if;
  select c.tenant_id into v_tenant
    from contacts c
   where c.id = p_contact_id and c.erased_at is null and c.merged_into_contact_id is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_for_user_id is not null and not exists (
    select 1 from memberships m where m.tenant_id = v_tenant and m.user_id = p_for_user_id
  ) then
    return jsonb_build_object('error', 'not_a_member');
  end if;
  insert into person_notes (tenant_id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, source)
  values (v_tenant, p_contact_id, v_body, 'member', v_user, p_for_user_id, coalesce(p_team_only, false), p_source)
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.noted', 'contact', 'contact', p_contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'by', v_user,
                             'for', p_for_user_id, 'team_only', v_row.team_only, 'source', p_source));
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_add(uuid, text, uuid, boolean, text) from public, anon;
grant execute on function public.person_note_add(uuid, text, uuid, boolean, text) to authenticated;
comment on function public.person_note_add(uuid, text, uuid, boolean, text) is
  'A member writes a note on a person (0007): up to 600 characters, optionally for one member of the team, optionally for the team only. Owner or operator. Answers {note} or {error}.';

-- Its author changes a note: the words, who it is for, whether it is for the
-- team only, all of them each time. The version the page saw refuses a stale
-- save. A receptionist's note is changed as it is kept (person_note_decide).
create or replace function public.person_note_edit(
  p_note_id     uuid,
  p_body        text,
  p_for_user_id uuid default null,
  p_team_only   boolean default false,
  p_version     integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row  public.person_notes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_body is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  select * into v_row from person_notes n where n.id = p_note_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.author_kind <> 'member' or v_row.author_user_id is distinct from v_user then
    return jsonb_build_object('error', 'not_yours');
  end if;
  if p_version is not null and p_version <> v_row.version then
    return jsonb_build_object('error', 'moved', 'version', v_row.version);
  end if;
  if p_for_user_id is not null and not exists (
    select 1 from memberships m where m.tenant_id = v_row.tenant_id and m.user_id = p_for_user_id
  ) then
    return jsonb_build_object('error', 'not_a_member');
  end if;
  update person_notes n
     set body = v_body, for_user_id = p_for_user_id, team_only = coalesce(p_team_only, false),
         version = n.version + 1
   where n.id = v_row.id
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'contact.note_changed', 'contact', 'contact', v_row.contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'by', v_user,
                             'for', p_for_user_id, 'team_only', v_row.team_only));
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_edit(uuid, text, uuid, boolean, integer) from public, anon;
grant execute on function public.person_note_edit(uuid, text, uuid, boolean, integer) to authenticated;
comment on function public.person_note_edit(uuid, text, uuid, boolean, integer) is
  'Its author changes a member''s note (0007): the words, who it is for, team only; a stale version answers {error: moved}. Answers {note} or {error}.';

-- A note is taken away by its author, or by an owner. The words go: nothing
-- is kept but the event, which holds none.
create or replace function public.person_note_remove(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.person_notes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from person_notes n where n.id = p_note_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.author_user_id is distinct from v_user and not public.is_workspace_owner(v_row.tenant_id) then
    return jsonb_build_object('error', 'not_yours');
  end if;
  delete from person_notes n where n.id = v_row.id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'contact.note_removed', 'contact', 'contact', v_row.contact_id,
          jsonb_build_object('note_id', v_row.id, 'by', v_user, 'author_kind', v_row.author_kind));
  return jsonb_build_object('removed', v_row.id);
end $$;

revoke execute on function public.person_note_remove(uuid) from public, anon;
grant execute on function public.person_note_remove(uuid) to authenticated;
comment on function public.person_note_remove(uuid) is
  'Take a note away (0007): its author, or an owner. The words go; the event holds none. Answers {removed} or {error}.';

-- A member decides on the receptionist's suggestion: kept (in its words, or
-- the member's changes to them), and the receptionist reads it from then on;
-- or dismissed, and the words go.
create or replace function public.person_note_decide(
  p_note_id   uuid,
  p_keep      boolean,
  p_body      text default null,
  p_team_only boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row  public.person_notes%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_body is not null and char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  select * into v_row from person_notes n where n.id = p_note_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_row.state <> 'suggested' then
    return jsonb_build_object('error', 'decided');
  end if;
  if not coalesce(p_keep, false) then
    delete from person_notes n where n.id = v_row.id;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'contact.note_dismissed', 'contact', 'contact', v_row.contact_id,
            jsonb_build_object('note_id', v_row.id, 'by', v_user, 'source', v_row.source));
    return jsonb_build_object('removed', v_row.id);
  end if;
  update person_notes n
     set state = 'kept', kept_by = v_user, kept_at = now(),
         body = coalesce(v_body, n.body), team_only = coalesce(p_team_only, n.team_only),
         version = n.version + 1
   where n.id = v_row.id
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'contact.note_kept', 'contact', 'contact', v_row.contact_id,
          jsonb_build_object('note_id', v_row.id, 'by', v_user, 'source', v_row.source,
                             'changed', v_body is not null));
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_decide(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.person_note_decide(uuid, boolean, text, boolean) to authenticated;
comment on function public.person_note_decide(uuid, boolean, text, boolean) is
  'Keep or dismiss the receptionist''s suggested note (0007): kept (optionally in changed words) it is read by the receptionist from then on; dismissed, its words go. Owner or operator. Answers {note}, {removed} or {error}.';

-- The receptionist suggests a note after a call or a thread (0007, phase 2).
-- The edge alone calls it, as the service role. A person holds at most three
-- suggestions waiting at once, so a talkative week cannot bury the page.
create or replace function public.person_note_suggest(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_body       text,
  p_source     text,
  p_source_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row  public.person_notes%rowtype;
begin
  if v_body is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  if p_source is null or p_source not in ('call', 'thread') then
    return jsonb_build_object('error', 'bad_source');
  end if;
  if not exists (
    select 1 from contacts c
     where c.id = p_contact_id and c.tenant_id = p_tenant_id
       and c.erased_at is null and c.merged_into_contact_id is null
  ) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_source_id is not null and exists (
    select 1 from person_notes n where n.contact_id = p_contact_id and n.source_id = p_source_id
  ) then
    return jsonb_build_object('error', 'already');
  end if;
  if (select count(*) from person_notes n where n.contact_id = p_contact_id and n.state = 'suggested') >= 3 then
    return jsonb_build_object('error', 'too_many');
  end if;
  insert into person_notes (tenant_id, contact_id, body, author_kind, state, source, source_id)
  values (p_tenant_id, p_contact_id, v_body, 'receptionist', 'suggested', p_source, p_source_id)
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.note_suggested', 'contact', 'contact', p_contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'source', p_source));
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_suggest(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.person_note_suggest(uuid, uuid, text, text, uuid) to service_role;
comment on function public.person_note_suggest(uuid, uuid, text, text, uuid) is
  'The receptionist suggests a note on a person after a call or a thread (0007). Service role only (the edge). Once per source; at most three waiting per person. Answers {note} or {error}.';

/* ------------------------------------------ 3. the old door writes a row too -- */

-- 00054's door, restated: it still writes the field (a page loaded before this
-- deploy reads it back), and a save that says something new adds a row, so
-- nothing written in the minutes between the push and the deploy is lost.
create or replace function public.set_person_notes(p_contact_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_before text;
  v_notes  text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_notes is not null and char_length(v_notes) > 600 then
    raise exception 'Notes are at most 600 characters.' using errcode = '22023';
  end if;
  select c.tenant_id, c.notes into v_tenant, v_before
    from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set notes = v_notes, updated_at = now() where id = p_contact_id;
  if v_notes is not null and v_notes is distinct from v_before then
    insert into person_notes (tenant_id, contact_id, body, author_kind, author_user_id, source)
    values (v_tenant, p_contact_id, v_notes, 'member', v_user, 'page');
  end if;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.noted', 'contact', 'contact', p_contact_id,
          jsonb_build_object('chars', coalesce(char_length(v_notes), 0), 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'notes', v_notes);
end $$;

revoke execute on function public.set_person_notes(uuid, text) from public, anon;
grant execute on function public.set_person_notes(uuid, text) to authenticated;
comment on function public.set_person_notes(uuid, text) is
  'Superseded by person_note_add (0007). Still writes contacts.notes for a page loaded before 00157, and adds a note row when the words are new.';

comment on column public.contacts.notes is
  'Superseded by person_notes (0007): moved there by 00157 and no longer read by the receptionist or the page. Kept for a page loaded before that deploy.';

/* ---------------------------------------------------- 4. the notes move in -- */

-- Each person's field becomes their first note, credited to whoever last saved
-- it and dated then (the newest contact.noted event), else the person's own
-- last change. Re-runnable: a person who already has a moved note is skipped.
insert into public.person_notes (tenant_id, contact_id, body, author_kind, author_user_id, source, created_at, updated_at)
select c.tenant_id, c.id, btrim(c.notes), 'member',
       (select (e.data ->> 'by')::uuid from public.events e
         where e.tenant_id = c.tenant_id and e.kind = 'contact.noted' and e.subject_type = 'contact'
           and e.subject_id = c.id and (e.data ->> 'by') ~ '^[0-9a-f-]{36}$'
           and exists (select 1 from auth.users u where u.id = (e.data ->> 'by')::uuid)
         order by e.created_at desc limit 1),
       'moved',
       coalesce((select e.created_at from public.events e
                  where e.tenant_id = c.tenant_id and e.kind = 'contact.noted' and e.subject_type = 'contact'
                    and e.subject_id = c.id
                  order by e.created_at desc limit 1), c.updated_at, now()),
       now()
  from public.contacts c
 where c.notes is not null and btrim(c.notes) <> '' and c.erased_at is null
   and not exists (select 1 from public.person_notes n where n.contact_id = c.id and n.source = 'moved');

/* ------------------------------------------------- 5. an erasure keeps no notes -- */

-- Every note goes when the person is erased, and so does 00054's field, which
-- the erasure left on the tombstone row.
create or replace function public.person_notes_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.erased_at is not null and OLD.erased_at is null then
    delete from person_notes where contact_id = NEW.id;
    update contacts set notes = null where id = NEW.id and notes is not null;
  end if;
  return null;
end $$;
revoke execute on function public.person_notes_erase_on_contact() from public, anon, authenticated;
drop trigger if exists contacts_erase_takes_notes on public.contacts;
create trigger contacts_erase_takes_notes
  after update of erased_at on public.contacts
  for each row execute function public.person_notes_erase_on_contact();
comment on function public.person_notes_erase_on_contact() is
  'When a person is erased, every note on them goes, and the superseded contacts.notes field is cleared (0007).';

-- The erased already: no notes survive them (the field is the only place a note was before this).
update public.contacts set notes = null where erased_at is not null and notes is not null;
