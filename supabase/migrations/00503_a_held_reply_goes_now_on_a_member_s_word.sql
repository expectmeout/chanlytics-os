-- A held reply goes now on a member's word (the thread canvas, 1 Nov 2026: "Send now" beside Edit and Hold under a
-- reply counting down).
--
-- A reply the receptionist holds before it sends (the veto window, draft-queue.ts) is a queued message and the
-- outbound_send job that will send it at the window's end. A member could stop it (message_call_back, 00387) and could
-- not let it go: a reply they had read and liked waited out its last minute. message_send_now brings the job that would
-- send it to now, only while the message is still queued and no run has claimed it (sending_at, 00352), and records the
-- member's approve on the message in the same transaction (member_decision, 00357). The ledger's tick (00098) finds it
-- due within seconds; nothing is sent from here. Null when there was nothing to bring forward (sent, claimed, withdrawn,
-- gone), and then nothing was written. Deploy order: this migration first; a dashboard that calls a door the database
-- does not hold answers the press with an error and changes nothing. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.message_send_now(
  p_tenant_id uuid,
  p_message_id uuid,
  p_via text default null,
  p_undo_of uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- The job that would send it, brought to now while its message is queued and claimed by no run: a row on its way is
  -- left to its run, and one withdrawn has no job left to bring.
  with due as (
    update public.jobs j
       set due_at = least(j.due_at, now()), updated_at = now()
      from public.messages m
     where m.tenant_id = p_tenant_id and m.id = p_message_id
       and m.status = 'queued' and m.sending_at is null
       and j.tenant_id = p_tenant_id and j.kind = 'outbound_send' and j.state = 'scheduled'
       and j.payload ->> 'message_id' = m.id::text
    returning j.id
  )
  select count(*) into v_jobs from due;
  if v_jobs = 0 then
    return null;
  end if;
  -- The ledger's line as the member's own: they approved these words to go.
  return public.member_decision(p_tenant_id, 'message', p_message_id, 'approve', '{}'::jsonb, p_via, p_undo_of);
end $$;

revoke all on function public.message_send_now(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.message_send_now(uuid, uuid, text, uuid) to authenticated, service_role;
comment on function public.message_send_now(uuid, uuid, text, uuid) is
  'A member lets a held reply go now (00503): the outbound_send job of a message still queued and claimed by no run brought to now, and the approve decision on the message as the member''s own, in one transaction. Null when there was nothing to bring forward (sent, claimed, withdrawn, gone), with nothing written. Returns decision_id and undo_dropped.';
