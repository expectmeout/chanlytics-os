-- 00622 · A recheck wakes its clock, and no workspace holds another back (decision 0131, amended 13 Nov 2026).
--
-- 00618 had the leads clock ask again, by itself, for an address whose mailbox check did not answer. Read on production
-- the day after, and at the volume it is built for, it fell short in these ways:
--
--   trigger_leads_sweep     The clock called the sweep only while a search was live, so on a quiet day no address was
--                           asked again. It calls it too, once an hour, while one is due or stands 'checking'.
--   lead_check_retry        (a) It took the 200 that had waited longest across every workspace, and one with no room
--                           in its searching was refused, uncounted, and stood at the head of that line: 200 such
--                           addresses held every workspace's back until a month renewed. It goes a workspace at a
--                           time and leaves one with no room for the next. (b) An address left 'checking' by a check
--                           that died is given back to "Couldn't check". (c) An address on a name kept for examples
--                           (RFC 2606) is never asked: its tries are spent unasked. (d) An address never checked (a
--                           new one chosen with no room) is due, where a null time was never "a day ago". (e) Its
--                           rows are locked, so a press at the same moment is no try of the clock's. Answers `freed`.
--   lead_addressee_choose   A new address gets its two tries back.
--   sequence_overview       The list filed a lead whose address could not be checked under Needs you from the first
--                           day, while the clock was still going to ask again. It says how many are being checked
--                           again (`rechecking`), and counts as stuck only those whose tries are spent.
--   leads_recheck_due       Replaces leads_unknown_due: by workspace, and without the addresses whose tries are spent,
--                           which stood in the old one for good and were read at every slot.
--   leads_checking          The addresses standing 'checking': what the clock's wake and the give-back read.
--
-- Deploy order: either. Each function keeps its name and arguments; the answers only gain a key (`freed`, `rechecking`),
-- which a server before this one does not read and one after it reads as absent on a database before it. Re-runnable.

set local lock_timeout = '3s';

create index if not exists leads_recheck_due ON public.leads USING btree (tenant_id, email_checked_at) WHERE ((email_state = 'unknown'::text) AND (email_rechecks < 2));
create index if not exists leads_checking ON public.leads USING btree (tenant_id) WHERE (email_state = 'checking'::text);
drop index if exists public.leads_unknown_due;

create or replace function public.lead_check_retry(p_limit integer, p_tenant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(coalesce(p_limit, 0), 0);
  v_share integer := greatest(v_limit / 4, 1);
  v_t     record;
  v_r     record;
  v_asked integer := 0;
  v_held  integer := 0;
  v_freed integer := 0;
begin
  -- First, an address left 'checking' by a check that died (00622). A check asked after its round ended rides a job of
  -- its own (lead_check_ask); when that job fails for good nothing settles it, the sweep leaves it alone and the round
  -- has ended already, so the address stood 'checking' for ever: never asked again, refused by Check again, and never
  -- written to. One is given back to "Couldn't check" once no round of its is open, no check job naming it is on its
  -- way, and no check run of its rounds is live or began within the hour (a run just over may still be read).
  with dead as (
    select c.id
      from public.leads c
     where c.email_state = 'checking'
       and (p_tenant_id is null or c.tenant_id = p_tenant_id)
       and not exists (select 1 from public.lead_search_members m
                         join public.lead_rounds r on r.id = m.round_id
                        where m.lead_id = c.id and r.state <> 'ended')
       and not exists (select 1 from public.jobs j
                        where j.tenant_id = c.tenant_id and j.kind = 'lead_check' and j.state in ('scheduled', 'fired')
                          and j.payload -> 'lead_ids' @> to_jsonb(c.id::text))
       and not exists (select 1 from public.lead_search_members m
                         join public.lead_runs x on x.round_id = m.round_id
                        where m.lead_id = c.id and x.purpose = 'check'
                          and (x.state in ('claimed', 'starting', 'running', 'unknown')
                               or x.created_at > now() - interval '1 hour'))
     order by c.id
     limit 500
       for update of c skip locked
  )
  update public.leads l
     set email_state = 'unknown', email_checked_at = now()
    from dead d
   where l.id = d.id;
  get diagnostics v_freed = row_count;

  -- An address on a name kept for examples (RFC 2606: example.com, .test, .invalid and their kind) has no mailbox to
  -- ask. Its tries are spent unasked, so no check is paid for it and the list says at once that it could not be checked.
  update public.leads l
     set email_rechecks = 2
   where l.email_state = 'unknown' and l.email_rechecks < 2
     and (p_tenant_id is null or l.tenant_id = p_tenant_id)
     and lower(btrim(l.email)) ~ '@([^@]+\.)?(example\.(com|net|org)|example|test|invalid|localhost)$';

  -- Then the addresses that did not answer, a workspace at a time, the one that has waited longest first
  -- (leads_recheck_due). Its searching on and its spending allowed are read once a workspace, never once a lead; one
  -- whose switch is off is asked nothing and no try of its leads is counted.
  for v_t in
    select l.tenant_id
      from public.leads l
     where l.email_state = 'unknown' and l.email_rechecks < 2
       and (l.email_checked_at is null or l.email_checked_at <= now() - interval '1 day')
       and (p_tenant_id is null or l.tenant_id = p_tenant_id)
     group by l.tenant_id
     order by min(coalesce(l.email_checked_at, '-infinity'::timestamptz)), l.tenant_id
  loop
    exit when v_asked >= v_limit;
    continue when not public.lead_searches_on(v_t.tenant_id) or public.lead_spend_refusal(v_t.tenant_id) is not null;
    -- Each address whose last check did not answer a day ago or more, or was never made (a new address chosen with no
    -- room in the day's searching), tried by the clock fewer than twice, of a lead kept or in Needs review, under the
    -- newest finished round it was found in. A quarter of the call's limit a workspace, so one long list leaves room
    -- for the next; its rows locked, so a press of Check again at the same moment is not counted as a try of the clock's.
    for v_r in
      select d.round_id, array_agg(d.id order by d.id) as lead_ids
        from (
          select l.id, rr.round_id
            from public.leads l
           cross join lateral (
             select m.round_id
               from public.lead_search_members m
               join public.lead_rounds r on r.id = m.round_id and r.state = 'ended'
              where m.lead_id = l.id and m.tenant_id = l.tenant_id
                and m.class in ('review', 'qualified') and m.blanked_at is null
              order by r.created_at desc
              limit 1) rr
           where l.tenant_id = v_t.tenant_id
             and l.email_state = 'unknown' and l.email_rechecks < 2
             and (l.email_checked_at is null or l.email_checked_at <= now() - interval '1 day')
             and nullif(btrim(l.email), '') is not null
             and l.erased_at is null and l.blanked_at is null
           order by l.email_checked_at nulls first, l.id
           limit least(v_share, v_limit - v_asked)
             for update of l skip locked) d
       group by d.round_id
    loop
      -- Asked as Check again asks (lead_check_ask): with room in the month's and the day's searching, or not at all.
      -- A try is counted only once it is asked, so a day with no room costs none of an address's two; and a workspace
      -- with no room is left there for the next one, where it used to stand at the head of the line and hold every
      -- other workspace's addresses back until its month renewed.
      if public.lead_check_ask(v_t.tenant_id, v_r.round_id, v_r.lead_ids) then
        update public.leads set email_rechecks = email_rechecks + 1 where id = any (v_r.lead_ids);
        v_asked := v_asked + cardinality(v_r.lead_ids);
      else
        v_held := v_held + cardinality(v_r.lead_ids);
        exit;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('asked', v_asked, 'held', v_held, 'freed', v_freed);
end $$;

comment on function public.lead_check_retry(integer, uuid) is
  'The leads clock (00618, decision 0131; 00622). First gives back to "Couldn''t check" an address left checking by a check that died (no round of its open, no check job naming it on its way, no check run of its rounds live or begun within the hour), and spends unasked the tries of an address on a name kept for examples (RFC 2606), which has no mailbox. Then asks the mailbox check again, by itself, for each address whose last check did not answer a day ago or more, or was never made, at most twice (leads.email_rechecks), of a lead kept or in Needs review, under the newest finished round it was found in: a workspace at a time, the one that has waited longest first, a quarter of p_limit each and p_limit in all, in the workspace named or every one whose searching is on and that may spend; through lead_check_ask, so with room in the day''s and month''s searching or not at all, and a workspace with no room is left for the next and holds no other back. Answers {asked, held, freed}. Service role only.';

create or replace function public.trigger_leads_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Any round that has not ended, not only one waiting or checking: a round
  -- whose lead_round_start job died before it wrote a run sits in 'queued'
  -- with no run at all, and nothing but the sweep can end it and give its
  -- allowance and budget back (lead_rounds_live serves this predicate).
  -- And a lead just found with a site and no mark, whose round has ended by
  -- the time the sweep's second try reaches it (leads_untouched_purge serves it).
  -- And, at the top of each hour, an address the sweep's second tries are for (00622): one whose check did not answer
  -- and that the clock may still ask again (leads_recheck_due serves it), or one standing 'checking' (leads_checking).
  -- The clock asked the sweep only while a search was live, so on a quiet day no address was ever asked again (13 Nov
  -- 2026: 67 due, none asked). Once an hour, since a retry is a day's matter, and an address no check can take would
  -- otherwise call the edge at every slot.
  if exists (select 1 from public.lead_runs r where r.state in ('claimed', 'starting', 'running', 'unknown'))
     or exists (select 1 from public.lead_rounds r where r.state <> 'ended')
     or exists (
       select 1 from public.leads l
        where l.found_at >= now() - interval '11 minutes'
          and l.stage = 'ready'
          and l.contact_id is null
          and l.contacted_at is null
          and l.exported_at is null
          and l.erased_at is null
          and l.blanked_at is null
          and l.website_host is not null
          and l.mark_path is null
     )
     or (extract(minute from now()) < 5 and (
           exists (select 1 from public.leads l
                    where l.email_state = 'unknown' and l.email_rechecks < 2
                      and (l.email_checked_at is null or l.email_checked_at <= now() - interval '1 day'))
           or exists (select 1 from public.leads l where l.email_state = 'checking'))) then
    return public.request_sweep('leads', '/api/cron/leads');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('leads', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;

comment on function public.trigger_leads_sweep() is
  'The lead finder''s clock. Calls the edge (/api/cron/leads) only when a run is live, a round has not ended -- a round whose start job died sits queued with no run, and its reservation comes back only when something ends it -- or a lead just found has a site and no mark, for the sweep''s second try, or, at the top of each hour, an address is due the clock''s second try at its mailbox check or stands checking (00622); otherwise records that it looked, so sweep_health() can tell a quiet engine from a stopped clock.';

create or replace function public.lead_addressee_choose(p_lead_id uuid, p_person integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user   uuid := auth.uid();
  v_lead   public.leads%rowtype;
  v_people jsonb;
  v_was    integer;
  v_to     jsonb;
  v_email  text;
  v_kept   jsonb;
  v_state  text;
  v_at     timestamptz;
  v_round  uuid;
  v_ended  boolean;
  v_err    jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- Whose it is, then the lead locked: a lead of a workspace the caller may not find leads in is never held.
  select * into v_lead from public.leads where id = p_lead_id;
  if not found or not public.has_permission(v_user, v_lead.tenant_id, 'find') then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    return jsonb_build_object('error', 'gone');
  end if;
  if v_lead.kind <> 'company' then
    return jsonb_build_object('error', 'not_a_company');
  end if;
  v_people := case when jsonb_typeof(v_lead.facts->'people') = 'array' then v_lead.facts->'people' else '[]'::jsonb end;
  v_was := case when jsonb_typeof(v_lead.facts->'addressee') = 'number' then (v_lead.facts->>'addressee')::integer end;
  if p_person is null or p_person < 0 or p_person >= jsonb_array_length(v_people)
     or jsonb_typeof(v_people->p_person) is distinct from 'object' then
    return jsonb_build_object('error', 'no_person');
  end if;
  if p_person = v_was then
    return jsonb_build_object('error', 'already');
  end if;
  if v_lead.stage not in ('ready', 'nurture') or v_lead.closed_reason is not null or v_lead.contact_id is not null then
    return jsonb_build_object('error', 'closed');
  end if;
  if v_lead.contacted_at is not null then
    return jsonb_build_object('error', 'written');
  end if;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = v_lead.tenant_id and s.lead_id = v_lead.id
                and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))) then
    return jsonb_build_object('error', 'in_reach_out');
  end if;
  if v_lead.email_state = 'checking' then
    return jsonb_build_object('error', 'checking');
  end if;

  v_to := v_people->p_person;
  v_email := lower(btrim(coalesce(v_to->>'email', '')));
  if v_email = '' or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'no_address');
  end if;
  if public.lead_address_suppressed(v_lead.tenant_id, v_email) then
    return jsonb_build_object('error', 'suppressed');
  end if;
  if public.lead_address_in_people(v_lead.tenant_id, v_email) then
    return jsonb_build_object('error', 'in_people');
  end if;
  -- One business written to once: an address another lead holds is that lead's.
  if exists (select 1 from public.leads l
              where l.tenant_id = v_lead.tenant_id and l.id <> v_lead.id and l.email = v_email
                and l.erased_at is null and l.blanked_at is null) then
    return jsonb_build_object('error', 'address_taken');
  end if;

  -- The check their address had while they were its addressee before, if it was this address and is under thirty days.
  v_kept := v_to->'check';
  if jsonb_typeof(v_kept) = 'object' and v_kept->>'email' = v_email
     and v_kept->>'state' in ('ok', 'catch_all', 'invalid')
     and coalesce(v_kept->>'at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
    v_at := (v_kept->>'at')::timestamptz;
    if v_at > now() - interval '30 days' then
      v_state := v_kept->>'state';
    else
      v_at := null;
    end if;
  end if;
  if v_state = 'invalid' then
    return jsonb_build_object('error', 'invalid');
  end if;

  if v_state is null then
    -- The switch and the spend, read before anything is asked of the provider (§0.5): the mailbox check is money too.
    if not public.lead_searches_on(v_lead.tenant_id) then
      return jsonb_build_object('error', 'paused');
    end if;
    v_err := public.lead_spend_refusal(v_lead.tenant_id);
    if v_err is not null then
      return v_err;
    end if;
    -- A check runs under a round: the lead's last, once it has ended (a search still running checks its own).
    select r.id, r.state = 'ended' into v_round, v_ended
      from public.lead_search_members m
      join public.lead_rounds r on r.id = m.round_id
     where m.tenant_id = v_lead.tenant_id and m.lead_id = v_lead.id and m.blanked_at is null
     order by r.created_at desc
     limit 1;
    if v_round is null then
      return jsonb_build_object('error', 'no_round');
    end if;
    if not v_ended then
      return jsonb_build_object('error', 'searching');
    end if;
  end if;

  -- The person it leaves keeps the check their address had, for a choice back.
  if v_was is not null and v_was < jsonb_array_length(v_people) and jsonb_typeof(v_people->v_was) = 'object'
     and v_lead.email is not null and v_lead.email_state in ('ok', 'catch_all', 'invalid')
     and v_lead.email_checked_at is not null then
    v_people := jsonb_set(v_people, array[v_was::text, 'check'],
                          jsonb_build_object('email', v_lead.email, 'state', v_lead.email_state,
                                             'at', v_lead.email_checked_at));
  end if;
  update public.leads
     set email = v_email,
         email_state = coalesce(v_state, 'checking'),
         email_checked_at = v_at,
         -- A new address is the clock's to ask twice, as the first was (00622): the tries are an address's, not a lead's.
         email_rechecks = 0,
         facts = jsonb_set(jsonb_set(facts, '{people}', v_people), '{addressee}', to_jsonb(p_person)),
         version = version + 1
   where id = v_lead.id;
  -- Its check, asked only with room in this month's and today's searching (00506); without it the address waits as not
  -- checked, for Check again once there is.
  if v_state is null and not public.lead_check_ask(v_lead.tenant_id, v_round, array[v_lead.id]) then
    v_state := 'unknown';
    update public.leads set email_state = 'unknown' where id = v_lead.id;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_lead.tenant_id, 'lead.addressee_chosen', 'lead', 'lead', v_lead.id,
          jsonb_build_object('person', p_person, 'checking', v_state is null, 'by', v_user));
  return jsonb_build_object('ok', true, 'addressee', p_person, 'email_state', coalesce(v_state, 'checking'),
                            'version', v_lead.version + 1);
end $$;

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
  -- The ones whose email could not be checked. The leads clock asks each again by itself, a day apart, twice (00618,
  -- leads.email_rechecks; 00622 spends the tries of one it will never ask): while it still will, the lead is being
  -- checked again and asks nothing of its owner (rechecking); with both tries spent it stands there until its owner
  -- presses Check again or takes it out (stuck). One refused for good (written to already, a customer, on the
  -- never-again list) asks nothing of its owner and is not counted.
  unchecked as (
    select a.sequence_id, a.at, coalesce(l.email_rechecks, 2) < 2 as again
      from asked a
      join whys w on w.sequence_id = a.sequence_id and w.lead_id = a.lead_id
      left join public.leads l on l.id = a.lead_id and l.tenant_id = p_tenant_id
     where w.why = 'unchecked'
  ),
  stuck as (
    select u.sequence_id,
           count(*) filter (where not u.again) as n,
           min(u.at) filter (where not u.again) as since,
           count(*) filter (where u.again) as rechecking
      from unchecked u
     group by u.sequence_id
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
           'stuck', case when coalesce(sk.n, 0) = 0 then null else
             jsonb_build_object('leads', sk.n, 'since', sk.since, 'reason', 'unchecked') end,
           'rechecking', coalesce(sk.rechecking, 0),
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
  'The workspace''s sequences (0060), or the one named: how each starts (its first step, with the search it adds from: 00459, when its words were last let go: 00462, or a one-off''s date, or the once of one kept as a draft: 00465), how its batches are decided (its mode, 00462), where it stands, its steps, the days they span and the emails still to write (00459), its channels, what needs you (batches waiting for an OK and their people, emails held by the check, emails for you to send, replies to answer, the oldest of them), the batch to come, the last that went with its sent and replied, and who is in it (everyone whose place stands, sequence_places: 00459). Newest first. Under the caller''s row security. And (decision 0128, stage 2): who is between two steps with a time to come (between: the first one''s time, and how many have one); leads on a running cold email''s list that its first step refuses because their email could not be checked (stuck: how many of the 200 that have stood there longest, past a day, and since when, once the leads clock has spent its two tries at each; rechecking: how many it will still ask again by itself, 00622; asked through sequence_queued_why_not, so only of a member); the business day its first step last ran and, where it is on and runs by its hour, why that run did nothing (last_run_for, last_run_off: the newest playbook.run event''s skipped, where it is a reason and not a count); and last counts a batch still going that has sent some, bar a one-off''s.';
