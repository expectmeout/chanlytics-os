-- 00361 · A booking tool's notice is no person's words, nor is Gmail's forwarding confirmation.
--
-- public.message_is_a_persons_words (00299) is the one statement in SQL of whether an inbound message's words are a
-- person's own, and contracts' isPersonsWords its twin in TypeScript. They drifted on 7 October (#1469, bookings by
-- email): TypeScript learned that a booking tool's notice (meta.email.claim 'booking_notice') is a program writing, and
-- SQL kept counting it, so Reports' replies (campaign_series) and People's "last wrote" (people_list, has_relationship)
-- counted a booking tool's email as a person answering while a run's card and Sent did not. Gmail asking whether it may
-- forward an account's mail ('forwarding_confirmation') is Google's mail, and neither twin said so.
--
-- The claims are declared once now, in contracts (EMAIL_CLAIMS, packages/contracts/src/conversations/message-author.ts),
-- each marked a person's words or not, and broadcasts/campaign-channels.db.test.mjs iterates that set against this
-- function, so a claim added there and not here fails. Only the body changes (language sql, immutable, search_path
-- empty), so create or replace takes it; no index, check or generated column reads it. Grants and comment restated.
--
-- Deploy order: either. After it, booking notices stop counting as replies on Reports and as a person writing on People.
-- Re-runnable.

create or replace function public.message_is_a_persons_words(p_meta jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_meta->'email'->>'claim', 'person')
         not in ('automated', 'auto_reply', 'report', 'booking_notice', 'forwarding_confirmation')
$$;
revoke execute on function public.message_is_a_persons_words(jsonb) from public, anon;
grant execute on function public.message_is_a_persons_words(jsonb) to authenticated, service_role;
comment on function public.message_is_a_persons_words(jsonb) is
  'Whether an inbound message''s words are a person''s own: false for an email the intake read as automated mail, an automatic reply, a delivery report, a booking tool''s notice or Gmail''s forwarding confirmation (meta.email.claim; contracts EMAIL_CLAIMS marks each), true for everything else, a message with no claim included. The one statement of it in SQL: has_relationship, people_list''s last_wrote_at and the campaign counts read it.';
