-- A message that arrived too late to answer automatically is a REASON a human
-- is needed, and until now there was no way to say so.
--
-- The edge dropped anything delivered more than ten minutes late: stamped
-- processed, no reply, no escalation, nobody told. Meta redelivers undelivered
-- webhooks with backoff for days, so any outage longer than that guard turned
-- its entire redelivery backlog into customers who wrote and were never
-- answered — an ordinary failure, invisible in every dashboard signal.
--
-- The edge now answers a late message inside the reply horizon and escalates
-- beyond it. That escalation needs a reason the CHECK will accept, and
-- packages/contracts/src/enums.ts carries the same set, kept in step by
-- tooling/scripts/tests/enums-vs-checks.test.mjs.
--
-- Written with the `in (...)` form deliberately: the guard test parses only
-- that shape, and `= any (array[...])` — identical to Postgres — would make
-- this constraint invisible to it.

alter table escalations drop constraint if exists escalations_reason_check;
alter table escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale'));
