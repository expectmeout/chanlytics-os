-- 00718 · A member's act writes its own event (lane 9 of the code refinement plan, 25 Nov 2026: layer 10's
-- invariant 2, a fact and its event share a transaction, decision 0031).
--
-- Each door below already wrote a member's act, and the dashboard wrote the act's event after it, from TypeScript, on
-- the service role, in a second request: an act could land with no event (the second write failed, or the request
-- died between them), and the ledger said what the dashboard thought had happened rather than what the door did. Each
-- door now writes its event itself, beside the change, in the same transaction, with the kind, category, subject and
-- data the dashboard wrote, so the Activity page reads every row as before. The caller is the one signed in (auth.uid(),
-- which each of these doors already asks for).
--
--   line_forwarding_set           line.forwarding_set            the number a business keeps, set to forward
--   lead_search_rename            lead.search_renamed
--   lead_search_remove            lead.search_removed            with how many leads it kept and how many it set aside
--   person_doubt_dismiss          contact.kept_apart             once, when the pair is settled now; on the page the
--                                                                member answered from (p_contact_id, new, optional)
--   sequence_lead_words_set       reach_out.lead_words_changed
--   lead_member_keep / _exclude /  lead.kept / lead.excluded /    the member's own press on one lead; a bulk act through
--   _put_back                     lead.put_back                  lead_member_move keeps lead_bulk's own rule, one event
--                                                                for the act
--   reach_out_lead_stop           reach_out.lead_stopped         once, when the lead is stopped now
--   reach_out_send_decide         reach_out.send_decided
--   reach_out_send_said           reach_out.send_decided (skip)  a draft its owner says did not go
--   reach_out_send_rewrite_undo   reach_out.send_decided (rewrite_undone)
--   mailbox_provider_wanted (new) mailbox_connection.provider_wanted   the ask is the whole write: the door is its one
--                                                                writer, an owner's or a partner's, as its route asks
--
-- One difference, toward "a change leaves exactly one event": a press that changed nothing (a lead already stopped, a
-- pair already settled, a lead's words put back where none were typed) writes none, where the dashboard wrote one for
-- every press.
--
-- Deploy order: either. A dashboard from before this keeps writing its own event after each of these doors, so between
-- this apply and its deploy an act in those minutes leaves two rows of its kind; no subscriber reads any of these kinds
-- (event_subscriptions names none), so a second row is a second line on the Activity page and nothing more. The
-- dashboard that stops writing them calls person_doubt_dismiss with p_contact_id, which a database from before this
-- does not take: it deploys after this is applied, as the house applies a migration before its merge.
set local lock_timeout = '3s';

/* -- line_forwarding_set: line.forwarding_set -- */

create or replace function public.line_forwarding_set(p_tenant_id uuid, p_number text, p_carrier text, p_mode text, p_test_from text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_id          uuid;
  v_destination text;
  v_facts       jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_number is null or p_number !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'The number to keep must be a full number, like +13055550100.' using errcode = '22023';
  end if;
  if p_carrier is null or p_carrier not in ('verizon', 'att', 'tmobile', 'other', 'office') then
    raise exception 'Unknown carrier.' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('unanswered', 'always') then
    raise exception 'Unknown forwarding mode.' using errcode = '22023';
  end if;
  if p_test_from is not null and p_test_from !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'The phone you will test from must be a full number.' using errcode = '22023';
  end if;

  -- The receptionist's line: where the calls go. Without one there is nothing to forward to.
  select number_e164 into v_destination
    from public.tenant_channels
   where tenant_id = p_tenant_id and kind = 'voice' and status = 'active' and number_e164 is not null
   order by created_at
   limit 1;
  if v_destination is null then
    raise exception 'Your receptionist has no line to forward to yet.' using errcode = 'P0001';
  end if;
  if v_destination = p_number then
    raise exception 'That is the receptionist''s own number — forward the number you keep, not this one.' using errcode = '22023';
  end if;

  v_facts := jsonb_build_object(
    'carrier', p_carrier,
    'mode', p_mode,
    'destination_e164', v_destination,
    'test_from', p_test_from
  );

  select id into v_id from public.lines where tenant_id = p_tenant_id and kind = 'forwarded' order by created_at limit 1;
  if v_id is null then
    insert into public.lines (tenant_id, e164, kind, provider, forwarding_state, state_since, facts)
    values (p_tenant_id, p_number, 'forwarded', 'carrier', 'instructed', now(), v_facts)
    returning id into v_id;
  else
    update public.lines
       set e164 = p_number, forwarding_state = 'instructed', state_since = now(), facts = v_facts, last_error = null
     where id = v_id;
  end if;
  -- Where a business's calls go changed on a member's word: who and which calls, never the number.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'line.forwarding_set', 'setup', 'line', v_id,
          jsonb_build_object('carrier', p_carrier, 'mode', p_mode, 'by', auth.uid()));
  return v_id;
end $_$;

/* -- lead_search_rename: lead.search_renamed -- */

create or replace function public.lead_search_rename(p_search_id uuid, p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  s      public.lead_searches;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'A name is 1 to 120 characters.' using errcode = '22023';
  end if;
  select * into s from public.lead_searches where id = p_search_id;
  if not found or not public.is_acting_member(s.tenant_id) then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  update public.lead_searches set name = v_name where id = p_search_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.search_renamed', 'lead', 'lead_search', p_search_id,
          jsonb_build_object('name', v_name, 'by', v_user));
  return jsonb_build_object('search_id', p_search_id, 'name', v_name);
end $$;

/* -- lead_search_remove: lead.search_removed -- */

create or replace function public.lead_search_remove(p_search_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user  uuid := auth.uid();
  s       public.lead_searches;
  r       public.lead_rounds;
  run     record;
  v_ids   uuid[];
  v_op    uuid;
  v_kept  integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into s from public.lead_searches where id = p_search_id for update;
  if not found or not public.has_permission(v_user, s.tenant_id, 'find') then
    raise exception 'Search not found.' using errcode = 'P0002';
  end if;
  if s.removed_at is not null then
    return jsonb_build_object('error', 'removed');
  end if;
  for r in select * from public.lead_rounds where search_id = p_search_id and state <> 'ended' for update loop
    for run in select * from public.lead_runs where round_id = r.id and state in ('claimed', 'starting', 'running', 'unknown') for update loop
      update public.lead_runs set lease_gen = lease_gen + 1 where id = run.id;
      if run.state = 'running' then
        insert into public.jobs (tenant_id, kind, due_at, payload)
        values (r.tenant_id, 'lead_collect', now(), jsonb_build_object('run_id', run.id, 'seq', 'stop'))
        on conflict ((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect' and state <> 'failed' do nothing;
      end if;
    end loop;
    perform public.lead_round_end(r.id, 'stopped');
  end loop;
  -- Members whose lead is being worked (contacted, or a person now) stay;
  -- the rest of the memberships are blanked, and the operation remembers
  -- which, so Undo can bring them back.
  select coalesce(array_agg(m.lead_id), '{}') into v_ids
    from public.lead_search_members m join public.leads l on l.id = m.lead_id
   where m.search_id = p_search_id and m.blanked_at is null and l.stage not in ('nurture', 'converted');
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where search_id = p_search_id and lead_id = any (v_ids);
  update public.lead_searches set removed_at = now() where id = p_search_id;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (s.tenant_id, 'undo_search', p_search_id, v_ids, jsonb_build_object('removed_at', null), jsonb_build_object('removed_at', now()), 1, v_user)
  returning id into v_op;
  -- A search and the leads nobody worked are gone on a member's word: whose, and what it kept and set aside.
  select count(*) into v_kept from public.lead_search_members where search_id = p_search_id and blanked_at is null;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (s.tenant_id, 'lead.search_removed', 'lead', 'lead_search', p_search_id,
          jsonb_build_object('name', s.name, 'kept', v_kept, 'archived', coalesce(array_length(v_ids, 1), 0),
                             'by', v_user));
  return jsonb_build_object('op_id', v_op, 'version', 1, 'blanked', coalesce(array_length(v_ids, 1), 0));
end $$;

/* -- person_doubt_dismiss: contact.kept_apart, on the page it was answered from -- */

drop function if exists public.person_doubt_dismiss(uuid);

create or replace function public.person_doubt_dismiss(p_doubt_id uuid, p_contact_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_row  public.person_doubts%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from public.person_doubts d where d.id = p_doubt_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if v_row.settled_as = 'merged' then
    raise exception 'These two records were merged already.' using errcode = '22023';
  end if;
  if v_row.settled_at is null then
    update public.person_doubts
       set settled_at = now(), settled_as = 'not_the_same', settled_by = v_user
     where id = p_doubt_id
     returning * into v_row;
    -- The answer to "is this one person?" is a member's: on the record they answered from, either side of the pair.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_row.tenant_id, 'contact.kept_apart', 'contact', 'contact',
            case when p_contact_id in (v_row.contact_id, v_row.other_id) then p_contact_id else v_row.contact_id end,
            jsonb_build_object('by', v_user, 'doubt_id', v_row.id));
  end if;
  return jsonb_build_object('doubt_id', v_row.id, 'contact_id', v_row.contact_id, 'other_id', v_row.other_id,
                            'settled_as', v_row.settled_as, 'settled_at', v_row.settled_at);
end $$;

comment on function public.person_doubt_dismiss(uuid, uuid) is 'Not the same (decision 0034, step 4): a member settles a doubt, and the pair is never raised again by the next arrival, with its event (contact.kept_apart, 00718) on the record it was answered from (p_contact_id, either side; the doubt''s own contact where none is named). Twice is once, and writes no second event; a pair the merge settled is refused in words.';
revoke all on function public.person_doubt_dismiss(uuid, uuid) from public, anon;
grant execute on function public.person_doubt_dismiss(uuid, uuid) to authenticated, service_role;

/* -- sequence_lead_words_set: reach_out.lead_words_changed -- */

create or replace function public.sequence_lead_words_set(p_step_id uuid, p_lead_id uuid, p_subject text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_checked_words text DEFAULT NULL::text, p_needs_line boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_step public.sequence_steps%rowtype;
  v_send public.sequence_sends%rowtype;
  v_was  public.sequence_lead_words%rowtype;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_step from public.sequence_steps where id = p_step_id;
  if not found or not public.is_acting_member(v_step.tenant_id) then
    raise exception 'That step has gone.' using errcode = 'P0002';
  end if;
  if v_step.kind <> 'reach_out' or v_step.hand is not null then
    raise exception 'Only an email takes words.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.leads l
                  where l.id = p_lead_id and l.tenant_id = v_step.tenant_id
                    and l.erased_at is null and l.blanked_at is null) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  -- The lead's latest send at this step, held against a claim while its words change: a claim waits, or finds them.
  select * into v_send from public.sequence_sends s
   where s.tenant_id = v_step.tenant_id and s.lead_id = p_lead_id and s.step_id = p_step_id
   order by s.created_at desc, s.id desc
   limit 1
   for update;
  if v_send.state in ('claimed', 'queued', 'sent', 'handed') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  if v_send.state = 'drafted' then
    raise exception 'It''s yours to send now: change it in your mail app.' using errcode = '22023';
  end if;
  select * into v_was from public.sequence_lead_words w
   where w.step_id = p_step_id and w.lead_id = p_lead_id
   for update;
  if p_body is null then
    delete from public.sequence_lead_words w where w.step_id = p_step_id and w.lead_id = p_lead_id;
  else
    insert into public.sequence_lead_words as w (tenant_id, step_id, lead_id, subject, body, written_by)
    values (v_step.tenant_id, p_step_id, p_lead_id, p_subject, p_body, v_user)
    on conflict (step_id, lead_id) do update
      set subject = excluded.subject, body = excluded.body, written_by = excluded.written_by, written_at = now();
  end if;
  if v_send.state in ('planned', 'held') then
    if p_needs_line and v_send.opening is null and v_send.checked_at is not null then
      -- Checked with no line, and these words name one: back to be checked, as words changed always are (R5).
      perform public.reach_out_recheck(array[v_send.id], v_step.tenant_id);
    else
      -- A check under way read other words, and writes nothing now. One done stands: what it held about the business still
      -- holds, and a held email stays held for its owner's answer. Its mark is of these words, so the sender sends them.
      update public.sequence_sends s
         set check_gen = s.check_gen + 1, check_started_at = null,
             checked_words = case when s.checked_at is not null then p_checked_words else s.checked_words end
       where s.id = v_send.id;
    end if;
  end if;
  -- A lead's own email typed on their sheet, or the step's words put back: who, never the words. Putting back what is
  -- back changed nothing, and writes nothing.
  if p_body is not null or v_was.step_id is not null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_step.tenant_id, 'reach_out.lead_words_changed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('step_id', p_step_id, 'kept', p_body is not null, 'by', v_user));
  end if;
  return jsonb_build_object(
    'step_id', p_step_id,
    'lead_id', p_lead_id,
    'send_id', v_send.id,
    'was', case when v_was.step_id is null then null
                else jsonb_build_object('subject', v_was.subject, 'body', v_was.body) end);
end $$;

/* -- lead_member_keep: lead.kept -- */

create or replace function public.lead_member_keep(p_search_id uuid, p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_answer jsonb := public.lead_member_move(p_search_id, p_lead_id, 'keep');
begin
  -- A member's word on a place, with its operation row (lead_member_move): who, and in which search. A refusal writes
  -- nothing. lead_bulk moves many through lead_member_move and writes one event for its act, so the event is here.
  if not v_answer ? 'error' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select s.tenant_id, 'lead.kept', 'lead', 'lead', p_lead_id, jsonb_build_object('by', auth.uid(), 'search_id', p_search_id)
      from public.lead_searches s
     where s.id = p_search_id;
  end if;
  return v_answer;
end $$;

/* -- lead_member_exclude: lead.excluded -- */

create or replace function public.lead_member_exclude(p_search_id uuid, p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_answer jsonb := public.lead_member_move(p_search_id, p_lead_id, 'exclude');
begin
  -- A member's word on a place, with its operation row (lead_member_move): who, and in which search. A refusal writes
  -- nothing. lead_bulk moves many through lead_member_move and writes one event for its act, so the event is here.
  if not v_answer ? 'error' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select s.tenant_id, 'lead.excluded', 'lead', 'lead', p_lead_id, jsonb_build_object('by', auth.uid(), 'search_id', p_search_id)
      from public.lead_searches s
     where s.id = p_search_id;
  end if;
  return v_answer;
end $$;

/* -- lead_member_put_back: lead.put_back -- */

create or replace function public.lead_member_put_back(p_search_id uuid, p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_answer jsonb := public.lead_member_move(p_search_id, p_lead_id, 'put_back');
begin
  -- A member's word on a place, with its operation row (lead_member_move): who, and in which search. A refusal writes
  -- nothing. lead_bulk moves many through lead_member_move and writes one event for its act, so the event is here.
  if not v_answer ? 'error' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    select s.tenant_id, 'lead.put_back', 'lead', 'lead', p_lead_id, jsonb_build_object('by', auth.uid(), 'search_id', p_search_id)
      from public.lead_searches s
     where s.id = p_search_id;
  end if;
  return v_answer;
end $$;

/* -- reach_out_lead_stop: reach_out.lead_stopped -- */

create or replace function public.reach_out_lead_stop(p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant  uuid;
  v_lead    public.leads%rowtype;
  v_skipped int;
  v_leaving int;
  v_places  int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is first, and only then the lock: a stranger never holds another workspace's lead row.
  select l.tenant_id into v_tenant from public.leads l where l.id = p_lead_id;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id and tenant_id = v_tenant for update;
  if not found or v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id)) then
    raise exception 'Nothing has been written to them yet.' using errcode = '22023';
  end if;
  if v_lead.reach_out_stopped_at is not null then
    return jsonb_build_object('stopped', false, 'already', true, 'skipped', 0, 'leaving', 0, 'left', 0);
  end if;
  update public.leads set reach_out_stopped_at = now() where id = p_lead_id;
  -- A business stops hearing from the workspace because a member said so: who.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_lead.tenant_id, 'reach_out.lead_stopped', 'lead', 'lead', p_lead_id, jsonb_build_object('by', auth.uid()));
  with skipped as (
    update public.sequence_sends s
       set state = 'skipped', reason = 'owner_stopped'
      from public.sequence_batches b
     where s.lead_id is not null and ( b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
       and s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('planned', 'held', 'drafted'))
    returning 1
  )
  select count(*) into v_skipped from skipped;
  -- Its places end too (00455): between steps nothing was pending to skip, so a place stood in every sequence. A
  -- place with an email on its way stays until it has gone (the door refuses it by the stop, and the next step
  -- passes them over), since a leave skips what has not gone, and that email is the sender's now.
  v_places := public.sequence_enrollments_leave(
    v_lead.tenant_id,
    array(select e.id from public.sequence_enrollments e
           where e.tenant_id = v_lead.tenant_id and e.lead_id = p_lead_id and e.state = 'in'
             and not exists (select 1 from public.sequence_sends s
                              where s.tenant_id = e.tenant_id and s.sequence_id = e.sequence_id
                                and s.lead_id = p_lead_id and s.state in ('claimed', 'queued'))),
    'owner_stopped', auth.uid());
  select count(*) into v_leaving from public.sequence_sends s
   where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = p_lead_id and s.state in ('claimed', 'queued'));
  return jsonb_build_object('stopped', true, 'already', false, 'skipped', v_skipped, 'leaving', v_leaving,
                            'left', v_places);
end $$;

/* -- reach_out_send_decide: reach_out.send_decided -- */

create or replace function public.reach_out_send_decide(p_send_id uuid, p_decision text, p_change text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_send   public.sequence_sends%rowtype;
  v_run    text;
  v_change text := nullif(btrim(coalesce(p_change, '')), '');
  v_was    jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  if v_change is not null and p_decision is distinct from 'rewrite' then
    raise exception 'Only a rewrite takes words.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_change, '')) > 280 then
    raise exception 'Say it in 280 characters or fewer.' using errcode = '22023';
  end if;
  select state into v_run from public.sequence_batches where id = v_send.batch_id;
  if v_run is null or v_run not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  if v_send.state not in ('held', 'planned') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  case p_decision
    when 'include' then
      if v_send.state <> 'held' or v_send.reason = 'check_unavailable' then
        raise exception 'Only an email the check held for a reason is included.' using errcode = '22023';
      end if;
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      update public.sequence_sends
         set state = 'planned', reason = null, hold_detail = null,
             included_for = array(select distinct x from unnest(included_for || v_send.reason) x order by x)
       where sequence_sends.lead_id is not null and ( id = p_send_id);
    when 'rewrite' then
      if public.reach_out_given_up(v_send.created_at) then
        raise exception 'This email waited two weeks for your answer and was given up.' using errcode = '22023';
      end if;
      -- Words typed for this lead that hold no line have no opening to write: they are the member's (00545).
      if exists (select 1 from public.sequence_lead_words w
                  where w.step_id = v_send.step_id and w.lead_id = v_send.lead_id
                    and w.body !~* '\{\{\s*opening\s*\}\}') then
        raise exception 'You wrote this email. Use the campaign''s words first.' using errcode = '22023';
      end if;
      -- The opening it replaces, as it stood, kept once: a second press while the first is written undoes to the first.
      v_was := case
        when v_send.opening is null and v_send.rewrite_asked ? 'was' then v_send.rewrite_asked->'was'
        when v_send.opening is null then null
        else jsonb_build_object('opening', v_send.opening, 'angle', v_send.angle, 'facts_used', to_jsonb(v_send.facts_used),
                                'state', v_send.state, 'reason', v_send.reason, 'hold_detail', v_send.hold_detail,
                                'checked_at', v_send.checked_at, 'checked_words', v_send.checked_words)
      end;
      perform public.reach_out_recheck(array[p_send_id], v_send.tenant_id);
      update public.sequence_sends
         set rewrite_asked = jsonb_strip_nulls(jsonb_build_object('change', v_change, 'by', auth.uid(), 'at', now(),
                                                                  'was', v_was))
       where sequence_sends.lead_id is not null and ( id = p_send_id) and state = 'planned';
    when 'skip' then
      update public.sequence_sends set state = 'skipped', reason = 'owner_skipped' where sequence_sends.lead_id is not null and ( id = p_send_id);
    when 'not_a_fit' then
      perform public.lead_set_stage(v_send.lead_id, 'archived', 'not_a_fit',
                                    case when v_send.reason = 'chain' then 'chain' else 'other' end);
      update public.sequence_sends set state = 'skipped', reason = 'not_a_fit' where sequence_sends.lead_id is not null and ( id = p_send_id);
    else
      raise exception 'Include, rewrite, skip or not a fit.' using errcode = '22023';
  end case;
  -- What a member decided of an email the check held, on the run it belongs to.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_send.tenant_id, 'reach_out.send_decided', 'lead', 'broadcast', v_send.batch_id,
          jsonb_build_object('decision', p_decision, 'by', auth.uid()));
  return jsonb_build_object('send_id', p_send_id, 'decision', p_decision);
end $$;

/* -- reach_out_send_said: reach_out.send_decided (skip), for a draft its owner says did not go -- */

create or replace function public.reach_out_send_said(p_send_id uuid, p_outcome text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user    uuid := auth.uid();
  v_at      timestamptz := now();
  v_tenant  uuid;
  v_lead_id uuid;
  v_send    public.sequence_sends%rowtype;
  v_lead    public.leads%rowtype;
  v_to      text;
  v_since   text;
  v_person  jsonb;
  v_contact uuid;
  v_conv    uuid;
  v_msg     uuid;
  v_why     text := left(coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'owner_skipped'), 60);
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_outcome is null or p_outcome not in ('sent', 'not_sent') then
    raise exception 'Sent, or not sent.' using errcode = '22023';
  end if;
  -- Whose it is first, and only then the locks: the lead, then the send.
  select s.tenant_id, s.lead_id into v_tenant, v_lead_id from public.sequence_sends s where s.lead_id is not null and ( s.id = p_send_id);
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = v_lead_id and tenant_id = v_tenant for update;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  -- What its owner may still say: either word on a draft waiting, and Sent on one skipped since it was handed over
  -- that nobody has said went or did not.
  if not (v_send.state = 'drafted'
          or (p_outcome = 'sent' and v_send.state = 'skipped' and v_send.drafted_at is not null
              and v_send.said_at is null)) then
    return jsonb_build_object('said', false, 'state', v_send.state, 'reason', v_send.reason);
  end if;

  if p_outcome = 'not_sent' then
    update public.sequence_sends
       set state = 'skipped', reason = v_why, said_at = v_at, said_by = v_user
     where sequence_sends.lead_id is not null and ( id = p_send_id);
    -- A draft left out on its owner's word is a decision about an email of the run, as a held one's Skip is.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'reach_out.send_decided', 'lead', 'broadcast', v_send.batch_id,
            jsonb_build_object('decision', 'skip', 'by', v_user));
    return jsonb_build_object('said', true, 'state', 'skipped', 'reason', v_why);
  end if;

  v_to := nullif(lower(btrim(coalesce(v_send.draft->>'to', ''))), '');
  -- What about its lead would refuse it now (never why it was skipped: a draft given up was no refusal): said beside the
  -- record, never instead of it.
  v_since := case
    when v_lead.id is null or v_lead.erased_at is not null or v_lead.blanked_at is not null then 'lead_gone'
    when v_lead.stage not in ('ready', 'nurture') then 'lead_closed'
    when v_to is not null and public.lead_address_suppressed(v_tenant, v_to) then 'outreach_suppressed'
    when v_lead.reach_out_stopped_at is not null then 'outreach_stopped'
  end;
  if v_to is not null and v_lead.id is not null and v_lead.erased_at is null and v_lead.blanked_at is null then
    v_person := public.reach_out_person(v_tenant, v_lead.id);
    if v_person ? 'refused' then
      v_since := coalesce(v_since, v_person->>'refused');
      -- Somebody in People holds the address (the lead's own person since it closed, or a customer): the email went
      -- to them, and goes on their thread.
      select c.id into v_contact from public.contacts c
       where c.tenant_id = v_tenant and c.erased_at is null
         and (c.id = v_lead.contact_id or c.email = v_to)
       order by (c.id = v_lead.contact_id) desc
       limit 1;
      if v_contact is null then
        select i.contact_id into v_contact from public.contact_identities i
          join public.contacts c on c.id = i.contact_id and c.erased_at is null
         where i.tenant_id = v_tenant and i.channel = 'email' and i.external_id = v_to
         limit 1;
      end if;
      -- Their thread, where they have one (a customer's does): the email goes on it. With none, the send is sent alone.
      if v_contact is not null then
        select id into v_conv from public.conversations where tenant_id = v_tenant and contact_id = v_contact;
      end if;
    else
      v_contact := (v_person->>'contact_id')::uuid;
      v_conv := (v_person->>'conversation_id')::uuid;
    end if;
  end if;

  if v_conv is not null and v_send.draft is not null then
    v_msg := gen_random_uuid();
    insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body,
                                 status, meta)
    values (v_msg, v_tenant, v_conv, v_contact, 'email', 'outbound', 'human', 'text',
            coalesce(v_send.draft->>'body', ''), 'sent',
            jsonb_build_object(
              'source', 'reach_out',
              'email', jsonb_build_object('subject', v_send.draft->>'subject', 'to', jsonb_build_array(v_to),
                                          'text', v_send.draft->>'text', 'said_by', v_user, 'said_at', v_at)
                       || case when nullif(v_send.draft->>'parent_id', '') is not null
                               then jsonb_build_object('parent_id', v_send.draft->>'parent_id') else '{}'::jsonb end,
              'reach_out', jsonb_build_object('send_id', v_send.id, 'lead_id', v_send.lead_id, 'contact_id', v_contact,
                                              'playbook_id', v_send.step_id, 'root_id', v_send.sequence_id,
                                              'broadcast_id', v_send.batch_id, 'attempt', v_send.attempts)
                           || case when v_since is not null then jsonb_build_object('since', v_since)
                                   else '{}'::jsonb end));
  end if;

  -- Sent, with its email when there is one to keep; a skip's reason no longer says what it is.
  update public.sequence_sends
     set state = 'sent', sent_at = v_at, message_id = v_msg, contact_id = coalesce(v_contact, contact_id),
         reason = null, said_at = v_at, said_by = v_user
   where sequence_sends.lead_id is not null and ( id = p_send_id);

  update public.leads
     set stage = case when stage = 'ready' then 'nurture' else stage end,
         contacted_at = coalesce(contacted_at, v_at),
         last_outcome = 'emailed',
         version = version + 1
   where id = v_lead_id and tenant_id = v_tenant and erased_at is null and blanked_at is null;
  if found then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'lead.emailed', 'lead', 'lead', v_lead_id,
            jsonb_build_object('by', 'reach_out', 'send_id', v_send.id));
  end if;

  return jsonb_build_object('said', true, 'state', 'sent', 'message_id', v_msg, 'contact_id', v_contact,
                            'conversation_id', v_conv, 'since', v_since);
end $$;

/* -- reach_out_send_rewrite_undo: reach_out.send_decided (rewrite_undone) -- */

create or replace function public.reach_out_send_rewrite_undo(p_send_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_send public.sequence_sends%rowtype;
  v_run  text;
  v_was  jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  select * into v_send from public.sequence_sends where sequence_sends.lead_id is not null and ( id = p_send_id) for update;
  if not found or not public.is_acting_member(v_send.tenant_id) then
    raise exception 'Email not found.' using errcode = 'P0002';
  end if;
  select state into v_run from public.sequence_batches where id = v_send.batch_id;
  if v_run is null or v_run not in ('pending_approval', 'scheduled', 'sending') then
    raise exception 'That run is over.' using errcode = '22023';
  end if;
  if v_send.state not in ('held', 'planned') then
    raise exception 'That email has gone.' using errcode = '22023';
  end if;
  v_was := v_send.rewrite_asked->'was';
  if v_was is null or jsonb_typeof(v_was) <> 'object' or nullif(v_was->>'opening', '') is null then
    raise exception 'There is no earlier opening to put back.' using errcode = '22023';
  end if;
  -- As it stood before the press: its words, the check's reading of them and its state. The version moves on, so a
  -- check still writing the rewrite writes nothing (recordCheck writes only onto the version it read).
  update public.sequence_sends
     set opening = v_was->>'opening',
         angle = v_was->>'angle',
         facts_used = coalesce(array(select jsonb_array_elements_text(coalesce(v_was->'facts_used', '[]'::jsonb))), '{}'),
         state = case when v_was->>'state' = 'held' then 'held' else 'planned' end,
         reason = v_was->>'reason',
         hold_detail = v_was->>'hold_detail',
         checked_at = (v_was->>'checked_at')::timestamptz,
         checked_words = v_was->>'checked_words',
         check_gen = check_gen + 1, claimed_at = null, check_started_at = null, check_after = null,
         check_tries = 0, check_first_at = null,
         rewrite_asked = null
   where sequence_sends.lead_id is not null and ( id = p_send_id);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_send.tenant_id, 'reach_out.send_decided', 'lead', 'broadcast', v_send.batch_id,
          jsonb_build_object('decision', 'rewrite_undone', 'by', auth.uid()));
  return jsonb_build_object('send_id', p_send_id, 'opening', v_was->>'opening',
                            'state', case when v_was->>'state' = 'held' then 'held' else 'planned' end);
end $$;

/* -- mailbox_provider_wanted (new): mailbox_connection.provider_wanted -- */

create or replace function public.mailbox_provider_wanted(p_tenant_id uuid, p_provider text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_provider text := nullif(btrim(coalesce(p_provider, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if v_provider is null or char_length(v_provider) > 60 then
    raise exception 'Say which you use, in 60 characters or fewer.' using errcode = '22023';
  end if;
  -- Which mailbox a workspace that can't connect would use, with who asked: the ask is the whole write.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox_connection.provider_wanted', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('provider', v_provider, 'by', auth.uid()));
end $$;

comment on function public.mailbox_provider_wanted(uuid, text) is 'Cold email''s Tell us (00718): which mailbox a workspace that can''t connect one would use, kept on the ledger with who asked (mailbox_connection.provider_wanted), so Microsoft is built when the asks justify it and they can be told. An owner''s or a partner''s (permission settings), as its route asks.';
revoke all on function public.mailbox_provider_wanted(uuid, text) from public, anon;
grant execute on function public.mailbox_provider_wanted(uuid, text) to authenticated, service_role;
