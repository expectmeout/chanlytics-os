-- 00617 · The Sequences list sees what is stuck (decision 0128, stage 2).
--
-- The list said "3 in it" of a cold email whose three leads could never start: their email had come back "Couldn't
-- check", the first step leaves such a lead out of its batch, and nothing checks it again by itself. It said nothing of
-- a customer's sequence whose run did nothing, which only its record said. And it said "18 in it" of people between two
-- steps, with no word of when the next of them is due. The list's one read learns the three:
--
--   stuck          Leads on a running cold email's list that its first step refuses because their email could not be
--                  checked: how many, and since when the first has stood there. Leads that only wait their turn are not
--                  stuck (a first step takes a day's worth, so most of a long list has stood there for days). The
--                  reason is reach_out_why_not's, asked through the door a member has (sequence_queued_why_not), of at
--                  most the 200 leads that have stood there longest in each, past a day.
--   last_run_for,  The business day its first step last ran, and why that run did nothing where it did, for a sequence
--   last_run_off   that is on and runs by its hour: what the record reads beside its row, read for every row.
--   between        Who is between two steps with a time to come: the first one's time, and how many have one.
--   last           Also a batch still going that has sent some: one held email kept a batch open, and its 18 sent were
--                  counted nowhere.
--
-- Where each one stands (sequence_places) was read once, for who is in it, and is still read once: the new counts are
-- taken from that read.
--
-- Deploy order: either. The function keeps its name, its arguments and its jsonb answer, which gains keys: a dashboard
-- before this one ignores them, and one after it, on a database before this, says of each row what it said. Re-runnable.

set local lock_timeout = '3s';

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
        -- One still going that has sent some (decision 0128, stage 2): an email held in it keeps it open for days, and
        -- what it sent was counted nowhere. Not a one-off's, whose row says its day until it has gone whole.
        or (b.state = 'sending' and q.starts <> 'date'
            and exists (select 1 from public.sequence_sends s
                         where s.batch_id = b.id and s.state in ('sent', 'handed')))
     order by b.sequence_id, coalesce(b.finished_at, b.started_at, b.scheduled_for) desc, b.id
  ),
  last_counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(l.id), '{}')) as counts from last l
  ),
  -- Where each one stands (sequence_places), read once for the three counts under it.
  places as materialized (
    select p.grp, p.sequence_id, p.lead_id, p.at
      from public.sequence_places(p_tenant_id, p_sequence_id, null) p
  ),
  -- Who is in it (00459): everyone whose place stands, as its People tab files them (sequence_places): a lead added and
  -- not yet planned, waiting for an OK, held, for you to send, up next or between steps. Not who left, finished, or wrote
  -- back and waits for an answer.
  in_it as (
    select p.sequence_id, count(*) as n
      from places p
     where p.grp not in ('done', 'left', 'replied')
     group by p.sequence_id
  ),
  -- Who is between two steps with a time to come (decision 0128, stage 2): the first one's time, and how many have one.
  -- A place between steps is timed by its next step where it has one, else by when it got there, so a time past is
  -- someone due already (their step's next run makes their batch) or someone with no step left.
  between_steps as (
    select p.sequence_id, count(*) as n, min(p.at) as first_at
      from places p
     where p.grp = 'in' and p.at > now()
     group by p.sequence_id
  ),
  -- Leads that have stood on a running cold email's list for more than a day, the 200 that have stood there longest in
  -- each. Most only wait their turn (a first step takes a day's worth); the ones it refuses for a reason their owner can
  -- mend are what the list says (stuck). The reason is asked a lead at a time, so of a bounded few: a list of 50,000
  -- costs what a list of 200 does.
  asked as (
    select r.sequence_id, r.lead_id, r.at
      from (select p.sequence_id, p.lead_id, p.at,
                   row_number() over (partition by p.sequence_id order by p.at, p.lead_id) as nth
              from places p
              join q on q.id = p.sequence_id and q.starts = 'leads' and q.state = 'on'
             where p.grp = 'queued' and p.lead_id is not null and p.at < now() - interval '1 day') r
     where r.nth <= 200
  ),
  -- Why no batch takes each, through the door a member has (00533, 00542: reach_out_why_not at the list's own setting,
  -- for a member of the workspace, a partner's seat only with its second factor). Asked by anyone else it answers
  -- nothing, and no lead is said to be stuck.
  whys as (
    select w.sequence_id, w.lead_id, w.why
      from (select coalesce(array_agg(a.lead_id order by a.sequence_id, a.lead_id), '{}'::uuid[]) as leads,
                   coalesce(array_agg(a.sequence_id order by a.sequence_id, a.lead_id), '{}'::uuid[]) as sequences
              from asked a) pairs
     cross join lateral public.sequence_queued_why_not(p_tenant_id, pairs.leads, pairs.sequences) w
  ),
  -- The ones whose email could not be checked: nothing checks it again by itself, so they stand there until their owner
  -- presses Check again on Leads. One refused for good (written to already, a customer, on the never-again list) asks
  -- nothing of its owner and is not counted.
  stuck as (
    select a.sequence_id, count(*) as n, min(a.at) as since
      from asked a
      join whys w on w.sequence_id = a.sequence_id and w.lead_id = a.lead_id
     where w.why = 'unchecked'
     group by a.sequence_id
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
           'in_it', coalesce(ii.n, 0),
           'between', case when bs.n is null then null else
             jsonb_build_object('at', bs.first_at, 'people', bs.n) end,
           'stuck', case when sk.n is null then null else
             jsonb_build_object('leads', sk.n, 'since', sk.since, 'reason', 'unchecked') end,
           -- Its first step's last run (decision 0128, stage 2): the business day it ran for, and why it did nothing
           -- where it did, the newest playbook.run event's `skipped` where that is a reason, as the record reads it
           -- (packages/db lastRunSkipped: a run that went writes a count there, which is no reason). Asked of a sequence
           -- that is on and runs by its hour: one probe of events_tenant_subject.
           'last_run_for', f.last_run_for,
           'last_run_off', case when q.state = 'on' and q.starts not in ('leads', 'date') then (
             select case when jsonb_typeof(e.data -> 'skipped') = 'string' then e.data ->> 'skipped' end
               from public.events e
              where e.tenant_id = q.tenant_id and e.subject_type = 'playbook' and e.subject_id = q.id
                and e.kind = 'playbook.run'
              order by e.created_at desc
              limit 1) end
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
    left join between_steps bs on bs.sequence_id = q.id
    left join stuck sk on sk.sequence_id = q.id
$$;

comment on function public.sequence_overview(uuid, uuid) is
  'The workspace''s sequences (0060), or the one named: how each starts (its first step, with the search it adds from: 00459, when its words were last let go: 00462, or a one-off''s date, or the once of one kept as a draft: 00465), how its batches are decided (its mode, 00462), where it stands, its steps, the days they span and the emails still to write (00459), its channels, what needs you (batches waiting for an OK and their people, emails held by the check, emails for you to send, replies to answer, the oldest of them), the batch to come, the last that went with its sent and replied, and who is in it (everyone whose place stands, sequence_places: 00459). Newest first. Under the caller''s row security. And (decision 0128, stage 2): who is between two steps with a time to come (between: the first one''s time, and how many have one); leads on a running cold email''s list that its first step refuses because their email could not be checked (stuck: how many of the 200 that have stood there longest, past a day, and since when; asked through sequence_queued_why_not, so only of a member); the business day its first step last ran and, where it is on and runs by its hour, why that run did nothing (last_run_for, last_run_off: the newest playbook.run event''s skipped, where it is a reason and not a count); and last counts a batch still going that has sent some, bar a one-off''s.';
