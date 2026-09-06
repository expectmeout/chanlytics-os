-- 00056 · An escalation because a class is set to "Ask me first".
--
-- The Autonomy pane's Booking and FAQ rows are consulted now: under "ask",
-- a booking or a service/pricing question is a person's to answer, and the
-- thread lands in Needs you with this reason so the Inbox can say why.

alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget','policy_ask'));
