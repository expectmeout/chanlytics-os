-- 00419 · The bell tells the truth (the wiring's second audit, lane R1: S11-1, S11-2, S6-1, S6-4).
--
-- The hourly sweep keeps everything the owner's calendar names in its window (00348), and every visit it adds wrote an
-- appointment.changed 'added' event that the bell told as "Someone booked with you": the owner's weekly staff meeting as
-- each occurrence came into range, a lunch block they typed themselves, the copy of a booking its tool's email had already
-- told, and every entry of a calendar the moment it was connected. The event said only the change, the source and the
-- start, so nothing downstream could tell a booking from the owner's own entry.
--
--   tenant_config.calendar_feed_kept_at   new, service role only: when the door first kept a read of the workspace's
--                            calendar, an empty read included. The door answers `first` for that read and the hourly
--                            sweep stamps it through the repository that already writes the row (packages/db
--                            control-plane.ts markCalendarFeedKept), once per workspace. A workspace whose reads were kept
--                            before 00419 has feed rows and no stamp: it is never first either.
--   appointments_feed_sync   an addition's event also carries what the bell asks of it, stamped where the row is written:
--                            `named` (the visit is linked to a living person of the workspace), `series` (one occurrence
--                            of a repeating event, as the sweep read it), `twin` (the calendar's copy of a booking the
--                            record holds from its tool, by contracts' same-visit rule, decided by the sweep), and
--                            `first` (no read of the workspace's calendar was kept before this one: no stamp and no feed
--                            row, so a workspace that kept rows before 00419 is never first, and a calendar empty when it
--                            was connected has had its first read once that read is kept). The sweep sends series and
--                            twin on each row; one from before this sends neither, and they are kept as null.
--   notifications.source_event   its comment says what else it may hold: a sweep's once-only notice keyed by the name of
--                            what it answers (the edge's notify.ts onceKey: the deadman's warning of one hold, the
--                            warning before a number is given back), so a mail that failed is retried alone.
--
-- A read that swaps the calendar for another, or rebuilds it, is not `first`: the bell's CATCH_UP_VISITS guard keeps it
-- quiet when it adds more than a customer could book in an hour.
--
-- The function is replaced whole, its body copied from 00397 (its latest definition) with the facts added; its grants
-- stand, and its comment is said again. Deploy order: either. An edge from before this sends rows without the two facts,
-- which the function keeps as null (the old subscriber never reads them, the new one reads null as no booking); a function
-- from before this ignores the two keys the new sweep sends, and its events carry none of the facts, which the new
-- subscriber reads as no booking. Re-runnable.

alter table public.tenant_config add column if not exists calendar_feed_kept_at timestamptz;
comment on column public.tenant_config.calendar_feed_kept_at is
  'When the hourly sweep first kept a read of this workspace''s calendar, an empty read included (00419): appointments_feed_sync answers first for it, and the sweep stamps it. Null with no calendar_feed row: no read kept yet, so the additions of the read that follows connecting a calendar are its first read, which the bell tells none of. Null with calendar_feed rows: reads were kept before 00419. The service role''s, like calendar_checked_at (00089: no member''s UPDATE grant names it).';

create or replace function public.appointments_feed_sync(p_tenant_id uuid, p_timezone text, p_rows jsonb, p_from timestamp with time zone, p_to timestamp with time zone, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    language plpgsql security definer
    set search_path to 'public'
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
  -- No read of this workspace's calendar kept before this one (calendar_feed_kept_at, and no feed row from before
  -- 00419): the read that follows connecting a calendar, every entry of it added at once, which is a calendar read and
  -- no customer booking.
  v_first    boolean;
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
  -- One read of a workspace's feed at a time, and never one older than the read the workspace last had: the sweep
  -- stamps the workspace with its tick's time once the read is kept, so a tick that overlapped a later one finds the
  -- later stamp and leaves the newer rows as they are.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|appointments|calendar_feed', 42));
  if exists (select 1 from tenant_config tc where tc.tenant_id = p_tenant_id and tc.calendar_checked_at > v_now) then
    return jsonb_build_object('added', 0, 'moved', 0, 'back', 0, 'vanished', 0, 'seen', 0, 'stale', true);
  end if;
  v_first := not exists (select 1 from tenant_config tc where tc.tenant_id = p_tenant_id and tc.calendar_feed_kept_at is not null)
             and not exists (select 1 from appointments a where a.tenant_id = p_tenant_id and a.source = 'calendar_feed');

  for v_in in
    select distinct on (r.external_id) r.*
      from jsonb_to_recordset(p_rows) as r(
             external_id text, starts_at timestamptz, ends_at timestamptz, all_day boolean, service text,
             consultation boolean, contact_id uuid, series boolean, twin boolean)
     where nullif(btrim(r.external_id), '') is not null and char_length(r.external_id) <= 512
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
      insert into appointments (tenant_id, contact_id, source, external_id, status, starts_at, ends_at, all_day,
                                service, consultation, timezone)
      values (p_tenant_id, v_contact, 'calendar_feed', v_in.external_id, 'booked', v_in.starts_at, v_in.ends_at,
              coalesce(v_in.all_day, false), left(nullif(btrim(v_in.service), ''), 200),
              coalesce(v_in.consultation, false), v_tz)
      returning id into v_id;
      v_change := 'added';
      v_added := v_added + 1;
    elsif v_row.status in ('kept', 'missed', 'cancelled') and v_row.starts_at is distinct from v_in.starts_at then
      -- A person's word was about the visit at its old time (00397): the event moved since is a new visit. The marked
      -- row is set aside under the key and its old start, gone from the feed as it stood, and a fresh one is booked.
      update appointments
         set external_id = left(v_row.external_id, 512) || '@' || extract(epoch from v_row.starts_at)::bigint::text,
             vanished_at = coalesce(vanished_at, v_now)
       where id = v_row.id;
      insert into appointments (tenant_id, contact_id, source, external_id, status, starts_at, ends_at, all_day,
                                service, consultation, timezone)
      values (p_tenant_id, v_contact, 'calendar_feed', v_in.external_id, 'booked', v_in.starts_at, v_in.ends_at,
              coalesce(v_in.all_day, false), left(nullif(btrim(v_in.service), ''), 200),
              coalesce(v_in.consultation, false), v_tz)
      returning id into v_id;
      v_change := 'moved';
      v_moved := v_moved + 1;
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
             all_day = coalesce(v_in.all_day, false), service = left(nullif(btrim(v_in.service), ''), 200),
             consultation = coalesce(v_in.consultation, false), timezone = v_tz, vanished_at = null
       where id = v_id
         and (contact_id is distinct from v_contact or starts_at is distinct from v_in.starts_at
              or ends_at is distinct from v_in.ends_at or all_day is distinct from coalesce(v_in.all_day, false)
              or service is distinct from left(nullif(btrim(v_in.service), ''), 200)
              or consultation is distinct from coalesce(v_in.consultation, false)
              or timezone is distinct from v_tz or vanished_at is not null);
    end if;
    if v_change is not null then
      -- An addition carries what the bell asks of it (contracts visit-news.ts bookingArriving): whether the visit is a
      -- person's of the workspace, one occurrence of a repeating event, the copy of a booking the record holds, and part of
      -- a calendar's first read. A sweep from before 00419 sends no series or twin, and they are kept as null: unknown,
      -- which the bell reads as no booking.
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'appointment.changed', 'appointment', 'appointment', v_id,
              jsonb_build_object('change', v_change, 'source', 'calendar_feed', 'starts_at', v_in.starts_at)
              || case when v_change = 'added'
                      then jsonb_build_object('named', v_contact is not null, 'series', v_in.series, 'twin', v_in.twin,
                                              'first', v_first)
                      else '{}'::jsonb end);
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

  -- The answer says when this was the first read kept, so the sweep stamps it (calendar_feed_kept_at) and the next read
  -- is no first read, even when this one named nothing.
  return jsonb_build_object('added', v_added, 'moved', v_moved, 'back', v_back, 'vanished', v_vanished,
                            'seen', cardinality(v_seen), 'stale', false, 'first', v_first);
end $$;

comment on function public.appointments_feed_sync(uuid, text, jsonb, timestamptz, timestamptz, timestamptz) is
  'The hourly sweep''s door (decision 0002, 00348): one read of a workspace''s feed kept on the appointments record (00345) as calendar_feed rows, in one transaction, never its titles. Each row inserted or updated by its key; a row the read no longer names, starting inside the window it covered, vanished (never cancelled). A read older than the workspace''s last (tenant_config.calendar_checked_at) is refused as stale. appointment.changed for each added, moved, vanished or back; an addition''s also carries named (linked to a living person of the workspace), series and twin (as the sweep sent them: one occurrence of a repeating event, the copy of a booking the record holds; null from a sweep that did not say) and first (no read of the workspace''s calendar kept before this one: tenant_config.calendar_feed_kept_at, which the sweep stamps after the door answers first for a kept read, empty or not, and no feed row from before 00419), which the bell reads to tell a customer''s booking from the owner''s own entry (00419). Answers the counts, and whether the read was the first kept (first). Service role only.';

comment on column public.notifications.source_event is
  'The event this notice answers (decision 0043, 00396): a hold''s notice keeps its escalation event, so a second delivery of it tells nobody. A sweep''s once-only notice keeps, in its place, a uuid made from the name of what it answers (the edge''s notify.ts onceKey: the deadman''s warning of one hold, the warning before a number is given back, a booking email held for a look), so a retry finds it and sends only the mail it still owes (00419). Null for a notice nothing keys.';
