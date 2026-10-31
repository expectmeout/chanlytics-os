-- 00498 · A time a cancellation frees is offered (decision 0082).
--
-- When a client's appointment is cancelled, moved or vanishes from the owner's calendar, the time it frees is offered
-- within the hour to the people who asked this month and never booked (People's "Asked, never booked"), by a sequence
-- on the moment slot_opened under the Follow-ups row: one batch per freed appointment, under 0064's modes, its reply
-- the receptionist's. The spec is docs/superpowers/specs/2026-10-30-the-receptionist-fills-the-book-design.md.
--
--   sequence_steps_trigger_check   takes slot_opened.
--   sequence_batches               offered_start, offered_end and offered_from: the time a batch offers and the
--                                  appointment that freed it; one batch per step and appointment
--                                  (sequence_batches_offered_once), so a second delivery of one event makes none.
--   appointments_note_change       a moved event also says was_at, the time the appointment left (00436's form otherwise).
--   appointments_feed_sync         the feed's moved events say was_at too (00419's form otherwise).
--   freed_time_taken                  how many people a batch sent to took its time: an appointment of theirs on the
--                                  record, standing, starting inside the offered span, written after the batch started.
--                                  Read as the caller, so a member counts their own workspace's and a stranger's is 0.
--   run_counts                     each run's counts also say took, for a run that offered a time (00374's form otherwise).
--   event_subscriptions            appointment.changed -> freed_time_offer, lane 2 (00334), the subscriber core/subscribers.ts runs.
--   assemble_broadcast             the batch's row also keeps offered_start, offered_end and offered_from where the run
--                                  names them (00282's form otherwise; the decision's overload calls this one).
--   sequence_steps_due             never hands the hourly sweep a step on slot_opened: it runs by its event (00462's form
--                                  otherwise).
--   sequence_history               each batch also says offered_start and took, as run_counts does (00442's form
--                                  otherwise), so a sequence's History and Reports say who took a freed time.
--
-- Either deploy order: an edge from before this keeps a delivery for a subscriber it does not know as an unknown kind
-- and settles it once it ships (jobs handlers.ts subscriberNamed); a dashboard from before reads no took and no offered
-- columns; an event from before says no was_at, and a move from it offers nothing. Re-runnable.

set local lock_timeout = '3s';

alter table public.sequence_steps drop constraint if exists playbooks_trigger_check;
alter table public.sequence_steps drop constraint if exists sequence_steps_trigger_check;
alter table public.sequence_steps add constraint sequence_steps_trigger_check check (trigger in (
  'quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed',
  'saved_list', 'proposal_waiting', 'lead_first', 'after_step', 'slot_opened'));

alter table public.sequence_batches add column if not exists offered_start timestamptz;
alter table public.sequence_batches add column if not exists offered_end timestamptz;
alter table public.sequence_batches add column if not exists offered_from uuid;
-- The appointment is the workspace's own, named with the workspace as every child key here names its parent; its row
-- gone leaves the batch and clears the one column.
alter table public.sequence_batches drop constraint if exists sequence_batches_offered_from_same_workspace;
alter table public.sequence_batches add constraint sequence_batches_offered_from_same_workspace
  foreign key (tenant_id, offered_from) references public.appointments(tenant_id, id) on delete set null (offered_from);
alter table public.sequence_batches drop constraint if exists sequence_batches_offered_check;
alter table public.sequence_batches add constraint sequence_batches_offered_check check (
  (offered_start is null and offered_end is null and offered_from is null)
  or (offered_start is not null and offered_end is not null and offered_start < offered_end));
create unique index if not exists sequence_batches_offered_once
  on public.sequence_batches (step_id, offered_from) where offered_from is not null;
comment on column public.sequence_batches.offered_start is
  'A freed time''s batch (decision 0082): the start of the time it offers, freed by the appointment offered_from names. Null for every other batch.';
comment on column public.sequence_batches.offered_end is
  'A freed time''s batch (decision 0082): the end of the time it offers.';
comment on column public.sequence_batches.offered_from is
  'A freed time''s batch (decision 0082): the appointment whose cancellation, move or vanishing freed the time; one batch per step and appointment (sequence_batches_offered_once). Set null when the appointment row goes.';

create or replace function public.appointments_note_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
          jsonb_build_object('change', v_change, 'source', new.source, 'starts_at', new.starts_at)
          -- Whose word it is, whatever source the visit came by: a signed-in member's, or the service's (00436).
          -- A move says the time it left (decision 0082, 00498): the freed time is that span.
          || case when v_change = 'moved' then jsonb_build_object('was_at', old.starts_at) else '{}'::jsonb end
          || jsonb_build_object('by', case when auth.uid() is not null then 'member' else 'service' end));
  return null;
end $$;

create or replace function public.appointments_feed_sync(p_tenant_id uuid, p_timezone text, p_rows jsonb, p_from timestamp with time zone, p_to timestamp with time zone, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
              -- A move says the time it left (decision 0082, 00498): v_row is the row as it stood before this read.
              || case when v_change = 'moved' then jsonb_build_object('was_at', v_row.starts_at) else '{}'::jsonb end
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

-- Who took the time a batch offered (decision 0082): the people it sent to with an appointment on the record that
-- stands (proposed, booked or kept, not vanished), starts inside the offered span and was written after the batch
-- started, from any source. Read, never stored. Runs as the caller: a member counts their own workspace's rows under
-- RLS, and a batch of another workspace counts 0.
create or replace function public.freed_time_taken(p_batch_id uuid) returns integer
language sql stable
set search_path to ''
as $$
  select count(distinct a.contact_id)::int
    from public.sequence_batches b
    join public.sequence_sends s on s.batch_id = b.id and s.state = 'sent' and s.contact_id is not null
    join public.appointments a on a.tenant_id = b.tenant_id and a.contact_id = s.contact_id
   where b.id = p_batch_id and b.offered_start is not null
     and a.status in ('proposed', 'booked', 'kept') and a.vanished_at is null
     and a.starts_at >= b.offered_start and a.starts_at < b.offered_end
     and a.created_at >= coalesce(b.started_at, b.created_at)
$$;
revoke execute on function public.freed_time_taken(uuid) from public, anon;
grant execute on function public.freed_time_taken(uuid) to authenticated, service_role;
comment on function public.freed_time_taken(uuid) is
  'How many people a batch sent to took the time it offered (decision 0082): an appointment of theirs on the record, standing, starting inside the offered span, written after the batch started. Read as the caller under RLS; never stored.';

create or replace function public.run_counts(p_tenant_id uuid, p_run_ids uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with people as (
    select r.batch_id as broadcast_id, r.state, r.sent_at,
           -- The channel it went by (00298); a row naming none went by WhatsApp, as every run before channels did.
           case when r.channel in ('sms', 'email') then r.channel else 'whatsapp' end as channel,
           m.status, m.conversation_id
      from public.sequence_sends r
      left join public.messages m on m.id = r.message_id
     where r.lead_id is null and ( r.tenant_id = p_tenant_id
       and r.batch_id = any (p_run_ids))
  ),
  counted as (
    select p.broadcast_id,
           count(*) filter (where p.state = 'queued')                           as queued,
           count(*) filter (where p.state = 'sent')                             as sent,
           count(*) filter (where p.state = 'skipped')                          as skipped,
           count(*) filter (where p.state = 'failed')                           as failed,
           count(*) filter (where p.status in ('delivered', 'read'))            as delivered,
           -- A read is WhatsApp's own receipt (0030): a text a carrier marked read is no read here.
           count(*) filter (where p.status = 'read' and p.channel = 'whatsapp') as was_read,
           count(*) filter (where p.state = 'sent' and p.channel = 'whatsapp')  as by_whatsapp,
           count(*) filter (where p.state = 'sent' and p.channel = 'sms')       as by_sms,
           count(*) filter (where p.state = 'sent' and p.channel = 'email')     as by_email
      from people p
     group by p.broadcast_id
  ),
  -- Each thread a run reached, once, from the first time it reached it there.
  threads as (
    select p.broadcast_id, p.conversation_id, min(p.sent_at) as sent_at
      from people p
     where p.conversation_id is not null and p.sent_at is not null
     group by p.broadcast_id, p.conversation_id
  ),
  replied as (
    -- One probe of messages_conversation_created (conversation_id, created_at) for each thread, whatever the planner
    -- guesses. This statement is planned with its arguments as placeholders, so any(p_run_ids) is guessed at about 250
    -- people where a busy workspace's history is 90,000, and the planner joined every thread to every inbound message of
    -- the workspace: 3,600 runs of 25 took 3 s at 720 inbound messages and 8 s, a member's limit, at 2,520. OFFSET 0
    -- keeps the EXISTS a probe of its own, and the probe names no workspace, since on tables not yet analyzed the planner
    -- probed the workspace's inbound index instead, every inbound message once per thread again (15 s at 720). The thread
    -- fixes the workspace: a run's person names a message of its own workspace, and a message a thread of its own
    -- (broadcast_recipients_message_id_same_workspace, messages_conversation_id_same_workspace). Now about 0.4 s from
    -- 720 to 30,720 inbound messages, analyzed or not, with the same answer
    -- (playbooks/totals/playbook-totals.db.test.mjs, "a workspace that talks").
    select t.broadcast_id, count(*) as replied
      from threads t
     where exists (
             select 1 from public.messages i
              where i.conversation_id = t.conversation_id
                and i.direction = 'inbound'
                and i.sender = 'customer'
                and public.message_is_a_persons_words(i.meta)
                and i.created_at > t.sent_at
                and i.created_at <= t.sent_at + public.campaign_reply_window()
             offset 0)
     group by t.broadcast_id
  )
  select coalesce(jsonb_object_agg(c.broadcast_id::text, jsonb_build_object(
           'queued', c.queued,
           'sent', c.sent,
           'skipped', c.skipped,
           'failed', c.failed,
           'delivered', c.delivered,
           'read', c.was_read,
           'replied', coalesce(y.replied, 0),
           'sent_by', jsonb_build_object('whatsapp', c.by_whatsapp, 'sms', c.by_sms, 'email', c.by_email))
           -- Who took the time a run offered (decision 0082, freed_time_taken): said only for a run that offered one.
           || case when b.offered_from is not null then jsonb_build_object('took', public.freed_time_taken(b.id))
              else '{}'::jsonb end), '{}'::jsonb)
    from counted c
    left join replied y on y.broadcast_id = c.broadcast_id
    left join public.sequence_batches b on b.id = c.broadcast_id
$$;

-- The reaction (0032): the subscriber in core/subscribers.ts, in the background lane with visit_notice and reach_out_booked.
insert into public.event_subscriptions (kind, subscriber, lane)
values ('appointment.changed', 'freed_time_offer', 2)
on conflict (kind, subscriber) do nothing;

create or replace function public.assemble_broadcast(p_tenant uuid, p_run jsonb, p_recipients jsonb, p_send_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
  v_asked int := jsonb_array_length(coalesce(p_recipients, '[]'::jsonb));
  v_enrolled int;
  v_off int;
  -- The channels the run ticks, as given; none given is WhatsApp alone, as every run was before. A list that is not the
  -- three channels, each once, is the column's CHECK to refuse, and a value that is no list raises here.
  v_channels text[] := case
    when coalesce(jsonb_typeof(p_run->'channels'), 'null') = 'null' then array['whatsapp']
    else array(select jsonb_array_elements_text(p_run->'channels'))
  end;
begin
  if (p_run->>'template_id') is not null and not exists (
       select 1 from public.templates t where t.id = (p_run->>'template_id')::uuid and t.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the template is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  if (p_run->>'playbook_id') is not null and not exists (
       select 1 from public.sequence_steps b where b.id = (p_run->>'playbook_id')::uuid and b.tenant_id = p_tenant) then
    raise exception 'assemble_broadcast: the playbook is not workspace %''s', p_tenant using errcode = '42501';
  end if;
  -- A freed time's batch (decision 0082, 00498) keeps the time it offers and the appointment that freed it.
  insert into public.sequence_batches (tenant_id, name, template_id, template_name, template_language, params, audience,
                                 state, scheduled_for, recipient_count, created_by, step_id, run_for, channels,
                                 offered_start, offered_end, offered_from)
  values (p_tenant, p_run->>'name', (p_run->>'template_id')::uuid, p_run->>'template_name',
          p_run->>'template_language', coalesce(p_run->'params', '[]'::jsonb), coalesce(p_run->'audience', '{}'::jsonb),
          p_run->>'state', (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int,
          (p_run->>'created_by')::uuid, (p_run->>'playbook_id')::uuid, (p_run->>'run_for')::date, v_channels,
          (p_run->>'offered_start')::timestamptz, (p_run->>'offered_end')::timestamptz, (p_run->>'offered_from')::uuid)
  returning id into v_id;

  -- Each person is on a channel the run ticks. None named is WhatsApp (a recipient written before the channels), so a run
  -- that does not tick WhatsApp refuses a person with none, as it refuses one on a channel it did not tick.
  select count(*)::int into v_off
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(contact_id uuid, facts jsonb, channel text)
   where coalesce(x.channel, 'whatsapp') <> all (v_channels);
  if v_off > 0 then
    raise exception 'assemble_broadcast: % of the % people are on a channel the run does not tick', v_off, v_asked
      using errcode = '22023';
  end if;

  insert into public.sequence_sends (batch_id, contact_id, tenant_id, facts, channel)
  select v_id, x.contact_id, p_tenant, x.facts, x.channel
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as x(contact_id uuid, facts jsonb, channel text)
   where exists (select 1 from public.contacts c
                  where c.id = x.contact_id and c.tenant_id = p_tenant and c.erased_at is null);
  get diagnostics v_enrolled = row_count;
  if v_enrolled <> v_asked then
    raise exception 'assemble_broadcast: % of the % people are not this workspace''s to send to', v_asked - v_enrolled,
      v_asked using errcode = '42501';
  end if;

  if p_send_at is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant, 'broadcast_send', p_send_at, jsonb_build_object('broadcast_id', v_id));
  end if;
  return v_id;
end $$;

create or replace function public.sequence_steps_due(p_kind text, p_at timestamp with time zone, p_last_hour integer, p_limit integer, p_tenant_id uuid DEFAULT NULL::uuid) RETURNS TABLE(step jsonb, timezone text, due_total bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select to_jsonb(s) || jsonb_build_object('mode', q.mode), z.tz, count(*) over ()
    from public.sequence_steps s
    join public.sequence_steps r on r.id = s.sequence_id
    join public.sequences q on q.id = s.sequence_id
    join public.tenants t on t.id = s.tenant_id
    cross join lateral (select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz) z
    cross join lateral (select p_at at time zone z.tz as clock) l
   where s.state = 'running' and s.kind = p_kind
     -- A freed time's step runs when an appointment frees a time (decision 0082, 00498), never by the hour.
     and s.trigger <> 'slot_opened'
     and (s.kind = 'reach_out' or (r.state = 'running' and q.state = 'on'))
     and t.status <> 'paused'
     and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     and extract(hour from l.clock) between s.run_hour and p_last_hour
     and s.last_run_for is distinct from l.clock::date
   order by s.last_run_at nulls first, s.created_at, s.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

create or replace function public.sequence_history(p_tenant_id uuid, p_sequence_id uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 30) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with lim as (select least(greatest(coalesce(p_limit, 30), 1), 100) as n),
  batches as (
    select b.id, b.step_id, b.state, b.run_for, b.scheduled_for, b.started_at, b.finished_at, b.recipient_count,
           b.failure, coalesce(b.started_at, b.scheduled_for) as at, b.offered_start, b.offered_from
      from public.sequence_batches b
     where b.tenant_id = p_tenant_id and b.sequence_id = p_sequence_id
       and (p_before is null or coalesce(b.started_at, b.scheduled_for) < p_before)
     order by coalesce(b.started_at, b.scheduled_for) desc, b.id desc
     limit (select l.n + 1 from lim l)
  ),
  page as (select * from batches order by at desc, id desc limit (select l.n from lim l)),
  counts as (select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(p.id), '{}')) as c from page p)
  select jsonb_build_object(
    'batches', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', p.id,
                           'state', p.state,
                           'run_for', p.run_for,
                           'at', p.at,
                           'scheduled_for', p.scheduled_for,
                           'finished_at', p.finished_at,
                           'people', p.recipient_count,
                           'failure', p.failure,
                           'place', (select st.place from public.sequence_steps st where st.id = p.step_id),
                           'counts', coalesce((select c from counts) -> p.id::text, '{}'::jsonb))
                           -- A freed time's batch (decision 0082): the time it offers, and who took it; said for it alone.
                           || case when p.offered_from is not null then jsonb_build_object(
                                'offered_start', p.offered_start, 'took', public.freed_time_taken(p.id))
                              else '{}'::jsonb end
                           order by p.at desc, p.id desc)
                           from page p), '[]'::jsonb),
    'more', (select count(*) from batches) > (select l.n from lim l))
$$;
