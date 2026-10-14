-- 00436 · A visit's change says who made it.
--
-- The wiring's second audit, lane R11 (S6-6). A customer who cancelled or moved a booking through the booking tool's
-- email was told to nobody: the Calendar changed and Activity said so, and the owner, who could have filled the freed
-- time, found out by looking. The owner is told now (core visit_notice, contracts bookingChanged), and only of what the
-- customer did: a visit the owner cancelled themselves (mark_visit) carries the source it came by, booking_email, just as
-- the customer's cancellation does, and telling the owner of their own Cancel would be noise.
--
--   appointments_note_change   appointment.changed's data also says `by`: "member" when a signed-in member's session made
--                              the write (auth.uid(), read in the write's own transaction: mark_visit runs as the member),
--                              "service" for the edge's (a booking tool's email, the calendar's door), which run as the
--                              service role. Nothing else changes: the same changes, the same keys.
--
-- Either deploy order: a subscriber from before this tells no change but a booking's arrival. One from after it tells a
-- change only where `by` says "service", so on a database from before, whose events say no `by`, it tells none.
-- Re-runnable.

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
          jsonb_build_object('change', v_change, 'source', new.source, 'starts_at', new.starts_at)
          -- Whose word it is, whatever source the visit came by: a signed-in member's, or the service's (00436).
          || jsonb_build_object('by', case when auth.uid() is not null then 'member' else 'service' end));
  return null;
end $$;

comment on function public.appointments_note_change() is
  'appointment.changed {change, source, starts_at, by} in the same transaction as the write (00389, 00397, 00436): added, confirmed, cancelled, kept, missed or moved, and nothing for a write that changes none of those; by is member when a signed-in member''s session made the write, service for the edge''s (a booking tool''s email, the calendar''s door). On a feed''s row only a moved status is said (appointments_note_status): the feed''s door writes its own events (00348) and never moves a status, so that is a person''s word.';
