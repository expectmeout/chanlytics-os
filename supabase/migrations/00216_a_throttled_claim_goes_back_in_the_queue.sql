-- 00216 · A throttled claim goes back in the queue.
--
-- The batch sender claims each person (failed, outcome_unknown) just before the wire, so a run killed mid-send never
-- sends them the template twice (00182). When WhatsApp answers "not now" -- a rate or throughput limit, channels
-- graphThrottled -- nothing was taken, and the batch now gives the person back to the queue and waits (core
-- messages/broadcast.ts). Until now it marked them failed and went on to the next, so a limit that held burned the
-- rest of the list as "WhatsApp refused" and the run still ended as sent.
--
--   broadcast_recipients_guard()   a claim may also go back to queued, once, and only as `throttled`: the release
--                                  names why, so no other writer frees a claim whose send may have gone. It still
--                                  settles to sent or skipped; every other final state stays final; a same-state
--                                  update is still not a move. Re-runnable.

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
    -- Or released, when WhatsApp refused the send as too many, too fast: nothing was taken, and the release says so.
    if OLD.state = 'failed' and OLD.reason = 'outcome_unknown' and NEW.state = 'queued' and NEW.reason = 'throttled' then
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
  'queued -> sent|skipped|failed, once; a claim (failed, outcome_unknown) -> sent|skipped, or back to queued as throttled when WhatsApp said not now; sent, skipped and other failures are final. A same-state update is not a move.';
