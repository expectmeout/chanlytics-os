-- 00387 · A queued message is withdrawn by one door.
--
-- Withdrawing a queued message was written in nine places, each its own way: the reply path's withdrawal of the
-- receptionist's drafts (the dashboard), a member's call-back of a send in its grace (the dashboard), the reply's own
-- row when its job could not be scheduled (the dashboard), the edge's pause on a handoff (packages/db ingest), a
-- rewrite retiring the draft it replaces (the edge's steer), a draft whose job could not be scheduled (the edge's draft
-- queue), a reach-out email taken back (packages/db reach-out), the take-over (00386), and a newer message taking the
-- thread's reply turn from an older one's held drafts (claim_reply_turn, 00362). Each kept the rule its own
-- way: some asked that no run had claimed the row (sending_at, 00352) and some did not; some took the send job with
-- the row, on a second client, and some left the job to find its row canceled. One rule now, in one place:
--
--   withdraw_queued(tenant, ids, reason)
--       Each named message of the workspace that is still queued and that no run has claimed (sending_at null) is
--       canceled, with the reason on its row when one is given (null leaves the row's error as it was: a member's
--       call-back writes none), and the outbound_send job that would send it is canceled with it, in one transaction.
--       Answers the ids withdrawn: a row on its way, or gone, is left to its run and not among them. The service
--       role's.
--   withdraw_ai_drafts(tenant, conversation, reason, keep)
--       The receptionist's queued drafts on a thread, all but the one named to keep (the holding message a handoff
--       queues in the same breath), through withdraw_queued. The service role's.
--   member_withdraw_drafts(tenant, conversation)
--       The same on a member's own session (an owner or an operator, or a partner whose session showed its second
--       factor), as a reply withdraws the drafts its words replace: superseded_by_human. Answers how many.
--   member_withdraw_message(tenant, message, reason)
--       One message on a member's own session: the reply's own row when its job could not be scheduled.
--   message_call_back(tenant, message, via, undo_of)
--       A member's call-back of a send in its grace: the withdrawal and the cancel_send decision as theirs, in one
--       transaction (member_decision, 00357). Null when the message was no longer withdrawable (sent, claimed, gone),
--       and then nothing was written.
--
-- conversation_take_over (00386) and claim_reply_turn (00284, 00362) withdraw through it now, each re-created whole
-- with that one block changed: nine writers were one rule's, and are one door's. A member's session still may not touch jobs: the doors are definers, each with its own floor.
--
-- Deploy order: this migration first. An app that calls a door the database does not hold answers the act with an
-- error and changes nothing. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- the one rule */

create or replace function public.withdraw_queued(p_tenant_id uuid, p_message_ids uuid[], p_reason jsonb default null)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if p_tenant_id is null then
    raise exception 'withdraw_queued: a message is withdrawn in a workspace' using errcode = '22004';
  end if;
  if p_reason is not null and (jsonb_typeof(p_reason) <> 'object' or nullif(p_reason->>'reason', '') is null) then
    raise exception 'withdraw_queued: a reason is an object that names its reason' using errcode = '22023';
  end if;
  -- The rows, then the jobs that would send them, in this one statement: a row a run has claimed is on its way and is
  -- left to say what became of it, and its job with it.
  with withdrawn as (
    update public.messages m
       set status = 'canceled', error = coalesce(p_reason, m.error)
     where m.tenant_id = p_tenant_id and m.id = any (coalesce(p_message_ids, '{}'::uuid[]))
       and m.status = 'queued' and m.sending_at is null
    returning m.id
  ), jobs_withdrawn as (
    update public.jobs j
       set state = 'canceled'
      from withdrawn w
     where j.tenant_id = p_tenant_id and j.kind = 'outbound_send' and j.state = 'scheduled'
       and j.payload ->> 'message_id' = w.id::text
    returning j.id
  )
  select coalesce(array_agg(w.id order by w.id), '{}'::uuid[]) into v_ids from withdrawn w;
  return v_ids;
end $$;

revoke all on function public.withdraw_queued(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.withdraw_queued(uuid, uuid[], jsonb) to service_role;
comment on function public.withdraw_queued(uuid, uuid[], jsonb) is
  'The one door a queued message is withdrawn by (00387): each named message of the workspace still queued and claimed by no run (sending_at null) canceled, with the reason on its row when one is given, and the outbound_send job that would send it canceled with it, in one transaction. Answers the ids withdrawn; a row on its way or gone is left to its run. The service role''s.';

create or replace function public.withdraw_ai_drafts(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_reason jsonb,
  p_keep_message_id uuid default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.withdraw_queued(
    p_tenant_id,
    array(select m.id from public.messages m
           where m.tenant_id = p_tenant_id and m.conversation_id = p_conversation_id
             and m.sender = 'ai' and m.status = 'queued' and m.sending_at is null
             and m.id is distinct from p_keep_message_id),
    p_reason);
end $$;

revoke all on function public.withdraw_ai_drafts(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.withdraw_ai_drafts(uuid, uuid, jsonb, uuid) to service_role;
comment on function public.withdraw_ai_drafts(uuid, uuid, jsonb, uuid) is
  'The receptionist''s queued drafts on a thread withdrawn with their send jobs, all but p_keep_message_id, through withdraw_queued (00387). The service role''s.';

/* ------------------------------------------------------------------------------------- on a member's session */

create or replace function public.member_withdraw_drafts(p_tenant_id uuid, p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return cardinality(public.withdraw_ai_drafts(p_tenant_id, p_conversation_id,
                                               '{"reason": "superseded_by_human"}'::jsonb));
end $$;

revoke all on function public.member_withdraw_drafts(uuid, uuid) from public, anon;
grant execute on function public.member_withdraw_drafts(uuid, uuid) to authenticated, service_role;
comment on function public.member_withdraw_drafts(uuid, uuid) is
  'A member withdraws the receptionist''s queued drafts on a thread, on their own session (00387): an owner or an operator, or a partner whose session showed its second factor. superseded_by_human, through withdraw_ai_drafts. Answers how many.';

create or replace function public.member_withdraw_message(p_tenant_id uuid, p_message_id uuid, p_reason jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return cardinality(public.withdraw_queued(p_tenant_id, array[p_message_id], p_reason)) > 0;
end $$;

revoke all on function public.member_withdraw_message(uuid, uuid, jsonb) from public, anon;
grant execute on function public.member_withdraw_message(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.member_withdraw_message(uuid, uuid, jsonb) is
  'A member withdraws one queued message of the workspace, on their own session (00387), through withdraw_queued: the reply''s own row when its send job could not be scheduled. True when it was withdrawn.';

create or replace function public.message_call_back(
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
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- The withdrawal, as a call-back has always written it (no reason on the row), and nothing when it was too late.
  if cardinality(public.withdraw_queued(p_tenant_id, array[p_message_id], null)) = 0 then
    return null;
  end if;
  -- The ledger's line as the member's own, in the same transaction.
  return public.member_decision(p_tenant_id, 'message', p_message_id, 'cancel_send', '{}'::jsonb, p_via, p_undo_of);
end $$;

revoke all on function public.message_call_back(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.message_call_back(uuid, uuid, text, uuid) to authenticated, service_role;
comment on function public.message_call_back(uuid, uuid, text, uuid) is
  'A member calls back a send in its grace (00387): the message withdrawn with its send job through withdraw_queued, and the cancel_send decision as the member''s own, in one transaction. Null when it was too late (sent, claimed, gone), with nothing written. Returns decision_id and undo_dropped.';

/* ------------------------------------------------------------------------------------- the take-over, through it */

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
  v_seconds := least(86400, greatest(1, round(extract(epoch from (p_paused_until - now())))))::integer;
  v_hold := public.claim_conversation_control(p_tenant_id, p_conversation_id, 'person', v_actor, null, v_seconds);
  if v_hold not in ('claimed', 'renewed') then
    raise exception 'conversation_take_over: the hold on % answered %', p_conversation_id, v_hold using errcode = 'XX000';
  end if;
  -- 3. The receptionist's held drafts withdrawn with their send jobs, through the one door (withdraw_ai_drafts): a held
  --    reply must not land after a person has taken the thread. Only the receptionist's, and only one no run has
  --    claimed: a claimed draft may be at the provider, and its run settles it. A colleague's queued words, and the
  --    job behind them, are left alone.
  v_withdrawn := cardinality(public.withdraw_ai_drafts(p_tenant_id, p_conversation_id,
                                                       '{"reason": "superseded_by_human"}'::jsonb));
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
  'A member takes a thread over, as themselves (an owner, an operator, or a partner whose session showed its second factor), in one transaction (00386; its drafts through withdraw_ai_drafts since 00387): the claim (needs_human, paused until p_paused_until, the snooze cleared, theirs), the live hold on who is speaking (claim_conversation_control, at most a day), the receptionist''s queued drafts on the thread withdrawn with their outbound_send jobs, and the take_over decision recorded as theirs. Returns claimed, paused_until, withdrawn_drafts, decision_id and undo_dropped; null when no thread of the workspace''s answered, with nothing written. How long the pause is stays core''s (takeOver).';

/* -------------------------------------------------------------------------- an older turn's drafts, through it */

-- claim_reply_turn (00284, 00362) withdrew an older turn's held drafts with an update of its own, and left their jobs to
-- find the rows canceled: re-created whole from 00362 with that one write through withdraw_queued.
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
  -- Through the one door (00387), with the job that would send each.
  perform public.withdraw_queued(
    p_tenant,
    array(select d.id from public.messages d
           where d.conversation_id = p_conversation
             and d.tenant_id = p_tenant
             and d.direction = 'outbound'
             and d.sender = 'ai'
             and d.status = 'queued'
             and d.sending_at is null
             and d.meta->>'source' in ('veto_window', 'low_confidence')),
    jsonb_build_object('reason', 'superseded_by_newer_message', 'by', p_message));
  return true;
end $$;

revoke all on function public.claim_reply_turn(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_reply_turn(uuid, uuid, uuid) to service_role;
comment on function public.claim_reply_turn(uuid, uuid, uuid) is
  'The thread''s reply turn for this message, unless a newer message of the thread (by created_at, then id) holds it; moving the turn withdraws the receptionist''s drafts an older turn left queued, but not one a run has already claimed for the wire (00362), each with its send job through withdraw_queued (00387). True when held.';
