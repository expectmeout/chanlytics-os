-- 00357 · A deal's record and a playbook's start are one write, each with its line in the ledger.
--
-- The last two of the four writes the 8 October architecture review named as the worst to fail half-way (a run's
-- approval is 00353, a person's consent 00356). Each was a change on the member's session and then the route's own
-- insert into `decisions`:
--
--   a deal        deal_record (00242) moved the deal and kept its stage's event in one transaction, and the decision
--                 came after it. A decision that failed left a deal moved with no line saying who moved it, and the
--                 route answered 500 for a move that had landed, which a person presses again.
--   a playbook    the row was inserted `running` and the decision came after it. A decision that failed left a
--                 playbook sending with nothing in the ledger saying who started it, and a 500 the person answers by
--                 pressing Start again: a second playbook on the same moment.
--
--   member_decision   a decision written as the caller's own: auth.uid() in a workspace they act in, never a
--                     parameter. What the session's insert policy on `decisions` already lets a member write, as a
--                     function, so a door that runs on the member's own rights can end with it. team_decision
--                     (00277) writes the row and keeps its rules (the `via`, an undo link nobody holds dropped).
--   record_deal       the member's one call for a deal: deal_record with what the caller named, then the record_deal
--                     decision as theirs, in one transaction. deal_record decides everything it decided (who may,
--                     the stage's moves, the version the page saw, what a link is); a move it refuses is answered as
--                     it answers it, and nothing is recorded.
--   start_playbook    the member's one call for a new playbook: the row, then the start_playbook decision, in one
--                     transaction. It runs on the CALLER's rights (security invoker), so the insert is judged by the
--                     table's own policy as the route's insert was (an acting member, as themselves, a moment and
--                     never a reach-out, a list and a message of the same workspace) and that rule stays written
--                     once. What a playbook may name is the route's check (checkPlaybook) before this is called.
--
-- deal_record stays as it is, and a session may still call it: a dashboard from before this migration does. Its
-- grant to `authenticated` can go once no deployed dashboard calls it.
--
-- Deploy order: this migration first. A dashboard that calls a function the database does not hold answers the write
-- with an error and changes nothing. Re-runnable.

create or replace function public.member_decision(
  p_tenant_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_verb text,
  p_payload jsonb default '{}'::jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the decision is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who the insert policy lets
  -- write a decision. A stranger learns nothing.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  return public.team_decision(p_tenant_id, v_actor, p_subject_type, p_subject_id, p_verb,
                              coalesce(p_payload, '{}'::jsonb), p_via, p_undo_of);
end $$;

revoke execute on function public.member_decision(uuid, text, uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function public.member_decision(uuid, text, uuid, text, jsonb, text, uuid) to authenticated, service_role;
comment on function public.member_decision(uuid, text, uuid, text, jsonb, text, uuid) is
  'A decision written as the caller''s own (00357): auth.uid(), in a workspace they act in. What the insert policy on decisions lets a member write, as a function, so a door on the member''s own rights can end with it in the same transaction. team_decision writes the row. Returns decision_id and undo_dropped.';

create or replace function public.record_deal(
  p_contact_id uuid,
  p_stage text,
  p_move jsonb default '{}'::jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_move   jsonb := case when jsonb_typeof(p_move) = 'object' then p_move else '{}'::jsonb end;
  v_door   jsonb;
  v_tenant uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- The door, with what the caller named and nothing it did not: a key `p_move` lacks is the null the door's own
  -- default is, so this calls it as the route did.
  v_door := public.deal_record(
    p_contact_id   => p_contact_id,
    p_stage        => p_stage,
    p_deal_id      => (v_move ->> 'deal_id')::uuid,
    p_version      => (v_move ->> 'version')::integer,
    p_service      => v_move ->> 'service',
    p_when         => (v_move ->> 'when')::timestamptz,
    p_amount_cents => (v_move ->> 'amount_cents')::integer,
    p_per          => v_move ->> 'per',
    p_note         => v_move ->> 'note',
    p_evidence     => case when jsonb_typeof(v_move -> 'evidence') = 'object' then v_move -> 'evidence' end,
    p_proposal_url => v_move ->> 'proposal_url',
    p_valid_until  => (v_move ->> 'valid_until')::date,
    p_lost_reason  => v_move ->> 'lost_reason',
    p_clear        => case when jsonb_typeof(v_move -> 'clear') = 'array'
                           then array(select jsonb_array_elements_text(v_move -> 'clear')) end
  );
  -- Refused (the door wrote nothing and says why), or an answer with no deal in it: the door's own answer, and no
  -- line for a move that did not happen.
  if v_door is null or v_door ? 'error' or jsonb_typeof(v_door -> 'deal') is distinct from 'object' then
    return v_door;
  end if;
  -- The door let them past, so the person is one of a workspace they act in.
  select c.tenant_id into v_tenant from public.contacts c where c.id = p_contact_id;
  -- The line the route used to write after the door, with the fields it wrote.
  return v_door || public.team_decision(
    v_tenant, v_actor, 'deal', (v_door -> 'deal' ->> 'id')::uuid, 'record_deal',
    jsonb_build_object('contact_id', p_contact_id, 'stage', p_stage,
                       'from', v_door -> 'from', 'service', v_door -> 'deal' -> 'service'),
    p_via, p_undo_of);
end $$;

revoke execute on function public.record_deal(uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function public.record_deal(uuid, text, jsonb, text, uuid) to authenticated, service_role;
comment on function public.record_deal(uuid, text, jsonb, text, uuid) is
  'A member records a deal and its line in the ledger together (00357): deal_record with what the caller named (p_move, by the door''s parameter names without the p_), then the record_deal decision as theirs, in one transaction. deal_record''s rules are unchanged and asked there; a move it refuses is answered as it answers it and nothing is recorded. Returns what the door returns with decision_id and undo_dropped.';

create or replace function public.start_playbook(
  p_tenant_id uuid,
  p_playbook jsonb,
  p_decision jsonb default '{}'::jsonb,
  p_via text default null,
  p_undo_of uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or jsonb_typeof(p_playbook) is distinct from 'object' then
    raise exception 'start_playbook: a playbook is named whole' using errcode = '22004';
  end if;
  -- On the caller's rights: the table's insert policy judges the row (an acting member, as themselves, a moment, a
  -- list and a message of this workspace), and its checks and unique indexes refuse what they refuse. The workspace,
  -- who made it and that it runs are said here, never by the caller; `kind` is the table's default, a moment.
  insert into public.playbooks (tenant_id, name, trigger, list_id, list_key, template_id, template_name,
                                template_language, params, policy_class, state, run_hour, cap_per_run, gap_days,
                                cadence_days, channels, created_by)
  select p_tenant_id, r.name, r.trigger, r.list_id, r.list_key, r.template_id, r.template_name,
         r.template_language, r.params, r.policy_class, 'running', r.run_hour, r.cap_per_run, r.gap_days,
         r.cadence_days, r.channels, v_actor
    from jsonb_populate_record(null::public.playbooks, p_playbook) r
  returning id into v_id;
  return jsonb_build_object('id', v_id)
      || public.member_decision(p_tenant_id, 'playbook', v_id, 'start_playbook', p_decision, p_via, p_undo_of);
end $$;

revoke execute on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) to authenticated, service_role;
comment on function public.start_playbook(uuid, jsonb, jsonb, text, uuid) is
  'A member starts a playbook and its line in the ledger together (00357): the row, running, then the start_playbook decision as theirs (member_decision), in one transaction. Security invoker: the insert is judged by the table''s own policy, checks and unique indexes, as the route''s insert was. Returns id, decision_id and undo_dropped.';
