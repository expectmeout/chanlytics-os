-- 00447: who is in a sequence says the email handed to its owner (decision 0060; the Sequences parity review of 15 Oct
-- 2026, wiring W2). sequence_people's to_send rows carry their draft as it was handed over (00429: its address, subject
-- and words with the foot, whether it follows an email before, its angle and when it was handed), so a sequence's People
-- lays out what needs you from its one read, as the run's sheet in Sent does from the run's, and never reads each batch's
-- run beside it. A held row already carries why it was held (reason, hold_detail), which its answers are made from.
--
-- A draft the send door would refuse now (its lead said no, closed, or became a customer since) is still listed, as the
-- sequence's count of what needs you counts it: the clock skips it on its next tick, and a word on it said meanwhile is
-- the door's to answer. Nothing else changes: the same groups, counts, rows and order, under the caller's row security.
-- Applied before the dashboard deploys or after: a dashboard without it reads no draft and opens the run's sheet instead.
-- Re-runnable.

set local lock_timeout = '3s';

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
             when l.state in ('queued', 'planned', 'claimed') then 'next'
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
  rows_of as (
    -- An email handed to its owner, whole (00429 sequence_sends_drafted_is_whole): what their mail app opens with.
    select p.grp, p.contact_id, p.lead_id, p.place, p.at, p.reason as why, p.hold_detail, p.send_id, p.batch_id,
           null::uuid as enrollment_id,
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
           null::jsonb
      from between b
    union all
    select case when e.state = 'done' then 'done' else 'left' end, e.contact_id, e.lead_id, e.place, e.at, e.why,
           null, null, null, e.enrollment_id, null::jsonb
      from enrolled e where e.state in ('done', 'left')
  ),
  named as (
    select r.*,
           coalesce(c.display_name, c.wa_profile_name, ld.business_name) as name,
           row_number() over (partition by r.grp
                              order by case when r.grp in ('done', 'left') then r.at end desc nulls last, r.at, r.contact_id, r.lead_id) as pos
      from rows_of r
      left join public.contacts c on c.id = r.contact_id and c.erased_at is null
      left join public.leads ld on ld.id = r.lead_id
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
                        'draft', n.draft) order by n.grp, n.pos)
                        from named n where n.pos <= (select l.n from lim l)), '[]'::jsonb))
$$;

comment on function public.sequence_people(uuid, uuid, integer) is
  'Who is in a sequence (0060), by where they stand, each group''s count whole and its first p_limit (1 to 200, 50) rows: waiting (a batch waiting for your OK), held (by the check, with why), to_send (an email for you to send, with its draft as it was handed over: 00447), next (going out), in (between steps, their next step''s day), done, and left (with why). A person by their name, a lead by its business''s. Under the caller''s row security.';
