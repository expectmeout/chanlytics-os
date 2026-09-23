-- 00158 · A note can reach its reader.
--
-- docs/decisions/0007-person-notes.md, phase 3. A note may be for one member
-- of the team (00157's for_user_id), and until now that member learned of it
-- only by opening the person's page. A notification may now be addressed to
-- one member: recipient_user_id, null for the whole workspace as every row
-- before this was. Only its recipient reads an addressed row -- the policy,
-- the realtime feed (which the policy governs) and the mark door all say so.
--
-- The first addressed kind is note_for_you, written by the note doors when a
-- note is for someone other than its writer: on a new note, and on a change
-- that addresses it to someone new, never again for the same reader. It names
-- who wrote it and whom it is about, never the note's words. An erasure takes
-- these rows with the notes they pointed at.

/* ------------------------------------------------ 1. a row may have a reader -- */

alter table public.notifications
  add column if not exists recipient_user_id uuid references auth.users (id) on delete cascade;
comment on column public.notifications.recipient_user_id is
  'The one member this is for (0007); null for everyone in the workspace. Only the recipient reads an addressed row.';
create index if not exists notifications_recipient
  on public.notifications (tenant_id, recipient_user_id, created_at desc)
  where recipient_user_id is not null;

drop policy if exists notifications_member_select on public.notifications;
create policy notifications_member_select on public.notifications
  for select to authenticated
  using (
    tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))
    and (recipient_user_id is null or recipient_user_id = (select auth.uid()))
  );

-- The bell's list as it stands after 00142, plus note_for_you. Every widening
-- of this CHECK is drop-and-add with its own full list (00141, 00142).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you'));

-- A mark is its reader's: a row addressed to someone else is not found.
create or replace function public.notification_mark(p_id uuid, p_read boolean default null, p_dismissed boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_for    uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select n.tenant_id, n.recipient_user_id into v_tenant, v_for from notifications n where n.id = p_id;
  if v_tenant is null
     or not exists (select 1 from memberships m where m.user_id = v_user and m.tenant_id = v_tenant)
     or (v_for is not null and v_for <> v_user) then
    raise exception 'Notification not found.' using errcode = 'P0002';
  end if;
  insert into notification_marks (notification_id, user_id, read_at, dismissed_at)
  values (p_id, v_user, case when p_read then now() end, case when p_dismissed then now() end)
  on conflict (notification_id, user_id) do update set
    read_at      = case when p_read is null then notification_marks.read_at      when p_read then coalesce(notification_marks.read_at, now()) else null end,
    dismissed_at = case when p_dismissed is null then notification_marks.dismissed_at when p_dismissed then coalesce(notification_marks.dismissed_at, now()) else null end;
  return jsonb_build_object('notification_id', p_id);
end $$;
revoke execute on function public.notification_mark(uuid, boolean, boolean) from public, anon;
grant execute on function public.notification_mark(uuid, boolean, boolean) to authenticated;

/* -------------------------------------------- 2. the note doors tell its reader -- */

-- The one writer of note_for_you, called by the two note doors. The title
-- names the writer (their profile name, else the name of their address) and
-- the person (their name, else their number); the words stay on the page.
create or replace function public.note_for_you_notify(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_note_id    uuid,
  p_by         uuid,
  p_for        uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by     text;
  v_person text;
begin
  if p_for is null or p_for = p_by then
    return;
  end if;
  select coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1), 'A teammate')
    into v_by
    from auth.users u left join profiles p on p.user_id = u.id
   where u.id = p_by;
  select coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(c.wa_profile_name), ''), c.phone_e164, 'someone')
    into v_person
    from contacts c where c.id = p_contact_id;
  insert into notifications (tenant_id, kind, title, body, route, subject_type, subject_id, recipient_user_id)
  values (
    p_tenant_id, 'note_for_you',
    left(format('%s left you a note on %s', coalesce(v_by, 'A teammate'), coalesce(v_person, 'someone')), 200),
    'It is on their page.',
    'clients/' || p_contact_id::text,
    'contact', p_contact_id::text, p_for
  );
end $$;
revoke execute on function public.note_for_you_notify(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
comment on function public.note_for_you_notify(uuid, uuid, uuid, uuid, uuid) is
  'Tell the member a note is for that it is there (0007): a note_for_you notification addressed to them, naming the writer and the person, never the words. Nothing when the note is for its own writer. Called only by the note doors.';

-- 00157's doors, restated whole: the same checks and events, and the reader told.
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
  perform public.note_for_you_notify(v_tenant, p_contact_id, v_row.id, v_user, p_for_user_id);
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_add(uuid, text, uuid, boolean, text) from public, anon;
grant execute on function public.person_note_add(uuid, text, uuid, boolean, text) to authenticated;

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
  v_was  uuid;
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
  v_was := v_row.for_user_id;
  update person_notes n
     set body = v_body, for_user_id = p_for_user_id, team_only = coalesce(p_team_only, false),
         version = n.version + 1
   where n.id = v_row.id
  returning * into v_row;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_row.tenant_id, 'contact.note_changed', 'contact', 'contact', v_row.contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'by', v_user,
                             'for', p_for_user_id, 'team_only', v_row.team_only));
  -- Only a note addressed to someone new tells them; a change of words is not news to its reader.
  if p_for_user_id is distinct from v_was then
    perform public.note_for_you_notify(v_row.tenant_id, v_row.contact_id, v_row.id, v_user, p_for_user_id);
  end if;
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;

revoke execute on function public.person_note_edit(uuid, text, uuid, boolean, integer) from public, anon;
grant execute on function public.person_note_edit(uuid, text, uuid, boolean, integer) to authenticated;

/* ------------------------------------------- 3. an erasure takes the pointers -- */

-- 00157's trigger, restated: every note goes, the old field is cleared, and
-- the note_for_you rows about the person go with them, since their titles
-- name the person.
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
    delete from notifications
     where tenant_id = NEW.tenant_id and kind = 'note_for_you'
       and subject_type = 'contact' and subject_id = NEW.id::text;
  end if;
  return null;
end $$;
revoke execute on function public.person_notes_erase_on_contact() from public, anon, authenticated;
