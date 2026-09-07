-- 00062 · An escalation because a caller needs a call back.
--
-- The phone receptionist's post-call analysis says when it could not finish
-- a call and a person has to call back (outcome callback_needed, with what
-- to do in follow_up). The webhook opens an escalation with this reason and
-- pauses the thread, exactly as a WhatsApp handoff does, so the caller lands
-- on Needs you with "call back: confirm Saturday's 10:00" rather than only on
-- a call card.

alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget','policy_ask',
                    'callback'));
