-- 00450: a person taken out of a sequence can be put back (decision 0060, S3: "leave out, stop, undo one person"). A
-- leave (00442 sequence_leave) ended each place and skipped each send not yet gone, and kept nothing of what the places
-- were, so a member's mistake could not be undone. Now the leave keeps, in its decision, each place's next step and how
-- many sends it skipped (`put_back`), and sequence_return puts each place back as the leave found it: still out for that
-- same reason, by the same member, and nobody of theirs back in the sequence since. A send it skipped stays skipped: a
-- skipped send is final (sequence_sends' guard), so a batch already made goes without them, and their next steps come as
-- they would have. Its own decision, return_to_sequence, names the leave it undoes, and answers how many sends stayed out
-- so its receipt can say so.
--
-- A leave made before this migration kept nothing to put back: its undo is refused in words. Applied before the
-- dashboard deploys or after: a dashboard without its route offers no undo. Re-runnable.

set local lock_timeout = '3s';

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb = any (array[
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply',
  'cancel_send', 'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
  'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
  'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule',
  'add_to_list', 'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge',
  'change_playbook', 'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence',
  'answer_booking_request', 'return_to_sequence'
]));

create or replace function public.sequence_leave(p_tenant_id uuid, p_sequence_id uuid, p_enrollment_ids uuid[],
                                                p_why text default 'removed',
                                                p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_why text := left(coalesce(nullif(btrim(p_why), ''), 'removed'), 60);
  v_ids uuid[];
  v_places jsonb;
  v_sends int;
  v_n int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Only their places in this sequence: an id of another sequence, or another workspace, is nobody here.
  select array_agg(e.id) into v_ids from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id and e.id = any (coalesce(p_enrollment_ids, '{}'));
  if v_ids is null then
    raise exception 'Nobody of that sequence is in it.' using errcode = 'P0002';
  end if;
  -- What the leave is about to change, as it stands now (sequence_enrollments_leave's own choice of rows), kept in the
  -- decision so its undo puts back exactly these places, and can say how many sends stay out.
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'next_at', e.next_at)), '[]'::jsonb) into v_places
    from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.id = any (v_ids) and e.state = 'in';
  select count(*) into v_sends
    from public.sequence_enrollments e
    join public.sequence_sends s
      on s.tenant_id = p_tenant_id and s.sequence_id = e.sequence_id
     and case when e.lead_id is null then s.lead_id is null and s.contact_id = e.contact_id
              else s.lead_id = e.lead_id end
   where e.tenant_id = p_tenant_id and e.id = any (v_ids) and e.state = 'in'
     and s.state in ('planned', 'held', 'queued', 'drafted');
  v_n := public.sequence_enrollments_leave(p_tenant_id, v_ids, v_why, v_actor);
  return jsonb_build_object('left', v_n, 'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'leave_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object(
           'left', v_n, 'put_back', jsonb_build_object('why', v_why, 'places', v_places, 'sends', v_sends)),
         p_via, p_undo_of);
end $$;

comment on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid) is
  'People taken out of a sequence by an acting member (0060): each still in it leaves with p_why (removed), a send of theirs not yet gone skipped with it, and the leave_sequence decision written in the same transaction, keeping each place''s next step and how many sends it skipped (put_back, 00450) for sequence_return. Answers how many left.';

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
  return jsonb_build_object('back', v_back, 'sends_out', case when v_back > 0 then v_out else 0 end,
                            'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'return_to_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('back', v_back), p_via, p_undo_of);
end $$;

revoke all on function public.sequence_return(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.sequence_return(uuid, uuid, jsonb, text, uuid) to authenticated;
comment on function public.sequence_return(uuid, uuid, jsonb, text, uuid) is
  'A leave undone (0060, 00450): of the places a leave_sequence decision (p_undo_of) ended, each still out for its reason, by its member, with nobody of theirs back in since, is put back with its next step. A send the leave skipped stays skipped (a skipped send is final). The return_to_sequence decision rides in the same transaction. Answers how many came back and how many sends stayed out.';
