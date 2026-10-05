-- 00313 · A booking link sent in chat is said once.
--
-- The Reports lenses spec, K7 (the chat half). A call that sends the booking link records it as its outcome
-- (calls.outcome booking_link_sent); a chat message that carried it recorded nothing, so "links sent, then booked" could
-- not be read for the receptionist's replies, a member's, or the voice tool's WhatsApp link. Now booking_link.sent
-- { channel, sender } is written when an outbound chat message (whatsapp or sms) has left, carrying the workspace's booking
-- link, and is not an automated send (phase A's automated_send: a broadcast or a reach-out is not a reply). "Has left" is
-- the row becoming sent: inserted as sent (the receptionist's own reply, the voice tool's WhatsApp link) or a queued one
-- finalized (a member's reply, the Inbox's template, a held draft); a canceled or failed one never is, and an email never is
-- (its row is written before its words leave, and a cold email is not a reply). The trigger is on the message row because
-- that is the one place every sender passes and the one moment the words are known to have gone; the reply verb only
-- queues (a 15 s undo follows) and the receptionist's reply never passes it. Nothing in the reply path, the send door,
-- the voice tool or the webhook is edited.
--
-- message_carries_link is the rule, and it is the receptionist's own: the words carry the link when they hold it without
-- its scheme. Its twins are named by file and function, never by line (a line moves, and this text is frozen once applied):
-- layerTwo in packages/core/src/inbound/steps.ts (its carriesLink check, replyText.includes(booking_link), which agrees
-- with it whenever the scheme is present); writtenOutDetail in packages/contracts/src/config/business-tab/fold-limits.ts
-- (said.includes(link), which trims the link first; this reads it as stored, as layerTwo does); and the two senders that
-- strip the scheme before they fill a template's link slot, each in its bookingLink argument to resolveParams:
-- sendBookingLinkOnCall in apps/edge/lib/voice/call-booking-link.ts (the voice tool's WhatsApp link) and queueReply in
-- packages/core/src/conversations/reply.ts (the Inbox's template). A message they write holds host/path and never
-- https://host/path, and it is the very link. Case is kept as stored, as layerTwo keeps it. The link is
-- brain.booking_link of tenant_config, the field every sender already uses, read raw. A link that is null, empty, or
-- nothing but a scheme or spaces carries nothing: no event, never a match on everything. What the rule counts, said
-- plainly: any words that hold the link as the workspace wrote it, so a longer page of the same site that starts with it
-- counts, as it does for the receptionist's own check; and a differently-cased spelling does not.
--
-- What it costs, on the hottest table. The WHEN holds only the cheap columns (direction, channel, the move to sent, not an
-- automated send, not a backfill): there is no test of the words in it, because "looks like a link" would be a second
-- rule beside the one above. So the function runs once for each outbound chat message that leaves and is not automated
-- (once when it is inserted as sent, or once when its queued row is finalized, never again for a delivered or a read):
-- one primary-key read of tenant_config and one strpos, inside the block's subtransaction. Measured on 3 Oct 2026 on a
-- local stack, 3000 rows to a statement, against an email row the WHEN skips: the function adds about 55 microseconds to
-- an outbound chat message that carries no link, and about 145 to one that does, the event's own insert included; the
-- send's own wire call takes hundreds of milliseconds. This is the only file of the batch whose cost is per message.
--
-- Once per message. The insert trigger fires for a row written as sent, the update trigger for a row that becomes sent
-- and was not (messages_guard keeps a status monotone and a terminal one terminal, so a row that is sent is sent, then
-- delivered, then read, and a delivered, a read or a repeated sent never writes a second event). The two WHENs restate the
-- same chat-reply conditions (outbound, whatsapp or sms, not automated, not a backfill) and differ only in the move into
-- sent, and the backfill test is spelled inline here as in 00303, 00304 and 00306: both are left as they are, the pattern
-- since 00306.
--
-- It writes only the event and traps its own failure: a message with no event is a warning, never a failed send or a lost
-- ingest. It sits beside 00306's first-touch trigger on the same table and neither depends on the other: that one fires
-- for an inbound customer message and this one for an outbound one, so no row fires both; this one reads only NEW (after
-- messages_guard, which may stamp meta.status_at and touches neither meta.source nor meta.backfill) and tenant_config, and
-- writes only an event of a kind no trigger on events reacts to; the statement triggers of messages (person_moments_*,
-- workspace_tell_*) fire after every row trigger and read neither. So the order Postgres fires them in (by name) cannot
-- matter, and each traps its own failure. No backfill. Either deploy order works (nothing reads it yet; an older dashboard
-- words the kind as "Booking_link · sent" until it deploys).
--
-- The lock. Two triggers on messages take SHARE ROW EXCLUSIVE (writers wait, readers do not) until commit: one table, one
-- wait, the 3 s guard of 00259; if it times out nothing was applied and the owner re-runs it when the line is quiet. Every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.message_carries_link(p_body text, p_link text)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- The words hold the link without its scheme, as stored (case kept). One rule in several spellings, named by file and
  -- function: layerTwo in packages/core/src/inbound/steps.ts (the receptionist's own check, with the scheme),
  -- writtenOutDetail in packages/contracts/src/config/business-tab/fold-limits.ts (a written-out link), and the two
  -- senders that strip the scheme before they fill the slot: sendBookingLinkOnCall in apps/edge/lib/voice/call-booking-link.ts
  -- (the voice tool) and queueReply in packages/core/src/conversations/reply.ts (the Inbox's template).
  -- A link that is null, empty, or nothing but a scheme or spaces carries nothing, never everything.
  select btrim(l.bare) <> '' and strpos(coalesce(p_body, ''), l.bare) > 0
    from (select regexp_replace(coalesce(p_link, ''), '^https?://', '') as bare) l
$$;

revoke all on function public.message_carries_link(text, text) from public, anon;
grant execute on function public.message_carries_link(text, text) to authenticated, service_role;
comment on function public.message_carries_link(text, text) is
  'Whether these words carry this link (K7): they hold the link without its scheme (^https?://), as stored, in the same case, anywhere in the words. False for no words, and for a link that is null, empty, or nothing but a scheme or spaces. The twins of this rule, by file and function: layerTwo in packages/core/src/inbound/steps.ts, writtenOutDetail in packages/contracts/src/config/business-tab/fold-limits.ts, and the scheme-stripping senders sendBookingLinkOnCall in apps/edge/lib/voice/call-booking-link.ts and queueReply in packages/core/src/conversations/reply.ts.';

create or replace function public.messages_note_booking_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
begin
  select c.config #>> '{brain,booking_link}' into v_link
    from public.tenant_config c
   where c.tenant_id = NEW.tenant_id;
  if public.message_carries_link(NEW.body, v_link) then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (NEW.tenant_id, 'booking_link.sent', 'message', 'message', NEW.id,
            jsonb_build_object('channel', NEW.channel, 'sender', NEW.sender));
  end if;
  return null;
exception when others then
  raise warning 'messages_note_booking_link: %', sqlerrm;
  return null;
end $$;

revoke all on function public.messages_note_booking_link() from public, anon, authenticated;
comment on function public.messages_note_booking_link() is
  'Writes booking_link.sent { channel, sender } when an outbound chat message has left carrying the workspace''s booking link (K7), once: when its row becomes sent. Never fails the message''s writer: a failure is a warning.';

create or replace trigger messages_note_booking_link after insert on public.messages
  for each row
  when (new.direction = 'outbound' and new.status = 'sent' and new.channel in ('whatsapp', 'sms')
        and not public.automated_send(new.meta)
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_booking_link();

-- Only the move into sent: the old row is asked too, so a delivered, a read and a receipt that says sent again write nothing.
create or replace trigger messages_note_booking_link_on_send after update of status on public.messages
  for each row
  when (new.direction = 'outbound' and new.status = 'sent' and old.status is distinct from 'sent'
        and new.channel in ('whatsapp', 'sms') and not public.automated_send(new.meta)
        and coalesce(new.meta ->> 'backfill', 'false') <> 'true')
  execute function public.messages_note_booking_link();
