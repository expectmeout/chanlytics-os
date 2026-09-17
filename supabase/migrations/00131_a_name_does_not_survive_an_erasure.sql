-- 00131 · a name does not survive an erasure.
--
-- 00027 held events out of the erasure on a stated ground, and that ground is
-- the comment beginning "events.data is deliberately NOT scrubbed": every key
-- is a count or an enum -- call.recorded {direction,status}, message.received
-- {channel,type}, usage.voice_seconds {seconds} -- so deleting them would
-- destroy metering, not personal data. That was verified against the live
-- tenant and it was true when it was written. IT IS NOT TRUE NOW, AND THIS
-- FILE SUPERSEDES THAT CLAIM. Three doors written since put a person's own
-- words into events.data:
--
--   00053  create_person                 contact.added  {source, title, by}
--   00054  set_person_name               contact.named  {name, by}
--   apps/edge/lib/calendar-people.ts     contact.added  {source, title,
--                                                       uid, start}
--
-- `name` is the name itself, verbatim, as the owner typed it. `title` is the
-- appointment title the calendar carried, which is where a booking tool puts
-- the client's name. The tombstone keeps no number and no name (00027), the
-- calendar cannot bring the person back (00124), the answer about offers goes
-- (00101) and the address goes (00125) -- and the name sat in the ledger
-- through all of it.
--
-- 00125 already wrote this rule, three migrations ago, for the address it was
-- adding: "events outlive an erasure (00027), so nothing that identifies a
-- person belongs in one". It did not go back for the two that were already
-- there. This does.
--
-- AN ALLOW-LIST, NOT A DROP-LIST. The scrub keeps `by` and `source` and
-- discards every other key. A drop-list of {name, title} would have missed
-- `uid` and `start` -- the edge door writes those, and the finding that
-- prompted this file named only the two SQL doors. It would miss the next
-- door too. What an event must carry to stay useful is small and known; what
-- a door might put in it is neither.
--
-- A TRIGGER, NOT A RECREATE. 00101's rule, restated by 00125: whatever path
-- erases a row, this goes with it, and the one function the right to be
-- forgotten runs through is not recreated to reach one more table. AFTER,
-- like 00101's and unlike 00125's, because this writes to another table
-- rather than editing the row being written.
--
-- SECURITY DEFINER IS LOAD-BEARING. events is RLS'd, and an UPDATE that RLS
-- forbids does not raise -- it matches no rows and reports success. A scrub
-- that ran as its caller would leave the name exactly where it was and say it
-- had gone. This runs as its owner, and returns the row count so the backfill
-- and the test read a number instead of trusting one.
--
-- THE PARTITIONS. events is range-partitioned by created_at (00002 lines
-- 150-191), so an update with no created_at predicate touches every
-- partition. There is no predicate to give: nothing records when a person was
-- named, and the row may be any month old. The scope is tenant_id +
-- subject_type + subject_id + kind, which is the leading columns of
-- events_tenant_subject, so each partition costs an index probe and the whole
-- scrub reaches the handful of rows one person has. Tenant-scoped because
-- this runs as its owner: an unscoped predicate would be a cross-tenant
-- write, which is 00027's rule.
--
-- THE TWO KINDS ARE NAMED, not inferred. contact.erased carries the counts
-- that are the erasure's own record, and contact.consent_changed carries the
-- answer history the profile renders as evidence; scrubbing either would
-- destroy an audit trail to protect nothing. A door that puts a name in some
-- third kind is a new gap, and the integration test beside this reads EVERY
-- event of an erased contact rather than these two, so that gap fails a test
-- instead of sitting quietly.

/* ------------------------------------------------------------- the scrub -- */

create or replace function public.scrub_contact_events(
  p_tenant_id  uuid,
  p_contact_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  update events e
     set data = (
           select coalesce(jsonb_object_agg(t.k, t.v), '{}'::jsonb)
             from jsonb_each(e.data) as t(k, v)
            where t.k in ('by', 'source')
         ) || jsonb_build_object('scrubbed_at', now())
   where e.tenant_id    = p_tenant_id
     and e.subject_type = 'contact'
     and e.subject_id   = p_contact_id
     and e.kind in ('contact.named', 'contact.added')
     -- Idempotent, and it does not churn a row that holds nothing: whatever
     -- is left once the kept keys are removed is the reason to write.
     and (e.data - 'by' - 'source' - 'scrubbed_at') <> '{}'::jsonb;
  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

comment on function public.scrub_contact_events(uuid, uuid) is
  'Rewrite the contact.named and contact.added events of one erased person to keep only `by`, `source` and a scrubbed_at stamp. Every other key -- the name, the appointment title, the calendar uid and start -- is dropped. Returns the number of rows rewritten.';

revoke execute on function public.scrub_contact_events(uuid, uuid) from public, anon, authenticated;

/* ----------------------------------------------------------- the trigger -- */

create or replace function public.contact_events_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.erased_at is not null and old.erased_at is null then
    perform public.scrub_contact_events(new.tenant_id, new.id);
  end if;
  return new;
end $fn$;

-- 00121's rule, which swept 00101's and 00044's erase triggers: Postgres
-- refuses to run a trigger function outside a trigger and firing never checks
-- EXECUTE, so closing it costs nothing and leaves nothing for an advisor to
-- flag. privileges.db.test.mjs holds every definer trigger function to it.
revoke execute on function public.contact_events_on_erase() from public, anon, authenticated;

drop trigger if exists contacts_erase_scrubs_events on public.contacts;
create trigger contacts_erase_scrubs_events
  after update of erased_at on public.contacts
  for each row execute function public.contact_events_on_erase();

/* ---------------------------------------------------------- the backfill -- */

-- Everyone erased before the trigger existed. Their name is in the ledger
-- right now; this is the only thing in this file that removes data which has
-- already been kept longer than it should have been.
do $bf$
declare
  v_rows integer := 0;
  v_one  integer;
  r      record;
begin
  for r in
    select c.id, c.tenant_id from public.contacts c where c.erased_at is not null
  loop
    select public.scrub_contact_events(r.tenant_id, r.id) into v_one;
    v_rows := v_rows + coalesce(v_one, 0);
  end loop;
  raise notice 'scrub_contact_events backfill: % event row(s) rewritten', v_rows;
end $bf$;

/* --------------------------------------------------------- the name door -- */

-- 00054's body, with one change: the event says THAT the person was named and
-- by whom, never what they were called -- the shape 00125 chose for the
-- address, and the one 00054 itself chose a few lines lower, where
-- contact.noted records {chars, by} and not the note. Nothing reads the key:
-- packages/contracts/src/activity.ts maps contact.named to the words "A
-- person was named" and never opens data, and no route selects it. The
-- trigger above covers what is already written; this stops writing more.
--
-- create or replace, so the function keeps its owner and its grants (00115's
-- note). The signature is unchanged, so packages/db/src/database.types.ts is
-- unchanged with it.
create or replace function public.set_person_name(p_contact_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_name   text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set display_name = v_name, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.named', 'contact', 'contact', p_contact_id,
          jsonb_build_object('named', v_name is not null, 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'name', v_name);
end $fn$;

comment on function public.set_person_name(uuid, text) is
  'Owner or operator names a person; empty clears it and the WhatsApp name or the number shows again. The event records that the name changed and by whom, never the name.';

-- create_person (00053) and the edge's calendar door still write `title`, on
-- purpose. Unlike the name, it is READ: the profile renders it as "Added from
-- your calendar (Colour)" -- packages/contracts/src/people.ts, the `added`
-- item in the activity list and the "Added" row in the about list, fed by
-- apps/dashboard/app/api/v1/contacts/[id]/route.ts. Dropping it at the door
-- would quietly take a line off every person's page to close an erasure gap
-- the trigger above already closes. What that door writes and nothing reads
-- -- `uid` and `start` -- is worth a separate look.
