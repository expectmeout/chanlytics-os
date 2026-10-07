-- 00348 · The calendar feed is kept on the appointments record.
--
-- Decision 0002, step 2, on the record 00345 made for a booking tool's notice (#1469). The owner's calendar feed was
-- re-read live by every page and reply, and kept nowhere, so a reminder planned for a visit could not ask whether the
-- visit still stood when it went. Now the hourly calendar sweep keeps each read of the feed as calendar_feed rows of
-- the same record, and a reminder's send asks its row again (apps/edge/lib/calendar/calendar-appointments.ts,
-- packages/core messages/broadcast.ts).
--
--   appointments_feed_sync(p_tenant_id, p_timezone, p_rows, p_from, p_to, p_now)
--       The service role's door for the sweep, one transaction per workspace, one at a time per workspace (an advisory
--       lock): each row of the read (contracts feedAppointmentRows, keyed by the event's UID and, for one occurrence of
--       a repeating event, its original start) inserted, or its row updated where it moved or changed; a feed row the
--       read no longer names, starting inside the window the read covered, stamped vanished (never cancelled: a feed
--       drops a cancelled event, and a feed that could not be read says nothing); one named again, back. A booked feed
--       row whose end passed a day ago with nobody saying otherwise is kept, the one status inferred, and only from
--       time; a booking tool's rows are its notices' to move. The person is the one the sweep matched, while they are
--       this workspace's and living. appointment.changed for each that was added, moved, vanished, came back or was
--       kept, on the appointment, with the change and its start, never its title. Answers the counts.
--
-- The record's other rules are 00345's and hold the feed's rows as they hold a notice's: its guard on status, its
-- member-only read, and its erasure (appointments_scrub takes the title and the key of a person's rows; the owner's
-- calendar, read again, may name the visit again, linked to nobody). The board and the receptionist's openings read
-- the feed itself and leave the feed's rows out (packages/db appointmentsBetween), so a visit is never drawn twice.
--
-- Either deploy order: nothing calls the door until the edge that syncs deploys, and a send that cannot read the rows
-- goes as before. Re-runnable: the function replaced.

set local lock_timeout = '3s';

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

  -- Kept, from time alone: booked, still named, and over for a day with nobody saying otherwise. The feed's own rows: a
  -- booking tool's word on its visits is its notices', which may still say cancelled.
  for v_row in
    update appointments a
       set status = 'kept'
     where a.tenant_id = p_tenant_id and a.source = 'calendar_feed' and a.status = 'booked' and a.vanished_at is null
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
  'The hourly sweep''s door (decision 0002, 00348): one read of a workspace''s feed kept on the appointments record (00345) as calendar_feed rows, in one transaction. Each row inserted or updated by its key; a row the read no longer names, starting inside the window it covered, vanished (never cancelled); a booked feed row over for a day, kept. appointment.changed for each added, moved, vanished, back or kept. Answers the counts. Service role only.';
