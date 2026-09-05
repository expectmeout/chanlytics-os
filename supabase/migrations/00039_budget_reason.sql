-- A reason for the day the receptionist stops because its tokens are spent.
--
-- policies.limits.max_llm_tokens_day (reply row; 0 or absent = off) caps a
-- workspace's model usage over a rolling 24 hours, read from the
-- usage.llm_tokens events every reply writes. Over it, the receptionist
-- stops and files an escalation exactly as it does at the reply cap — a
-- customer is never abandoned to a log line — and this is that reason.
--
-- Written with the `in (...)` form deliberately: the guard test parses only
-- that shape.

alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget'));
