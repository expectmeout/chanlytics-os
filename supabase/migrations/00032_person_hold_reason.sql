-- 00032 A hold the owner chose for ONE person is its own escalation reason.
--
-- The per-person receptionist mode (People → profile → "Receptionist for …",
-- migration 00029) held a message under reason 'policy_block' — the reason
-- the WORKSPACE reply setting uses — and the Inbox labelled every such
-- message "Pricing question — held by policy", with an alert email per
-- message. Neither is what happened: the owner said "I handle this person
-- myself", and the receptionist stayed out.
--
-- 'person_hold' names that. The edge writes it (apps/edge/api/whatsapp.ts),
-- the contracts label it ("You handle this person — the receptionist stays
-- out"), and it is alerted once per open hold rather than once per message.
-- Same rule as 00024: every reason must be in this CHECK or the escalation
-- insert fails and the customer's message is held with nobody told.

alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold'));
