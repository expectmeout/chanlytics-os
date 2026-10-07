-- 00228 · A chain may end with a call or a note for you.
--
-- Reach out, Part 5 (docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md, PR 10; G20). A reach-out's last
-- step may hand each lead it reaches to the team instead of writing to them: a call to make, or a note, as a dated step
-- on the lead's person, due the day the step runs. It sends nothing, so it waits for no approval and spends nothing.
--
--   playbooks.hand          { kind: 'call' | 'note', words }: a hand step, on a reach-out's later step only, which has
--                           no template. Its template columns may be null now, and only then.
--   broadcasts              a hand step's day's run is a run with no template, its audience saying `hand`.
--   reach_out_sends.state   `handed`: a lead the hand step reached, inserted so, dated, and never moved (the guard, 00197,
--                           allows no move out of a state it does not name). The followers' "not already on this step"
--                           counts any row, so a handed lead is reached once.
--   reach_out_save          00211's, whole, but a last step may be { hand, after_days } ("A call or a note ends the
--                           chain."), and a step that handed anyone is never dropped.
--   reach_out_hand_run      the hand step's run, written whole: the day's run, a `handed` send for each lead, and each
--                           lead's dated step (person_step_from_playbook, once per step and lead). Service role only.
--   reach_out_chain_report  00211's, whole, with `handed` per step and per run. What was written, delivered and answered
--                           still reads `sent` only, so a hand step is never where a lead's answer is counted.
--
-- The CHECKs on playbooks and broadcasts are added NOT VALID and then validated, so the tables are read without being
-- locked against their writers. Every statement re-runs.

/* ---------------------------------------------------------------- the hand step -- */

alter table public.playbooks add column if not exists hand jsonb;

alter table public.playbooks
  alter column template_id drop not null,
  alter column template_name drop not null,
  alter column template_language drop not null;

-- A step has its template or its hand, never both and never neither; the hand is a reach-out's later step's only, of two
-- kinds, with its words (1 to 280 characters) and nothing else. Each branch is coalesced to false, as 00183's are.
alter table public.playbooks drop constraint if exists playbooks_template_or_hand;
alter table public.playbooks add constraint playbooks_template_or_hand check (
  case when hand is null
    then template_id is not null and template_name is not null and template_language is not null
    else coalesce(
      kind = 'reach_out' and trigger = 'after_step'
      and template_id is null and template_name is null and template_language is null
      and jsonb_typeof(hand) = 'object'
      and hand->>'kind' in ('call', 'note')
      and jsonb_typeof(hand->'words') = 'string'
      and char_length(btrim(hand->>'words')) between 1 and 280
      and hand - 'kind' - 'words' = '{}'::jsonb, false)
  end) not valid;
alter table public.playbooks validate constraint playbooks_template_or_hand;

comment on column public.playbooks.hand is
  'A reach-out''s last step that hands each lead it reaches to the team (Reach out Part 5, G20): {kind: call | note, words}. Such a step has no template.';

/* ---------------------------------------------------------------- its run -- */

alter table public.broadcasts
  alter column template_id drop not null,
  alter column template_name drop not null,
  alter column template_language drop not null;

-- A run has its template, unless it is a hand step's run: a reach-out's, its audience naming the hand's kind.
alter table public.broadcasts drop constraint if exists broadcasts_template_or_hand;
alter table public.broadcasts add constraint broadcasts_template_or_hand check (
  coalesce(
    (template_id is not null and template_name is not null and template_language is not null)
    or (template_id is null and template_name is null and template_language is null
        and audience->>'kind' = 'reach_out' and audience->>'hand' in ('call', 'note')), false)) not valid;
alter table public.broadcasts validate constraint broadcasts_template_or_hand;

/* ---------------------------------------------------------------- a handed lead -- */

alter table public.reach_out_sends drop constraint if exists reach_out_sends_state_check;
alter table public.reach_out_sends add constraint reach_out_sends_state_check
  check (state in ('planned', 'held', 'claimed', 'queued', 'sent', 'skipped', 'failed', 'handed')) not valid;
alter table public.reach_out_sends validate constraint reach_out_sends_state_check;

-- A handed lead was handed when its run was made: dated, as a sent one is.
alter table public.reach_out_sends drop constraint if exists reach_out_sends_handed_is_dated;
alter table public.reach_out_sends add constraint reach_out_sends_handed_is_dated
  check (state <> 'handed' or sent_at is not null) not valid;
alter table public.reach_out_sends validate constraint reach_out_sends_handed_is_dated;

/* ---------------------------------------------------------------- saving a chain -- */

-- 00211's, whole, but for the hand step: a last step may be { hand, after_days } instead of words, and never the first
-- or any other; a step keeps what it is once it has run; and a step that handed anyone is never dropped.
create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_domains  uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'domain_ids', '[]'::jsonb)) x), '{}');
  v_steps    jsonb := coalesce(p_chain->'steps', '[]'::jsonb);
  v_n        int := jsonb_array_length(coalesce(p_chain->'steps', '[]'::jsonb));
  v_existing uuid[] := '{}';
  v_dropped  uuid[] := '{}';
  v_signed_was text;
  v_step     jsonb;
  v_i        int;
  v_id       uuid;
  v_prev     uuid;
  v_template uuid;
  v_subject  text;
  v_body     text;
  v_parts    jsonb;
  v_label    text;
  v_hand     jsonb;
  v_was_hand jsonb;
  v_ids      uuid[] := '{}';
  v_changed  uuid[] := '{}';
  v_reset    int := 0;
begin
  -- Who may: the one table of permissions (00201 has_permission's approve, a playbook's own: owner, operator, partner).
  if p_tenant_id is null or p_user_id is null or not public.has_permission(p_user_id, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_n < 1 then raise exception 'A reach-out has at least one email.' using errcode = '22023'; end if;
  -- A call or a note is the last step, and never the first: the chain writes before it hands anyone over.
  for v_i in 0 .. v_n - 1 loop
    if v_steps->v_i ? 'hand' and (v_i = 0 or v_i < v_n - 1) then
      raise exception 'A call or a note ends the chain.' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from unnest(v_domains) d
              where not exists (select 1 from public.sending_domains s where s.id = d and s.tenant_id = p_tenant_id)) then
    raise exception 'Domain not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.playbooks
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.playbooks where id = v_root
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    )
    select array_agg(id order by n) into v_existing from c;
  end if;

  -- An edit keeps the chain's steps in their places: the first k it names are the chain's first k, in order, and any
  -- after them are new.
  for v_i in 0 .. v_n - 1 loop
    v_id := nullif(v_steps->v_i->>'id', '')::uuid;
    if (v_i < coalesce(cardinality(v_existing), 0) and v_id is distinct from v_existing[v_i + 1])
       or (v_i >= coalesce(cardinality(v_existing), 0) and v_id is not null) then
      raise exception 'A step is out of its place. Open the reach-out again.' using errcode = '22023';
    end if;
  end loop;

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned and held sends
  -- skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its owner
  -- pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.reach_out_sends s where s.playbook_id = any (v_dropped) for update;
    if exists (select 1 from public.reach_out_sends s
                where s.playbook_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed')) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.broadcasts set state = 'canceled'
     where tenant_id = p_tenant_id and playbook_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.reach_out_sends set state = 'skipped', reason = 'step_removed'
     where playbook_id = any (v_dropped) and state in ('planned', 'held');
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.playbooks p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_playbook_id cascades).
    delete from public.playbooks where id = v_dropped[1];
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_step := v_steps->v_i;
    v_id := nullif(v_step->>'id', '')::uuid;
    v_hand := case when v_step ? 'hand'
                then jsonb_build_object('kind', v_step->'hand'->>'kind', 'words', btrim(coalesce(v_step->'hand'->>'words', '')))
              end;
    v_subject := case when v_i = 0 then btrim(coalesce(v_step->>'subject', '')) end;
    v_body := btrim(coalesce(v_step->>'body', ''));
    v_parts := case when v_i = 0
                 then jsonb_build_array(jsonb_build_object('type', 'HEADER', 'format', 'TEXT', 'text', v_subject),
                                        jsonb_build_object('type', 'BODY', 'text', v_body))
                 else jsonb_build_array(jsonb_build_object('type', 'BODY', 'text', v_body)) end;
    v_label := case
                 when v_hand is not null then case v_hand->>'kind' when 'call' then 'a call' else 'a note' end
                 when v_i = 0 then 'your email' when v_i = 1 then 'a nudge' else 'email ' || (v_i + 1) end;

    if v_id is null then
      v_id := gen_random_uuid();
      if v_hand is null then
        insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                      body_preview, title, created_by)
        values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                'approved', v_parts, left(v_body, 1024),
                left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
        returning id into v_template;
      end if;
      insert into public.playbooks (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_playbook_id,
                                    after_days, gap_minutes, domain_ids, signed_by, include_unconfirmed, template_id,
                                    template_name, template_language, hand, params, run_hour, cap_per_run, state,
                                    created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_domains,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id, hand into v_template, v_was_hand from public.playbooks where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.reach_out_sends s where s.playbook_id = v_id) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.playbooks
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.playbooks
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.playbooks set hand = v_hand where id = v_id and hand is distinct from v_hand;
      -- New words: what is planned or held for this step is checked again against them (R5).
      elsif (select components from public.templates where id = v_template) is distinct from v_parts then
        update public.templates set components = v_parts, body_preview = left(v_body, 1024) where id = v_template;
        v_changed := v_changed || v_id;
      end if;
      -- A new name for the chain is its words' new title in Templates too.
      if v_template is not null then
        update public.templates set title = left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60)
         where id = v_template
           and title is distinct from left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60);
      end if;
      update public.playbooks
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, domain_ids = v_domains,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.playbook_id = any (v_changed) and s.state in ('planned', 'held')),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;
revoke execute on function public.reach_out_save(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_save(uuid, uuid, jsonb) to service_role;
comment on function public.reach_out_save(uuid, uuid, jsonb) is
  'Reach out (Part 4, Part 5 G20): a chain made or edited whole, its email templates and its playbook rows, for a member the route has checked (service role only, R15). Steps keep their places; the last may be a call or a note ({hand, after_days}) and no other; a step that wrote or handed is never dropped nor changes what it is; new words or a new name send the step''s planned and held sends back to the check.';

/* ---------------------------------------------------------------- a hand step's run -- */

-- The hand step's run for its day, written whole: the run (its id handed in, derived as every reach-out run's is: its
-- step and its day), a `handed` send for each lead (its id handed in too), and each lead's step for the team, due that
-- day, once per step and lead (p_items[].source_id). A lead already on the run is `already`, and makes nothing again.
-- Each item is { send_id, lead_id, contact_id, words, source_id }; the words are contracts' (handStepWords).
create or replace function public.reach_out_hand_run(
  p_tenant_id uuid,
  p_step_id   uuid,
  p_run_id    uuid,
  p_day       date,
  p_items     jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step  public.playbooks%rowtype;
  v_root  uuid;
  v_item  jsonb;
  v_send  uuid;
  v_made  int := 0;
  v_already int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The run''s leads are a list.' using errcode = '22023';
  end if;
  select * into v_step from public.playbooks
   where id = p_step_id and tenant_id = p_tenant_id and kind = 'reach_out' and hand is not null;
  if not found then raise exception 'Step not found.' using errcode = 'P0002'; end if;
  -- Its chain's root: a chain is a few steps, and a walk longer than ten is a loop in the rows.
  with recursive up as (
    select p.id, p.after_playbook_id, 0 as n from public.playbooks p where p.id = v_step.after_playbook_id
    union all
    select p.id, p.after_playbook_id, up.n + 1 from public.playbooks p join up on p.id = up.after_playbook_id
     where up.n < 10
  )
  select id into v_root from up where after_playbook_id is null;
  if v_root is null then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;

  insert into public.broadcasts (id, tenant_id, playbook_id, run_for, name, template_id, template_name,
                                 template_language, state, scheduled_for, recipient_count, audience)
  values (p_run_id, p_tenant_id, p_step_id, p_day, left(v_step.name || ' · ' || p_day::text, 120), null, null, null,
          'sent', now(), 0,
          jsonb_build_object('kind', 'reach_out', 'root_id', v_root, 'step_id', p_step_id, 'search_id', null,
                             'hand', v_step.hand->>'kind'))
  on conflict do nothing;
  if not exists (select 1 from public.broadcasts b where b.id = p_run_id and b.tenant_id = p_tenant_id
                   and b.playbook_id = p_step_id) then
    raise exception 'This step has another run for that day.' using errcode = '23505';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    -- The lead and its person are the workspace's; the send's row refuses anything else.
    if not exists (select 1 from public.leads l
                    where l.id = (v_item->>'lead_id')::uuid and l.tenant_id = p_tenant_id)
       or not exists (select 1 from public.contacts c
                       where c.id = (v_item->>'contact_id')::uuid and c.tenant_id = p_tenant_id) then
      raise exception 'Lead not found.' using errcode = 'P0002';
    end if;
    v_send := null;
    insert into public.reach_out_sends (id, tenant_id, broadcast_id, playbook_id, root_id, lead_id, contact_id, state,
                                        sent_at)
    values ((v_item->>'send_id')::uuid, p_tenant_id, p_run_id, p_step_id, v_root, (v_item->>'lead_id')::uuid,
            (v_item->>'contact_id')::uuid, 'handed', now())
    on conflict do nothing
    returning id into v_send;
    if v_send is null then
      v_already := v_already + 1;
      continue;
    end if;
    perform public.person_step_from_playbook(p_tenant_id, (v_item->>'contact_id')::uuid, p_day, v_item->>'words',
                                             null, (v_item->>'source_id')::uuid);
    v_made := v_made + 1;
  end loop;

  update public.broadcasts b
     set recipient_count = (select count(*) from public.reach_out_sends s where s.broadcast_id = b.id)
   where b.id = p_run_id;
  return jsonb_build_object('run_id', p_run_id, 'made', v_made, 'already', v_already);
end $$;
revoke execute on function public.reach_out_hand_run(uuid, uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.reach_out_hand_run(uuid, uuid, uuid, date, jsonb) to service_role;
comment on function public.reach_out_hand_run(uuid, uuid, uuid, date, jsonb) is
  'A reach-out''s hand step''s run for a day (Reach out Part 5, G20), written whole: the run (state sent, no template, audience.hand), a handed send per lead, and each lead''s dated step for the team (person_step_from_playbook, once per step and lead). Items are {send_id, lead_id, contact_id, words, source_id}. Answers {run_id, made, already}. Service role only.';

/* ---------------------------------------------------------------- a chain's report -- */

-- 00211's, whole, with `handed`: the leads a hand step handed to the team, per step and per run. Written, delivered,
-- bounced and each lead's last send (where its answer is counted) read `sent` only, as they did.
create or replace function public.reach_out_chain_report(p_tenant_id uuid, p_root_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.playbooks p
                  where p.id = p_root_id and p.tenant_id = p_tenant_id and p.kind = 'reach_out'
                    and p.trigger = 'lead_first') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  return (
    with recursive c as (
      select p.id, 0 as n from public.playbooks p where p.id = p_root_id
      union all
      select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
    ),
    -- Each lead's last send that left, in this chain: where its answer is counted.
    last_sent as (
      select distinct on (s.lead_id) s.lead_id, s.playbook_id, s.contact_id, l.email, l.closed_reason
        from public.reach_out_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
       where s.root_id = p_root_id and s.tenant_id = p_tenant_id and s.state = 'sent'
       order by s.lead_id, s.sent_at desc
    ),
    -- Who of them wrote back, asked once for all (the send door's own reading).
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answered as (
      select ls.playbook_id,
             count(*) filter (where ls.contact_id in (select contact_id from wrote)) as wrote_back,
             count(*) filter (where ls.closed_reason = 'said_no') as said_no
        from last_sent ls
       group by ls.playbook_id
    )
    select jsonb_build_object(
      'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'n', c.n,
        'written', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'sent'),
        'delivered', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                       where s.playbook_id = c.id and s.state = 'sent' and m.status in ('delivered', 'read')),
        'bounced', (select count(*) from public.reach_out_sends s join public.messages m on m.id = s.message_id
                     where s.playbook_id = c.id and m.status = 'failed' and m.error->>'provider' = 'bounced'),
        'wrote_back', coalesce((select a.wrote_back from answered a where a.playbook_id = c.id), 0),
        'said_no', coalesce((select a.said_no from answered a where a.playbook_id = c.id), 0),
        'waiting', (select count(*) from public.reach_out_sends s
                     where s.playbook_id = c.id and s.state in ('planned', 'claimed', 'queued')),
        'held', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'held'),
        'handed', (select count(*) from public.reach_out_sends s where s.playbook_id = c.id and s.state = 'handed'))
        order by c.n) from c), '[]'::jsonb),
      'runs', coalesce((select jsonb_agg(r order by r->>'run_for' desc) from (
        select jsonb_build_object('id', b.id, 'step_id', b.playbook_id, 'run_for', b.run_for, 'state', b.state,
                                  'planned', b.recipient_count,
                                  'written', (select count(*) from public.reach_out_sends s
                                               where s.broadcast_id = b.id and s.state = 'sent'),
                                  'held', (select count(*) from public.reach_out_sends s
                                            where s.broadcast_id = b.id and s.state = 'held'),
                                  'handed', (select count(*) from public.reach_out_sends s
                                              where s.broadcast_id = b.id and s.state = 'handed')) as r
          from public.broadcasts b
         where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
           and b.audience->>'root_id' = p_root_id::text
         order by b.run_for desc
         limit 5) x), '[]'::jsonb),
      'can_remove', not exists (select 1 from public.reach_out_sends s
                                 where s.root_id = p_root_id and s.state in ('claimed', 'queued', 'sent', 'failed')))
  );
end $$;
revoke execute on function public.reach_out_chain_report(uuid, uuid) from public, anon;
grant execute on function public.reach_out_chain_report(uuid, uuid) to authenticated, service_role;
