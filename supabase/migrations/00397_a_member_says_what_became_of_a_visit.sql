-- 00397 · A member says what became of a visit (decision 0002, step 8, and its answers of 10 October 2026).
--
-- A visit's status was a source's word alone: a booking tool's notice says booked or cancelled, and the calendar's feed
-- only booked. Whether the client came is a person's word, and the database cannot support it otherwise: the sweep that
-- would have inferred `kept` from time is not built, and a visit past its end is read, and worded, as past.
--
--   1. mark_visit(p_appointment_id, p_status): an owner or an operator (or a partner on a session that showed its second
--      factor: is_acting_member) says kept, missed or cancelled, and the decision is written as theirs in the same
--      transaction (team_decision, as record_deal's is). Kept or missed only once the visit has begun; cancelled only
--      until it has ended, and never for a visit already kept or missed. Saying what it already says changes nothing.
--   2. The guard keeps every end final but one: a kept visit may be corrected to missed, and a missed one to kept, through
--      this door alone (a transaction-local setting only it raises, as 00344's link_lead is). It now also refuses a
--      booked visit moved back to proposed, which nothing writes.
--   3. appointment.changed says kept and missed as well, and a person's word on a feed's row too: the feed's door writes
--      its own events (00348) and never moves a status, so a status moved on a feed row is a person's.
--   4. The ledger takes the subject and the verb: 'appointment', 'mark_visit'.
--   5. The feed's door keeps a person's word with its time: an event moved after its visit was marked kept, missed or
--      cancelled is a new visit, booked afresh under its key, the marked row set aside with the start it was said of.
--
-- Deploy order: this migration first. A dashboard that calls a function the database does not hold answers the write
-- with an error and changes nothing. Re-runnable.

-- 4. The ledger's words -------------------------------------------------------------------------------------------------
alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check check (subject_type = any (array[
  'conversation', 'escalation', 'draft', 'lead', 'message', 'agent', 'membership', 'invitation', 'contact', 'call',
  'channel', 'broadcast', 'playbook', 'review', 'workspace', 'deal', 'list', 'appointment'
]));
alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list',
  'change_list_rule', 'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import',
  'open_recording', 'merge', 'change_playbook', 'mark_visit'
]));

-- 2. The guard -----------------------------------------------------------------------------------------------------------
create or replace function public.appointments_guard() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status then
    -- A person's correction of their own word, through mark_visit alone: kept and missed may trade places.
    if OLD.status in ('kept', 'missed') and NEW.status in ('kept', 'missed')
       and current_setting('chanlytics.visit_correction', true) = 'on' then
      return NEW;
    end if;
    if OLD.status in ('kept', 'missed', 'cancelled') then
      raise exception 'appointments.status is terminal (% -> % refused)', OLD.status, NEW.status
        using errcode = 'check_violation';
    end if;
    if OLD.status = 'proposed' and NEW.status not in ('booked', 'cancelled') then
      raise exception 'a proposed appointment may only be booked or cancelled (% refused)', NEW.status
        using errcode = 'check_violation';
    end if;
    if OLD.status = 'booked' and NEW.status = 'proposed' then
      raise exception 'a booked appointment is not proposed again (booked -> proposed refused)'
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end $$;

-- 3. What changed, said ----------------------------------------------------------------------------------------------------
create or replace function public.appointments_note_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change text;
begin
  if tg_op = 'INSERT' then
    v_change := case when new.status = 'cancelled' then 'cancelled' else 'added' end;
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_change := 'cancelled';
  elsif old.status = 'proposed' and new.status = 'booked' then
    v_change := 'confirmed';
  elsif new.status in ('kept', 'missed') and old.status is distinct from new.status then
    v_change := new.status;
  elsif new.starts_at is distinct from old.starts_at then
    v_change := 'moved';
  else
    return null;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (new.tenant_id, 'appointment.changed', 'appointment', 'appointment', new.id,
          jsonb_build_object('change', v_change, 'source', new.source, 'starts_at', new.starts_at));
  return null;
end $$;

comment on function public.appointments_note_change() is
  'appointment.changed {change, source, starts_at} in the same transaction as the write (00389, 00397): added, confirmed, cancelled, kept, missed or moved, and nothing for a write that changes none of those. On a feed''s row only a moved status is said (appointments_note_status): the feed''s door writes its own events (00348) and never moves a status, so that is a person''s word.';

drop trigger if exists appointments_note_status on public.appointments;
create trigger appointments_note_status
  after update of status on public.appointments
  for each row
  when (new.source = 'calendar_feed' and old.status is distinct from new.status)
  execute function public.appointments_note_change();

-- 5. A word keeps its time ---------------------------------------------------------------------------------------------
-- The feed's door (00348) moved a row by its key whatever it said, so a no-show marked missed and then rebooked by
-- dragging the same event to next week stood missed next week: its reminder held, the board saying Missed. An event
-- moved after a person's word on its visit is a new visit: the marked row keeps the word with the time it was said of,
-- set aside under its key and that start, and the key is booked afresh. Its event says moved.
create or replace function public.appointments_feed_sync(p_tenant_id uuid, p_timezone text, p_rows jsonb, p_from timestamp with time zone, p_to timestamp with time zone, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone) returns jsonb
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

  for v_in in
    select distinct on (r.external_id) r.*
      from jsonb_to_recordset(p_rows) as r(
             external_id text, starts_at timestamptz, ends_at timestamptz, all_day boolean, service text,
             consultation boolean, contact_id uuid)
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

  return jsonb_build_object('added', v_added, 'moved', v_moved, 'back', v_back, 'vanished', v_vanished,
                            'seen', cardinality(v_seen), 'stale', false);
end $$;

-- 1. The door ------------------------------------------------------------------------------------------------------------
create or replace function public.mark_visit(
  p_appointment_id uuid,
  p_status text,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.appointments%rowtype;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the word is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_status is null or p_status not in ('kept', 'missed', 'cancelled') then
    raise exception 'mark_visit: kept, missed or cancelled (% refused)', p_status using errcode = '22023';
  end if;
  select * into v_row from public.appointments where id = p_appointment_id for update;
  -- One the caller does not act in is one they cannot see: a stranger learns nothing.
  if not found or not public.is_acting_member(v_row.tenant_id) then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if v_row.status = p_status then
    return jsonb_build_object('appointment', jsonb_build_object('id', v_row.id, 'status', v_row.status),
                              'from', v_row.status, 'unchanged', true);
  end if;
  if p_status in ('kept', 'missed') then
    if v_row.status = 'proposed' then
      return jsonb_build_object('error', 'never_booked');
    end if;
    if v_row.status = 'cancelled' then
      return jsonb_build_object('error', 'cancelled');
    end if;
    if v_row.starts_at > now() then
      return jsonb_build_object('error', 'not_begun');
    end if;
  else
    if v_row.status = 'cancelled' then
      return jsonb_build_object('error', 'cancelled');
    end if;
    if v_row.status in ('kept', 'missed') then
      return jsonb_build_object('error', 'already_said');
    end if;
    if v_row.ends_at <= now() then
      return jsonb_build_object('error', 'over');
    end if;
  end if;
  -- Kept and missed trade places only here: the guard reads this for the transaction, and nothing else raises it.
  if v_row.status in ('kept', 'missed') then
    perform set_config('chanlytics.visit_correction', 'on', true);
  end if;
  update public.appointments set status = p_status where id = v_row.id;
  perform set_config('chanlytics.visit_correction', 'off', true);
  return jsonb_build_object('appointment', jsonb_build_object('id', v_row.id, 'status', p_status),
                            'from', v_row.status)
      || public.team_decision(v_row.tenant_id, v_actor, 'appointment', v_row.id, 'mark_visit',
                              jsonb_build_object('from', v_row.status, 'to', p_status, 'source', v_row.source,
                                                 'starts_at', v_row.starts_at, 'contact_id', v_row.contact_id),
                              p_via, p_undo_of);
end $$;

revoke execute on function public.mark_visit(uuid, text, text, uuid) from public, anon;
grant execute on function public.mark_visit(uuid, text, text, uuid) to authenticated, service_role;
comment on function public.mark_visit(uuid, text, text, uuid) is
  'A member says what became of a visit (00397, decision 0002 step 8): kept or missed once it has begun, cancelled until it has ended, kept and missed correctable one into the other, every other end final; the mark_visit decision as theirs in the same transaction, and appointment.changed by the triggers. A refusal is answered as {error}: never_booked, cancelled, not_begun, already_said or over. Returns the appointment''s id and status, from, and the decision''s id.';
