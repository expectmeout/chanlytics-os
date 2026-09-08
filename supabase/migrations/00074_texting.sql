-- 00074 · texting, stage one. The saga learns a step — the Messaging Service
-- a line texts through — and the Inbox learns why a text was held before the
-- carriers approved the line. lines.messaging_service_sid has existed since
-- 00066 and is filled from here on.

alter table public.lines drop constraint if exists lines_step_check;
alter table public.lines add constraint lines_step_check
  check (step is null or step in ('subaccount', 'number', 'trunk', 'agent', 'import', 'messaging', 'channel'));

alter table public.escalations drop constraint if exists escalations_reason_check;
alter table public.escalations add constraint escalations_reason_check
  check (reason in ('human_token','non_text','refusal','rate_cap','policy_block',
                    'send_failed','deadman','brain_error','manual','opt_out',
                    'state_unavailable','stale','person_hold','budget','policy_ask',
                    'callback','paused','carriers'));
