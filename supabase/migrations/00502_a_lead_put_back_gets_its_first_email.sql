-- A lead put back that nothing ever reached gets its first email (the lead sheet, decision D5 of its canvas, 1 Nov 2026).
--
-- sequence_leave skips a lead's planned email along with its place. Put back gave the place back and left the email
-- skipped, and a lead has one first email (sequence_sends_one_first), so a lead taken out of a batch and put back stood
-- in a place nothing moved: counted as in it, and never written to. A lead whose email the leave skipped, and nothing
-- reached, now goes back on its list as a lead moved away and back does: its skipped email is freed and its place left
-- as moved, so its next batch plans its first email. Any other lead is put back as it was, on the step it had reached.

-- sequence_return, as 00455_a_lead_s_place_in_its_sequence_stays_true.sql wrote it; a lead nothing reached goes back on its list.
create or replace function public.sequence_return(p_tenant_id uuid, p_sequence_id uuid,
                                                 p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                 p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_left public.decisions%rowtype;
  v_why text;
  v_back int;
  v_out int;
  v_on int;
  v_list uuid;
  v_fresh int;
  v_freed int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- The leave this undoes: one of this sequence, in this workspace, and its own record of what it changed.
  select d.* into v_left from public.decisions d
   where d.id = p_undo_of and d.tenant_id = p_tenant_id and d.verb = 'leave_sequence'
     and d.subject_type = 'sequence' and d.subject_id = p_sequence_id;
  if not found then
    raise exception 'That is not a leave of this sequence.' using errcode = 'P0002';
  end if;
  v_why := v_left.payload #>> '{put_back,why}';
  if v_why is null then
    raise exception 'That leave kept nothing to put back.' using errcode = 'P0001';
  end if;
  v_out := coalesce((v_left.payload #>> '{put_back,sends}')::int, 0);
  -- A lead whose email the leave skipped, and nothing reached, goes back on its list, never onto a step: its first email
  -- stands skipped and a lead has one, so its place alone would stand still. Its email is freed as a moved one is and its
  -- place left as moved, so the list holds it again and its next batch plans it.
  with was as (
    select (x->>'id')::uuid as id
      from jsonb_array_elements(coalesce(v_left.payload #> '{put_back,places}', '[]'::jsonb)) x),
  fresh as (
    select e.id, e.lead_id
      from was w
      join public.sequence_enrollments e on e.id = w.id
     where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id and e.lead_id is not null
       and e.state = 'left' and e.why = v_why and e.left_by is not distinct from v_left.actor_user_id
       and e.ended_at >= v_left.created_at
       and exists (
         select 1 from public.sequence_sends s
          where s.tenant_id = p_tenant_id and s.sequence_id = e.sequence_id and s.lead_id = e.lead_id
            and s.state = 'skipped' and s.reason = v_why)
       and not exists (
         select 1 from public.sequence_sends s
          where s.tenant_id = p_tenant_id and s.sequence_id = e.sequence_id and s.lead_id = e.lead_id
            and (s.sent_at is not null or s.state in ('claimed', 'queued', 'sent', 'handed', 'drafted')))),
  freed as (
    update public.sequence_sends s set reason = 'moved'
      from fresh f
     where s.tenant_id = p_tenant_id and s.sequence_id = p_sequence_id and s.lead_id = f.lead_id
       and s.state = 'skipped' and s.reason = v_why
    returning s.id),
  listed as (
    update public.sequence_enrollments e set why = 'moved'
      from fresh f
     where e.id = f.id
    returning e.id)
  select (select count(*) from listed), (select count(*) from freed) into v_fresh, v_freed;
  -- Each place still out for this leave's reason, by the member who made it, since it was made, and nobody of theirs
  -- back in the sequence since (one place in at a time: sequence_enrollments_one_in_*).
  with was as (
    select (x->>'id')::uuid as id, nullif(x->>'next_at', '')::timestamptz as next_at
      from jsonb_array_elements(coalesce(v_left.payload #> '{put_back,places}', '[]'::jsonb)) x),
  back as (
    update public.sequence_enrollments e
       set state = 'in', why = null, ended_at = null, left_by = null, next_at = w.next_at, moved_at = now()
      from was w
     where e.id = w.id and e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
       and e.state = 'left' and e.why = v_why and e.left_by is not distinct from v_left.actor_user_id
       and e.ended_at >= v_left.created_at
       and not exists (
         select 1 from public.sequence_enrollments o
          where o.sequence_id = e.sequence_id and o.state = 'in' and o.id <> e.id
            and case when e.lead_id is null then o.lead_id is null and o.contact_id = e.contact_id
                     else o.lead_id = e.lead_id end)
    returning e.id)
  select count(*) into v_back from back;
  -- A lead the leave took off the list (00455) is on it again, unless it was added back since.
  with mem as (
    select (x->>'id')::uuid as id from jsonb_array_elements(coalesce(v_left.payload #> '{put_back,members}', '[]'::jsonb)) x),
  onto as (
    update public.lead_search_members m set blanked_at = null, version = m.version + 1
      from mem w
     where m.id = w.id and m.tenant_id = p_tenant_id and m.blanked_at >= v_left.created_at
       and not exists (select 1 from public.lead_search_members o
                        where o.search_id = m.search_id and o.lead_id = m.lead_id and o.id <> m.id
                          and o.blanked_at is null)
    returning m.id, m.search_id)
  select count(*), min(o.search_id::text)::uuid into v_on, v_list from onto o;
  -- The list's own event, as an add writes it (reach_out_add).
  if v_on > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'reach_out.lead_added', 'lead', 'playbook', p_sequence_id,
            jsonb_build_object('search_id', v_list, 'n', v_on, 'by', v_actor, 'put_back', true));
  end if;
  v_back := v_back + v_on + v_fresh;
  return jsonb_build_object('back', v_back, 'sends_out', case when v_back > 0 then greatest(v_out - v_freed, 0) else 0 end,
                            'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'return_to_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('back', v_back), p_via, p_undo_of);
end $$;
