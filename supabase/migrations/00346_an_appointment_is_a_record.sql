-- 00346 · An appointment is a record.
--
-- Decision 0002, steps 1 and 2. The owner's calendar was read at read time and nothing of it was kept: every page, run
-- and message re-derived the appointments from the feed, a reminder's words were frozen when its run was made, and a
-- send never asked whether the appointment still stood. Now the hourly sweep keeps each event of the feed as a row,
-- and a send asks the row again (contracts calendar/appointments.ts appointmentHolds).
--
--   appointments
--       One row per appointment per source: the hourly read of the feed (calendar_feed), and later a booking tool's
--       webhook (booking_tool) and a person (person). The product never writes one on its own initiative, and the
--       receptionist is no source. Keyed by the source's own id (an event's UID, with the occurrence's original start
--       for one instance of a repeating event: contracts appointmentKeyOf), so a re-read updates and never duplicates,
--       and a moved appointment is its own row moved. The person it is for, by the board's match (a number in the
--       event, then an address, then a whole name), named with the workspace (the fence every child keeps). Its status:
--       proposed, booked, kept, missed, cancelled, held by appointments_guard in 00106's shape (proposed to booked or
--       cancelled; booked to kept, missed or cancelled; those three final; a same-status update is no move). The
--       workspace's zone it was read in, since a playbook's day is the business's. vanished_at: the feed stopped naming
--       it, which is NOT a cancellation (a feed drops a cancelled event, and a feed that could not be read says nothing),
--       cleared if the feed names it again. A member reads their workspace's; only the definer doors write.
--
--   appointments_feed_sync(p_tenant_id, p_timezone, p_rows, p_from, p_to, p_now)
--       The service role's door for the sweep, one transaction per workspace: each row of the read (contracts
--       feedAppointmentRows) inserted, or its row updated where it moved or changed; a row the read no longer names,
--       whose start falls in the window the read covered, stamped vanished; and a booked appointment whose end passed a
--       day ago with nobody saying otherwise, kept (the one status a sweep may infer, and only from time; the day is the
--       owner's to say missed first, once a person may). appointment.changed for each that was added, moved, vanished,
--       came back or was kept, on the appointment, with the change and its start; never its title. Answers the counts.
--
--   appointments_erase_on_contact
--       An erasure takes the person's appointments, the leg of their record's own triggers. The calendar is the owner's:
--       its next read writes what it still names, linked to nobody.
--
-- Either deploy order: a table neither app reads until the edge that syncs it deploys, and a send that cannot read it
-- goes as before. Re-runnable: the table, its indexes and its policy if not exists, the functions replaced, the table's
-- own triggers dropped if they exist and made again, and the one on contacts made with `create or replace`.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- the record */

create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  contact_id    uuid,
  source        text not null,
  external_id   text,
  status        text not null default 'booked',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  all_day       boolean not null default false,
  title         text,
  service       text,
  consultation  boolean not null default false,
  timezone      text not null,
  vanished_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The person named with the workspace (database/fences): an appointment cannot be another workspace's person's.
  constraint appointments_contact_id_same_workspace
    foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete set null (contact_id),
  constraint appointments_source_check check (source in ('calendar_feed', 'booking_tool', 'person')),
  constraint appointments_status_check check (status in ('proposed', 'booked', 'kept', 'missed', 'cancelled')),
  constraint appointments_ends_after_start check (ends_at > starts_at),
  constraint appointments_external_id_length check (external_id is null or char_length(external_id) between 1 and 1024),
  constraint appointments_title_length check (title is null or char_length(title) <= 500),
  constraint appointments_service_length check (service is null or char_length(service) <= 200)
);

-- One row per event per source: a re-read updates, never duplicates.
create unique index if not exists appointments_source_key
  on public.appointments (tenant_id, source, external_id) where external_id is not null;
create index if not exists appointments_tenant_start on public.appointments (tenant_id, starts_at);
create index if not exists appointments_contact_start
  on public.appointments (tenant_id, contact_id, starts_at) where contact_id is not null;

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function extensions.moddatetime('updated_at');

alter table public.appointments enable row level security;
drop policy if exists appointments_member_select on public.appointments;
create policy appointments_member_select on public.appointments
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;
grant all on public.appointments to service_role;

comment on table public.appointments is
  'An appointment, as its source keeps it (decision 0002): the owner''s calendar feed read hourly (calendar_feed), later a booking tool (booking_tool) or a person (person); never the receptionist, which does not book. One row per source''s own id; status held by appointments_guard; vanished_at when the feed stopped naming it, which is not a cancellation. A member reads their workspace''s; the definer doors write.';
comment on column public.appointments.external_id is
  'The source''s own id: an event''s UID, with the occurrence''s original start for one instance of a repeating event (contracts appointmentKeyOf). The replay gate.';
comment on column public.appointments.vanished_at is
  'When the feed stopped naming it: not a cancellation (a feed drops a cancelled event, and a feed that could not be read says nothing). Cleared when the feed names it again.';
comment on column public.appointments.consultation is
  'Whether its title says consultation or names a consult-first service (contracts isConsultationTitle), decided when the row was written.';

/* ----------------------------------------------------------------------------------------------- the guard */

create or replace function public.appointments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if old.status in ('kept', 'missed', 'cancelled') then
      raise exception 'An appointment that was kept, missed or cancelled stays so (% to % refused).', old.status, new.status
        using errcode = '23514';
    end if;
    if old.status = 'proposed' and new.status not in ('booked', 'cancelled') then
      raise exception 'A proposed appointment is booked or cancelled (% refused).', new.status using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard before update of status on public.appointments
  for each row execute function public.appointments_guard();

/* ------------------------------------------------------------------------------------------------ the sync */

create or replace function public.appointments_feed_sync(
  p_tenant_id uuid,
  p_timezone  text,
  p_rows      jsonb,
  p_from      timestamptz,
  p_to        timestamptz,
  p_now       timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := coalesce(p_now, now());
  v_tz       text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  v_in       record;
  v_row      public.appointments%rowtype;
  v_contact  uuid;
  v_id       uuid;
  v_change   text;
  v_seen     text[] := '{}';
  v_added    integer := 0;
  v_moved    integer := 0;
  v_back     integer := 0;
  v_vanished integer := 0;
  v_kept     integer := 0;
begin
  if p_tenant_id is null or not exists (select 1 from tenants t where t.id = p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array' then
    raise exception 'The rows are a list.' using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The window runs forward.' using errcode = '22023';
  end if;
  -- One read of a workspace's feed at a time: two sweeps that overlap never vanish each other's rows.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|appointments|calendar_feed', 42));

  for v_in in
    select distinct on (r.external_id) r.*
      from jsonb_to_recordset(p_rows) as r(
             external_id text, starts_at timestamptz, ends_at timestamptz, all_day boolean, title text,
             service text, consultation boolean, contact_id uuid)
     where nullif(btrim(r.external_id), '') is not null
       and r.starts_at is not null and r.ends_at is not null and r.ends_at > r.starts_at
       and r.starts_at between p_from and p_to
     order by r.external_id
  loop
    v_seen := array_append(v_seen, v_in.external_id);
    -- Only a living person of this workspace: a match the sweep made against a list read a moment ago may have been
    -- erased or merged since.
    select c.id into v_contact from contacts c
     where c.id = v_in.contact_id and c.tenant_id = p_tenant_id
       and c.erased_at is null and c.merged_into_contact_id is null;
    v_change := null;
    select * into v_row from appointments a
     where a.tenant_id = p_tenant_id and a.source = 'calendar_feed' and a.external_id = v_in.external_id
     for update;
    if v_row.id is null then
      insert into appointments (tenant_id, contact_id, source, external_id, status, starts_at, ends_at, all_day, title,
                                service, consultation, timezone)
      values (p_tenant_id, v_contact, 'calendar_feed', left(v_in.external_id, 1024), 'booked', v_in.starts_at,
              v_in.ends_at, coalesce(v_in.all_day, false), left(nullif(btrim(v_in.title), ''), 500),
              left(nullif(btrim(v_in.service), ''), 200), coalesce(v_in.consultation, false), v_tz)
      returning id into v_id;
      v_change := 'added';
      v_added := v_added + 1;
    else
      v_id := v_row.id;
      if v_row.vanished_at is not null then
        v_change := 'back';
        v_back := v_back + 1;
      elsif v_row.starts_at is distinct from v_in.starts_at then
        v_change := 'moved';
        v_moved := v_moved + 1;
      end if;
      update appointments
         set contact_id = v_contact, starts_at = v_in.starts_at, ends_at = v_in.ends_at,
             all_day = coalesce(v_in.all_day, false), title = left(nullif(btrim(v_in.title), ''), 500),
             service = left(nullif(btrim(v_in.service), ''), 200), consultation = coalesce(v_in.consultation, false),
             timezone = v_tz, vanished_at = null
       where id = v_id
         and (contact_id is distinct from v_contact or starts_at is distinct from v_in.starts_at
              or ends_at is distinct from v_in.ends_at or all_day is distinct from coalesce(v_in.all_day, false)
              or title is distinct from left(nullif(btrim(v_in.title), ''), 500)
              or service is distinct from left(nullif(btrim(v_in.service), ''), 200)
              or consultation is distinct from coalesce(v_in.consultation, false)
              or timezone is distinct from v_tz or vanished_at is not null);
    end if;
    if v_change is not null then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'appointment.changed', 'appointment', 'appointment', v_id,
              jsonb_build_object('change', v_change, 'source', 'calendar_feed', 'starts_at', v_in.starts_at));
    end if;
  end loop;

  -- Gone from the read, inside the window it covered: vanished, never cancelled.
  for v_row in
    update appointments a
       set vanished_at = v_now
     where a.tenant_id = p_tenant_id and a.source = 'calendar_feed' and a.vanished_at is null
       and a.starts_at between p_from and p_to
       and not (a.external_id = any (v_seen))
    returning a.*
  loop
    v_vanished := v_vanished + 1;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'appointment.changed', 'appointment', 'appointment', v_row.id,
            jsonb_build_object('change', 'vanished', 'source', 'calendar_feed', 'starts_at', v_row.starts_at));
  end loop;

  -- Kept, from time alone: booked, still named, and over for a day with nobody saying otherwise.
  for v_row in
    update appointments a
       set status = 'kept'
     where a.tenant_id = p_tenant_id and a.status = 'booked' and a.vanished_at is null
       and a.ends_at <= v_now - interval '1 day'
    returning a.*
  loop
    v_kept := v_kept + 1;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'appointment.changed', 'appointment', 'appointment', v_row.id,
            jsonb_build_object('change', 'kept', 'source', v_row.source, 'starts_at', v_row.starts_at));
  end loop;

  return jsonb_build_object('added', v_added, 'moved', v_moved, 'back', v_back, 'vanished', v_vanished, 'kept', v_kept,
                            'seen', cardinality(v_seen));
end $$;

revoke all on function public.appointments_feed_sync(uuid, text, jsonb, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.appointments_feed_sync(uuid, text, jsonb, timestamptz, timestamptz, timestamptz)
  to service_role;
comment on function public.appointments_feed_sync(uuid, text, jsonb, timestamptz, timestamptz, timestamptz) is
  'The hourly sweep''s door (decision 0002): one read of a workspace''s feed kept as appointments, in one transaction. Each row inserted or updated by its key; a row the read no longer names, starting inside the window it covered, vanished (never cancelled); a booked appointment over for a day, kept. appointment.changed for each added, moved, vanished, back or kept. Answers the counts. Service role only.';

/* --------------------------------------------------------------------------------------------- the erasure */

create or replace function public.appointments_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    delete from public.appointments a where a.tenant_id = new.tenant_id and a.contact_id = new.id;
  end if;
  return new;
end $$;

-- A definer trigger function fires for every writer and is callable by none of them (database/privileges.db.test.mjs).
revoke all on function public.appointments_erase_on_contact() from public, anon, authenticated;
-- `create or replace`, never a drop first: on contacts, which every arrival writes, a drop takes ACCESS EXCLUSIVE (00306).
create or replace trigger contacts_erase_takes_appointments
  after update of erased_at on public.contacts
  for each row execute function public.appointments_erase_on_contact();
