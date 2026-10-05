-- 00288 · A person keeps how they first reached the workspace.
--
-- The Reports lenses spec, K3. People works "where they first reached you" out when it reads, and nothing says which line
-- or which ad. Now contacts.acquired_via (whatsapp, sms, email, call, ad; from 00289 calendar, import, lead, manual) and
-- acquired_ref (the line, a tenant_channels id, or the ad's id; never the person) are written once, through
-- person_set_first_touch, by the message or call that made the person. A person and the first message or call that made
-- them are written in one transaction, so their created_at are one now(), and anyone who existed before (imported, added,
-- made by an earlier call) is never stamped by it. The triggers run inside ingest_inbound and ingest_call (neither
-- restated) and trap their own failure as lead_link_contact (00140) does: a warning and a person with no first touch,
-- never a lost message. A call counts when public.call_connected says so (phase A's one rule, 00285: ongoing or ended, or
-- an error after it had a length), read at the moment it first does: on the call's first row, or on the update that first
-- makes it connected. Retell's first row can be `registered`, which an upsert later raises to ongoing or ended; a row keeps
-- its created_at across updates, so the person that row made still has the same created_at as the call, and that equality
-- is still what says this call made them. A person made by a call that never connected stays unknown. An ad is a WhatsApp
-- click-to-chat ad: a referral whose source_type is `ad`; any other referral (a post) is stamped by its wire, as a message
-- with no referral is. No backfill. An erased person keeps both columns: the erasure (00151 erase_contact) blanks the
-- columns it names and neither is one, and neither identifies anyone (a wire's name, a line's id, an ad's id, or a lead's
-- bare id, whose row the erasure blanks), so a count of how people first reached the workspace keeps an erased person.
-- Either deploy order works.
--
-- What it costs, on the two busiest tables. The triggers are per row, not per statement as 00259's are. Each inbound
-- customer message, and each inbound call at the moment it first connects, costs one call of person_set_first_touch: a
-- primary-key lookup of the person that finds nothing to change after their first (their touch is taken, or their
-- created_at is not this row's), and one row update when it is their first; the call sits in an exception block, which is
-- a subtransaction, so that a stamp can never fail the write that made it. A statement trigger over a transition table was
-- not chosen: the stamp has to be decided inside the transaction that made the person, row by row, because their
-- created_at being this row's now() is the only thing that tells a person the row made from one who existed before it.
-- The WHEN of each trigger stays as cheap as a WHEN can (direction, sender, a contact, a channel, not a backfill; a call's
-- status), so an outbound row, a system row and a backfilled one never enter the function at all. The call's second
-- trigger fires only on an update of status or duration_ms, and its WHEN asks call_connected of the new row and of the
-- old one, so the transcript turns of a live call (updates of a row that is already ongoing) and the end of a call that
-- connected (ongoing to ended) find the old row connected and never enter it: the function runs once, on the update that
-- first connects the call. The backfill test is restated from the places that already restate it (A's functions); it is
-- the same words.
--
-- Locks, and the one way this file could hurt a customer. In one transaction it takes ACCESS EXCLUSIVE on contacts (add
-- column, add constraint) and SHARE ROW EXCLUSIVE on messages and on calls (create or replace trigger: writers wait,
-- readers do not; a drop trigger if exists before it would take ACCESS EXCLUSIVE, so it is not used). Each is held to
-- commit, and the file waits for each in turn while it holds the ones before. A customer's write can wait for this file
-- while this file waits for it: ingest_inbound holds contacts and then wants messages, and an outbound reply's insert
-- holds messages while its statement trigger (00259) reads contacts. Postgres ends such a cycle after deadlock_timeout
-- (1 s by default) by cancelling the statement that looks first, and that could be the customer's insert. So this file's
-- lock_timeout is 500 ms, below that 1 s: a wait of this file for a lock ends, by cancelling this file, before the
-- detector would look at it, and the side that is aborted is this file, never a customer's insert. A customer's
-- statement that queues behind the file's locks is looked at one second after it began, and by then the file, which
-- takes its three locks one after another and makes its one scan (validate constraint, SHARE UPDATE EXCLUSIVE, under the
-- ACCESS EXCLUSIVE it already holds) last, after its last wait, has either got them all and waits for nothing more, or
-- has given up. If it times out nothing was applied (one transaction): the owner re-runs the file, when the line is
-- quiet. This file alone sets it so; the other files of this batch each lock one table and keep 00259's 3 s.
-- Every statement re-runs.
set local lock_timeout = '500ms';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '500ms' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the columns -- */

alter table public.contacts add column if not exists acquired_via text;
alter table public.contacts add column if not exists acquired_ref text;

comment on column public.contacts.acquired_via is
  'How the person first reached the workspace, written once (person_set_first_touch): whatsapp, sms, email or call for the wire of the message or call that made them, ad for a WhatsApp click-to-chat ad (a referral whose source_type is ad; a post or any other referral is the wire''s), calendar, import, lead or manual for the door that added them (00289). Null for a person from before it was kept, and wherever nothing says: unknown, never a guess.';
comment on column public.contacts.acquired_ref is
  'The line (tenant_channels.id) or the ad (Meta''s source id) the person first came through; null where nothing says. Never the person.';

-- Added only when absent, and validated at the end of the file: the columns are new and null, so no row can fail either.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_acquired_via_check' and conrelid = 'public.contacts'::regclass) then
    alter table public.contacts add constraint contacts_acquired_via_check
      check (acquired_via is null or acquired_via in ('whatsapp', 'sms', 'email', 'call', 'ad', 'calendar', 'import', 'lead', 'manual')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contacts_acquired_ref_check' and conrelid = 'public.contacts'::regclass) then
    alter table public.contacts add constraint contacts_acquired_ref_check
      check (acquired_ref is null or (acquired_via is not null and char_length(acquired_ref) between 1 and 200)) not valid;
  end if;
end $$;

/* ----------------------------------------------------------------- 2. the door -- */

-- The one place a first touch is written. p_made_at, when given, names the instant of the row that made the person
-- (a message's or a call's created_at): the touch counts only if the person's own created_at is that instant, which it
-- is exactly when the two were written in one transaction. A caller that made the person itself (a door that just
-- added them) passes none.
create or replace function public.person_set_first_touch(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_via        text,
  p_ref        text default null,
  p_made_at    timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update contacts
     set acquired_via = p_via,
         acquired_ref = nullif(btrim(p_ref), '')
   where id = p_contact_id
     and tenant_id = p_tenant_id
     and acquired_via is null
     and (p_made_at is null or created_at = p_made_at);
  return found;
end $$;

revoke all on function public.person_set_first_touch(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.person_set_first_touch(uuid, uuid, text, text, timestamptz) to service_role;
comment on function public.person_set_first_touch(uuid, uuid, text, text, timestamptz) is
  'A person''s first touch (K3), written once: sets acquired_via and acquired_ref where acquired_via is null and, when p_made_at is given, only where the person''s created_at is that instant (the row that made them was written in the same transaction). True when it wrote. Called by the message, call and contact.added triggers; the closed set is contacts_acquired_via_check.';

/* --------------------------------------------------- 3. the message and the call -- */

-- Only an ad is an ad: the referral names it by its source_id when its source_type is `ad`. A WhatsApp referral can
-- also be a post, and any other referral is stamped by its wire, as a message with no referral is.
create or replace function public.messages_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text := case when NEW.meta #>> '{referral,source_type}' = 'ad'
                    then nullif(btrim(NEW.meta #>> '{referral,source_id}'), '') end;
begin
  perform public.person_set_first_touch(
    NEW.tenant_id,
    NEW.contact_id,
    case when v_ad is not null then 'ad' else NEW.channel end,
    case when v_ad is not null then v_ad else NEW.meta ->> 'line' end,
    NEW.created_at
  );
  return null;
exception when others then
  raise warning 'messages_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.messages_note_first_touch() from public, anon, authenticated;
comment on function public.messages_note_first_touch() is
  'The first touch of the person an inbound customer message made (K3): its wire, or the ad it came from (meta.referral.source_id, when meta.referral.source_type is ad; a post or any other referral is the wire''s), with the line it came in on (meta.line). Never fails the insert: a failure is a warning.';

create or replace trigger messages_note_first_touch after insert on public.messages
  for each row
  when (new.direction = 'inbound' and new.sender = 'customer' and new.contact_id is not null
        and new.channel in ('whatsapp', 'sms', 'email')
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_first_touch();

-- One function, two triggers: it reads only NEW, so the call that is connected on its first row and the call that
-- becomes connected on a later update are stamped by the same words. NEW.created_at is the row's own on an update too.
create or replace function public.calls_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.person_set_first_touch(NEW.tenant_id, NEW.contact_id, 'call', NEW.channel_id::text, NEW.created_at);
  return null;
exception when others then
  raise warning 'calls_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.calls_note_first_touch() from public, anon, authenticated;
comment on function public.calls_note_first_touch() is
  'The first touch of the person an inbound call made (K3): a call, on the line it rang (calls.channel_id), at the moment the call is one public.call_connected counts (ongoing or ended, or an error after it had a length): its first row, or the update that first makes it so. Never fails the write: a failure is a warning.';

create or replace trigger calls_note_first_touch after insert on public.calls
  for each row
  when (new.direction = 'inbound' and new.contact_id is not null and public.call_connected(new.status, new.duration_ms))
  execute function public.calls_note_first_touch();

-- A call is a first touch when it CONNECTS, not only on its first row: Retell's first row can be `registered`, and an
-- upsert raises it to ongoing or ended later, which fires no insert trigger. This one fires on exactly the update that
-- first makes the call connected (the new row is, the old one was not), so it is once per call.
create or replace trigger calls_note_first_touch_on_connect after update of status, duration_ms on public.calls
  for each row
  when (new.direction = 'inbound' and new.contact_id is not null
        and public.call_connected(new.status, new.duration_ms)
        and not public.call_connected(old.status, old.duration_ms))
  execute function public.calls_note_first_touch();

/* ------------------------------------------------------------- 4. the validation -- */

-- Last on purpose: the one scan of contacts this file makes, after its last wait for a lock (see the header).
alter table public.contacts validate constraint contacts_acquired_via_check;
alter table public.contacts validate constraint contacts_acquired_ref_check;
