-- 00633 · The database's own sentences say today's words.
--
-- docs/words.md: a campaign is a campaign (never a sequence), cold email is cold email, and a problem says couldn't. The
-- app's pages say so since expectmeout/chanlytics-os#2351 and #2358; three sentences the database says itself kept the
-- old words, because the app reads two of them back to know a refusal, and a database test holds each to the app's.
--
--   reach_out_send_decide      as 00545 wrote it, but its Rewrite refusal for an email its owner wrote says "Use the
--                              campaign's words first" (was "the sequence's").
--   sequence_create_leads      as 00585 wrote it, but with no mailbox it refuses in New's words today: "Connect your
--                              mailbox first: cold email sends from your own address" (was "a sequence to leads").
--   booking_request_answer     as 00443 wrote it, but the hold it leaves when no words came from the page says
--                              "Couldn't book …" (was "Could not book …"), as the page's own words do.
--
-- No table, no column, no grant changes: each function is re-made in place, its privileges and comment kept.
--
-- Deploy order: either. The app reads the database's Rewrite refusal by its words and knows the old sentence and the new
-- (contracts reachOutRefusalWords), the app refuses a missing mailbox itself before the database does, and the
-- booking hold's words come from the page whenever the page sends them.

set local lock_timeout = '3s';

create or replace function public.reach_out_send_decide(p_send_id uuid, p_decision text, p_change text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
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
  return jsonb_build_object('send_id', p_send_id, 'decision', p_decision);
end $$;

create or replace function public.sequence_create_leads(p_tenant_id uuid, p_first jsonb, p_start boolean, p_decision jsonb,
                                                        p_via text, p_undo_of uuid) returns jsonb
  language plpgsql security definer
  set search_path to 'public'
  as $$
declare
  v_actor   uuid := auth.uid();
  v_name    text := left(btrim(coalesce(p_first->>'name', '')), 80);
  v_from    uuid := nullif(p_first->>'from', '')::uuid;
  v_list    uuid := nullif(p_first->>'list_id', '')::uuid;
  v_source  uuid := nullif(p_first->>'source_search_id', '')::uuid;
  v_aim     uuid := nullif(p_first->>'aim_search_id', '')::uuid;
  v_search  uuid := nullif(p_first->>'search_id', '')::uuid;
  v_leads   uuid[] := coalesce(array(select x::uuid from jsonb_array_elements_text(coalesce(p_first->'lead_ids', '[]'::jsonb)) x), '{}');
  v_boxes   uuid[];
  v_chain   jsonb;
  v_made    jsonb;
  v_saved   jsonb;
  v_root    uuid;
  v_n       int;
  v_counted int := 0;
  v_left    jsonb := '{}'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'A sequence is named.' using errcode = '22023';
  end if;
  if v_source is not null and exists (select 1 from public.sequence_steps r where r.source_search_id = v_source) then
    raise exception 'Another sequence adds from that search already.' using errcode = '23505';
  end if;
  -- Cold email sends from a mailbox (00585, decision 0116): never handed to the owner to send by hand, and never made
  -- with none connected, whichever way in. The app says why first, in the words of what is true (contracts
  -- coldEmailCannotSendWhy); these are its words for none at all.
  if coalesce((p_first->>'owner_sends')::boolean, false) then
    raise exception 'Chanlytics sends cold email from your mailbox, so sending each by hand isn''t offered.'
      using errcode = '22023';
  end if;
  -- Sent from the workspace's connected mailboxes whose SPF and DKIM are not missing (00492, decision 0077), else from
  -- every connected one.
  select coalesce(array_agg(c.id order by c.created_at), '{}') into v_boxes
    from public.mailbox_connections c
   where c.tenant_id = p_tenant_id and c.state = 'connected'
     and coalesce(c.dns->>'spf', '') <> 'missing' and coalesce(c.dns->>'dkim', '') <> 'missing';
  if cardinality(v_boxes) = 0 then
    select coalesce(array_agg(c.id order by c.created_at), '{}') into v_boxes
      from public.mailbox_connections c where c.tenant_id = p_tenant_id and c.state = 'connected';
  end if;
  if cardinality(v_boxes) = 0 then
    raise exception 'Connect your mailbox first: cold email sends from your own address. Settings › Cold email has the way.'
      using errcode = '22023';
  end if;
  if v_from is not null then
    v_chain := public.reach_out_chain_of(p_tenant_id, v_from);
    if v_chain is null then
      raise exception 'Sequence not found.' using errcode = 'P0002';
    end if;
    -- A copy of one its owner sent by hand sends from the mailboxes, as every new one does.
    if coalesce((v_chain->>'owner_sends')::boolean, false) then
      v_chain := v_chain || jsonb_build_object('owner_sends', false, 'mailbox_ids', to_jsonb(v_boxes));
    end if;
  else
    v_chain := jsonb_build_object(
      'gap_minutes', 20,
      'mailbox_ids', to_jsonb(v_boxes),
      'owner_sends', false,
      'steps', case when jsonb_typeof(p_first->'steps') = 'array' and jsonb_array_length(p_first->'steps') > 0
                    then p_first->'steps'
                    else jsonb_build_array(jsonb_build_object('subject', '', 'body', '')) end);
  end if;
  -- A search's ready leads, copied to its list where it does not add from the search (00465): each the search counted
  -- and qualified, not taken out, not put off.
  if v_list is null and cardinality(v_leads) = 0 and v_search is not null and v_source is null then
    v_leads := coalesce(array(
      select m.lead_id from public.lead_search_members m
        join public.lead_searches s on s.id = m.search_id
       where m.search_id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null
         and m.class = 'qualified' and m.counted and m.blanked_at is null and m.later_at is null
       order by m.lead_id), '{}');
  end if;
  if v_list is null then
    if cardinality(v_leads) > 0 then
      v_made := public.lead_search_choose(p_tenant_id, v_name, v_leads);
      if v_made ? 'error' then
        raise exception '%', v_made->>'sentence' using errcode = '22023';
      end if;
      v_list := (v_made->>'search_id')::uuid;
      v_counted := coalesce((v_made->>'counted')::int, 0);
      v_left := coalesce(v_made->'left_out', '{}'::jsonb);
    else
      v_list := public.reach_out_list_for(p_tenant_id, v_name, v_actor);
    end if;
  elsif not exists (select 1 from public.lead_searches s where s.id = v_list and s.tenant_id = p_tenant_id
                       and s.removed_at is null and s.via in ('chosen', 'import')) then
    raise exception 'List not found.' using errcode = 'P0002';
  end if;
  v_saved := public.reach_out_save(p_tenant_id, v_actor,
               v_chain || jsonb_build_object('search_id', v_list, 'name', v_name));
  v_root := (v_saved->>'root_id')::uuid;
  v_n := jsonb_array_length(v_saved->'step_ids');
  update public.sequence_steps
     set state = case when p_start then 'running' else 'paused' end, source_search_id = v_source
   where id = v_root;
  if not p_start then
    update public.sequences set state = 'draft' where id = v_root;
  end if;
  -- How its batches are decided, where New chose (00465): never on its own, which the table refuses.
  if p_first->>'mode' in ('veto', 'ask') then
    update public.sequences set mode = p_first->>'mode' where id = v_root;
  end if;
  if v_aim is not null then
    update public.lead_searches set adds_to = v_root
     where id = v_aim and tenant_id = p_tenant_id and removed_at is null;
  end if;
  return jsonb_build_object('id', v_root, 'steps', v_n, 'state', case when p_start then 'on' else 'draft' end,
                            'list_id', v_list, 'added', v_counted, 'left_out', v_left)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_root, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('steps', v_n, 'started', p_start, 'starts', 'leads'),
         p_via, p_undo_of);
end $$;

create or replace function public.booking_request_answer(
  p_appointment_id uuid,
  p_booked boolean,
  p_via text default null,
  p_reply_words text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_row      public.appointments%rowtype;
  v_handed   jsonb;
  v_words    text;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule): the answer is theirs.
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_booked is null then
    raise exception 'booking_request_answer: booked, or not' using errcode = '22004';
  end if;
  select * into v_row from public.appointments where id = p_appointment_id for update;
  -- One the caller does not act in is one they cannot see: a stranger learns nothing.
  if not found or not public.is_acting_member(v_row.tenant_id) then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if v_row.source <> 'receptionist' then
    return jsonb_build_object('error', 'not_a_request');
  end if;
  if v_row.status <> 'proposed' then
    return jsonb_build_object('error', 'answered', 'status', v_row.status);
  end if;
  -- Past its expiry the request took no slot, so its time may have gone to someone else: it is not booked blind. Can't
  -- still answers it.
  if p_booked and v_row.expires_at is not null and v_row.expires_at <= now() then
    return jsonb_build_object('error', 'expired');
  end if;
  -- A booking no longer expires: it stands on the board until a member says what became of it.
  update public.appointments set status = case when p_booked then 'booked' else 'cancelled' end,
                                 expires_at = case when p_booked then null else expires_at end
   where id = v_row.id;
  if v_row.conversation_id is not null then
    if p_booked then
      -- Booked: the thread goes back to the receptionist through the hand-back door (00386), which resolves its hold as
      -- the member's decision; a booked visit is then the receptionist's to speak of, as any other is.
      if exists (select 1 from public.escalations e
                  where e.tenant_id = v_row.tenant_id and e.conversation_id = v_row.conversation_id
                    and e.state = 'open' and e.reason = 'booking_request') then
        v_handed := public.conversation_hand_back(v_row.tenant_id, v_row.conversation_id, p_via, null);
      end if;
    elsif exists (select 1 from public.escalations e
                   where e.tenant_id = v_row.tenant_id and e.conversation_id = v_row.conversation_id
                     and e.state = 'open' and e.reason = 'booking_request') then
      -- The line the dashboard words (contracts), else the time and the service as they stand.
      v_words := coalesce(nullif(btrim(coalesce(p_reply_words, '')), ''),
                          'Couldn''t book '
                          || to_char(v_row.starts_at at time zone v_row.timezone, 'Dy FMDD Mon, FMHH12:MI AM')
                          || coalesce(' · ' || v_row.service, '') || ': reply to them');
      perform public.escalation_open(v_row.tenant_id, v_row.conversation_id, 'booking_reply', v_words);
    end if;
  end if;
  return jsonb_build_object('appointment', jsonb_build_object('id', v_row.id,
                                                              'status', case when p_booked then 'booked' else 'cancelled' end),
                            'hold', case when coalesce((v_handed ->> 'resolved_escalations')::int, 0) > 0 then 'resolved'
                                         when not p_booked and v_words is not null then 'reply' end)
      || public.team_decision(v_row.tenant_id, v_actor, 'appointment', v_row.id, 'answer_booking_request',
                              jsonb_build_object('booked', p_booked, 'starts_at', v_row.starts_at,
                                                 'contact_id', v_row.contact_id, 'service', v_row.service),
                              p_via, null);
end $$;
