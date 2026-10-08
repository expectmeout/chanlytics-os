-- 00353 · A run is approved in one transaction.
--
-- A run that waits for a person (pending_approval) was approved in three statements on two clients: the member's
-- session released it to `scheduled`, the service role wrote its broadcast_send job, and the session wrote the
-- decision. A job the ledger refused was compensated by putting the run back, and a put-back that failed left a run
-- that read "scheduled" with nothing to send it until the stranded-runs watchdog marked it not sent, ten minutes or
-- more on. A decision that could not be written left a run that would send with no record of who said so. The run was
-- assembled whole (assemble_broadcast, 00282); it is approved whole now.
--
--   approve_broadcast   the member's own door, on their own session: an owner or an operator (or a partner whose
--                       session showed its second factor) releases a run of their workspace that is still waiting,
--                       its send job is written when one is asked for, and the approval is recorded as theirs
--                       (team_decision, 00277), all or none. The decision's id with whether an undo link was dropped;
--                       null when the run was no longer waiting, and then nothing was written.
--
-- The rules stay core's (approveRun): the workspace's pause, the sending hours and a run approved too late are judged
-- before this is called, and `p_send_at` is the moment they chose. A reach-out's run asks for no job (`p_job` null):
-- its sends keep their own times and the reach-out clock claims them.
--
-- Deploy order: this migration first. A dashboard that calls a function the database does not hold answers the
-- approval with an error and changes nothing. Re-runnable.

create or replace function public.approve_broadcast(
  p_tenant_id uuid,
  p_broadcast_id uuid,
  p_send_at timestamptz,
  p_job jsonb,
  p_decision jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_released uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_send_at is null then
    raise exception 'approve_broadcast: a run is released for a moment' using errcode = '22004';
  end if;
  -- Only a run still waiting, and this workspace's: the row carries the time its job carries (00119). No row is a run
  -- that moved while the person looked (approved by someone else, skipped, canceled), and nothing else is written.
  update public.broadcasts
     set state = 'scheduled', scheduled_for = p_send_at
   where id = p_broadcast_id and tenant_id = p_tenant_id and state = 'pending_approval'
  returning id into v_released;
  if v_released is null then
    return null;
  end if;
  -- The send, on the ledger no session may write: what the caller carries with it (the request it was approved in)
  -- rides in the payload, and the run it sends is named here, never by the caller.
  if p_job is not null then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'broadcast_send', p_send_at,
            (case when jsonb_typeof(p_job) = 'object' then p_job else '{}'::jsonb end)
              || jsonb_build_object('broadcast_id', p_broadcast_id));
  end if;
  return public.team_decision(p_tenant_id, v_actor, 'broadcast', p_broadcast_id, 'send_broadcast',
                              coalesce(p_decision, '{}'::jsonb), p_via, p_undo_of);
end $$;

revoke execute on function public.approve_broadcast(uuid, uuid, timestamptz, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.approve_broadcast(uuid, uuid, timestamptz, jsonb, jsonb, text, uuid) to authenticated, service_role;
comment on function public.approve_broadcast(uuid, uuid, timestamptz, jsonb, jsonb, text, uuid) is
  'A member approves a run that waits for a person, as themselves (an owner, an operator, or a partner whose session showed its second factor): the run released to scheduled for p_send_at, its broadcast_send job written when p_job is given (null for a reach-out''s run, whose sends keep their own times), and the send_broadcast decision recorded as theirs, in one transaction (00353). Returns the decision''s id and whether an undo link was dropped; null when the run was no longer waiting, with nothing written. The rules (the pause, the sending hours, a run approved too late) are core''s approveRun, judged before the call.';
