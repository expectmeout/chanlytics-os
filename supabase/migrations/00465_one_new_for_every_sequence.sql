-- 00465 · One New for every sequence (decision 0065): a sequence or a message sent once, to people or to leads, every part
-- of it a choice, made through the doors every sequence is made by.
--
--   sequence_steps.template_or_hand   A call or a note for you may close a customer's sequence, as it closes a lead's: a
--                                     hand step on a moment's step after the first. What must still hold of someone due
--                                     it (only_if) is a moment's step's own already.
--   sequence_sends.customer_states    A customer's call or note handed to the team is 'handed', as a lead's is.
--   sequences.once                    A message sent once, kept as a draft (Ruben's pick of 20 Oct 2026): who, when, how
--                                     and its message, as New shaped them. Held on a draft that starts on a date alone.
--   sequence_create                   Takes a call or a note as the last step (p_then[].hand), and the mode New chose
--                                     (p_first.mode), which the class's Autonomy row only defaulted.
--   sequence_create_leads             Takes the mode New chose, who sends (owner_sends), and a search whose ready leads it
--                                     copies to its list when it does not add from it (search_id).
--   sequence_step_save                Adds a call or a note at the end of a customer's sequence, or changes one's words.
--   sequence_hand_run                 A customer's call or note step's run for its day, written whole. Service role.
--   sequence_once_keep                A one-off kept, or kept again, as a draft.
--   sequence_overview                 Says a kept one-off's once.
--   sequence_discard                  Lets a kept one-off go, as it lets a sequence that never sent go.
--
-- Deploy order: applied before the dashboard that sends these (the merge lands with --applied). The apps that run now
-- name none of them, so the order the apps deploy in after it does not matter. Re-runnable.

set local lock_timeout = '3s';

-- A hand step on a customer's step after the first, as on a lead's.
alter table public.sequence_steps drop constraint if exists sequence_steps_template_or_hand;
alter table public.sequence_steps add constraint sequence_steps_template_or_hand check (
  case
    when hand is null then template_id is not null and template_name is not null and template_language is not null
    else coalesce(trigger = 'after_step'
                  and template_id is null and template_name is null and template_language is null
                  and jsonb_typeof(hand) = 'object' and hand->>'kind' in ('call', 'note')
                  and jsonb_typeof(hand->'words') = 'string'
                  and char_length(btrim(hand->>'words')) between 1 and 280
                  and hand - 'kind' - 'words' = '{}'::jsonb, false)
  end);

-- A customer's call or note handed to the team.
alter table public.sequence_sends drop constraint if exists sequence_sends_customer_states;
alter table public.sequence_sends add constraint sequence_sends_customer_states check (
  lead_id is not null or state in ('queued', 'sent', 'skipped', 'failed', 'handed'));

-- A one-off kept as a draft.
alter table public.sequences add column if not exists once jsonb;
alter table public.sequences drop constraint if exists sequences_once_is_a_draft;
alter table public.sequences add constraint sequences_once_is_a_draft check (
  once is null or (starts = 'date' and state = 'draft' and jsonb_typeof(once) = 'object' and octet_length(once::text) <= 32000));
comment on column public.sequences.once is
  'A message sent once, kept as a draft (00465, decision 0065): who it goes to, when (null: now), the channels and its step as New shaped it ({who, at, channels, step}). Only on a draft that starts on a date; it sends nothing until it is sent, and goes as it is sent.';

create or replace function public.sequence_create(p_tenant_id uuid, p_first jsonb, p_then jsonb default '[]'::jsonb,
                                                   p_start boolean default false, p_decision jsonb default '{}'::jsonb,
                                                   p_via text default null, p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_then jsonb := coalesce(p_then, '[]'::jsonb);
  v_asked public.sequence_steps%rowtype;
  v_first public.sequence_steps%rowtype;
  v_t public.templates%rowtype;
  v_step jsonb;
  v_at bigint;
  v_prev uuid;
  v_n int := 1;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_first) is distinct from 'object' or jsonb_typeof(v_then) <> 'array'
     or jsonb_array_length(v_then) > 5 then
    raise exception 'sequence_create: a sequence is named whole, with five steps after its first at most'
      using errcode = '22004';
  end if;
  -- A sequence to leads (00459): the one creator makes it too, on its list, a draft until Start.
  if p_first->>'starts' = 'leads' then
    return public.sequence_create_leads(p_tenant_id, p_first, p_start, p_decision, p_via, p_undo_of);
  end if;
  if p_first->>'trigger' in ('lead_first', 'after_step') then
    raise exception 'A sequence to leads is made with starts ''leads''.' using errcode = '23514';
  end if;
  -- Each message is the workspace's own, named as its row names it, never as the body says.
  select * into v_t from public.templates
   where tenant_id = p_tenant_id and id = nullif(p_first->>'template_id', '')::uuid;
  if v_t.id is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  v_asked := jsonb_populate_record(null::public.sequence_steps, p_first);
  -- A customer's moment, made as the member: the steps' own checks, keys (a list and a message of this workspace) and
  -- unique indexes judge the rest, as the insert policy's would on the member's session. What the body leaves out is
  -- the table's own default.
  insert into public.sequence_steps (tenant_id, kind, name, trigger, list_id, list_key, template_id, template_name,
                                     template_language, params, policy_class, state, run_hour, cap_per_run, gap_days,
                                     cadence_days, channels, created_by)
  values (p_tenant_id, 'moment', v_asked.name, v_asked.trigger, v_asked.list_id, v_asked.list_key, v_t.id, v_t.name,
          v_t.language, coalesce(v_asked.params, '[]'::jsonb), v_asked.policy_class,
          case when p_start then 'running' else 'paused' end, coalesce(v_asked.run_hour, 10),
          coalesce(v_asked.cap_per_run, 25), coalesce(v_asked.gap_days, 90), coalesce(v_asked.cadence_days, 30),
          coalesce(nullif(v_asked.channels, '{}'), '{whatsapp}'), v_actor)
  returning * into v_first;
  if not p_start then
    update public.sequences set state = 'draft' where id = v_first.sequence_id;
  end if;
  -- How its batches are decided, where New chose (0064's modes): the class's Autonomy row only defaulted it.
  if p_first->>'mode' in ('auto', 'veto', 'ask') then
    update public.sequences set mode = p_first->>'mode' where id = v_first.sequence_id;
  end if;
  v_prev := v_first.id;
  for v_step, v_at in select value, ordinality from jsonb_array_elements(v_then) with ordinality loop
    if jsonb_typeof(v_step->'hand') = 'object' then
      -- A call or a note for you (00465): no message, the last step, handed to the team on its day.
      if v_at < jsonb_array_length(v_then) then
        raise exception 'A call or a note is the last step.' using errcode = '23514';
      end if;
      insert into public.sequence_steps (tenant_id, kind, name, trigger, after_step_id, after_days, only_if, hand,
                                         params, policy_class, state, run_hour, cap_per_run, channels, created_by)
      values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_prev,
              (v_step->>'after_days')::int,
              coalesce(array(select jsonb_array_elements_text(v_step->'only_if')), '{}'),
              jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', ''))),
              '[]'::jsonb, v_first.policy_class, 'running', v_first.run_hour, v_first.cap_per_run, v_first.channels,
              v_actor)
      returning id into v_prev;
    else
      select * into v_t from public.templates
       where tenant_id = p_tenant_id and id = nullif(v_step->>'template_id', '')::uuid;
      if v_t.id is null then
        raise exception 'Message not found.' using errcode = 'P0002';
      end if;
      insert into public.sequence_steps (tenant_id, kind, name, trigger, after_step_id, after_days, only_if, template_id,
                                         template_name, template_language, params, policy_class, state, run_hour,
                                         cap_per_run, channels, created_by)
      values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_prev,
              (v_step->>'after_days')::int,
              coalesce(array(select jsonb_array_elements_text(v_step->'only_if')), '{}'),
              v_t.id, v_t.name, v_t.language, coalesce(v_step->'params', '[]'::jsonb), v_first.policy_class, 'running',
              v_first.run_hour, v_first.cap_per_run,
              coalesce(nullif(array(select jsonb_array_elements_text(v_step->'channels')), '{}'), v_first.channels),
              v_actor)
      returning id into v_prev;
    end if;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('id', v_first.sequence_id, 'steps', v_n,
                            'state', case when p_start then 'on' else 'draft' end)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_first.sequence_id, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('steps', v_n, 'started', p_start), p_via, p_undo_of);
end $$;

comment on function public.sequence_create(uuid, jsonb, jsonb, boolean, jsonb, text, uuid) is
  'A new customer''s sequence made whole (0060, S4): its first step (a moment, as start_playbook takes it) and up to five steps after it, each a wait, what must still hold and a message of this workspace, or last a call or a note for the team (00465), under the first step''s class, hour and cap; how its batches are decided where New chose (p_first.mode, 00465); kept as a draft (its first step paused, the sequence ''draft'', nothing sent) or started. By an acting member; the steps'' checks and keys judge each row; the make_sequence decision rides in the same transaction. Answers id, steps and state.';

create or replace function public.sequence_create_leads(p_tenant_id uuid, p_first jsonb, p_start boolean, p_decision jsonb,
                                                         p_via text, p_undo_of uuid)
returns jsonb
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
  if v_from is not null then
    v_chain := public.reach_out_chain_of(p_tenant_id, v_from);
    if v_chain is null then
      raise exception 'Sequence not found.' using errcode = 'P0002';
    end if;
  else
    -- Sent from the workspace's connected mailboxes; with none, or where New said so, handed to the owner to send from
    -- their own inbox (00465).
    select coalesce(array_agg(c.id order by c.created_at), '{}') into v_boxes
      from public.mailbox_connections c where c.tenant_id = p_tenant_id and c.state = 'connected';
    v_chain := jsonb_build_object(
      'gap_minutes', 12,
      'mailbox_ids', to_jsonb(v_boxes),
      'owner_sends', cardinality(v_boxes) = 0 or coalesce((p_first->>'owner_sends')::boolean, false),
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

-- A member may add a call or a note at the end of a customer's sequence and change its words, on their own rights, as
-- 00442 lets them add and change a step's other columns: the steps' policies decide which rows, the shape its check.
grant insert (hand) on public.sequence_steps to authenticated;
grant update (hand) on public.sequence_steps to authenticated;

create or replace function public.sequence_step_save(p_tenant_id uuid, p_sequence_id uuid, p_step jsonb,
                                                      p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                      p_undo_of uuid default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_step jsonb := case when jsonb_typeof(p_step) = 'object' then p_step else '{}'::jsonb end;
  v_first public.sequence_steps%rowtype;
  v_last public.sequence_steps%rowtype;
  v_was public.sequence_steps%rowtype;
  v_t public.templates%rowtype;
  v_id uuid := nullif(v_step->>'id', '')::uuid;
  v_only text[] := coalesce(array(select jsonb_array_elements_text(v_step->'only_if')), '{}');
  v_channels text[] := array(select jsonb_array_elements_text(v_step->'channels'));
  v_hand jsonb := case when jsonb_typeof(v_step->'hand') = 'object'
                       then jsonb_build_object('kind', v_step->'hand'->>'kind',
                                               'words', btrim(coalesce(v_step->'hand'->>'words', '')))
                  end;
  v_out uuid;
  v_place int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_first from public.sequence_steps
   where tenant_id = p_tenant_id and id = p_sequence_id for update;
  if v_first.id is null or v_first.kind <> 'moment' then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  if v_id is null then
    select * into v_last from public.sequence_steps
     where tenant_id = p_tenant_id and sequence_id = p_sequence_id order by place desc limit 1;
    -- A call or a note is the last step (00465): nothing is added after one.
    if v_last.hand is not null then
      raise exception 'A call or a note is the last step.' using errcode = '23514';
    end if;
    if v_hand is null then
      -- Its message is the workspace's own, named as the row names it, never as the body says.
      select * into v_t from public.templates
       where tenant_id = p_tenant_id and id = nullif(v_step->>'template_id', '')::uuid;
      if v_t.id is null then
        raise exception 'Message not found.' using errcode = 'P0002';
      end if;
    end if;
    insert into public.sequence_steps (tenant_id, kind, name, trigger, after_step_id, after_days, only_if, template_id,
                                       template_name, template_language, hand, params, policy_class, state, run_hour,
                                       cap_per_run, until, channels, created_by)
    values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_last.id,
            (v_step->>'after_days')::int, v_only, v_t.id, v_t.name, v_t.language, v_hand,
            case when v_hand is null then coalesce(v_step->'params', '[]'::jsonb) else '[]'::jsonb end,
            v_first.policy_class, 'running', v_first.run_hour, v_first.cap_per_run, v_first.until,
            coalesce(nullif(v_channels, '{}'), v_first.channels), v_actor)
    returning id, place into v_out, v_place;
  else
    select * into v_was from public.sequence_steps
     where tenant_id = p_tenant_id and sequence_id = p_sequence_id and id = v_id and id <> sequence_id for update;
    if v_was.id is null then
      raise exception 'Step not found.' using errcode = 'P0002';
    end if;
    update public.sequence_steps
       set after_days = coalesce((v_step->>'after_days')::int, after_days),
           only_if = case when v_step ? 'only_if' then v_only else only_if end,
           channels = coalesce(nullif(v_channels, '{}'), channels),
           name = coalesce(nullif(btrim(v_step->>'name'), ''), name),
           params = case when hand is null then coalesce(v_step->'params', params) else params end,
           -- A call's or a note's words (00465), on a step that is one: a message's step stays a message's.
           hand = case when hand is not null and v_hand is not null then v_hand else hand end
     where id = v_id
    returning id, place into v_out, v_place;
  end if;
  return jsonb_build_object('id', v_out, 'place', v_place,
    'was', case when v_was.id is null then null else jsonb_build_object(
      'after_days', v_was.after_days, 'only_if', to_jsonb(v_was.only_if), 'channels', to_jsonb(v_was.channels),
      'name', v_was.name, 'params', v_was.params, 'hand', v_was.hand) end)
    || public.member_decision(p_tenant_id, 'sequence', p_sequence_id, 'change_step',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('step_id', v_out, 'added', v_was.id is null),
         p_via, p_undo_of);
end $$;

comment on function public.sequence_step_save(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A customer''s step after the first (D6, 0060), added at the end of its sequence or changed (p_step.id): its wait (after_days), what must still hold (only_if), its message, channels and slots, or a call''s or a note''s words (hand, 00465: added last, and nothing after one); a new one under the first step''s class, hour, cap and last day (00453), named as it unless given a name. On the member''s own rights (the steps'' policies and column grants); the change_step decision rides in the same transaction. Answers id, place, was and the decision''s.';

create or replace function public.sequence_hand_run(p_tenant_id uuid, p_step_id uuid, p_run_id uuid, p_day date,
                                                     p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_step    public.sequence_steps%rowtype;
  v_item    jsonb;
  v_send    uuid;
  v_next    public.sequence_steps%rowtype;
  v_made    int := 0;
  v_already int := 0;
  v_handed  uuid[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The run''s people are a list.' using errcode = '22023';
  end if;
  select * into v_step from public.sequence_steps
   where id = p_step_id and tenant_id = p_tenant_id and kind = 'moment' and trigger = 'after_step' and hand is not null;
  if not found then raise exception 'Step not found.' using errcode = 'P0002'; end if;

  insert into public.sequence_batches (id, tenant_id, step_id, run_for, name, template_id, template_name,
                                       template_language, state, scheduled_for, recipient_count, audience)
  values (p_run_id, p_tenant_id, p_step_id, p_day, left(v_step.name || ' · ' || p_day::text, 120), null, null, null,
          'sent', now(), 0,
          jsonb_build_object('kind', 'playbook', 'id', p_step_id, 'label', v_step.name, 'trigger', 'after_step',
                             'hand', v_step.hand->>'kind'))
  on conflict do nothing;
  if not exists (select 1 from public.sequence_batches b where b.id = p_run_id and b.tenant_id = p_tenant_id
                   and b.step_id = p_step_id) then
    raise exception 'This step has another run for that day.' using errcode = '23505';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- The person is the workspace's; the send's row refuses anything else.
    if not exists (select 1 from public.contacts c
                    where c.id = (v_item->>'contact_id')::uuid and c.tenant_id = p_tenant_id) then
      raise exception 'Person not found.' using errcode = 'P0002';
    end if;
    v_send := null;
    insert into public.sequence_sends (id, tenant_id, batch_id, step_id, sequence_id, contact_id, state, sent_at)
    values ((v_item->>'send_id')::uuid, p_tenant_id, p_run_id, p_step_id, v_step.sequence_id,
            (v_item->>'contact_id')::uuid, 'handed', now())
    on conflict do nothing
    returning id into v_send;
    if v_send is null then
      v_already := v_already + 1;
      continue;
    end if;
    perform public.person_step_from_playbook(p_tenant_id, (v_item->>'contact_id')::uuid, p_day, v_item->>'words',
                                             null, (v_item->>'source_id')::uuid);
    v_handed := v_handed || (v_item->>'contact_id')::uuid;
    v_made := v_made + 1;
  end loop;

  -- Their place moves past the step, as a send's does (sequence_sends_move_enrollment): on to a step after it after its
  -- wait, or done after the last.
  select * into v_next from public.sequence_steps
   where sequence_id = v_step.sequence_id and place = v_step.place + 1;
  update public.sequence_enrollments e
     set place = greatest(e.place, v_step.place), sent_at = now(),
         state = case when v_next.id is null then 'done' else 'in' end,
         ended_at = case when v_next.id is null then coalesce(e.ended_at, now()) else null end,
         next_at = case when v_next.id is null then null
                        else now() + make_interval(days => coalesce(v_next.after_days, 0)) end
   where e.tenant_id = p_tenant_id and e.sequence_id = v_step.sequence_id and e.lead_id is null
     and e.contact_id = any (v_handed) and e.state = 'in';

  update public.sequence_batches b
     set recipient_count = (select count(*) from public.sequence_sends s where s.batch_id = b.id)
   where b.id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'made', v_made, 'already', v_already);
end $$;

comment on function public.sequence_hand_run(uuid, uuid, uuid, date, jsonb) is
  'A customer''s call or note step''s run for a day (00465, decision 0065), written whole: the run (state sent, no message, audience.hand), a handed send per person, each person''s dated step for the team (person_step_from_playbook, once per step and person), and their place moved past the step. Items are {send_id, contact_id, words, source_id}. Answers {run_id, made, already}. Service role only.';

revoke all on function public.sequence_hand_run(uuid, uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.sequence_hand_run(uuid, uuid, uuid, date, jsonb) to service_role;

create or replace function public.sequence_once_keep(p_tenant_id uuid, p_name text, p_once jsonb, p_id uuid default null,
                                                      p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                      p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_name  text := left(btrim(coalesce(p_name, '')), 80);
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'A message sent once is named.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_once) is distinct from 'object' then
    raise exception 'A kept one-off says who, when and what.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.sequences (tenant_id, name, starts, state, created_by, mode, once)
    values (p_tenant_id, v_name, 'date', 'draft', v_actor, null, p_once)
    returning id into v_id;
  else
    update public.sequences set name = v_name, once = p_once, updated_at = now()
     where tenant_id = p_tenant_id and id = p_id and starts = 'date' and state = 'draft'
    returning id into v_id;
    if v_id is null then
      raise exception 'Draft not found.' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'state', 'draft')
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_id, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('once', true, 'kept', p_id is not null), p_via,
         p_undo_of);
end $$;

comment on function public.sequence_once_keep(uuid, text, jsonb, uuid, jsonb, text, uuid) is
  'A message sent once, kept as a draft (00465, decision 0065; Ruben''s pick of 20 Oct 2026): a sequence that starts on a date, its state draft, its once New''s {who, at, channels, step}; p_id keeps one already kept. Sends nothing: it goes as it is sent, through the send door, and its draft goes then (sequence_discard). By a member who may approve; the make_sequence decision rides in the same transaction. Answers id and state.';

revoke all on function public.sequence_once_keep(uuid, text, jsonb, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.sequence_once_keep(uuid, text, jsonb, uuid, jsonb, text, uuid) to authenticated, service_role;

create or replace function public.sequence_discard(p_tenant_id uuid, p_sequence_id uuid, p_decision jsonb default '{}'::jsonb,
                                                    p_via text default null, p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_q public.sequences%rowtype;
  v_steps int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_q from public.sequences where tenant_id = p_tenant_id and id = p_sequence_id for update;
  if v_q.id is null or not (v_q.starts in ('moment', 'list') or (v_q.starts = 'date' and v_q.state = 'draft'
                                                                  and v_q.once is not null)) then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  -- What has sent keeps its history: a sequence that made a batch, or took anyone in, is paused, never taken away.
  if exists (select 1 from public.sequence_batches b where b.sequence_id = p_sequence_id)
     or exists (select 1 from public.sequence_enrollments e where e.sequence_id = p_sequence_id) then
    raise exception 'It has sent: pause it instead.' using errcode = 'P0001';
  end if;
  select count(*) into v_steps from public.sequence_steps where sequence_id = p_sequence_id;
  if v_q.starts = 'date' then
    -- A kept one-off (00465) has no step: the draft itself goes.
    delete from public.sequences where id = p_sequence_id;
  else
    -- Its first step goes, the steps after it with it (after_step_id cascades), and the sequence with them (00440).
    delete from public.sequence_steps where id = p_sequence_id;
  end if;
  return jsonb_build_object('id', p_sequence_id, 'steps', v_steps)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'discard_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('name', v_q.name, 'was', v_q.state), p_via,
         p_undo_of);
end $$;

comment on function public.sequence_discard(uuid, uuid, jsonb, text, uuid) is
  'A customer''s sequence that never made a batch nor took anyone in, taken away whole by an acting member (0060, S4): a draft let go, or a new one undone; and a one-off kept as a draft (00465), let go or sent. One that has sent is refused (P0001): it is paused, its history kept. The discard_sequence decision rides in the same transaction. Answers id and how many steps went.';

create or replace function public.sequence_overview(p_tenant_id uuid, p_sequence_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with q as (
    select * from public.sequences
     where tenant_id = p_tenant_id and (p_sequence_id is null or id = p_sequence_id)
  ),
  steps as (
    select s.sequence_id, count(*) as n,
           array(select distinct c from public.sequence_steps x, unnest(x.channels) c
                  where x.sequence_id = s.sequence_id order by c) as channels,
           -- The days its steps span (00459): each wait after the first, as the record's rail adds them.
           coalesce(sum(s.after_days) filter (where s.after_step_id is not null), 0) as days,
           -- A sequence to leads' emails still to write (00459): a step's body left empty, as a new draft's is.
           count(*) filter (where s.kind = 'reach_out' and s.hand is null
                              and coalesce(btrim((select x->>'text' from jsonb_array_elements(t.components) x
                                                   where x->>'type' = 'BODY' limit 1)), '') = '') as unwritten
      from public.sequence_steps s
      join q on q.id = s.sequence_id
      left join public.templates t on t.id = s.template_id
     group by s.sequence_id
  ),
  -- Each batch waiting for an OK, as the badge judges one (contracts runWaitsOnYou, by the business's day): its step,
  -- the day it was made for and its moment, which the server's reader asks of each (readers/sequences.ts).
  waiting as (
    select b.sequence_id, count(*) as n, sum(b.recipient_count) as people, min(b.created_at) as oldest,
           jsonb_agg(jsonb_build_object(
             'id', b.id, 'step_id', b.step_id, 'run_for', b.run_for, 'at', b.scheduled_for,
             'people', b.recipient_count,
             'audience', jsonb_build_object('kind', b.audience->>'kind', 'trigger', b.audience->>'trigger'))
             order by b.scheduled_for, b.id) as batches
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state = 'pending_approval'
     group by b.sequence_id
  ),
  held as (
    select s.sequence_id,
           count(*) filter (where s.state = 'held')    as held,
           count(*) filter (where s.state = 'drafted') as to_send,
           min(coalesce(s.drafted_at, s.created_at))   as oldest
      from public.sequence_sends s
      join q on q.id = s.sequence_id
     where s.lead_id is not null and s.state in ('held', 'drafted')
     group by s.sequence_id
  ),
  -- A reply that asks for an answer: a person interested or asking, read in the last 14 days, not answered or undone.
  replies as (
    select s.sequence_id, count(*) as n, min(r.read_at) as oldest
      from public.sequence_replies r
      join public.sequence_sends s on s.id = r.send_id
      join q on q.id = s.sequence_id
     where r.undone_at is null and r.answered_message_id is null and r.claim in ('person', 'owner')
       and r.intent in ('interested', 'question') and r.read_at > now() - interval '14 days'
     group by s.sequence_id
  ),
  next as (
    select distinct on (b.sequence_id) b.sequence_id, b.id, b.scheduled_for, b.recipient_count, b.state, b.step_id
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state in ('pending_approval', 'scheduled', 'sending')
     order by b.sequence_id, b.scheduled_for, b.id
  ),
  last as (
    select distinct on (b.sequence_id) b.sequence_id, b.id,
           coalesce(b.finished_at, b.started_at, b.scheduled_for) as at
      from public.sequence_batches b
      join q on q.id = b.sequence_id
     where b.state = 'sent'
     order by b.sequence_id, coalesce(b.finished_at, b.started_at, b.scheduled_for) desc, b.id
  ),
  last_counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(l.id), '{}')) as counts from last l
  ),
  -- Who is in it (00459): everyone whose place stands, as its People tab files them (sequence_places): a lead added and
  -- not yet planned, waiting for an OK, held, for you to send, up next or between steps. Not who left, finished, or wrote
  -- back and waits for an answer.
  in_it as (
    select p.sequence_id, count(*) as n
      from public.sequence_places(p_tenant_id, p_sequence_id, null) p
     where p.grp not in ('done', 'left', 'replied')
     group by p.sequence_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'name', q.name,
           'starts', q.starts,
           'state', q.state,
           'mode', q.mode,
           'created_at', q.created_at,
           'first', case when f.id is null then null else jsonb_build_object(
             'id', f.id,
             'kind', f.kind,
             'trigger', f.trigger,
             'state', f.state,
             'policy_class', f.policy_class,
             'run_hour', f.run_hour,
             'list_id', f.list_id,
             'list_key', f.list_key,
             'list_name', (select g.name from public.segments g where g.id = f.list_id),
             'search_id', f.lead_search_id,
             'search_name', (select ls.name from public.lead_searches ls where ls.id = f.lead_search_id),
             'source_search_id', f.source_search_id,
             'source_name', (select ls.name from public.lead_searches ls where ls.id = f.source_search_id),
             -- The search it could add from, while it adds from none (How it runs' auto-add switch): the live finder
             -- search that found most of its list's leads, and that no other sequence adds from already.
             'source_could', case when f.lead_search_id is null or f.source_search_id is not null then null else (
               select jsonb_build_object('id', ls.id, 'name', ls.name)
                 from public.lead_search_members m
                 join public.lead_search_members o
                   on o.tenant_id = m.tenant_id and o.lead_id = m.lead_id and o.search_id <> m.search_id
                 join public.lead_searches ls on ls.id = o.search_id
                where m.search_id = f.lead_search_id and m.tenant_id = q.tenant_id
                  and ls.removed_at is null and ls.via not in ('chosen', 'import')
                  and not exists (select 1 from public.sequence_steps r where r.source_search_id = ls.id)
                group by ls.id, ls.name
                order by count(*) desc, ls.name
                limit 1) end,
             'owner_sends', f.owner_sends,
             'until', f.until,
             'words_ok_at', f.words_ok_at,
             'template_name', f.template_name,
             'template_language', f.template_language) end,
           -- A one-off kept as a draft (00465): who, when, how and its message, as New shaped them.
           'once', case when q.starts = 'date' and q.state = 'draft' then q.once end,
           'date', case when q.starts = 'date' then (
             select jsonb_build_object('batch_id', d.id, 'state', d.state, 'at', d.scheduled_for,
                                       'people', d.recipient_count)
               from public.sequence_batches d where d.id = q.id) end,
           'steps', coalesce(st.n, 0),
           'days', coalesce(st.days, 0),
           'unwritten', coalesce(st.unwritten, 0),
           'channels', coalesce(to_jsonb(st.channels), '[]'::jsonb),
           'needs', jsonb_build_object(
             'waiting', coalesce(w.n, 0),
             'waiting_people', coalesce(w.people, 0),
             'held', coalesce(h.held, 0),
             'to_send', coalesce(h.to_send, 0),
             'replies', coalesce(rp.n, 0),
             'oldest_at', least(w.oldest, h.oldest, rp.oldest),
             'batches', coalesce(w.batches, '[]'::jsonb)),
           'next', case when nx.id is null then null else jsonb_build_object(
             'id', nx.id, 'at', nx.scheduled_for, 'people', nx.recipient_count, 'state', nx.state,
             'place', (select ps.place from public.sequence_steps ps where ps.id = nx.step_id)) end,
           'last', case when ls.id is null then null else jsonb_build_object(
             'id', ls.id, 'at', ls.at,
             'sent', coalesce(((select counts from last_counts) -> ls.id::text ->> 'sent')::int, 0),
             'replied', coalesce(((select counts from last_counts) -> ls.id::text ->> 'replied')::int, 0)) end,
           'in_it', coalesce(ii.n, 0)
         ) order by q.created_at desc, q.id), '[]'::jsonb)
    from q
    left join public.sequence_steps f on f.id = q.id
    left join steps st on st.sequence_id = q.id
    left join waiting w on w.sequence_id = q.id
    left join held h on h.sequence_id = q.id
    left join replies rp on rp.sequence_id = q.id
    left join next nx on nx.sequence_id = q.id
    left join last ls on ls.sequence_id = q.id
    left join in_it ii on ii.sequence_id = q.id
$$;

comment on function public.sequence_overview(uuid, uuid) is
  'The workspace''s sequences (0060), or the one named: how each starts (its first step, with the search it adds from: 00459, when its words were last let go: 00462, or a one-off''s date, or the once of one kept as a draft: 00465), how its batches are decided (its mode, 00462), where it stands, its steps, the days they span and the emails still to write (00459), its channels, what needs you (batches waiting for an OK and their people, emails held by the check, emails for you to send, replies to answer, the oldest of them), the batch to come, the last that went with its sent and replied, and who is in it (everyone whose place stands, sequence_places: 00459). Newest first. Under the caller''s row security.';
