-- 00455: a lead's place in its sequence stays true (the lead sheet, in Sequences' words: Sequences' pieces first).
--
-- Five things said one way on the sheet and on a sequence's record:
--  1. A later step follows up only someone whose place still stands. A lead taken out between steps, with nothing of
--     theirs pending to skip, was followed up anyway: reach_out_followers never read the place. And a lead the planner
--     refuses (stopped, wrote back, set aside, unsubscribed, bounced) was dropped by the read, so nothing ever ended its
--     place and it stood "in it" for good. Now the read returns them, and the planner passes them over through
--     sequence_leads_leave, whose why the record says. Only someone away still waits: the step takes them back. A
--     page holds as many it may write to as the limit and as many refused beside them, so passing over never delays a
--     day's emails.
--  2. Stop writing ends every place of the lead's still standing, not only one with a send pending; a place with an
--     email on its way stays until it has gone, and the next step passes them over.
--  3. Take out takes a lead by its id (sequence_leave's p_lead_ids): by its place while it stands, and one on the
--     sequence's list that nothing has been planned for comes off the list, which Put back puts on again (kept in the
--     decision's put_back).
--  4. Who wrote back to a sequence and waits for an answer is People's own group, replied, with their reading: the
--     same replies the overview counts as needing you (00442), a person once, by their newest.
--  5. A lead's story (reach_out_lead_timeline) carries its place, so the lead sheet says Left when a leave ended it
--     between steps, which moved no send of theirs.
-- Re-runnable: each function is re-made whole; sequence_leave gains a parameter, so its old form is dropped first.

/* ------------------------------------------------------------- 1. the follow-up passes over, by name -- */

create or replace function public.reach_out_followers(p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days integer, p_limit integer)
 returns TABLE(lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid, facts jsonb, bounced boolean, mailbox_id uuid, country text)
 language sql
 stable security definer
 set search_path to 'public'
as $$
  -- A page holds as many it may write to as the limit, and as many refused beside them (00455): the planner passes over
  -- whom it refuses (sequence_leads_leave), so their place ends with why instead of standing for good, and those passed
  -- over never crowd out a day's emails. Only someone away waits: the step takes them back after the day named.
  select g.lead_id, g.contact_id, g.email, g.region, g.hours, g.parent_message_id, g.facts, g.bounced, g.mailbox_id,
         g.country
    from (
      select f.*, row_number() over (partition by f.writes order by f.sent_at) as n
        from (
          select d.*,
                 coalesce(d.facts->>'lead_stage' in ('ready', 'nurture'), false)
                   and not coalesce((d.facts->>'suppressed')::boolean, true)
                   and not coalesce((d.facts->>'wrote_back')::boolean, true)
                   and not coalesce((d.facts->>'stopped')::boolean, false)
                   and not d.bounced as writes
            from (
      select l.id as lead_id, s.contact_id, lower(btrim(l.email)) as email, l.region, l.hours,
             s.message_id as parent_message_id, s.sent_at, s.mailbox_id, l.country,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.sequence_sends b join public.messages bm on bm.id = b.message_id
                      where b.lead_id is not null and ( b.sequence_id = s.sequence_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed'))) as bounced
        from public.sequence_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        join public.messages m on m.id = s.message_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = p_parent_id and s.state = 'sent'
         and s.sent_at <= now() - make_interval(days => p_after_days)
         and s.contact_id is not null
         -- Only someone whose place in the sequence still stands (00455): taken out, stopped or passed over is not
         -- followed up, even with nothing of theirs pending when they left.
         and exists (select 1 from public.sequence_enrollments e
                      where e.tenant_id = p_tenant_id and e.sequence_id = s.sequence_id and e.lead_id = l.id
                        and e.state = 'in')
         and not exists (select 1 from public.sequence_sends x
                          where x.lead_id is not null and ( x.step_id = p_step_id and x.lead_id = l.id
                            and not (x.state = 'skipped' and x.reason = 'outreach_away'))))
            ) d
           where not coalesce((d.facts->>'away')::boolean, false)
        ) f
    ) g
   where g.n <= greatest(p_limit, 0)
   order by g.writes desc, g.sent_at
$$;

revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;

create or replace function public.sequence_leads_leave(p_tenant_id uuid, p_sequence_id uuid, p_leads jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int := 0;
  r record;
begin
  if p_tenant_id is null or p_sequence_id is null or jsonb_typeof(p_leads) is distinct from 'array' then
    return 0;
  end if;
  -- Each why once, its leads' places in this sequence that still stand: sequence_enrollments_leave ends them and skips
  -- whatever of theirs had not gone.
  for r in
    select left(btrim(x->>'why'), 60) as why, array_agg(e.id) as ids
      from jsonb_array_elements(p_leads) x
      join public.sequence_enrollments e
        on e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id and e.state = 'in'
       and e.lead_id = (x->>'lead_id')::uuid
     where nullif(btrim(x->>'why'), '') is not null
     group by left(btrim(x->>'why'), 60)
  loop
    v_n := v_n + public.sequence_enrollments_leave(p_tenant_id, r.ids, r.why, null);
  end loop;
  return v_n;
end $$;

revoke all on function public.sequence_leads_leave(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sequence_leads_leave(uuid, uuid, jsonb) to service_role;
comment on function public.sequence_leads_leave(uuid, uuid, jsonb) is
  'Leads a later step passes over (00455): each {lead_id, why} whose place in p_sequence_id still stands leaves with why, and a send of theirs not yet gone is skipped (sequence_enrollments_leave). Service role only. How many left.';

/* --------------------------------------------------------------- 2. Stop writing ends every place -- */

create or replace function public.reach_out_lead_stop(p_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
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

revoke execute on function public.reach_out_lead_stop(uuid) from public, anon;
grant execute on function public.reach_out_lead_stop(uuid) to authenticated, service_role;

/* ------------------------------------------------- 3. Take out, before anything has been planned -- */

drop function if exists public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid);

create or replace function public.sequence_leave(p_tenant_id uuid, p_sequence_id uuid, p_enrollment_ids uuid[],
                                                p_why text default 'removed',
                                                p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                p_undo_of uuid default null, p_lead_ids uuid[] default '{}')
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
  v_root public.sequence_steps%rowtype;
  v_members jsonb := '[]'::jsonb;
  v_off int := 0;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Only their places in this sequence: an id of another sequence, or another workspace, is nobody here.
  select array_agg(e.id) into v_ids from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
     and (e.id = any (coalesce(p_enrollment_ids, '{}'))
          -- A lead named by its id (00455: the lead sheet's Take out) leaves by its place, while it stands.
          or (e.lead_id = any (coalesce(p_lead_ids, '{}')) and e.state = 'in'));
  -- A lead on the sequence's list that nothing has been planned for has no place to end (00455): it comes off the
  -- list, as reach_out_leave_out took it, and the leave keeps each membership for Put back. Only a list's: a
  -- sequence fed by its own search takes its leads out on Leads.
  if coalesce(cardinality(p_lead_ids), 0) > 0 then
    select st.* into v_root from public.sequence_steps st
      join public.lead_searches q on q.id = st.lead_search_id and q.tenant_id = st.tenant_id
     where st.tenant_id = p_tenant_id and st.sequence_id = p_sequence_id and st.kind = 'reach_out'
       and st.trigger = 'lead_first' and q.removed_at is null and q.via in ('chosen', 'import');
    if found then
      with off as (
        update public.lead_search_members m set blanked_at = now(), version = m.version + 1
         where m.tenant_id = p_tenant_id and m.search_id = v_root.lead_search_id and m.blanked_at is null
           and m.lead_id = any (p_lead_ids)
           and not exists (select 1 from public.sequence_enrollments e
                            where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
                              and e.lead_id = m.lead_id)
        returning m.id, m.lead_id)
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'lead_id', o.lead_id)), '[]'::jsonb), count(*)
        into v_members, v_off from off o;
      -- The list's own event, as Leave out writes it (reach_out_leave_out).
      if v_off > 0 then
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', v_root.id,
                jsonb_build_object('search_id', v_root.lead_search_id, 'n', v_off, 'by', v_actor, 'left_out', true));
      end if;
    end if;
  end if;
  if v_ids is null and v_off = 0 then
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
  v_n := public.sequence_enrollments_leave(p_tenant_id, coalesce(v_ids, '{}'), v_why, v_actor) + v_off;
  return jsonb_build_object('left', v_n, 'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'leave_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object(
           'left', v_n, 'put_back', jsonb_build_object('why', v_why, 'places', v_places, 'sends', v_sends,
                                                      'members', v_members)),
         p_via, p_undo_of);
end $$;

revoke all on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid, uuid[]) from public, anon;
grant execute on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid, uuid[]) to authenticated;
comment on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid, uuid[]) is
  'People taken out of a sequence by an acting member (0060): each still in it leaves with p_why (removed), a send of theirs not yet gone skipped with it; a lead named by its id (p_lead_ids, 00455) leaves by its place, or, with none, comes off the list. The leave_sequence decision rides in the same transaction, keeping each place''s next step, how many sends it skipped and each membership (put_back) for sequence_return. Answers how many left.';

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
  v_back := v_back + v_on;
  return jsonb_build_object('back', v_back, 'sends_out', case when v_back > 0 then v_out else 0 end,
                            'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'return_to_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('back', v_back), p_via, p_undo_of);
end $$;

revoke all on function public.sequence_return(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.sequence_return(uuid, uuid, jsonb, text, uuid) to authenticated;

/* -------------------------------------------------------------------------- 4. who wrote back -- */

create or replace function public.sequence_people(p_tenant_id uuid, p_sequence_id uuid, p_limit integer default 50)
returns jsonb
language sql stable
set search_path = ''
as $$
  with lim as (select least(greatest(coalesce(p_limit, 50), 1), 200) as n),
  -- Each person's latest send in the sequence: where they stand now.
  latest as (
    select distinct on (coalesce(s.lead_id, s.contact_id))
           s.id as send_id, s.batch_id, s.step_id, s.contact_id, s.lead_id, s.state, s.reason, s.hold_detail,
           s.send_at, s.sent_at, s.drafted_at, s.created_at, s.draft, s.angle, b.state as batch_state, b.scheduled_for
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
     where s.tenant_id = p_tenant_id and s.sequence_id = p_sequence_id
     order by coalesce(s.lead_id, s.contact_id), s.created_at desc, s.id desc
  ),
  placed as (
    select l.*, st.place,
           case
             when l.state = 'held' then 'held'
             when l.state = 'drafted' then 'to_send'
             when l.batch_state = 'pending_approval' and l.state in ('queued', 'planned') then 'waiting'
             when l.state in ('queued', 'planned', 'claimed') and l.batch_state not in ('canceled', 'failed') then 'next'
             else null
           end as grp,
           coalesce(l.drafted_at, l.send_at, l.scheduled_for, l.created_at) as at
      from latest l
      left join public.sequence_steps st on st.id = l.step_id
  ),
  enrolled as (
    select e.id as enrollment_id, e.contact_id, e.lead_id, e.state, e.place, e.why, e.next_at, e.sent_at,
           coalesce(e.ended_at, e.moved_at) as at
      from public.sequence_enrollments e
     where e.tenant_id = p_tenant_id and e.sequence_id = p_sequence_id
  ),
  -- Someone in it between steps (no send of theirs pending), and those done or out, from their enrollments.
  between as (
    select e.* from enrolled e
     where e.state = 'in'
       and not exists (select 1 from placed p where p.grp is not null
                         and coalesce(p.lead_id, p.contact_id) = coalesce(e.lead_id, e.contact_id))
  ),
  -- Someone whose reply asks for an answer (00455), as the overview counts one (00442 sequence_overview's
  -- replies): a person interested or asking, read in the last 14 days, not answered or undone. Their newest.
  replied as (
    select distinct on (coalesce(r.lead_id, r.contact_id))
           r.contact_id, r.lead_id, r.conversation_id, r.intent, r.summary, r.read_at, st.place
      from public.sequence_replies r
      join public.sequence_sends s on s.id = r.send_id and s.tenant_id = p_tenant_id and s.sequence_id = p_sequence_id
      left join public.sequence_steps st on st.id = s.step_id
     where r.tenant_id = p_tenant_id and r.undone_at is null and r.answered_message_id is null
       and r.claim in ('person', 'owner') and r.intent in ('interested', 'question')
       and r.read_at > now() - interval '14 days'
     order by coalesce(r.lead_id, r.contact_id), r.read_at desc
  ),
  rows_of as (
    -- An email handed to its owner, whole (00429 sequence_sends_drafted_is_whole): what their mail app opens with.
    select p.grp, p.contact_id, p.lead_id, p.place, p.at, p.reason as why, p.hold_detail, p.send_id, p.batch_id,
           null::uuid as enrollment_id, null::jsonb as reply,
           case when p.grp = 'to_send' and jsonb_typeof(p.draft) = 'object'
                     and jsonb_typeof(p.draft -> 'to') = 'string' and jsonb_typeof(p.draft -> 'subject') = 'string'
                     and jsonb_typeof(p.draft -> 'text') = 'string'
                then jsonb_build_object(
                       'to', p.draft ->> 'to',
                       'subject', p.draft ->> 'subject',
                       'text', p.draft ->> 'text',
                       'follow_up', coalesce(jsonb_typeof(p.draft -> 'parent_id') = 'string', false),
                       'angle', p.angle,
                       'drafted_at', coalesce(p.drafted_at, p.created_at))
           end as draft
      from placed p where p.grp is not null
    union all
    select 'in', b.contact_id, b.lead_id, b.place, coalesce(b.next_at, b.at), null, null, null, null, b.enrollment_id,
           null::jsonb, null::jsonb
      from between b
    union all
    select case when e.state = 'done' then 'done' else 'left' end, e.contact_id, e.lead_id, e.place, e.at, e.why,
           null, null, null, e.enrollment_id, null::jsonb, null::jsonb
      from enrolled e where e.state in ('done', 'left')
    union all
    -- Their place, while it stands, so Take out reaches them here too.
    select 'replied', rp.contact_id, rp.lead_id, rp.place, rp.read_at, rp.intent, null, null, null,
           (select e.enrollment_id from enrolled e
             where e.state = 'in' and coalesce(e.lead_id, e.contact_id) = coalesce(rp.lead_id, rp.contact_id)
             limit 1),
           jsonb_build_object('intent', rp.intent, 'summary', rp.summary, 'conversation_id', rp.conversation_id),
           null::jsonb
      from replied rp
  ),
  named as (
    select r.*,
           coalesce(c.display_name, c.wa_profile_name, ld.business_name) as name,
           row_number() over (partition by r.grp
                              order by case when r.grp in ('done', 'left') then r.at end desc nulls last, r.at, r.contact_id, r.lead_id) as pos
      from rows_of r
      left join public.contacts c on c.id = r.contact_id and c.erased_at is null
      left join public.leads ld on ld.id = r.lead_id
     -- Who wrote back shows there alone, not again where their place stands.
     where r.grp = 'replied' or not exists (select 1 from replied rp
                                            where coalesce(rp.lead_id, rp.contact_id) = coalesce(r.lead_id, r.contact_id))
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(g.grp, g.n) from (select grp, count(*) as n from named group by grp) g),
                       '{}'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
                        'group', n.grp,
                        'contact_id', n.contact_id,
                        'lead_id', n.lead_id,
                        'enrollment_id', n.enrollment_id,
                        'send_id', n.send_id,
                        'batch_id', n.batch_id,
                        'name', n.name,
                        'place', n.place,
                        'at', n.at,
                        'why', n.why,
                        'hold_detail', n.hold_detail,
                        'draft', n.draft,
                        'reply', n.reply) order by n.grp, n.pos)
                        from named n where n.pos <= (select l.n from lim l)), '[]'::jsonb))
$$;

grant execute on function public.sequence_people(uuid, uuid, integer) to authenticated, service_role;
comment on function public.sequence_people(uuid, uuid, integer) is
  'Who is in a sequence (0060), by where they stand, each group''s count whole and its first p_limit (1 to 200, 50) rows: replied (a reply that asks for an answer, as the overview counts one, with their newest reading: 00455), waiting (a batch waiting for your OK), held (by the check, with why), to_send (an email for you to send, with its draft as it was handed over: 00447), next (going out: never a send of a batch cut off, 00453), in (between steps, their next step''s day), done, and left (with why). A person by their name, a lead by its business''s. Under the caller''s row security.';
/* ----------------------------------------------------------------- 5. the place on a lead's story -- */

create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_lead  public.leads%rowtype;
  v_root  uuid;
  v_sent  boolean := false;
  v_added timestamptz;
  v_via   text;
begin
  -- A partner's seat counts for the calling session only once it showed its second factor (0013, 00261).
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads l
   where l.id = p_lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null;
  if not found then
    return null;
  end if;
  select s.sequence_id as root_id into v_root from public.sequence_sends s
   where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id
     and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))
   order by s.created_at desc
   limit 1;
  v_sent := v_root is not null;
  -- Not written yet: the reach-out whose search holds it (a list it was added to, or the search that found it), 00426.
  if v_root is null then
    select p.id, m.created_at into v_root, v_added
      from public.sequence_steps p
      join public.lead_search_members m on m.search_id = p.lead_search_id and m.lead_id = v_lead.id
     where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
       and m.blanked_at is null and m.class = 'qualified' and m.counted
     order by m.created_at desc
     limit 1;
  end if;
  select q.via into v_via from public.sequence_steps p join public.lead_searches q on q.id = p.lead_search_id
   where p.id = v_root;
  return jsonb_build_object(
    'lead_id', v_lead.id,
    'business_name', v_lead.business_name,
    'stage', v_lead.stage,
    'closed_reason', v_lead.closed_reason,
    'found_at', v_lead.found_at,
    'email_state', v_lead.email_state,
    'resume_at', v_lead.resume_at,
    'booked_at', v_lead.booked_at,
    'won_at', (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
                where d.tenant_id = p_tenant_id and d.lead_id = v_lead.id and d.stage = 'won'),
    'stopped_at', v_lead.reach_out_stopped_at,
    -- Found on a listing (the finder's), or brought on a list of the owner's own with no place (00242).
    'found_on_listing', v_lead.place_id is not null,
    -- What the lead is and where it came from (00430): a company found by the people card was on no listing, and is not
    -- a list's either.
    'kind', v_lead.kind,
    'source', v_lead.source,
    -- When it was put on its reach-out's list, while nothing has been written to it (00426).
    'added_at', case when not v_sent and v_via in ('chosen', 'import') then v_added end,
    'chain', (select jsonb_build_object(
                'root_id', p.id, 'name', p.name, 'state', p.state,
                'fed_by', case when v_via in ('chosen', 'import') then 'list' else 'search' end,
                'run_hour', p.run_hour, 'last_run_for', p.last_run_for,
                'waiting_run_id', (select b.id from public.sequence_batches b
                                    where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                      and b.audience->>'root_id' = p.id::text and b.state = 'pending_approval'
                                    order by b.created_at desc limit 1),
                'steps', (with recursive c as (
                            select x.id, x.after_days, x.hand, 0 as n from public.sequence_steps x where x.id = p.id
                            union all
                            select x.id, x.after_days, x.hand, c.n + 1
                              from public.sequence_steps x join c on x.after_step_id = c.id
                          )
                          select coalesce(jsonb_agg(jsonb_build_object('n', c.n, 'after_days', c.after_days,
                                                                       'hand', c.hand->>'kind') order by c.n), '[]'::jsonb)
                            from c))
                from public.sequence_steps p where p.id = v_root and p.tenant_id = p_tenant_id),
    -- The chain's search when there is one, else the newest search that found the lead.
    'search', coalesce(
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.sequence_steps p
         join public.lead_searches q on q.id = p.lead_search_id and q.tenant_id = p_tenant_id
         left join public.lead_search_members sm on sm.search_id = q.id and sm.lead_id = v_lead.id
        where p.id = v_root),
      (select jsonb_build_object('id', q.id, 'name', q.name, 'asked', q.asked, 'fit', sm.fit)
         from public.lead_search_members sm
         join public.lead_searches q on q.id = sm.search_id and q.removed_at is null
        where sm.tenant_id = p_tenant_id and sm.lead_id = v_lead.id and sm.blanked_at is null
        order by sm.created_at desc
        limit 1)),
    -- The person's email thread: where the reach-out's emails, and the answers to them, are.
    'conversation_id', (select m.conversation_id from public.sequence_sends s join public.messages m on m.id = s.message_id
                         where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = v_lead.id and s.state = 'sent')
                         order by s.sent_at desc
                         limit 1),
    'sends', coalesce((
      with recursive c as (
        select p.id, 0 as n from public.sequence_steps p where p.id = v_root
        union all
        select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
      )
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'n', c.n,
               'hand', p.hand->>'kind',
               'state', s.state,
               'reason', s.reason,
               'send_at', s.send_at,
               'sent_at', coalesce(s.sent_at, case when s.state = 'failed' and public.email_left(m.status, m.error)
                                                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end),
               'left', s.state = 'sent' or (s.state = 'failed' and coalesce(public.email_left(m.status, m.error), false)),
               'angle', s.angle,
               'host', b.host,
               'from', b.address,
               'message_id', s.message_id,
               'email_status', m.status,
               'bounced', coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false))
             order by coalesce(s.sent_at, s.send_at, s.created_at), s.id)
        from (select * from public.sequence_sends x
               where x.lead_id is not null and ( x.tenant_id = p_tenant_id and x.lead_id = v_lead.id and x.sequence_id = v_root)
               order by x.created_at desc
               limit 20) s
        left join c on c.id = s.step_id
        left join public.sequence_steps p on p.id = s.step_id
        left join public.mailbox_connections b on b.id = s.mailbox_id
        left join public.messages m on m.id = s.message_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'message_id', r.message_id,
               'read_at', r.read_at,
               'intent', r.intent,
               'claim', r.claim,
               'summary', r.summary,
               'undone', r.undone_at is not null,
               'until_at', r.until_at,
               -- What the reading did, as its door recorded it (contracts readingPlan): the page says it, never re-derives it.
               'stops', coalesce((r.plan->>'stops')::boolean, false),
               'convert', coalesce((r.plan->>'convert')::boolean, false),
               'said_no', coalesce((r.plan->>'saidNo')::boolean, false),
               'can_undo', public.reach_out_reply_undoable(r.message_id) is null)
             order by r.read_at desc)
        from (select * from public.sequence_replies x
               where x.tenant_id = p_tenant_id and x.lead_id = v_lead.id
               order by x.read_at desc
               limit 10) r), '[]'::jsonb),
    -- Stop writing to them asks of a lead something was written to (reach_out_lead_stop refuses the others).
    'can_stop', v_sent and v_lead.reach_out_stopped_at is null,
    -- Their place in it (00455), the one record of where they stand: a leave between steps moves no send of theirs.
    'place', (select jsonb_build_object('id', e.id, 'state', e.state, 'why', e.why, 'next_at', e.next_at)
                from public.sequence_enrollments e
               where e.tenant_id = p_tenant_id and e.sequence_id = v_root and e.lead_id = v_lead.id
               order by e.entered_at desc limit 1)
  );
end $$;
