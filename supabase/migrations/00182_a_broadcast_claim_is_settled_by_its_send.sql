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
--   the rows it left behind        a claim whose person has the run's message on their thread, sent (the test the
--                                  batch's alreadySent makes), is marked sent with that message. A claim with no
--                                  message stays what it is: nobody knows whether it went. Re-runnable.

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

with sent as (
  select distinct on (r.broadcast_id, r.contact_id)
         r.broadcast_id, r.contact_id, m.id as message_id, m.created_at
    from public.broadcast_recipients r
    join public.conversations c on c.tenant_id = r.tenant_id and c.contact_id = r.contact_id
    join public.messages m on m.tenant_id = r.tenant_id and m.conversation_id = c.id
   where r.state = 'failed' and r.reason = 'outcome_unknown'
     and m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read')
     and m.meta->>'broadcast_id' = r.broadcast_id::text
   order by r.broadcast_id, r.contact_id, m.created_at
)
update public.broadcast_recipients r
   set state = 'sent', reason = null, message_id = sent.message_id, sent_at = coalesce(r.sent_at, sent.created_at)
  from sent
 where r.broadcast_id = sent.broadcast_id and r.contact_id = sent.contact_id
   and r.state = 'failed' and r.reason = 'outcome_unknown';
