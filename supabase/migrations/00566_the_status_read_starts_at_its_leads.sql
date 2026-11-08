-- 00566 · The status read starts at its leads.
--
-- sequence_places (00554) joined each send to its batch before it picked each person's newest send in each sequence, so a
-- read of a few leads (lead_status_groups, which Leads' status asks) could be planned from the workspace's batches,
-- walking every send in each through sequence_sends_batch_id_lead_id_key. CI's database check read 37 blocks of that key
-- for 20 leads beside 3,000 other sends of their workspace, and 95 beside 9,000 (8 Nov 2026, main at 39591e4c87). The
-- newest send is now picked from the sends alone, by the leads' own keys, and its batch read after it by the batch's key.
-- What each row says is unchanged: a send in a sequence always has its batch (sequence_sends_own_is_a_leads, and the
-- batch key is the same workspace's), and a send with no sequence stood nowhere here before either.
--
-- Re-runnable.

create or replace function public.sequence_places(
  p_tenant_id uuid, p_sequence_id uuid default null, p_lead_ids uuid[] default null, p_standing_leads boolean default false
)
returns table (grp text, sequence_id uuid, contact_id uuid, lead_id uuid, enrollment_id uuid, send_id uuid, batch_id uuid,
               place integer, at timestamptz, why text, hold_detail text, draft jsonb, reply jsonb)
language plpgsql
stable
set search_path = ''
set work_mem = '64MB'
as $fn$
begin
  -- One text, planned with the values each call hands it, so a list of leads or a sequence is an index condition. A SQL
  -- function is planned without them: "p_lead_ids is null or ..." read every send of the workspace, whatever it was asked.
  -- Each person is one column, so two of these walks join on who and in what order they already stand, whatever the planner
  -- guesses of how many there are.
  return query execute $q$
  -- Each one's newest send in each sequence, picked from the sends alone, its batch read after by its key: joined before the
  -- pick, a read of a few leads could start from the workspace's batches and walk every send in each (00566). A send with
  -- no batch is a lead's own, with no sequence (sequence_sends_own_is_a_leads), and stands nowhere here.
  with newest as (
    select distinct on (s.sequence_id, coalesce(s.lead_id, s.contact_id))
           s.sequence_id, coalesce(s.lead_id, s.contact_id) as person, s.id as send_id, s.batch_id, s.step_id, s.contact_id,
           s.lead_id, s.state, s.reason, s.hold_detail, s.send_at, s.sent_at, s.drafted_at, s.created_at
      from public.sequence_sends s
     where s.tenant_id = $1
       and ($2 is null or s.sequence_id = $2)
       and ($3 is null or (s.lead_id is not null and s.lead_id = any ($3)))
       -- What stands of a lead is an open send, the newest of its lead there: this walks the open ones, not every one sent.
       and (not $4 or (s.lead_id is not null and s.state in ('held', 'drafted', 'queued', 'planned', 'claimed')
                       and not exists (select 1 from public.sequence_sends n
                                        where n.tenant_id = $1 and n.lead_id = s.lead_id and n.sequence_id = s.sequence_id
                                          and (n.created_at, n.id) > (s.created_at, s.id))))
     order by s.sequence_id, coalesce(s.lead_id, s.contact_id), s.created_at desc, s.id desc
  ),
  latest as (
    select n.*, b.state as batch_state, b.scheduled_for
      from newest n
      join public.sequence_batches b on b.id = n.batch_id
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
  -- Each one's latest place in each sequence: someone who came back (started again, moved back) is where they are now.
  enrolled as (
    select distinct on (e.sequence_id, coalesce(e.lead_id, e.contact_id))
           e.id as enrollment_id, e.sequence_id, coalesce(e.lead_id, e.contact_id) as person, e.contact_id, e.lead_id, e.state,
           e.place, e.why, e.next_at, e.sent_at, coalesce(e.ended_at, e.moved_at) as at
      from public.sequence_enrollments e
     where e.tenant_id = $1
       and ($2 is null or e.sequence_id = $2)
       and ($3 is null or (e.lead_id is not null and e.lead_id = any ($3)))
       and (not $4 or e.lead_id is not null)
     order by e.sequence_id, coalesce(e.lead_id, e.contact_id), e.entered_at desc, e.id desc
  ),
  between as (
    select e.* from enrolled e
     where e.state = 'in'
       and not exists (select 1 from placed p where p.grp is not null and p.sequence_id = e.sequence_id
                         and p.person = e.person)
  ),
  replied as (
    select distinct on (s.sequence_id, coalesce(r.lead_id, r.contact_id))
           s.sequence_id, coalesce(r.lead_id, r.contact_id) as person, r.contact_id, r.lead_id, r.conversation_id, r.intent,
           r.summary, r.read_at, st.place
      from public.sequence_replies r
      join public.sequence_sends s on s.id = r.send_id and s.tenant_id = $1
                                  and ($2 is null or s.sequence_id = $2)
      left join public.sequence_steps st on st.id = s.step_id
     where r.tenant_id = $1 and r.undone_at is null and r.answered_message_id is null
       and r.claim in ('person', 'owner') and r.intent in ('interested', 'question')
       and r.read_at > now() - interval '14 days'
       and ($3 is null or (r.lead_id is not null and r.lead_id = any ($3)))
       and (not $4 or r.lead_id is not null)
     order by s.sequence_id, coalesce(r.lead_id, r.contact_id), r.read_at desc
  ),
  listed as (
    select r.sequence_id, m.lead_id, m.created_at
      from public.sequence_steps r
      join public.lead_search_members m on m.search_id = r.lead_search_id and m.tenant_id = r.tenant_id
     where r.tenant_id = $1 and r.kind = 'reach_out' and r.trigger = 'lead_first'
       and ($2 is null or r.sequence_id = $2)
       and ($3 is null or m.lead_id = any ($3))
       and m.blanked_at is null and m.class = 'qualified' and m.counted
       and not exists (select 1 from placed p where p.grp is not null and p.sequence_id = r.sequence_id
                         and p.lead_id = m.lead_id)
       -- Never planned here, or moved out and back since (its place there left as moved, the list holding it again).
       and not exists (select 1 from enrolled e where e.sequence_id = r.sequence_id and e.lead_id = m.lead_id
                         and not (e.state = 'left' and e.why = 'moved'))
  ),
  rows_of as (
    select p.grp, p.sequence_id, p.contact_id, p.lead_id, null::uuid as enrollment_id, p.send_id, p.batch_id, p.place,
           p.at, p.reason as why, p.hold_detail,
           -- An email theirs to send says its words: read for those alone, so the walk above carries no draft.
           case when p.grp = 'to_send' and not $4 then (
             select case when jsonb_typeof(d.draft) = 'object'
                              and jsonb_typeof(d.draft -> 'to') = 'string' and jsonb_typeof(d.draft -> 'subject') = 'string'
                              and jsonb_typeof(d.draft -> 'text') = 'string'
                         then jsonb_build_object(
                                'to', d.draft ->> 'to',
                                'subject', d.draft ->> 'subject',
                                'text', d.draft ->> 'text',
                                'follow_up', coalesce(jsonb_typeof(d.draft -> 'parent_id') = 'string', false),
                                'angle', d.angle,
                                'drafted_at', coalesce(p.drafted_at, p.created_at))
                    end
               from public.sequence_sends d where d.id = p.send_id)
           end as draft,
           null::jsonb as reply
      from placed p where p.grp is not null
    union all
    select 'in', b.sequence_id, b.contact_id, b.lead_id, b.enrollment_id, null, null, b.place, coalesce(b.next_at, b.at),
           null, null, null::jsonb, null::jsonb
      from between b
    union all
    select case when e.state = 'done' then 'done' else 'left' end, e.sequence_id, e.contact_id, e.lead_id,
           e.enrollment_id, null, null, e.place, e.at, e.why, null, null::jsonb, null::jsonb
      from enrolled e where e.state in ('done', 'left') and not $4
       and not exists (select 1 from listed l where l.sequence_id = e.sequence_id and l.lead_id = e.lead_id)
    union all
    select 'queued', l.sequence_id, null, l.lead_id, null, null, null, 1, l.created_at, null, null, null::jsonb,
           null::jsonb
      from listed l
    union all
    select 'replied', rp.sequence_id, rp.contact_id, rp.lead_id, e.enrollment_id,
           null, null, rp.place, rp.read_at, rp.intent, null, null::jsonb,
           jsonb_build_object('intent', rp.intent, 'summary', rp.summary, 'conversation_id', rp.conversation_id)
      from replied rp
      -- Each is one row a person a sequence and already in that order: this walks the two side by side. What stands never asks.
      left join enrolled e on not $4 and e.state = 'in' and e.sequence_id = rp.sequence_id and e.person = rp.person
  )
  -- Who wrote back shows there alone, not again where their place stands.
  select r.grp, r.sequence_id, r.contact_id, r.lead_id, r.enrollment_id, r.send_id, r.batch_id, r.place, r.at, r.why,
         r.hold_detail, r.draft, r.reply
    from rows_of r
   where r.grp = 'replied'
      or not exists (select 1 from replied rp where rp.sequence_id = r.sequence_id
                       and rp.person = coalesce(r.lead_id, r.contact_id))
  $q$ using p_tenant_id, p_sequence_id, p_lead_ids, coalesce(p_standing_leads, false);
end
$fn$;

revoke all on function public.sequence_places(uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.sequence_places(uuid, uuid, uuid[], boolean) to authenticated, service_role;

comment on function public.sequence_places(uuid, uuid, uuid[], boolean) is
  'Where each person or lead stands in each sequence, the one reader of a place (00459). Planned with the values each call hands it (00554), so p_lead_ids and p_sequence_id are index conditions; p_standing_leads asks only what stands of a workspace''s leads, and walks their open sends. An email theirs to send says its words, read for those rows alone. Each one''s newest send is picked from the sends before its batch is read (00566), so a read of a few leads never walks a batch.';
