-- 00472 · The cold lane's own sending domains go.
--
-- Decision 0056 (13 October 2026) moved cold email onto mailboxes a business connects and left the second mail
-- account's SQL inert, so an edge from before it kept running against the database while the deploys settled.
-- docs/debt.md said when it could go: once production's edge had run 0056's code for a week and nothing in
-- sending_domains was wanted. Both hold on 22 October 2026 (the Supabase layer review): no domain was ever made, no
-- send names one, no step lists one, no clock calls the domains sweep (00423 took it off), and nothing in the edge, the
-- dashboard or the packages calls any of the doors below; a send's facts are outreach_mailbox_facts' and a mailbox's
-- day is mailbox_capacity's.
--
-- Gone: the two tables, a send's domain_id with its key and its index, a step's domain_ids, and the six doors only that
-- edge called. reach_out_save is re-created as 00459 wrote it but for the one assignment that cleared domain_ids, which
-- a step no longer has. The erasure registry, the delete-tenant backup, the tenancy proof and the generated keys drop
-- their rows in the same change. Either deploy order: no deployed code reads any of it. Re-runnable.

set local lock_timeout = '3s';

-- The doors only an edge from before 0056 called.
drop function if exists public.cold_receipts_owed(timestamptz, timestamptz);
drop function if exists public.outreach_facts(uuid, uuid, text, text, timestamptz, uuid);
drop function if exists public.sending_domain_capacity(uuid, timestamptz);
drop function if exists public.sending_domain_counts(uuid, text, timestamptz);
drop function if exists public.sending_domain_days_keep();
drop function if exists public.trigger_domains_sweep();

-- reach_out_save, as 00459_one_road_from_a_lead_to_a_sequence.sql wrote it, but for domain_ids, which a step no
-- longer has.
create or replace function public.reach_out_save(p_tenant_id uuid, p_user_id uuid, p_chain jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_root     uuid := nullif(p_chain->>'root_id', '')::uuid;
  v_search   uuid := nullif(p_chain->>'search_id', '')::uuid;
  v_name     text := btrim(coalesce(p_chain->>'name', ''));
  v_gap      int := (p_chain->>'gap_minutes')::int;
  v_signed   text := nullif(btrim(coalesce(p_chain->>'signed_by', '')), '');
  v_unconf   boolean := coalesce((p_chain->>'include_unconfirmed')::boolean, false);
  v_owner    boolean := coalesce((p_chain->>'owner_sends')::boolean, false);
  v_mailboxes uuid[] := coalesce(
               array(select x::uuid from jsonb_array_elements_text(coalesce(p_chain->'mailbox_ids', '[]'::jsonb)) x), '{}');
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
  v_source   uuid;
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
  -- The mailboxes it writes from are this workspace's, and not removed (00423).
  if exists (select 1 from unnest(v_mailboxes) b
              where not exists (select 1 from public.mailbox_connections c
                                 where c.id = b and c.tenant_id = p_tenant_id and c.state <> 'removed')) then
    raise exception 'Mailbox not found.' using errcode = 'P0002';
  end if;

  if v_root is null then
    if not exists (select 1 from public.lead_searches s
                    where s.id = v_search and s.tenant_id = p_tenant_id and s.removed_at is null) then
      raise exception 'Search not found.' using errcode = 'P0002';
    end if;
    -- Made on a finder search (00459): a list of its own, drawing from that search, so it takes the leads you add too.
    if exists (select 1 from public.lead_searches s where s.id = v_search and s.via not in ('chosen', 'import')) then
      if exists (select 1 from public.sequence_steps r where r.source_search_id = v_search) then
        raise exception 'This search has a reach-out already.' using errcode = '23505';
      end if;
      v_source := v_search;
      v_search := public.reach_out_list_for(p_tenant_id, v_name, p_user_id);
    end if;
  else
    select lead_search_id, signed_by into v_search, v_signed_was from public.sequence_steps
     where id = v_root and tenant_id = p_tenant_id and kind = 'reach_out' and trigger = 'lead_first'
       for update;
    if not found then raise exception 'Reach-out not found.' using errcode = 'P0002'; end if;
    -- The chain as it stands, root first.
    with recursive c as (
      select id, 0 as n from public.sequence_steps where id = v_root
      union all
      select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
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

  -- A step dropped from the end takes its work with it (R17): its live runs canceled, its planned, held and drafted
  -- sends skipped, step_removed, then its row. One that wrote, or handed anyone to the team, keeps its history: its
  -- owner pauses the chain instead.
  if coalesce(cardinality(v_existing), 0) > v_n then
    v_dropped := v_existing[v_n + 1:];
    -- Held against a claim while it is judged: a claim waits, or finds them skipped.
    perform 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = any (v_dropped)) for update;
    if exists (select 1 from public.sequence_sends s
                where s.lead_id is not null and ( s.step_id = any (v_dropped) and s.state in ('claimed', 'queued', 'sent', 'failed', 'handed'))) then
      raise exception 'That step has written already. Pause the reach-out instead.' using errcode = '23503';
    end if;
    update public.sequence_batches set state = 'canceled'
     where tenant_id = p_tenant_id and step_id = any (v_dropped)
       and state in ('pending_approval', 'scheduled', 'sending');
    update public.sequence_sends set state = 'skipped', reason = 'step_removed'
     where sequence_sends.lead_id is not null and ( step_id = any (v_dropped) and state in ('planned', 'held', 'drafted'));
    -- Their words stay on file (a run of theirs names them: broadcasts.template_id), hidden from Templates.
    update public.templates set hidden_at = coalesce(hidden_at, now())
     where id in (select p.template_id from public.sequence_steps p where p.id = any (v_dropped));
    -- The first step dropped takes the ones after it (after_step_id cascades).
    delete from public.sequence_steps where id = v_dropped[1];
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
      insert into public.sequence_steps (id, tenant_id, kind, name, trigger, policy_class, lead_search_id, after_step_id,
                                    after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed,
                                    template_id, template_name, template_language, hand, params, run_hour, cap_per_run,
                                    state, created_by)
      values (v_id, p_tenant_id, 'reach_out',
              case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
              case when v_i = 0 then 'lead_first' else 'after_step' end, 'outreach',
              case when v_i = 0 then v_search end, case when v_i > 0 then v_prev end,
              case when v_i > 0 then (v_step->>'after_days')::int end, v_gap, v_mailboxes, v_i = 0 and v_owner,
              case when v_i = 0 then v_signed end, v_i = 0 and v_unconf,
              case when v_hand is null then v_template end,
              case when v_hand is null then 'reach_out_' || replace(v_id::text, '-', '') end,
              case when v_hand is null then 'en' end,
              v_hand, '[]'::jsonb, 9, 200, 'running', p_user_id);
    else
      select template_id, hand into v_template, v_was_hand from public.sequence_steps where id = v_id;
      -- A step keeps what it is once it has run: an email that wrote, or a hand that handed, is itself for good.
      if (v_was_hand is null) <> (v_hand is null) then
        if exists (select 1 from public.sequence_sends s where s.lead_id is not null and ( s.step_id = v_id)) then
          raise exception 'That step has run already. Add a new step instead.' using errcode = '23503';
        end if;
        if v_hand is null then
          insert into public.templates (tenant_id, channel, source, name, language, category, meta_status, components,
                                        body_preview, title, created_by)
          values (p_tenant_id, 'email', 'chanlytics', 'reach_out_' || replace(v_id::text, '-', ''), 'en', 'marketing',
                  'approved', v_parts, left(v_body, 1024),
                  left(left(v_name, 60 - char_length(v_label) - 3) || ' · ' || v_label, 60), p_user_id)
          returning id into v_template;
          update public.sequence_steps
             set hand = null, template_id = v_template, template_name = 'reach_out_' || replace(v_id::text, '-', ''),
                 template_language = 'en'
           where id = v_id;
        else
          update public.templates set hidden_at = coalesce(hidden_at, now()) where id = v_template;
          update public.sequence_steps
             set template_id = null, template_name = null, template_language = null, hand = v_hand
           where id = v_id;
          v_template := null;
        end if;
      elsif v_hand is not null then
        update public.sequence_steps set hand = v_hand where id = v_id and hand is distinct from v_hand;
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
      update public.sequence_steps
         set name = case when v_i = 0 then v_name else left(v_name, 80 - char_length(v_label) - 3) || ' · ' || v_label end,
             gap_minutes = v_gap, mailbox_ids = v_mailboxes,
             owner_sends = v_i = 0 and v_owner,
             after_days = case when v_i > 0 then (v_step->>'after_days')::int end,
             signed_by = case when v_i = 0 then v_signed end,
             include_unconfirmed = v_i = 0 and v_unconf
       where id = v_id;
    end if;
    v_prev := v_id;
    v_ids := v_ids || v_id;
  end loop;

  if v_source is not null then
    update public.sequence_steps set source_search_id = v_source where id = v_ids[1];
  end if;
  -- A new name to sign with changes every step's words as a business reads them.
  if v_root is not null and v_signed is distinct from v_signed_was then v_changed := v_ids; end if;
  if cardinality(v_changed) > 0 then
    v_reset := public.reach_out_recheck(array(
      select s.id from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = any (v_changed) and s.state in ('planned', 'held'))),
      p_tenant_id);
  end if;

  return jsonb_build_object('root_id', v_ids[1], 'step_ids', to_jsonb(v_ids), 'rechecked', v_reset);
exception
  when unique_violation then
    raise exception 'This search has a reach-out already.' using errcode = '23505';
end $$;

-- A send no longer names a domain, and a step no longer lists them. The steps' shape held a step that is not a
-- reach-out's to an empty domain list (00441): a column dropped takes every constraint that names it, so the shape is
-- restated first as 00441 wrote it but for that one clause, and the column goes after it.
alter table public.sequence_sends drop constraint if exists sequence_sends_domain_id_same_workspace;
drop index if exists public.sequence_sends_due;
alter table public.sequence_sends drop column if exists domain_id;

alter table public.sequence_steps drop constraint if exists sequence_steps_shape;
alter table public.sequence_steps add constraint sequence_steps_shape check (
  case kind
    when 'reach_out' then coalesce(
      policy_class = 'outreach' and gap_minutes is not null and gap_minutes between 5 and 120
      and case trigger
            when 'lead_first' then lead_search_id is not null and after_step_id is null and after_days is null
            when 'after_step' then after_step_id is not null and after_days between 2 and 30 and lead_search_id is null
            else false
          end, false)
    else coalesce(
      policy_class <> 'outreach' and trigger <> 'lead_first' and lead_search_id is null and gap_minutes is null
      and case trigger
            when 'after_step' then after_step_id is not null and after_days between 1 and 90
            else after_step_id is null and after_days is null
          end, false)
  end);
alter table public.sequence_steps drop column if exists domain_ids;

-- The tables, and the function the domains' limit fired.
drop table if exists public.sending_domain_days;
drop table if exists public.sending_domains;
drop function if exists public.sending_domains_within_limit();
