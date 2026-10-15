-- 00441 · A sequence is read and changed through its own doors (decision 0060, steps S0 and S3).
--
-- The Sequences page and Ask read the same four answers and press the same doors:
--
--   sequence_batch_counts      What became of each batch's sends, a customer's and a lead's alike: waiting, sent, skipped,
--                              failed, held, to send, delivered, read (WhatsApp's own receipt) and replied (a person's own
--                              words in the reply window, or a reply's reading of a lead's email). run_counts' rules.
--   sequence_overview          Every sequence of the workspace, or one: how it starts, where it stands, what needs you
--                              (batches waiting for an OK and their people, emails held by the check, emails for you to
--                              send, replies to answer), the batch to come, the last that went, and who is in it.
--   sequence_steps_of          Its steps in their places: each one's message and the words waiting for WhatsApp, its wait
--                              and what must still hold, its channels, and what it sent and drew in the last 30 days.
--   sequence_people            Who is in it, by where they stand: waiting for your OK, held, for you to send, up next, in
--                              it between steps, done, and left with why.
--   sequence_history           What it sent, a batch a row, newest first, each with its counts.
--
--   sequence_step_save         A customer's step after the first, added at the end or changed (D6): its wait, what must
--                              still hold, its message and channels; under the first step's class and hour. A member's own
--                              rights decide it (the steps' policies and column grants); its decision rides in the write.
--   sequence_step_remove       That step taken away, with the steps after it; whoever was waiting for it is done.
--   sequence_step_words        A step's message changed: at once where WhatsApp is not ticked or its version is approved,
--                              else kept waiting for WhatsApp (next_template_*) while the step sends what it sends.
--   sequence_leave             People taken out of a sequence by a member, with why, and its decision.
--   sequence_batch_cancel      A member's cancel of a batch, the one way a session moves a batch's state (S0): the grants
--                              and the policy that let a session write a batch's state go.
--   sequence_create            A new sequence made whole (S4, New): its first step and the steps after it in one write,
--                              kept as a draft that sends nothing until it is started, or started; make_sequence.
--   sequence_discard           A sequence that never made a batch taken away whole: a draft let go, or a new one undone;
--                              discard_sequence.
--
-- A draft stays a draft while its first step does not run: the first step's state says the sequence's (00439), and a
-- draft's turns 'on' when it runs, never 'paused' before.
--
-- Deploy order: this migration first (00439, 00440 before it). A dashboard from before cancels a run by writing its
-- state from the member's session, which this takes away: its Stop says the run could not be stopped until it deploys.
-- Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------- 1. the words a decision says -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (verb in (
  'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back', 'resolve', 'archive', 'reply', 'cancel_send',
  'pause_agent', 'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
  'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook', 'pause_playbook',
  'reply_review', 'export', 'end_call', 'record_deal', 'make_list', 'rename_list', 'change_list_rule', 'add_to_list',
  'drop_from_list', 'archive_list', 'restore_list', 'delete_list', 'import', 'open_recording', 'merge', 'change_playbook',
  'mark_visit', 'change_step', 'leave_sequence', 'make_sequence', 'discard_sequence'));

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check check (subject_type in (
  'conversation', 'escalation', 'draft', 'lead', 'message', 'agent', 'membership', 'invitation', 'contact', 'call',
  'channel', 'broadcast', 'playbook', 'review', 'workspace', 'deal', 'list', 'appointment', 'sequence'));

/* ------------------------------------------------------------------------------------- 2. a batch's counts -- */

create or replace function public.sequence_batch_counts(p_tenant_id uuid, p_batch_ids uuid[])
returns jsonb
language sql stable
set search_path = ''
as $$
  with sends as (
    select s.id, s.batch_id, s.lead_id, s.state, s.sent_at,
           -- The channel it went by (00298): a lead's is email; a customer's naming none went by WhatsApp.
           case when s.channel in ('sms', 'email') then s.channel
                when s.lead_id is not null then 'email' else 'whatsapp' end as channel,
           m.status, m.conversation_id
      from public.sequence_sends s
      left join public.messages m on m.id = s.message_id
     where s.tenant_id = p_tenant_id
       and s.batch_id = any (p_batch_ids)
  ),
  counted as (
    select x.batch_id,
           count(*) filter (where x.state in ('queued', 'planned', 'held', 'claimed', 'drafted')) as waiting,
           count(*) filter (where x.state in ('sent', 'handed'))                              as sent,
           count(*) filter (where x.state = 'skipped')                                        as skipped,
           count(*) filter (where x.state = 'failed')                                         as failed,
           count(*) filter (where x.state = 'held')                                           as held,
           count(*) filter (where x.state = 'drafted')                                        as to_send,
           count(*) filter (where x.status in ('delivered', 'read'))                          as delivered,
           count(*) filter (where x.status = 'read' and x.channel = 'whatsapp')               as was_read
      from sends x
     group by x.batch_id
  ),
  -- A customer's thread, once, from the first time the batch reached it.
  threads as (
    select x.batch_id, x.conversation_id, min(x.sent_at) as sent_at
      from sends x
     where x.lead_id is null and x.conversation_id is not null and x.sent_at is not null
     group by x.batch_id, x.conversation_id
  ),
  -- One probe a thread, as run_counts probes (00374's fence: OFFSET 0 keeps the EXISTS its own).
  customers_replied as (
    select t.batch_id, count(*) as n
      from threads t
     where exists (
             select 1 from public.messages i
              where i.conversation_id = t.conversation_id
                and i.direction = 'inbound'
                and i.sender = 'customer'
                and public.message_is_a_persons_words(i.meta)
                and i.created_at > t.sent_at
                and i.created_at <= t.sent_at + public.campaign_reply_window()
             offset 0)
     group by t.batch_id
  ),
  -- A lead's email answered: a reading of a reply to it, a person's or what its owner said, not undone.
  leads_replied as (
    select x.batch_id, count(distinct x.id) as n
      from sends x
      join public.sequence_replies r on r.send_id = x.id
     where x.lead_id is not null and r.undone_at is null and r.claim in ('person', 'owner')
     group by x.batch_id
  )
  select coalesce(jsonb_object_agg(c.batch_id::text, jsonb_build_object(
           'waiting', c.waiting,
           'sent', c.sent,
           'skipped', c.skipped,
           'failed', c.failed,
           'held', c.held,
           'to_send', c.to_send,
           'delivered', c.delivered,
           'read', c.was_read,
           'replied', coalesce(cr.n, 0) + coalesce(lr.n, 0))), '{}'::jsonb)
    from counted c
    left join customers_replied cr on cr.batch_id = c.batch_id
    left join leads_replied lr on lr.batch_id = c.batch_id
$$;

comment on function public.sequence_batch_counts(uuid, uuid[]) is
  'What became of each batch''s sends (0060), a customer''s and a lead''s: waiting, sent, skipped, failed, held, to_send, delivered, read (WhatsApp''s own receipt) and replied (a person''s own words in the reply window, run_counts'' rule; or a reading of a lead''s reply, not undone). Keyed by batch id. Under the caller''s row security.';

/* ----------------------------------------------------------------------------------------- 3. the readers -- */

create or replace function public.sequence_overview(p_tenant_id uuid, p_sequence_id uuid default null)
returns jsonb
language sql stable
set search_path = ''
as $$
  with q as (
    select * from public.sequences
     where tenant_id = p_tenant_id and (p_sequence_id is null or id = p_sequence_id)
  ),
  steps as (
    select s.sequence_id, count(*) as n,
           array(select distinct c from public.sequence_steps x, unnest(x.channels) c
                  where x.sequence_id = s.sequence_id order by c) as channels
      from public.sequence_steps s
      join q on q.id = s.sequence_id
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
  in_it as (
    select e.sequence_id, count(*) as n
      from public.sequence_enrollments e
      join q on q.id = e.sequence_id
     where e.state = 'in'
     group by e.sequence_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'name', q.name,
           'starts', q.starts,
           'state', q.state,
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
             'owner_sends', f.owner_sends,
             'until', f.until,
             'trial_until', f.trial_until,
             'template_name', f.template_name,
             'template_language', f.template_language) end,
           'date', case when q.starts = 'date' then (
             select jsonb_build_object('batch_id', d.id, 'state', d.state, 'at', d.scheduled_for,
                                       'people', d.recipient_count)
               from public.sequence_batches d where d.id = q.id) end,
           'steps', coalesce(st.n, 0),
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
  'The workspace''s sequences (0060), or the one named: how each starts (its first step, or a one-off''s date), where it stands, its steps and channels, what needs you (batches waiting for an OK and their people, emails held by the check, emails for you to send, replies to answer, the oldest of them), the batch to come, the last that went with its sent and replied, and who is in it. Newest first. Under the caller''s row security.';

create or replace function public.sequence_steps_of(p_tenant_id uuid, p_sequence_id uuid, p_days integer default 30)
returns jsonb
language sql stable
set search_path = ''
as $$
  with steps as (
    select s.* from public.sequence_steps s
     where s.tenant_id = p_tenant_id and s.sequence_id = p_sequence_id
  ),
  batches as (
    select b.id, b.step_id from public.sequence_batches b
     where b.tenant_id = p_tenant_id and b.sequence_id = p_sequence_id
       and coalesce(b.started_at, b.scheduled_for) > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90))
  ),
  counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(b.id), '{}')) as c from batches b
  ),
  by_step as (
    select b.step_id,
           sum(coalesce(((select c from counts) -> b.id::text ->> 'sent')::int, 0))    as sent,
           sum(coalesce(((select c from counts) -> b.id::text ->> 'replied')::int, 0)) as replied
      from batches b
     group by b.step_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'place', s.place,
           'name', s.name,
           'kind', s.kind,
           'trigger', s.trigger,
           'state', s.state,
           'after_days', s.after_days,
           'only_if', to_jsonb(s.only_if),
           'channels', to_jsonb(s.channels),
           'template_id', s.template_id,
           'template_name', s.template_name,
           'template_language', s.template_language,
           'params', s.params,
           'hand', s.hand,
           'next_words', case when s.next_template_name is null then null else jsonb_build_object(
             'template_id', s.next_template_id,
             'name', s.next_template_name,
             'language', s.next_template_language,
             'status', (select t.meta_status from public.templates t
                         where t.tenant_id = s.tenant_id and t.channel = 'whatsapp'
                           and t.name = s.next_template_name and t.language = s.next_template_language
                         order by t.updated_at desc limit 1),
             'rejected_reason', (select t.rejected_reason from public.templates t
                                  where t.tenant_id = s.tenant_id and t.channel = 'whatsapp'
                                    and t.name = s.next_template_name and t.language = s.next_template_language
                                  order by t.updated_at desc limit 1)) end,
           'sent', coalesce(bs.sent, 0),
           'replied', coalesce(bs.replied, 0)
         ) order by s.place), '[]'::jsonb)
    from steps s
    left join by_step bs on bs.step_id = s.id
$$;

comment on function public.sequence_steps_of(uuid, uuid, integer) is
  'A sequence''s steps in their places (0060): each one''s message and the words waiting for WhatsApp with WhatsApp''s answer, its wait and what must still hold of someone due it, its channels, a hand step''s call or note, and what its batches of the last p_days (1 to 90, 30) sent and drew back. Under the caller''s row security.';

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
           s.send_at, s.sent_at, s.drafted_at, s.created_at, b.state as batch_state, b.scheduled_for
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
    select p.grp, p.contact_id, p.lead_id, p.place, p.at, p.reason as why, p.hold_detail, p.send_id, p.batch_id,
           null::uuid as enrollment_id
      from placed p where p.grp is not null
    union all
    select 'in', b.contact_id, b.lead_id, b.place, coalesce(b.next_at, b.at), null, null, null, null, b.enrollment_id
      from between b
    union all
    select case when e.state = 'done' then 'done' else 'left' end, e.contact_id, e.lead_id, e.place, e.at, e.why,
           null, null, null, e.enrollment_id
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
                        'hold_detail', n.hold_detail) order by n.grp, n.pos)
                        from named n where n.pos <= (select l.n from lim l)), '[]'::jsonb))
$$;

comment on function public.sequence_people(uuid, uuid, integer) is
  'Who is in a sequence (0060), by where they stand, each group''s count whole and its first p_limit (1 to 200, 50) rows: waiting (a batch waiting for your OK), held (by the check, with why), to_send (an email for you to send), next (going out), in (between steps, their next step''s day), done, and left (with why). A person by their name, a lead by its business''s. Under the caller''s row security.';

create or replace function public.sequence_history(p_tenant_id uuid, p_sequence_id uuid, p_before timestamptz default null,
                                                  p_limit integer default 30)
returns jsonb
language sql stable
set search_path = ''
as $$
  with lim as (select least(greatest(coalesce(p_limit, 30), 1), 100) as n),
  batches as (
    select b.id, b.step_id, b.state, b.run_for, b.scheduled_for, b.started_at, b.finished_at, b.recipient_count,
           b.failure, coalesce(b.started_at, b.scheduled_for) as at
      from public.sequence_batches b
     where b.tenant_id = p_tenant_id and b.sequence_id = p_sequence_id
       and (p_before is null or coalesce(b.started_at, b.scheduled_for) < p_before)
     order by coalesce(b.started_at, b.scheduled_for) desc, b.id desc
     limit (select l.n + 1 from lim l)
  ),
  page as (select * from batches order by at desc, id desc limit (select l.n from lim l)),
  counts as (select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(p.id), '{}')) as c from page p)
  select jsonb_build_object(
    'batches', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', p.id,
                           'state', p.state,
                           'run_for', p.run_for,
                           'at', p.at,
                           'scheduled_for', p.scheduled_for,
                           'finished_at', p.finished_at,
                           'people', p.recipient_count,
                           'failure', p.failure,
                           'place', (select st.place from public.sequence_steps st where st.id = p.step_id),
                           'counts', coalesce((select c from counts) -> p.id::text, '{}'::jsonb)) order by p.at desc, p.id desc)
                           from page p), '[]'::jsonb),
    'more', (select count(*) from batches) > (select l.n from lim l))
$$;

comment on function public.sequence_history(uuid, uuid, timestamptz, integer) is
  'What a sequence sent (0060), a batch a row, newest first, p_limit (1 to 100, 30) of them before p_before: when, its state, its step''s place, its people and what became of its sends (sequence_batch_counts), and whether there is more. Under the caller''s row security.';

/* ------------------------------------------------------------------------------------------- 4. the doors -- */

-- A member may add a step after the first to a customer's sequence, change it, give a step new words, and take one
-- away, on their own rights (the steps' policies decide which rows): these columns too.
grant insert (after_step_id, after_days, only_if, kind) on public.sequence_steps to authenticated;
grant update (after_days, only_if, next_template_id, next_template_name, next_template_language, next_params)
  on public.sequence_steps to authenticated;

create or replace function public.sequence_step_save(p_tenant_id uuid, p_sequence_id uuid, p_step jsonb,
                                                    p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                    p_undo_of uuid default null)
returns jsonb
language plpgsql
set search_path = public
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
    -- Its message is the workspace's own, named as the row names it, never as the body says.
    select * into v_t from public.templates
     where tenant_id = p_tenant_id and id = nullif(v_step->>'template_id', '')::uuid;
    if v_t.id is null then
      raise exception 'Message not found.' using errcode = 'P0002';
    end if;
    select * into v_last from public.sequence_steps
     where tenant_id = p_tenant_id and sequence_id = p_sequence_id order by place desc limit 1;
    insert into public.sequence_steps (tenant_id, kind, name, trigger, after_step_id, after_days, only_if, template_id,
                                       template_name, template_language, params, policy_class, state, run_hour,
                                       cap_per_run, channels, created_by)
    values (p_tenant_id, 'moment', coalesce(nullif(btrim(v_step->>'name'), ''), v_first.name), 'after_step', v_last.id,
            (v_step->>'after_days')::int, v_only, v_t.id, v_t.name, v_t.language,
            coalesce(v_step->'params', '[]'::jsonb), v_first.policy_class, 'running', v_first.run_hour,
            v_first.cap_per_run, coalesce(nullif(v_channels, '{}'), v_first.channels), v_actor)
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
           params = coalesce(v_step->'params', params)
     where id = v_id
    returning id, place into v_out, v_place;
  end if;
  return jsonb_build_object('id', v_out, 'place', v_place,
    'was', case when v_was.id is null then null else jsonb_build_object(
      'after_days', v_was.after_days, 'only_if', to_jsonb(v_was.only_if), 'channels', to_jsonb(v_was.channels),
      'name', v_was.name, 'params', v_was.params) end)
    || public.member_decision(p_tenant_id, 'sequence', p_sequence_id, 'change_step',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('step_id', v_out, 'added', v_was.id is null),
         p_via, p_undo_of);
end $$;

comment on function public.sequence_step_save(uuid, uuid, jsonb, jsonb, text, uuid) is
  'A customer''s step after the first (D6, 0060), added at the end of its sequence or changed (p_step.id): its wait (after_days), what must still hold (only_if), its message, channels, name and slots; a new one under the first step''s class, hour and cap. On the member''s own rights (the steps'' policies and column grants); the change_step decision rides in the same transaction. Answers id, place, was and the decision''s.';

create or replace function public.sequence_step_remove(p_tenant_id uuid, p_step_id uuid,
                                                      p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                      p_undo_of uuid default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_step public.sequence_steps%rowtype;
  v_gone int;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_step from public.sequence_steps
   where tenant_id = p_tenant_id and id = p_step_id and kind = 'moment' for update;
  if v_step.id is null or v_step.id = v_step.sequence_id then
    raise exception 'Step not found.' using errcode = 'P0002';
  end if;
  select count(*) into v_gone from public.sequence_steps
   where sequence_id = v_step.sequence_id and place >= v_step.place;
  -- The steps after it go with it (after_step_id cascades).
  delete from public.sequence_steps where id = p_step_id;
  return jsonb_build_object('id', p_step_id, 'removed', v_gone, 'sequence_id', v_step.sequence_id)
    || public.member_decision(p_tenant_id, 'sequence', v_step.sequence_id, 'change_step',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('step_id', p_step_id, 'removed', true),
         p_via, p_undo_of);
end $$;

comment on function public.sequence_step_remove(uuid, uuid, jsonb, text, uuid) is
  'A customer''s step after the first taken away (0060), with the steps after it; never a first step (pause or remove the sequence instead). Whoever waited for it is done (sequence_steps_gone_ends_the_wait). On the member''s own rights; the change_step decision rides in the same transaction.';

-- A step taken away: whoever was waiting for it, or one after it, has had what is left of the sequence.
create or replace function public.sequence_steps_gone_ends_the_wait() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.sequence_enrollments e
     set state = 'done', ended_at = now(), next_at = null
   where e.sequence_id = OLD.sequence_id and e.state = 'in' and e.lead_id is null and e.place >= OLD.place - 1
     and not exists (select 1 from public.sequence_steps n where n.sequence_id = OLD.sequence_id and n.place = e.place + 1);
  return null;
end $$;

drop trigger if exists sequence_steps_gone_ends_the_wait on public.sequence_steps;
create trigger sequence_steps_gone_ends_the_wait after delete on public.sequence_steps
  for each row when (OLD.id <> OLD.sequence_id) execute function public.sequence_steps_gone_ends_the_wait();

create or replace function public.sequence_step_words(p_tenant_id uuid, p_step_id uuid, p_template_id uuid,
                                                     p_params jsonb default null,
                                                     p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                     p_undo_of uuid default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_step public.sequence_steps%rowtype;
  v_t public.templates%rowtype;
  v_ready boolean;
  v_waits boolean;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select * into v_step from public.sequence_steps where tenant_id = p_tenant_id and id = p_step_id for update;
  if v_step.id is null or v_step.hand is not null then
    raise exception 'Step not found.' using errcode = 'P0002';
  end if;
  select * into v_t from public.templates where tenant_id = p_tenant_id and id = p_template_id;
  if v_t.id is null then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  -- The message's WhatsApp version, where the step goes by WhatsApp: approved, or the words wait for it.
  v_ready := exists (select 1 from public.templates t
                      where t.tenant_id = p_tenant_id and t.channel = 'whatsapp' and t.name = v_t.name
                        and t.language = v_t.language and t.meta_status = 'approved');
  v_waits := 'whatsapp' = any (v_step.channels) and not v_ready
             and exists (select 1 from public.templates t
                          where t.tenant_id = p_tenant_id and t.channel = 'whatsapp' and t.name = v_t.name
                            and t.language = v_t.language and t.meta_status = 'pending');
  -- Its values (p_params, judged against these words by the route) go with the words: now, or when they are approved.
  if v_waits then
    update public.sequence_steps
       set next_template_id = v_t.id, next_template_name = v_t.name, next_template_language = v_t.language,
           next_params = p_params
     where id = p_step_id;
  else
    update public.sequence_steps
       set template_id = v_t.id, template_name = v_t.name, template_language = v_t.language,
           params = coalesce(p_params, params),
           next_template_id = null, next_template_name = null, next_template_language = null, next_params = null
     where id = p_step_id;
  end if;
  return jsonb_build_object('id', p_step_id, 'waits', v_waits,
    'was', jsonb_build_object('template_id', v_step.template_id, 'template_name', v_step.template_name,
                              'template_language', v_step.template_language, 'params', v_step.params))
    || public.member_decision(p_tenant_id, 'sequence', v_step.sequence_id, 'change_step',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('step_id', p_step_id, 'words', v_t.name,
                                                                 'waits', v_waits),
         p_via, p_undo_of);
end $$;

comment on function public.sequence_step_words(uuid, uuid, uuid, jsonb, jsonb, text, uuid) is
  'A step''s message changed (0060): at once where the step does not go by WhatsApp or the message''s WhatsApp version is approved; else the new words wait for WhatsApp (next_template_*) while the step sends its own, and take its place when WhatsApp approves them (00440). On the member''s own rights; the change_step decision rides in the same transaction. Answers whether the words wait.';

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
  v_ids uuid[];
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
  v_n := public.sequence_enrollments_leave(p_tenant_id, v_ids, coalesce(nullif(btrim(p_why), ''), 'removed'), v_actor);
  return jsonb_build_object('left', v_n, 'sequence_id', p_sequence_id)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'leave_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('left', v_n), p_via, p_undo_of);
end $$;

comment on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid) is
  'People taken out of a sequence by an acting member (0060): each still in it leaves with p_why (removed), a send of theirs not yet gone skipped with it, and the leave_sequence decision written in the same transaction. Answers how many left.';

create or replace function public.sequence_batch_cancel(p_tenant_id uuid, p_batch_id uuid, p_from text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_from not in ('pending_approval', 'scheduled', 'sending') then
    return false;
  end if;
  update public.sequence_batches set state = 'canceled'
   where tenant_id = p_tenant_id and id = p_batch_id and state = p_from;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

comment on function public.sequence_batch_cancel(uuid, uuid, text) is
  'A batch canceled by an acting member, only from the state it was read in (S0, 0060): the one way a session moves a batch''s state. True when it moved. The caller withdraws its job and writes its decision.';

-- What a sequence's state becomes when its first step's is written: an ended one stays ended, a running step is on, a
-- draft stays a draft until then, and anything else is paused.
create or replace function public.sequence_state_of(p_sequence text, p_step text) returns text
language sql immutable
set search_path = public
as $$
  select case when p_sequence = 'ended' then 'ended'
              when p_step = 'running' then 'on'
              when p_sequence = 'draft' then 'draft'
              else 'paused' end
$$;

-- The first step's name and state are its sequence's (00439), and a draft stays one until its first step runs.
create or replace function public.sequence_steps_say_sequence() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.sequences q
     set name = NEW.name,
         state = public.sequence_state_of(q.state, NEW.state)
   where q.id = NEW.sequence_id
     and (q.name is distinct from NEW.name or q.state is distinct from public.sequence_state_of(q.state, NEW.state));
  return null;
end $$;

create or replace function public.sequence_create(p_tenant_id uuid, p_first jsonb, p_then jsonb default '[]'::jsonb,
                                                 p_start boolean default false,
                                                 p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                 p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_then jsonb := coalesce(p_then, '[]'::jsonb);
  v_asked public.sequence_steps%rowtype;
  v_first public.sequence_steps%rowtype;
  v_t public.templates%rowtype;
  v_step jsonb;
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
  if p_first->>'trigger' in ('lead_first', 'after_step') then
    raise exception 'A sequence to leads is made from a search.' using errcode = '23514';
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
  v_prev := v_first.id;
  for v_step in select value from jsonb_array_elements(v_then) loop
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
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('id', v_first.sequence_id, 'steps', v_n,
                            'state', case when p_start then 'on' else 'draft' end)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_first.sequence_id, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('steps', v_n, 'started', p_start), p_via, p_undo_of);
end $$;

comment on function public.sequence_create(uuid, jsonb, jsonb, boolean, jsonb, text, uuid) is
  'A new customer''s sequence made whole (0060, S4): its first step (a moment, as start_playbook takes it) and up to five steps after it, each a wait, what must still hold and a message of this workspace, under the first step''s class, hour and cap; kept as a draft (its first step paused, the sequence ''draft'', nothing sent) or started. By an acting member; the steps'' checks and keys judge each row; the make_sequence decision rides in the same transaction. Answers id, steps and state.';

create or replace function public.sequence_discard(p_tenant_id uuid, p_sequence_id uuid,
                                                  p_decision jsonb default '{}'::jsonb, p_via text default null,
                                                  p_undo_of uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
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
  if v_q.id is null or v_q.starts not in ('moment', 'list') then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  -- What has sent keeps its history: a sequence that made a batch, or took anyone in, is paused, never taken away.
  if exists (select 1 from public.sequence_batches b where b.sequence_id = p_sequence_id)
     or exists (select 1 from public.sequence_enrollments e where e.sequence_id = p_sequence_id) then
    raise exception 'It has sent: pause it instead.' using errcode = 'P0001';
  end if;
  select count(*) into v_steps from public.sequence_steps where sequence_id = p_sequence_id;
  -- Its first step goes, the steps after it with it (after_step_id cascades), and the sequence with them (00439).
  delete from public.sequence_steps where id = p_sequence_id;
  return jsonb_build_object('id', p_sequence_id, 'steps', v_steps)
    || public.team_decision(p_tenant_id, v_actor, 'sequence', p_sequence_id, 'discard_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('name', v_q.name, 'was', v_q.state), p_via,
         p_undo_of);
end $$;

comment on function public.sequence_discard(uuid, uuid, jsonb, text, uuid) is
  'A customer''s sequence that never made a batch nor took anyone in, taken away whole by an acting member (0060, S4): a draft let go, or a new one undone. One that has sent is refused (P0001): it is paused, its history kept. The discard_sequence decision rides in the same transaction. Answers id and how many steps went.';

-- A session moves a batch's state through its door alone (S0): the grants and the policy that let it write one go.
revoke update on public.sequence_batches from authenticated;
revoke update on public.broadcasts from authenticated;
drop policy if exists sequence_batches_acting_update on public.sequence_batches;
revoke insert on public.sequence_batches from authenticated;
revoke insert on public.broadcasts from authenticated;
drop policy if exists sequence_batches_acting_insert on public.sequence_batches;

revoke all on function public.sequence_batch_counts(uuid, uuid[]) from public, anon;
revoke all on function public.sequence_overview(uuid, uuid) from public, anon;
revoke all on function public.sequence_steps_of(uuid, uuid, integer) from public, anon;
revoke all on function public.sequence_people(uuid, uuid, integer) from public, anon;
revoke all on function public.sequence_history(uuid, uuid, timestamptz, integer) from public, anon;
revoke all on function public.sequence_step_save(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon;
revoke all on function public.sequence_step_remove(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function public.sequence_step_words(uuid, uuid, uuid, jsonb, jsonb, text, uuid) from public, anon;
revoke all on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid) from public, anon;
revoke all on function public.sequence_batch_cancel(uuid, uuid, text) from public, anon;
revoke all on function public.sequence_state_of(text, text) from public, anon, authenticated;
revoke all on function public.sequence_create(uuid, jsonb, jsonb, boolean, jsonb, text, uuid) from public, anon;
revoke all on function public.sequence_discard(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function public.sequence_steps_gone_ends_the_wait() from public, anon, authenticated;
grant execute on function public.sequence_batch_counts(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.sequence_overview(uuid, uuid) to authenticated, service_role;
grant execute on function public.sequence_steps_of(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.sequence_people(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.sequence_history(uuid, uuid, timestamptz, integer) to authenticated, service_role;
grant execute on function public.sequence_step_save(uuid, uuid, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.sequence_step_remove(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.sequence_step_words(uuid, uuid, uuid, jsonb, jsonb, text, uuid) to authenticated;
grant execute on function public.sequence_leave(uuid, uuid, uuid[], text, jsonb, text, uuid) to authenticated;
grant execute on function public.sequence_batch_cancel(uuid, uuid, text) to authenticated;
grant execute on function public.sequence_state_of(text, text) to service_role;
grant execute on function public.sequence_create(uuid, jsonb, jsonb, boolean, jsonb, text, uuid) to authenticated;
grant execute on function public.sequence_discard(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.sequence_steps_gone_ends_the_wait() to service_role;
