-- 00585 · Cold email needs a mailbox, in the database too.
--
-- Decision 0116 (Ruben, 9 Nov 2026: sending by hand defeats the purpose of Chanlytics). The app refuses a sequence to
-- leads with no mailbox that sends, on New, on Ask's card and at the door, and refuses one asked to be sent by hand. The
-- maker itself still chose "by hand" on its own where none was connected (00465), so any other way in made one.
--
--   sequence_create_leads      as 00492 wrote it, but: asked to be sent by hand, refused; with no connected mailbox,
--                              refused, in the words New says; a copy of a sequence its owner sent by hand sends from
--                              the mailboxes, as every new one does. One already sent by hand goes on as it is until the
--                              column goes (Stage E of docs/superpowers/plans/2026-11-09-cold-email.md).
--
-- Deploy order: either. The app refuses first, so this changes nothing a person sees from the app; a build before it
-- reads the same rows. Re-runnable: one function replaced, its grants kept.

set local lock_timeout = '3s';

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
    raise exception 'Connect your mailbox first: a sequence to leads sends from your own address. Settings › Cold email has the way.'
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
