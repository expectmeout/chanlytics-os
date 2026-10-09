-- 00364 · A thread is taken over, and handed back, in one transaction.
--
-- A member taking a thread over was four writes on two clients: the claim on their own session (needs_human, paused
-- until, the snooze cleared, theirs), the live hold on who is speaking through the service role (claim_conversation_control,
-- 00132), the receptionist's held drafts withdrawn with their send jobs (rows on the session, jobs on the service role),
-- and the take_over decision on the session again. Handing it back was the same four the other way: the release, the
-- hold let go, the hand_back decision, and the open escalation resolved by it. Each write after the first could fail
-- with the ones before it standing. The worst of them: a hold taken and a release that then failed left the person's
-- hold on the thread for up to a day while the Inbox showed it open, and the door (core deliver.ts) refused every
-- receptionist draft meanwhile; a decision that could not be written left a thread moved with no line saying who moved
-- it, and a 500 for a move that had landed, which a person presses again.
--
--   conversation_take_over   the member's own door, on their own session: the claim as contracts' take_over move writes
--                            it, the hold as claim_conversation_control takes it for a person (never refused, at most
--                            a day, 00132), the receptionist's queued drafts on the thread withdrawn with their
--                            outbound_send jobs (rows then jobs, as the dashboard withdrew them), and the take_over
--                            decision with the moment the pause ends, all or none. Null when no thread of the
--                            workspace's answered (it moved while the person looked), and then nothing was written.
--   conversation_hand_back   the release as contracts' hand_back move writes it, this person's hold let go and nobody
--                            else's (release_conversation_control), the hand_back decision, and the open escalation
--                            resolved by it, all or none. Null when no thread answered, with nothing written.
--
-- The actor is auth.uid(), read here and never a parameter (00021's rule): an owner or an operator, or a partner whose
-- session showed its second factor (is_acting_member), which is the floor the session's own UPDATE on conversations
-- had (00014). The route's role check stays in front of it. How long the pause is stays core's (takeOver, from the
-- reply policy's pause_hours); the door takes the moment it chose.
--
-- Deploy order: this migration first. A dashboard that calls a function the database does not hold answers the
-- take-over with an error and changes nothing. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.conversation_take_over(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_paused_until timestamptz,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_claimed   uuid;
  v_seconds   integer;
  v_hold      text;
  v_withdrawn integer;
  v_until     text;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_paused_until is null then
    raise exception 'conversation_take_over: a take-over pauses the receptionist until a moment' using errcode = '22004';
  end if;
  -- 1. The claim: contracts' take_over move, from any state (conversation-moves.ts). This workspace's thread only; no
  --    row is a thread that moved while the person looked, and nothing else is written.
  update public.conversations
     set state = 'needs_human', paused_until = p_paused_until, snooze_until = null, assignee_user_id = v_actor
   where id = p_conversation_id and tenant_id = p_tenant_id
  returning id into v_claimed;
  if v_claimed is null then
    return null;
  end if;
  -- 2. Who is speaking now, before the drafts are withdrawn: the pause window is the ceiling on the hold, and a day
  --    is the ceiling on that (core PERSON_CONTROL_MAX_S; the claim door refuses more). A person takes it from
  --    anyone, so the door answers claimed or renewed; the row was just written, so never gone.
  v_seconds := least(86400, greatest(1, round(extract(epoch from (p_paused_until - now())))::integer));
  v_hold := public.claim_conversation_control(p_tenant_id, p_conversation_id, 'person', v_actor, null, v_seconds);
  if v_hold not in ('claimed', 'renewed') then
    raise exception 'conversation_take_over: the hold on % answered %', p_conversation_id, v_hold;
  end if;
  -- 3. The receptionist's held drafts withdrawn, rows then their send jobs (the dashboard's cancelPendingAiReply): a
  --    held reply must not land after a person has taken the thread. Only the receptionist's: a colleague's queued
  --    words, and the job behind them, are left alone.
  with withdrawn as (
    update public.messages
       set status = 'canceled', error = jsonb_build_object('reason', 'superseded_by_human')
     where conversation_id = p_conversation_id and tenant_id = p_tenant_id
       and status = 'queued' and sender = 'ai'
    returning id
  ), jobs_withdrawn as (
    update public.jobs j
       set state = 'canceled'
      from withdrawn w
     where j.tenant_id = p_tenant_id and j.kind = 'outbound_send' and j.state = 'scheduled'
       and j.payload ->> 'message_id' = w.id::text
    returning j.id
  )
  select count(*) into v_withdrawn from withdrawn;
  -- 4. The ledger, with the moment the pause ends as the dashboard wrote it (an ISO instant in UTC with milliseconds,
  --    what Date.toISOString() spells), so a reader of older rows reads these the same.
  v_until := to_char(p_paused_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  return jsonb_build_object('claimed', true, 'paused_until', v_until, 'withdrawn_drafts', v_withdrawn)
      || public.team_decision(p_tenant_id, v_actor, 'conversation', p_conversation_id, 'take_over',
                              jsonb_build_object('paused_until', v_until), p_via, p_undo_of);
end $$;

revoke execute on function public.conversation_take_over(uuid, uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.conversation_take_over(uuid, uuid, timestamptz, text, uuid) to authenticated, service_role;
comment on function public.conversation_take_over(uuid, uuid, timestamptz, text, uuid) is
  'A member takes a thread over, as themselves (an owner, an operator, or a partner whose session showed its second factor), in one transaction (00364): the claim (needs_human, paused until p_paused_until, the snooze cleared, theirs), the live hold on who is speaking (claim_conversation_control, at most a day), the receptionist''s queued drafts on the thread withdrawn with their outbound_send jobs, and the take_over decision recorded as theirs. Returns claimed, paused_until, withdrawn_drafts, decision_id and undo_dropped; null when no thread of the workspace''s answered, with nothing written. How long the pause is stays core''s (takeOver).';

create or replace function public.conversation_hand_back(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_released uuid;
  v_decision jsonb;
  v_resolved integer;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- 1. The release: contracts' hand_back move, from any state. No row is a thread that moved while the person looked.
  update public.conversations
     set state = 'open', paused_until = null, snooze_until = null, assignee_user_id = null
   where id = p_conversation_id and tenant_id = p_tenant_id
  returning id into v_released;
  if v_released is null then
    return null;
  end if;
  -- 2. This person's hold, let go; somebody else's is left where it is (release_conversation_control, 00132). In the
  --    same transaction as the release, so a thread is never left open with the receptionist held off it.
  perform public.release_conversation_control(p_tenant_id, p_conversation_id, 'person', v_actor, null);
  -- 3. The ledger.
  v_decision := public.team_decision(p_tenant_id, v_actor, 'conversation', p_conversation_id, 'hand_back',
                                     '{}'::jsonb, p_via, p_undo_of);
  -- 4. The open escalation resolved by this decision, when there is one (the dashboard's resolveOpenEscalation).
  update public.escalations
     set state = 'resolved', resolved_by_user_id = v_actor, decision_id = (v_decision ->> 'decision_id')::uuid
   where conversation_id = p_conversation_id and tenant_id = p_tenant_id and state = 'open';
  get diagnostics v_resolved = row_count;
  return jsonb_build_object('released', true, 'resolved_escalations', v_resolved) || v_decision;
end $$;

revoke execute on function public.conversation_hand_back(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.conversation_hand_back(uuid, uuid, text, uuid) to authenticated, service_role;
comment on function public.conversation_hand_back(uuid, uuid, text, uuid) is
  'A member hands a thread back, as themselves (an owner, an operator, or a partner whose session showed its second factor), in one transaction (00364): the release (open, nothing paused, snoozed or claimed), this person''s hold let go and nobody else''s (release_conversation_control), the hand_back decision recorded as theirs, and the open escalation resolved by it. Returns released, resolved_escalations, decision_id and undo_dropped; null when no thread of the workspace''s answered, with nothing written.';
