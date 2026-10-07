-- 00347 · A text is answered after its acknowledgement.
--
-- Decision 0031, Phase 2. The SMS door held Twilio's request while the receptionist answered: a model's turn can take
-- longer than the fifteen seconds Twilio waits, and a function killed mid-turn left a text nobody answered, which only
-- the deadman sweep found, three minutes later, for a person. Now the door records the text, schedules its answer as a
-- job and answers Twilio; the job takes the text up again through the whole inbound phase (apps/edge/lib/sms/
-- inbound-text.ts answerText, core answerInbound with `resume`). A runner killed mid-turn leaves the job fired with its
-- lease running out, and the claim takes it back: it answers while the message is unprocessed and no reply names it
-- (messages.meta.reply_to), so a second claim never texts twice.
--
--   inbound_answer   the job kind that carries one text's answer. Keyed 'inbound_answer:<message>' (jobs.dedupe_key,
--                    00333), so one message has one live job; its payload names the message, its thread and its person,
--                    so erase_contact cancels and scrubs one still waiting, as it does every job that names them.
--   jobs.lane        the kind runs in lane 0, a reply's: a customer is waiting for it. The column is generated, so its
--                    expression is set again with one more case (PostgreSQL 17's set expression: no column dropped).
--
-- Either deploy order: an edge before this migration has its job refused by the CHECK and answers the text in the
-- door, as before (sms_answer_unscheduled); a database before the edge holds no job of the kind. Re-runnable throughout.

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver', 'inbound_answer'));

alter table public.jobs alter column lane set expression as (
  case
    when kind = 'inbound_answer' then 0
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
);
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read), 2 bulk. Generated from kind and payload; an event_deliver runs in its subscription''s lane (payload.lane, 00334), a text''s answer in a reply''s (inbound_answer, 00347); null for a kind the case does not name, claimed last.';
