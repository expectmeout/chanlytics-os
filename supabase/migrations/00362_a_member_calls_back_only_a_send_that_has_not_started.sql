-- 00362 · A member calls back only a send that has not started, and nothing else of a message.
--
-- Two holes in one place, the moment a queued message is changed by anyone but the run that sends it.
--
--   A member's session could rewrite a message's status and its error. The update policy asked only that the caller
--   act in the workspace, and the session holds UPDATE on both columns; messages_guard refuses only a move backwards
--   or off a terminal state, and failed outranks every other. So a member could move a sent or delivered message to
--   failed, or blank the error of one that failed, and each of those is a number the product holds them to: the
--   month's campaign and reach-out allowances (campaign_month_sent, reach_out_month_sent) count what left, a sending
--   domain's capacity and its bounce hold (sending_domain_counts, the edge's reputationHoldOf) read failed rows by
--   their error. What the dashboard writes on a session is one move and no other (read on 9 October 2026): a queued
--   message called back as canceled, by the person's undo (cancel-send), a reply or a take-over withdrawing the
--   receptionist's held draft (with the error that says why), and a reply whose job could not be written.
--
--   A call-back raced the send. The run that sends a queued row claims it first (messages.sending_at, 00352) and
--   moves it only when the provider answers, so for those seconds it is still queued; every call-back asked only
--   `status = 'queued'` and won it. The person got the words and the row said canceled, a state messages_guard keeps
--   for ever: no provider id, no receipt to match, gone from the thread's history. claim_reply_turn (00284) withdrew
--   an older turn's draft the same way.
--
-- So a member's update takes a row that is queued and not yet claimed, and leaves it canceled: nothing else. The error
-- stays theirs to write with that move and no other. claim_reply_turn withdraws only a draft no run has claimed; a
-- claimed one is on its way and goes. A claim that is given back (the provider provably did not take it, db
-- releaseQueuedSend) is a row that can be called back again.
--
-- Either deploy order works: every move the dashboard makes on main is this one, and a call-back that now finds the
-- row claimed changes nothing and is answered as one that came too late, which main already does. Re-runnable.

set local lock_timeout = '3s';

drop policy if exists messages_acting_member_update on public.messages;
create policy messages_acting_member_update on public.messages
  for update to authenticated
  using (public.is_acting_member(tenant_id) and status = 'queued' and sending_at is null)
  with check (public.is_acting_member(tenant_id) and status = 'canceled');

create or replace function public.claim_reply_turn(p_tenant uuid, p_conversation uuid, p_message uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mine timestamptz;
  v_before uuid;
  v_held uuid;
begin
  select m.created_at into v_mine
    from public.messages m
   where m.id = p_message and m.conversation_id = p_conversation and m.tenant_id = p_tenant;
  if v_mine is null then
    raise exception 'claim_reply_turn: message % is not in thread % of workspace %', p_message, p_conversation, p_tenant;
  end if;
  -- The thread's row, locked: two claims at once are taken one after the other.
  insert into public.reply_turns (conversation_id, tenant_id, message_id)
  values (p_conversation, p_tenant, p_message)
  on conflict (conversation_id) do nothing;
  select t.message_id into v_before from public.reply_turns t where t.conversation_id = p_conversation for update;
  if v_before = p_message then
    return true;
  end if;
  update public.reply_turns t
     set message_id = p_message, claimed_at = now()
   where t.conversation_id = p_conversation
     and not exists (
       select 1 from public.messages h
        where h.id = t.message_id
          and (h.created_at, h.id) > (v_mine, p_message)
     )
  returning t.message_id into v_held;
  if v_held is null then
    return false;
  end if;
  -- The older turn's replies still waiting to go are superseded by this one. One a run has claimed is already on its
  -- way to the person (00362): it is left to say what became of it.
  update public.messages d
     set status = 'canceled', error = jsonb_build_object('reason', 'superseded_by_newer_message', 'by', p_message)
   where d.conversation_id = p_conversation
     and d.tenant_id = p_tenant
     and d.direction = 'outbound'
     and d.sender = 'ai'
     and d.status = 'queued'
     and d.sending_at is null
     and d.meta->>'source' in ('veto_window', 'low_confidence');
  return true;
end $$;

revoke all on function public.claim_reply_turn(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_reply_turn(uuid, uuid, uuid) to service_role;
comment on function public.claim_reply_turn(uuid, uuid, uuid) is
  'The thread''s reply turn for this message, unless a newer message of the thread (by created_at, then id) holds it; moving the turn withdraws the receptionist''s drafts an older turn left queued, but not one a run has already claimed for the wire (00362). True when held.';
