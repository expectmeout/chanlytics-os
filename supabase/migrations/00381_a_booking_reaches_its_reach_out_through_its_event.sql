-- 00381 · A booking reaches its reach-out through its event: the spine's first subscriber that acts.
--
-- A booking stops a reach-out (Reach out Part 5): reach_out_booked (00227, 00241) stamps the lead a reach-out wrote to
-- as booked and converts it when it booked after an email left, so its next nudge is never written. It ran only from
-- the hourly calendar sweep, over the feed's items, so an appointment that arrived any other way (a booking tool's
-- notice by email, 00345: the record's second source) never reached it, and its lead kept being written to (0031's
-- review of 9 October: the booking-email gap). And an appointment kept on the record from a notice wrote no event at
-- all: the feed's door wrote appointment.changed (00348), the notice's writes nothing.
--
--   appointments_note_change   After each write of an appointment that is not the feed's (the feed's door writes its
--                              own), appointment.changed on the appointment, in the same transaction, as the feed's
--                              door words it: {change, source, starts_at}, the change one of added (a new one),
--                              cancelled, or moved (its start). A cancelled appointment stays cancelled
--                              (appointments_guard), so a booking's record has no "back". A write that changes none of
--                              those (a key set aside, a service named) writes no event.
--   reach_out_booked_from(tenant, appointment)
--                              The booking door over one appointment of the record, booked or kept and not vanished:
--                              its client's address and number and its person's, each with its start, the business's
--                              own addresses left out (member_has_address, 00345) as People's import leaves them.
--                              Answers how many leads moved. The service role's.
--   the subscription           appointment.changed -> reach_out_booked, in the background lane (2): the event_deliver
--                              job runs it after the commit (decision 0032), for every source the record keeps.
--
-- The hourly sweep still hands the door the feed's items as before; the door stamps a lead once, so the two meeting
-- on one appointment change nothing twice. Deploy order: this migration first, and the edge after it: until the edge
-- knows the subscriber, its deliveries are kept as a kind it does not know and run once it does. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------- the record's change, as an event */

create or replace function public.appointments_note_change()
returns trigger
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

revoke all on function public.appointments_note_change() from public, anon, authenticated;
comment on function public.appointments_note_change() is
  'appointment.changed {change, source, starts_at} for each write of an appointment the feed''s door did not make (00381), in the same transaction: added, cancelled or moved, and nothing for a write that changes none of those. The feed''s door writes its own (00348).';

drop trigger if exists appointments_note_change on public.appointments;
create trigger appointments_note_change
  after insert or update on public.appointments
  for each row
  when (new.source <> 'calendar_feed')
  execute function public.appointments_note_change();

/* ------------------------------------------------------------------------------ the booking door, for one booking */

create or replace function public.reach_out_booked_from(p_tenant_id uuid, p_appointment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seen jsonb;
begin
  select coalesce(jsonb_agg(x.seen), '[]'::jsonb) into v_seen
    from (
      select jsonb_build_object(x.what, x.address, 'start', to_char(a.starts_at at time zone 'UTC',
                                                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as seen
        from public.appointments a
        left join public.contacts c on c.tenant_id = a.tenant_id and c.id = a.contact_id and c.erased_at is null
        cross join lateral (values
          ('email', lower(nullif(btrim(a.client_email), ''))),
          ('phone', nullif(btrim(a.client_phone), '')),
          ('email', lower(nullif(btrim(c.email), ''))),
          ('phone', nullif(btrim(c.phone_e164), ''))
        ) x(what, address)
       where a.tenant_id = p_tenant_id and a.id = p_appointment_id
         and a.status in ('booked', 'kept') and a.vanished_at is null
         and x.address is not null
         and not (x.what = 'email' and public.member_has_address(p_tenant_id, x.address))
    ) x;
  if jsonb_array_length(v_seen) = 0 then
    return 0;
  end if;
  return public.reach_out_booked(p_tenant_id, v_seen);
end $$;

revoke all on function public.reach_out_booked_from(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_booked_from(uuid, uuid) to service_role;
comment on function public.reach_out_booked_from(uuid, uuid) is
  'The booking door (reach_out_booked) over one appointment of the record (00381), booked or kept and not vanished: its client''s address and number and its person''s, each with its start, the business''s own addresses left out. Answers how many leads moved. The service role''s; the reach_out_booked subscriber calls it.';

/* ------------------------------------------------------------------------------------------- the subscription */

insert into public.event_subscriptions (kind, subscriber, lane)
values ('appointment.changed', 'reach_out_booked', 2)
on conflict (kind, subscriber) do nothing;
