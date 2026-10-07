-- 00345 · An appointment is a record, and a booking tool's notice is how one arrives.
--
-- Decision 0002, built: the product kept nothing about an appointment, and every page, reply and playbook re-parsed
-- the owner's iCal feed. A booking tool's email about a booking has no feed to be re-derived from, so this is where the
-- record is made (docs/plans/2026-10-07-bookings-arrive-by-email.md). Two tables:
--
--   appointments          one visit: when, for whom, what, with whom, and what became of it. Written by the sources the
--                         decision names, each said on the row (source): a booking tool's notice (booking_email, this
--                         lane), the calendar feed (calendar_feed, the readers lane), a tool's own door (booking_tool,
--                         later) and a person. The product never writes one on its own: the receptionist does not book.
--   appointment_notices   the ledger of every notice taken in: the delivery it was, the tool, what it became or why it
--                         is held for a person. The replay gate (a delivery read twice meets its row), the health line
--                         ("last notice from Booksy, 2 h ago") and the audit (which email made this row).
--
-- Per 00339 a new table grants nothing by default: each grants the service role what the jobs and the sweeps write with
-- and authenticated the select its policy reads by. Per 00121 the table-wide write grant is never given to
-- authenticated, so a person's own writes (decision 0002, step 8) arrive with their route and their grant. Either deploy
-- order: nothing of either app writes these rows until the handler ships, and an older build reads nothing from them.
-- Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------ 1. the record -- */

create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  contact_id    uuid,
  lead_id       uuid,
  -- Where it came from. The product never writes 'receptionist': it does not book.
  source        text not null check (source in ('calendar_feed', 'booking_email', 'booking_tool', 'person')),
  -- The booking tool whose word it is, as contracts BOOKING_TOOLS names them; null for a feed's or a person's.
  tool          text,
  -- The source's own id for the visit: an event's UID, a notice's key (contracts appointmentKey). The replay gate.
  external_id   text,
  status        text not null default 'booked'
                  check (status in ('proposed', 'booked', 'kept', 'missed', 'cancelled')),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  all_day       boolean not null default false,
  -- The calendar's own words, as the feed gave them; null for a notice, whose words are the fields below.
  title         text,
  service       text,
  staff         text,
  price         text,
  note          text,
  -- The client as the source named them: what a feed's event never promises and a notice always carries.
  client_name   text,
  client_phone  text check (client_phone is null or client_phone ~ '^\+[1-9][0-9]{6,14}$'),
  client_email  text,
  consultation  boolean not null default false,
  -- A playbook's day key is the business's, never UTC.
  timezone      text not null,
  -- The feed stopped naming it: NOT a cancellation (decision 0002, Risks). Only a source or a person cancels.
  vanished_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The person and the lead are named with the workspace (the fence every child keeps, 00279; database/fences): a
  -- visit cannot name another workspace's. A person or a lead removed leaves the visit, unnamed.
  constraint appointments_contact_id_same_workspace
    foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete set null (contact_id),
  constraint appointments_lead_id_same_workspace
    foreign key (tenant_id, lead_id) references public.leads (tenant_id, id) on delete set null (lead_id),
  -- What a notice names its visit by, with the workspace.
  constraint appointments_tenant_id_id_key unique (tenant_id, id)
);

-- One row per visit per source: a re-sync or a repeat notice updates, never duplicates. The key is whole (no predicate),
-- so an upsert may name it (PostgREST infers a partial index from no ON CONFLICT list); a row with no external id is a
-- person's, and nulls are distinct.
create unique index if not exists appointments_source_uq on public.appointments (tenant_id, source, external_id);
create index if not exists appointments_tenant_start on public.appointments (tenant_id, starts_at);
create index if not exists appointments_contact on public.appointments (tenant_id, contact_id, starts_at);
create index if not exists appointments_lead on public.appointments (tenant_id, lead_id) where lead_id is not null;
create index if not exists appointments_client_phone on public.appointments (tenant_id, client_phone, starts_at)
  where client_phone is not null;
create index if not exists appointments_client_email on public.appointments (tenant_id, client_email, starts_at)
  where client_email is not null;

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function extensions.moddatetime('updated_at');

-- The guard, in 00106's shape: proposed -> booked | cancelled; booked -> kept | missed | cancelled; those three final;
-- a same-status update is not a move, because restating a row's details is not a move.
create or replace function public.appointments_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status then
    if OLD.status in ('kept', 'missed', 'cancelled') then
      raise exception 'appointments.status is terminal (% -> % refused)', OLD.status, NEW.status
        using errcode = 'check_violation';
    end if;
    if OLD.status = 'proposed' and NEW.status not in ('booked', 'cancelled') then
      raise exception 'a proposed appointment may only be booked or cancelled (% refused)', NEW.status
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.appointments_guard() from public, anon, authenticated;
drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard before update on public.appointments
  for each row execute function public.appointments_guard();

alter table public.appointments enable row level security;
drop policy if exists appointments_member_select on public.appointments;
create policy appointments_member_select on public.appointments
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.appointments from public, anon, authenticated;
grant select on public.appointments to authenticated;
grant select, insert, update, delete on public.appointments to service_role;
comment on table public.appointments is
  'One visit as a source stated it (decision 0002): a booking tool''s notice, the calendar feed, a tool''s door or a person; its client, what and with whom, and what became of it. Members read; the service role writes; the product never books.';

-- The live feed (00265): a statement on the record is told to its workspace, so the board repaints as a booking lands.
-- The table's row in WATCHED (packages/db realtime.ts) and these three triggers are held equal by
-- database/each-workspace-is-told-what-changed.db.test.mjs. A notice rides realtime.send, never the publication.
drop trigger if exists workspace_tell_insert on public.appointments;
create trigger workspace_tell_insert after insert on public.appointments referencing new table as changed
  for each statement execute function public.workspace_tell_changes();
drop trigger if exists workspace_tell_update on public.appointments;
create trigger workspace_tell_update after update on public.appointments referencing new table as changed
  for each statement execute function public.workspace_tell_changes();
drop trigger if exists workspace_tell_delete on public.appointments;
create trigger workspace_tell_delete after delete on public.appointments referencing old table as changed
  for each statement execute function public.workspace_tell_changes();

-- Whether an address is a member's of the workspace: how a forward by hand is trusted (core ingestEmail). Read on the
-- service role by the intake's job; a session never asks it.
create or replace function public.member_has_address(p_tenant_id uuid, p_address text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = p_tenant_id
       and lower(u.email) = lower(btrim(p_address))
  );
$$;
revoke all on function public.member_has_address(uuid, text) from public, anon, authenticated;
grant execute on function public.member_has_address(uuid, text) to service_role;
comment on function public.member_has_address(uuid, text) is
  'Is this address a member''s of the workspace: how the intake trusts a booking notice a person forwarded by hand (00345). Service role only.';

/* ------------------------------------------------------------------------------ 2. the ledger -- */

create table if not exists public.appointment_notices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- The provider's id for the delivery (the email_ingest job's received_id): the replay gate.
  notice_id       text not null,
  tool            text not null,
  from_address    text,
  subject         text,
  received_at     timestamptz not null,
  read_at         timestamptz not null default now(),
  -- What the notice became. held: a person must look (hold_reason says why: contracts NOTICE_HOLDS); dismissed: a
  -- person looked and let it go, the reason kept.
  outcome         text not null check (outcome in ('booked', 'changed', 'cancelled', 'held', 'dismissed')),
  hold_reason     text check (hold_reason is null or hold_reason in ('no_model', 'may_not_spend', 'unreadable', 'not_a_booking', 'no_time', 'no_client', 'gone')),
  appointment_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Both or neither: a held or dismissed notice says why, a read one has nothing to say.
  check ((outcome in ('held', 'dismissed')) = (hold_reason is not null)),
  -- The visit it made is named with the workspace (the fence every child keeps, 00279): a notice cannot name
  -- another workspace's. A visit removed leaves the notice, pointing at nothing.
  constraint appointment_notices_appointment_id_same_workspace
    foreign key (tenant_id, appointment_id) references public.appointments (tenant_id, id)
    on delete set null (appointment_id)
);

create unique index if not exists appointment_notices_delivery_uq on public.appointment_notices (tenant_id, notice_id);
create index if not exists appointment_notices_tenant_received on public.appointment_notices (tenant_id, received_at desc);
create index if not exists appointment_notices_held on public.appointment_notices (tenant_id) where outcome = 'held';
create index if not exists appointment_notices_appointment on public.appointment_notices (tenant_id, appointment_id)
  where appointment_id is not null;

drop trigger if exists appointment_notices_set_updated_at on public.appointment_notices;
create trigger appointment_notices_set_updated_at
  before update on public.appointment_notices
  for each row execute function extensions.moddatetime('updated_at');

alter table public.appointment_notices enable row level security;
drop policy if exists appointment_notices_member_select on public.appointment_notices;
create policy appointment_notices_member_select on public.appointment_notices
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.appointment_notices from public, anon, authenticated;
grant select on public.appointment_notices to authenticated;
grant select, insert, update, delete on public.appointment_notices to service_role;
comment on table public.appointment_notices is
  'Every booking tool''s notice the workspace''s address took in: the delivery, the tool, and what it became or why it is held for a person. Members read; the booking_read job writes.';

/* ------------------------------------------------------------------------------ 2b. the forward's confirmation -- */

-- Gmail forwards to an address only once that address has confirmed, and its confirmation email (from
-- forwarding-noreply@google.com, with a code and a link) lands at the workspace's address. The intake keeps it on the
-- mailbox instead of in the Inbox (core ingestEmail), and Settings › Business shows the code and the link with one
-- press; the first booking notice read clears it. The account is the owner's own Gmail: the workspace's, not a
-- customer's (packages/db erasure-registry.ts says so).
alter table public.mailboxes
  add column if not exists forward_confirm_account text,
  add column if not exists forward_confirm_code    text,
  add column if not exists forward_confirm_link    text,
  add column if not exists forward_confirm_at      timestamptz;
comment on column public.mailboxes.forward_confirm_code is
  'Gmail''s confirmation code for forwarding from forward_confirm_account to this address, kept by the intake until the first booking notice is read (00345).';

/* ------------------------------------------------------------------------------ 3. an erasure's hand -- */

-- Decision 0036: a column that can hold a person's words arrives with the leg that erases it. A visit is the business's
-- fact (when, what, with whom); the client in it is the person's. An erasure keeps the visit and takes the person out:
-- the rows the person's id or any of their numbers and addresses name lose the client's name, number, address and note,
-- and their key (which carries the number) becomes the row's own; the notices that made them, and any notice whose
-- subject names them, lose the subject. Called by the dashboard's erasure beside person_notes_scrub (00341).
create or replace function public.appointments_scrub(p_tenant_id uuid, p_contact_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_needles  text[];
  v_patterns text[];
  v_needle   text;
  v_subject  text;
  v_changed  integer := 0;
  v_ids      uuid[];
  r          record;
begin
  select coalesce(array_agg(n order by char_length(n) desc, n), '{}')
    into v_needles
    from (select distinct lower(btrim(x)) as n from unnest(coalesce(p_needles, '{}'::text[])) x) d
   where char_length(n) >= 6;

  -- The visits that are theirs: by the person the read linked, or by a number or an address the notice named.
  with theirs as (
    update public.appointments a
       set client_name  = null,
           client_phone = null,
           client_email = null,
           note         = null,
           title        = null,
           external_id  = 'erased:' || a.id::text
     where a.tenant_id = p_tenant_id
       and (a.contact_id = p_contact_id
            or (a.client_phone is not null and lower(a.client_phone) = any (v_needles))
            or (a.client_email is not null and lower(a.client_email) = any (v_needles)))
       and a.external_id is distinct from 'erased:' || a.id::text
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from theirs;
  v_changed := cardinality(v_ids);

  -- The notices that made those visits say nothing of who: the subject carries the name.
  update public.appointment_notices n
     set subject = null
   where n.tenant_id = p_tenant_id
     and n.appointment_id = any (v_ids)
     and n.subject is not null;

  -- Any other notice whose subject names them, as other people's notes are scrubbed (00341).
  if cardinality(v_needles) > 0 then
    select array_agg('%' || replace(replace(replace(n, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      into v_patterns
      from unnest(v_needles) n;
    for r in
      select n.id, n.subject
        from public.appointment_notices n
       where n.tenant_id = p_tenant_id
         and n.subject is not null
         and lower(n.subject) like any (v_patterns)
         for update
    loop
      v_subject := r.subject;
      foreach v_needle in array v_needles loop
        v_subject := regexp_replace(v_subject, regexp_replace(v_needle, '([^[:alnum:]])', '\\\1', 'g'), '[erased]', 'gi');
      end loop;
      if v_subject is distinct from r.subject then
        update public.appointment_notices set subject = v_subject where id = r.id;
      end if;
    end loop;
  end if;
  return v_changed;
end $$;
revoke all on function public.appointments_scrub(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.appointments_scrub(uuid, uuid, text[]) to service_role;
comment on function public.appointments_scrub(uuid, uuid, text[]) is
  'An erasure''s hand in the appointments (decision 0036): the person''s visits keep their time and service and lose the client''s name, number, address and note; the notices that made them, and any whose subject names them, lose the name. Answers how many visits changed. Service role only.';

/* ------------------------------------------------------------------------------ 4. the job and the purpose -- */

-- The kind arrives with its handler (packages/jobs booking-read.ts), its caller (core ingestEmail) and its lane: a
-- notice read is someone waiting who is not a customer, as a reply's reading is (lane 1).
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver', 'booking_read'));

alter table public.jobs drop column if exists lane;
alter table public.jobs add column lane smallint generated always as (
  case
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read', 'booking_read') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
) stored;
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read, a booking notice read), 2 bulk. Generated from kind and payload; an event_deliver row carries its subscription''s lane.';

-- contracts MODEL_PURPOSES, with the notice's read.
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read'));

-- The bell's kinds (00241's list), with a booking notice held for a person: a row on the bell, no mail
-- (contracts NOTIFICATION_DELIVERY).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('handoff','deadman','call','number','sweep','job_failed','playbook','calendar_people','alert','review','billing','template_ready','template_blocked','broadcast_sent','broadcast_stopped','leads_ready','leads_question','note_for_you','reach_out_replied','reach_out_day','booking_notice'));
