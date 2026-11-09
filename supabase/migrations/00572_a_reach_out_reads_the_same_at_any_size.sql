-- 00572 · A reach-out reads the same at any size.
--
-- Three reads of who is in a reach-out could compare every lead with every other once it held tens of thousands. Lists are small
-- today, so no customer feels any of them yet. Timed at a workspace's ceiling (decision 0103, 50,000 leads) on Postgres 17.5 run
-- in Node, with the real tables, indexes and functions.
--
-- reach_out_root_lines read a list against the leads already written to with `not exists`, which Postgres plans as a join chosen
-- from what it guesses of each side, as sequence_places did (00568). A SQL function is planned without its values, so the guess
-- is the average across every workspace, and with many small workspaces beside one large one it chose a loop: 25,000 by 50,000,
-- 937 million rows compared in memory, 81 to 120 s where the read takes 1 to 2 s. Production is planned that way today (read 9
-- Nov 2026 with explain generic_plan), on 43 sends, where it costs nothing.
--
-- reach_out_audience joined its members to what reach_out_why_not said of them, a function's rows against a CTE, and with a guess
-- of one member it chose the same loop: 50,000 by 50,000, 1.25 billion rows, about 186 s. The run that writes to a reach-out
-- reads it, under the service role's 30 s.
--
-- Both become `not in`, which is no join and has no loop to choose: Postgres hashes the walk if its guess fits in hash_mem. The
-- audience's guess is what any function gets, 1,000 rows, so it always fits. reach_out_root_lines' rests on the statistics: at
-- production's 3,500 kB of work_mem it stopped hashing at a guess of about 183,000 rows, at 64 MB, as sequence_places has, at about
-- 3.3 million, a count some 90 times past its rows.
--
-- reach_out_people_of found each line's place in the audience by reading the whole audience again for that line: 50,000 lines by
-- 5,000, 250 million comparisons on every read, whatever is guessed, about 17 s. A join reads each once. The audience holds a lead
-- once (members is distinct on lead_id, reach_out_why_not answers once for each, leads by its key), so the join finds what the
-- lookup found. Its own `not exists` stays: a hash in every state read, both sides being what a function returns.
--
-- What each answers is unchanged, row against row, in every way a lead can stand in a reach-out and at the ceiling, under the usual
-- statistics and the low guess. A drawer's first 200 among leads tied on their time and place may differ, as they already did from
-- one plan to the next. reach_out_people_of stays past a member's 8 s at the ceiling, at 16 to 19 s: most of what is left is
-- reach_out_why_not asking lead_address_suppressed of each lead in turn, which this does not change.
--
-- Re-runnable. Takes no table lock. The comments and grants on all three stand.

create or replace function public.reach_out_root_lines(p_tenant_id uuid, p_root_id uuid)
returns table (lead_id uuid, line jsonb, ord timestamptz, done boolean)
language sql
stable
security definer
set search_path = public
set work_mem = '64MB'
as $$
  with sends as (
    -- left_at: when an email left (sent, or failed by a receipt after it left: email_left), else null.
    select s.id, s.lead_id, s.state, s.reason, s.send_at,
           case when s.state = 'sent' then s.sent_at
                when s.state = 'failed' and public.email_left(m.status, m.error)
                  then public.email_sent_at(m.meta, m.status_updated_at, m.created_at) end as left_at,
           coalesce(m.status = 'failed' and m.error->>'provider' = 'bounced', false) as bounced,
           b.state in ('pending_approval', 'scheduled', 'sending') as live
      from public.sequence_sends s
      join public.sequence_batches b on b.id = s.batch_id
      left join public.messages m on m.id = s.message_id
     where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.sequence_id = p_root_id
       -- A send of a run its owner skipped, or one taken back, never happened as far as the lead's line is concerned.
       and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))
  ),
  per as (
    select x.lead_id,
           count(*) filter (where x.left_at is not null) as sent,
           min(x.left_at) as first_sent_at,
           max(x.left_at) as last_sent_at,
           min(x.send_at) filter (where x.state = 'planned' and x.live) as next_at,
           bool_or(x.state = 'held' and x.live) as held,
           bool_or(x.state = 'handed') as handed,
           count(*) filter (where x.state = 'drafted' and x.live) as drafted,
           bool_or(x.bounced and x.left_at is not null) as bounced,
           max(x.left_at) filter (where x.bounced) as bounced_at,
           max(x.left_at) as ord
      from sends x
     group by x.lead_id
  ),
  per_lead as (
    select p.lead_id, p.sent, p.first_sent_at, p.last_sent_at, p.next_at, p.held, p.handed, p.drafted, p.bounced,
           p.bounced_at, p.ord, null::timestamptz as added_at
      from per p
    union all
    -- A list-fed reach-out's leads not written yet: on its list, with when each was added (00426).
    select m.lead_id, 0, null, null, null, false, false, 0, false, null, null, m.created_at
      from public.sequence_steps r
      join public.lead_searches q on q.id = r.lead_search_id and q.via in ('chosen', 'import') and q.removed_at is null
      join public.lead_search_members m on m.search_id = q.id and m.blanked_at is null and m.class = 'qualified' and m.counted
     where r.id = p_root_id and r.tenant_id = p_tenant_id
       -- A hash of the walk, whatever is guessed of it (00572). Neither side is ever null: lead_id is not null on a member,
       -- and sends leaves out a send with no lead.
       and m.lead_id not in (select p.lead_id from per p)
  ),
  facts as (
    select x.*, l.business_name, l.stage, l.closed_reason, l.email_state, l.resume_at, l.booked_at, l.reach_out_stopped_at,
           -- Won: a deal that names the lead, won (decided); the first such, a count and never an amount.
           (select min(coalesce(d.decided_at, d.updated_at)) from public.deals d
             where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won_at,
           (select jsonb_build_object('intent', r.intent, 'claim', r.claim, 'read_at', r.read_at, 'undone', r.undone_at is not null)
              from public.sequence_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id
             order by r.read_at desc
             limit 1) as reply,
           (select max(r.until_at) from public.sequence_replies r
             where r.tenant_id = p_tenant_id and r.lead_id = x.lead_id and r.intent = 'away'
               and r.claim = 'auto_reply' and r.until_at > now() and r.undone_at is null) as away_until
      from per_lead x
      join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
  )
  select f.lead_id,
         jsonb_build_object(
           'lead_id', f.lead_id,
           'business_name', f.business_name,
           'stage', f.stage,
           'closed_reason', f.closed_reason,
           'sent', f.sent,
           'first_sent_at', f.first_sent_at,
           'last_sent_at', f.last_sent_at,
           'next_at', f.next_at,
           'held', coalesce(f.held, false),
           'handed', coalesce(f.handed, false),
           'drafted', coalesce(f.drafted, 0),
           'bounced', coalesce(f.bounced, false),
           'bounced_at', f.bounced_at,
           'email_state', f.email_state,
           'reply', f.reply,
           'away_until', f.away_until,
           'resume_at', f.resume_at,
           'booked_at', f.booked_at,
           'won_at', f.won_at,
           'stopped_at', f.reach_out_stopped_at,
           'added_at', f.added_at),
         coalesce(f.ord, f.added_at),
         -- Done: booked, stopped, bounced, said no, closed, or a person answered (an automatic reply only pauses). Each
         -- test is said so it is never null: a lead with no closed reason and no reply is not done, never unknown.
         (f.booked_at is not null or f.reach_out_stopped_at is not null or coalesce(f.bounced, false)
          or f.closed_reason is not distinct from 'said_no' or f.stage not in ('ready', 'nurture')
          or (f.reply is not null and not coalesce((f.reply->>'undone')::boolean, false)
              and f.reply->>'claim' is distinct from 'auto_reply'))
    from facts f
$$;

create or replace function public.reach_out_audience(
  p_tenant_id uuid,
  p_search_id uuid,
  p_limit int,
  p_include_unconfirmed boolean default false)
returns table (lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
language sql
stable
security definer
set search_path = public
as $$
  -- The search's leads, and (00459) where it is a sequence's list that draws from a search, that search's ready leads:
  -- each joins without a press, unless it is put off for later there or was taken out of the list (blanked on it).
  with src as (
    select r.source_search_id as id from public.sequence_steps r
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
       and r.lead_search_id = p_search_id and r.source_search_id is not null
  ),
  members as (
    select distinct on (sm.lead_id) sm.lead_id, sm.fit
      from public.lead_search_members sm
      join public.lead_searches s on s.id = sm.search_id and s.tenant_id = sm.tenant_id and s.removed_at is null
     where sm.tenant_id = p_tenant_id
       and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
       and (sm.search_id = p_search_id
            or (sm.search_id in (select src.id from src) and sm.later_at is null
                and not exists (select 1 from public.lead_search_members x
                                 where x.search_id = p_search_id and x.lead_id = sm.lead_id and x.blanked_at is not null)))
     order by sm.lead_id, case sm.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end
  )
  select l.id, lower(btrim(l.email)), l.business_name, l.city, l.region, l.hours
    from members m
    join public.leads l on l.id = m.lead_id and l.tenant_id = p_tenant_id
   -- A hash of who has a reason, whatever is guessed of it (00572). reach_out_why_not answers once for each lead it is asked
   -- of, so leaving those out leaves whoever it lets go, and none of its leads is null: members' lead_id is not null.
   where m.lead_id not in (
     select w.lead_id
       from public.reach_out_why_not(p_tenant_id, array(select lead_id from members), p_include_unconfirmed) w
      where w.why is not null)
   -- The finder's fit, strongest first, then the longest found.
   order by case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, l.found_at
   limit greatest(p_limit, 0)
$$;

create or replace function public.reach_out_people_of(p_tenant_id uuid, p_root_id uuid)
returns table (lead_id uuid, grp text, line jsonb, ord timestamptz, pos bigint)
language sql
stable
security definer
set search_path = public
as $$
  with root as (
    select r.lead_search_id, r.include_unconfirmed from public.sequence_steps r
     where r.id = p_root_id and r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  ),
  rl as (
    select * from public.reach_out_root_lines(p_tenant_id, p_root_id)
  ),
  aud as (
    select a.lead_id, a.business_name, row_number() over () as pos
      from root
     cross join lateral public.reach_out_audience(p_tenant_id, root.lead_search_id, 5000, root.include_unconfirmed) a
  )
  select r.lead_id,
         case when r.done then 'done' when (r.line->>'sent')::int > 0 then 'writing' else 'waiting' end,
         r.line, r.ord, coalesce(a.pos, 0)
    from rl r
    left join aud a on a.lead_id = r.lead_id
  union all
  select a.lead_id, 'waiting',
         jsonb_build_object('lead_id', a.lead_id, 'business_name', a.business_name, 'sent', 0, 'added_at', null),
         null::timestamptz, a.pos
    from aud a
   where not exists (select 1 from rl r where r.lead_id = a.lead_id)
$$;
