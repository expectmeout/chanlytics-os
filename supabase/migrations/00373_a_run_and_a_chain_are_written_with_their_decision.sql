-- 00373 · A run is assembled with its decision, and a chain is started with its decision.
--
-- Two writes the pattern of 00353 to 00357 had not reached: a change on the service role's door, then the route's own
-- line in the ledger, each a write of its own.
--
--   a broadcast     assemble_broadcast (00282, 00298) wrote the run, its people and its send job whole, and the route
--                   wrote the send_broadcast decision after it. A decision that failed answered 500 for a run that had
--                   landed, and the route lets the request's Idempotency-Key go when a write fails, so pressing Send
--                   again made a second run to the whole audience. A playbook's run had the same shape on the edge: the
--                   sweep's or the person's decision inserted after the door, a failure reported as a run that failed.
--   a reach-out     reach_out_save (00211, 00228) wrote the chain whole, and the route wrote the start_playbook
--                   decision after it, then asked the edge to run its first step. A decision that failed left a chain
--                   with nothing in the ledger saying who started it, and a 500 the person answers by saving again.
--
--   assemble_broadcast(tenant, run, people, decision, send_at, actor, via, undo_of)
--                   00282's door with its decision: the four-argument door is called whole (the run, its people and
--                   its job, every rule it keeps), then the send_broadcast decision on the run is written in the same
--                   transaction, as the member's (p_actor: the composer, a Run now; team_decision, 00277) or the
--                   system's (p_actor null: the sweep's, under the mode the owner chose). All or none. Answers the
--                   run's id with decision_id and undo_dropped; the id alone when p_decision is null, for a run that
--                   waits for a person, whose approval is its decision (approve_broadcast, 00353).
--   reach_out_save(tenant, user, chain, decision, via, undo_of)
--                   00228's door with its decision: the three-argument door is called whole (who may, the chain's
--                   shape, every rule it keeps), then the start_playbook decision on the chain's root is written as
--                   the member's, in the same transaction. A chain is started once: a decision given with an edit
--                   (a root_id named) is refused, and the edit writes none.
--
--   team_decision   00277's writer of a member's line, asked again: an undo link is kept only when it names a decision of
--                   the same workspace. It kept any decision that existed, and decisions_undo_of_same_workspace (00358)
--                   then refused the whole write, so a link to another workspace's line failed the run or the chain
--                   it rode with; the dashboard's own writer had dropped the link and gone on (undo_dropped).
--
-- The run's door is the service role's, so it asks itself what the session's insert policy on decisions asked before:
-- the member it writes for (p_actor) is a member of this workspace, or nothing is written (P0002). The route's own role
-- check stays the door in front of it; this is the floor under it.
--
-- The four- and three-argument doors stay as they are, and each is the other's body: a dashboard or an edge deployed
-- before this migration calls them as it did and writes its decision after, as it did. PostgREST picks a door by the
-- argument names a call gives, and the new doors need p_decision, which no call from before sends.
--
-- Deploy order: this migration first. An app that calls a door the database does not hold answers the write with an
-- error and changes nothing. Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------ the run, with its decision -- */

create or replace function public.assemble_broadcast(
  p_tenant uuid,
  p_run jsonb,
  p_recipients jsonb,
  p_decision jsonb,
  p_send_at timestamptz default null,
  p_actor uuid default null,
  p_via text default null,
  p_undo_of uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_decision uuid;
begin
  if p_decision is not null and jsonb_typeof(p_decision) <> 'object' then
    raise exception 'assemble_broadcast: a decision is an object' using errcode = '22023';
  end if;
  -- The member the line is written for is one of this workspace's, asked before anything is written: the floor the
  -- session's insert policy on decisions was when the route wrote the line itself.
  if p_decision is not null and p_actor is not null
     and not exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = p_actor) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- The run, its people and its job: 00282's door, every rule it keeps asked there, and nothing written when it refuses.
  v_id := public.assemble_broadcast(
    p_tenant => p_tenant, p_run => p_run, p_recipients => p_recipients, p_send_at => p_send_at);
  if p_decision is null then
    return jsonb_build_object('id', v_id);
  end if;
  -- The system's decision: the sweep's run, under the mode the owner chose. No person, so no undo link.
  if p_actor is null then
    insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
    values (p_tenant, 'broadcast', v_id, 'send_broadcast', 'system', null,
            p_decision || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end)
    returning id into v_decision;
    return jsonb_build_object('id', v_id, 'decision_id', v_decision, 'undo_dropped', false);
  end if;
  -- The member's: the person the service role acts for, named by the caller after its own role check.
  return jsonb_build_object('id', v_id)
      || public.team_decision(p_tenant, p_actor, 'broadcast', v_id, 'send_broadcast', p_decision, p_via, p_undo_of);
end $$;

revoke all on function public.assemble_broadcast(uuid, jsonb, jsonb, jsonb, timestamptz, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assemble_broadcast(uuid, jsonb, jsonb, jsonb, timestamptz, uuid, text, uuid)
  to service_role;
comment on function public.assemble_broadcast(uuid, jsonb, jsonb, jsonb, timestamptz, uuid, text, uuid) is
  'A broadcast''s run, its people, its send job (when p_send_at is set) and the send_broadcast decision on it, in one transaction (00373): 00282''s door called whole, then the decision as the member''s (p_actor, the person the caller acts for) or the system''s (p_actor null, the sweep''s). The service role''s alone. Returns {id, decision_id, undo_dropped}; {id} alone when p_decision is null (a run that waits for a person: its approval is its decision, 00353).';

/* ------------------------------------------------------ a member's line, its undo link this workspace's -- */

create or replace function public.team_decision(
  p_tenant_id uuid,
  p_actor uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_verb text,
  p_payload jsonb,
  p_via text,
  p_undo_of uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_undo uuid := p_undo_of;
  v_id   uuid;
begin
  -- A link names a line of this workspace, or it is dropped and the write goes on (undo_dropped): never one that
  -- fails the line, and the change it rides with, on the same-workspace key.
  if v_undo is not null
     and not exists (select 1 from public.decisions d where d.id = v_undo and d.tenant_id = p_tenant_id) then
    v_undo := null;
  end if;
  insert into public.decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload, undo_of)
  values (p_tenant_id, p_subject_type, p_subject_id, p_verb, 'user', p_actor,
          coalesce(p_payload, '{}'::jsonb)
            || case when p_via is null then '{}'::jsonb else jsonb_build_object('via', p_via) end,
          v_undo)
  returning id into v_id;
  return jsonb_build_object('decision_id', v_id, 'undo_dropped', p_undo_of is not null and v_undo is null);
end $$;
revoke all on function public.team_decision(uuid, uuid, text, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.team_decision(uuid, uuid, text, uuid, text, jsonb, text, uuid) to service_role;

/* ------------------------------------------------------ the chain, with its decision -- */

create or replace function public.reach_out_save(
  p_tenant_id uuid,
  p_user_id uuid,
  p_chain jsonb,
  p_decision jsonb,
  p_via text default null,
  p_undo_of uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved jsonb;
begin
  if p_decision is not null and jsonb_typeof(p_decision) <> 'object' then
    raise exception 'reach_out_save: a decision is an object' using errcode = '22023';
  end if;
  -- A chain is started once, when it is first saved; an edit records no start (its event is the route's).
  if p_decision is not null and nullif(p_chain->>'root_id', '') is not null then
    raise exception 'reach_out_save: a chain is started once; an edit records no start' using errcode = '22023';
  end if;
  -- The chain, whole: 00228's door, every rule it keeps asked there (who may, the steps' places, what a dropped step
  -- takes with it), and nothing written when it refuses.
  v_saved := public.reach_out_save(p_tenant_id => p_tenant_id, p_user_id => p_user_id, p_chain => p_chain);
  if p_decision is null then
    return v_saved;
  end if;
  -- The door let them past, so the member may act here: the start is theirs.
  return v_saved
      || public.team_decision(p_tenant_id, p_user_id, 'playbook', (v_saved->>'root_id')::uuid, 'start_playbook',
                              p_decision, p_via, p_undo_of);
end $$;

revoke all on function public.reach_out_save(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_save(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;
comment on function public.reach_out_save(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A reach-out chain saved whole and, when it is new, the start_playbook decision on its root as the member''s (p_user_id), in one transaction (00373): 00228''s door called whole, then team_decision. A decision given with an edit (a root_id named) is refused: a chain is started once. The service role''s alone. Returns what the door returns, with decision_id and undo_dropped when a decision was written.';
