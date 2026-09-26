-- 00182 · A broadcast's claim is settled by the send it was claimed for.
--
-- The batch sender (packages/core messages/broadcast.ts) writes each person's row `failed` with reason
-- `outcome_unknown` just before the wire, so a run killed mid-send is never sent to that person twice, and a moment
-- later overwrites it with how the send went. 00116's guard made `failed` final, so that second write was refused:
-- the person was sent the message and their row kept saying nobody knows. A report then counted them failed, and the
-- touches a playbook's gap and the week's breath are judged by (sent or queued) never saw them, so the next run could
-- write to them again inside their own rules.
--
--   broadcast_recipients_guard()   a claim (failed, outcome_unknown) may still become sent or skipped, once; every
--                                  other final state stays final. A same-state update is still not a move.

set local lock_timeout = '3s';

create or replace function public.broadcast_recipients_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    -- The claim, settled: the one failed that is not a verdict.
    if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state in ('sent', 'skipped') then
      return NEW;
    end if;
    if OLD.state in ('sent', 'skipped', 'failed') then
      raise exception 'broadcast_recipients.state is terminal (% -> % refused)', OLD.state, NEW.state;
    end if;
    -- From queued the CHECK admits only sent, skipped and failed.
  end if;
  return NEW;
end $$;
comment on function public.broadcast_recipients_guard() is
  'queued -> sent|skipped|failed, once; a claim (failed, outcome_unknown) -> sent|skipped, once; sent, skipped and other failures are final. A same-state update is not a move.';
