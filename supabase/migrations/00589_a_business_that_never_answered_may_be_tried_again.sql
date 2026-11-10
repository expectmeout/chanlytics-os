-- 00589 · A business that never answered may be tried again (decision 0120, D6).
--
-- A business was written to once, ever: reach_out_why_not's "written" held it, and sequence_sends_one_first (00427) refused
-- a second first email at the row. A sequence to leads may now be set to try again after 90 days, off unless its owner
-- turns it on (sequence_steps.again_after_days, on its first step): one more first email, its line about them written
-- again from their listing as it is then, to a business that never answered, and to nobody who said no, became a
-- customer or asked to be erased (those reasons come before "written" in reach_out_why_not, and stand). Once, never a
-- third: a send keeps the round it is of (sequence_sends.round), a business tried again does not come back, and no
-- follow-up goes after it (reach_out_followers follows a first round's email alone). Turned on, the sequence's words
-- wait for an OK once more, as any new words do (reach_out_again_set).
--
-- The first round's index is replaced by one a round in the next two files (00590 builds it, 00591 drops the old, each
-- alone, as an index built or dropped concurrently must be): until both have run, a second first email is refused at the
-- row, left out of its run as reach_out_plan_run leaves any, and nothing is written.
--
-- Deploy order: this migration before the build that asks reach_out_audience with p_again_after. Re-runnable.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------------------------- the columns -- */

alter table public.sequence_steps add column if not exists again_after_days integer;
alter table public.sequence_steps drop constraint if exists sequence_steps_again_after_days_check;
alter table public.sequence_steps add constraint sequence_steps_again_after_days_check check (
  again_after_days is null or (kind = 'reach_out' and trigger = 'lead_first' and again_after_days between 90 and 365));

-- A constant default: no row is rewritten.
alter table public.sequence_sends add column if not exists round smallint default 1 not null;

/* ---------------------------------------------------------------------------------------- who comes back -- */

CREATE OR REPLACE FUNCTION public.reach_out_comes_back(p_tenant_id uuid, p_lead_ids uuid[], p_after_days integer) RETURNS TABLE(lead_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Of these leads, each written to before, those that may be written to once more (00589, decision 0120). A lead written to
  -- reads to reach_out_why_not as closed (it is in nurture), or as a customer (the person its first email made holds its
  -- address), as often as written, so each reason is asked here again, the lead's own person aside: still there, in
  -- ready or nurture with nothing closing it, nobody else in People holding its address or its number, not on the
  -- never-again list, not stopped by its owner, its address checked and good, sharing with no other lead; every email of
  -- theirs left at least p_after_days ago and none is still on its way, none was of a second round, none bounced, and
  -- nobody answered: no reading of a reply, and nothing they wrote.
  select l.id
    from public.leads l
   where l.tenant_id = p_tenant_id
     and l.id = any (coalesce(p_lead_ids, '{}'::uuid[]))
     and l.erased_at is null and l.blanked_at is null
     and l.stage in ('ready', 'nurture') and l.closed_reason is null
     and l.reach_out_stopped_at is null
     and nullif(btrim(l.email), '') is not null and l.email_state = 'ok'
     and not exists (select 1 from public.contacts c
                      where c.tenant_id = l.tenant_id and c.erased_at is null and c.id is distinct from l.contact_id
                        and (c.email = lower(btrim(l.email)) or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
     and not exists (select 1 from public.contact_identities i
                       join public.contacts c on c.id = i.contact_id and c.erased_at is null
                      where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email))
                        and c.id is distinct from l.contact_id)
     and not public.lead_address_suppressed(l.tenant_id, lower(btrim(l.email)))
     and not exists (select 1 from public.lead_suppressions s where s.tenant_id = l.tenant_id and (
                       (s.kind = 'place' and l.place_id is not null
                        and s.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                    or (s.kind = 'phone' and l.phone_e164 is not null
                        and s.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
     and not exists (select 1 from public.lead_search_members m
                      where m.tenant_id = l.tenant_id and m.lead_id = l.id and m.blanked_at is null
                        and coalesce(jsonb_array_length(m.judgment->'shares'), 0) <> 0)
     and exists (select 1 from public.sequence_sends s
                  where s.lead_id is not null and (s.tenant_id = p_tenant_id and s.lead_id = l.id
                    and s.state in ('sent', 'handed')))
     and not exists (
       select 1 from public.sequence_sends s
        where s.lead_id is not null and (s.tenant_id = p_tenant_id and s.lead_id = l.id
          and (s.round > 1
               or s.state not in ('sent', 'handed', 'skipped', 'failed')
               or (s.state in ('sent', 'handed') and s.sent_at > now() - make_interval(days => greatest(coalesce(p_after_days, 0), 0))))))
     and not exists (select 1 from public.sequence_sends b join public.messages bm on bm.id = b.message_id
                      where b.lead_id is not null and (b.tenant_id = p_tenant_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed')))
     and not exists (select 1 from public.sequence_replies r where r.tenant_id = p_tenant_id and r.lead_id = l.id)
     and (l.contact_id is null
          or not exists (select 1 from public.messages im
                          where im.tenant_id = p_tenant_id and im.contact_id = l.contact_id and im.direction = 'inbound'))
$$;

comment on function public.reach_out_comes_back(p_tenant_id uuid, p_lead_ids uuid[], p_after_days integer) is
  'Of leads written to before, those a sequence may write to once more (00589, decision 0120): every email p_after_days old or more and none on its way, none of a second round, none bounced, none answered, sharing with no other lead, and a checked, good address. Asked only of leads reach_out_why_not refuses as written, whose earlier reasons stand. Service role only.';

revoke all on function public.reach_out_comes_back(uuid, uuid[], integer) from public;
grant all on function public.reach_out_comes_back(uuid, uuid[], integer) to service_role;

/* ------------------------------------------------------------------------------------------- the audience -- */

-- A parameter more is another function: the four-argument one goes, so a call of four finds this one, its fifth null.
drop function if exists public.reach_out_audience(uuid, uuid, integer, boolean);

CREATE FUNCTION public.reach_out_audience(p_tenant_id uuid, p_search_id uuid, p_limit integer, p_include_unconfirmed boolean DEFAULT false, p_again_after integer DEFAULT NULL::integer) RETURNS TABLE(lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  ),
  -- Who has a reason, once (00572's hash), and of those refused as written to before (closed in nurture, a customer by
  -- their own person, or written), the ones its sequence tries again after p_again_after days (00589, decision 0120): a
  -- business that never answered, once, never a third time, each reason asked again by reach_out_comes_back.
  refused as materialized (
    select w.lead_id, w.why
      from public.reach_out_why_not(p_tenant_id, array(select lead_id from members), p_include_unconfirmed) w
     where w.why is not null
  ),
  back as (
    select b.lead_id
      from public.reach_out_comes_back(p_tenant_id,
                                       array(select r.lead_id from refused r where r.why in ('closed', 'customer', 'written')),
                                       p_again_after) as b(lead_id)
     where p_again_after is not null
  )
  select l.id, lower(btrim(l.email)), l.business_name, l.city, l.region, l.hours
    from members m
    join public.leads l on l.id = m.lead_id and l.tenant_id = p_tenant_id
   -- A hash of who has a reason, whatever is guessed of it (00572). reach_out_why_not answers once for each lead it is asked
   -- of, so leaving those out leaves whoever it lets go, and none of its leads is null: members' lead_id is not null.
   where m.lead_id not in (select r.lead_id from refused r where r.lead_id not in (select k.lead_id from back k))
   -- New businesses first, then those tried again; within each, the finder's fit, strongest first, then the longest found.
   order by (m.lead_id in (select k.lead_id from back k)),
            case m.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, l.found_at
   limit greatest(p_limit, 0)
$$;

comment on function public.reach_out_audience(p_tenant_id uuid, p_search_id uuid, p_limit integer, p_include_unconfirmed boolean, p_again_after integer) is
  'Who a reach-out''s first step may write to (Part 3, rebuilt on reach_out_why_not in 00426): the qualified, counted, unblanked members of its one search that reach_out_why_not lets go, strongest fit first, then the longest found; and, given p_again_after (00589), those refused only as written that reach_out_comes_back lets back, after the new ones. Service role only.';

revoke all on function public.reach_out_audience(uuid, uuid, integer, boolean, integer) from public;
grant all on function public.reach_out_audience(uuid, uuid, integer, boolean, integer) to service_role;

/* --------------------------------------------------------------------------------- the round and the follow-up -- */

CREATE OR REPLACE FUNCTION public.reach_out_plan_run(p_run jsonb, p_sends jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_run uuid := (p_run->>'id')::uuid;
  v_tenant uuid := (p_run->>'tenant_id')::uuid;
  v_step uuid := (p_run->>'playbook_id')::uuid;
  v_root uuid := (p_run->'audience'->>'root_id')::uuid;
begin
  if p_run->'audience'->>'kind' is distinct from 'reach_out' then
    raise exception 'reach_out_plan_run: a run of a reach-out says so in its audience';
  end if;
  if not exists (select 1 from public.sequence_steps where id = v_step and tenant_id = v_tenant and kind = 'reach_out')
     or not exists (select 1 from public.sequence_steps where id = v_root and tenant_id = v_tenant and kind = 'reach_out') then
    raise exception 'reach_out_plan_run: step % or root % is no reach-out of workspace %', v_step, v_root, v_tenant;
  end if;
  begin
    insert into public.sequence_batches (id, tenant_id, step_id, run_for, name, template_id, template_name,
                                   template_language, state, scheduled_for, recipient_count, audience)
    values (v_run, v_tenant, v_step, (p_run->>'run_for')::date, p_run->>'name', (p_run->>'template_id')::uuid,
            p_run->>'template_name', p_run->>'template_language', p_run->>'state',
            (p_run->>'scheduled_for')::timestamptz, (p_run->>'recipient_count')::int, p_run->'audience');
  exception when unique_violation then
    return jsonb_build_object('exists', true);
  end;
  insert into public.sequence_sends (id, tenant_id, batch_id, step_id, sequence_id, lead_id, contact_id, mailbox_id,
                                      send_at, state, reason, round)
  select x.id, v_tenant, v_run, v_step, v_root, x.lead_id, x.contact_id, x.mailbox_id, x.send_at,
         coalesce(x.state, 'planned'), x.reason,
         -- A first email's round (00589): one more than the lead's last first email of any sequence, so a business tried
         -- again after it never answered has its second; a later step's email is of its first round.
         case when v_step = v_root
              then 1 + coalesce((select max(p.round) from public.sequence_sends p
                                  where p.lead_id is not null and (p.tenant_id = v_tenant and p.lead_id = x.lead_id
                                    and p.step_id = p.sequence_id
                                    and not (p.state = 'skipped' and p.reason in ('run_canceled', 'owner_took_back', 'moved')))), 0)
              else 1 end
    from jsonb_to_recordset(coalesce(p_sends, '[]'::jsonb))
         as x(id uuid, lead_id uuid, contact_id uuid, mailbox_id uuid, send_at timestamptz, state text, reason text)
   where exists (select 1 from public.leads l where l.id = x.lead_id and l.tenant_id = v_tenant)
     and (x.mailbox_id is null
          or exists (select 1 from public.mailbox_connections b where b.id = x.mailbox_id and b.tenant_id = v_tenant))
  -- A send any unique rule refuses (a replay's, or a lead another reach-out planned first: one first send per lead,
  -- 00427) is left out of this run, never the run's failure.
  on conflict do nothing;
  return jsonb_build_object('id', v_run);
end $$;

CREATE OR REPLACE FUNCTION public.reach_out_followers(p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days integer, p_limit integer) RETURNS TABLE(lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid, facts jsonb, bounced boolean, mailbox_id uuid, country text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
             coalesce(s.message_id, w.message_id) as parent_message_id, coalesce(s.sent_at, w.sent_at) as sent_at,
             coalesce(s.mailbox_id, w.mailbox_id) as mailbox_id, l.country,
             public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id) as facts,
             exists (select 1 from public.sequence_sends b join public.messages bm on bm.id = b.message_id
                      where b.lead_id is not null and ( b.sequence_id = s.sequence_id and b.lead_id = l.id
                        and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed'))) as bounced
        from public.sequence_sends s
        join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
        -- A step its owner skipped (00459) is followed as the email before it was: its thread, its mailbox.
        left join lateral (
          select x.message_id, x.sent_at, x.mailbox_id from public.sequence_sends x
           where x.sequence_id = s.sequence_id and x.lead_id = s.lead_id and x.state = 'sent'
           order by x.sent_at desc limit 1) w on s.state = 'skipped'
        join public.messages m on m.id = coalesce(s.message_id, w.message_id)
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.step_id = p_parent_id
         and ((s.state = 'sent' and s.sent_at <= now() - make_interval(days => p_after_days))
              or (s.state = 'skipped' and s.reason = 'owner_skipped'
                  and exists (select 1 from public.sequence_enrollments e2
                               where e2.tenant_id = p_tenant_id and e2.sequence_id = s.sequence_id and e2.lead_id = l.id
                                 and e2.state = 'in' and e2.next_at <= now())))
         and s.contact_id is not null
         -- A first round's email alone is followed up (00589): a business tried again gets that one email, and no more.
         and s.round = 1
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

/* -------------------------------------------------------------------------------------- the setting and its count -- */

CREATE OR REPLACE FUNCTION public.reach_out_again_set(p_tenant_id uuid, p_root_id uuid, p_days integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_was integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(auth.uid(), p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_days is not null and (p_days < 90 or p_days > 365) then
    raise exception 'A business is tried again after 90 to 365 days.' using errcode = '22023';
  end if;
  select r.again_after_days into v_was
    from public.sequence_steps r
   where r.id = p_root_id and r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
   for update;
  if not found then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  -- Turned on, its words wait for an OK once more, as new words do: the first batch that may write to someone again asks.
  update public.sequence_steps
     set again_after_days = p_days,
         words_ok_at = case when p_days is not null and v_was is null then null else words_ok_at end
   where id = p_root_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'reach_out.again_set', 'lead', 'playbook', p_root_id,
          jsonb_build_object('days', p_days, 'was', v_was, 'by', auth.uid()));
  return jsonb_build_object('root_id', p_root_id, 'again_after_days', p_days);
end $$;

comment on function public.reach_out_again_set(p_tenant_id uuid, p_root_id uuid, p_days integer) is
  'Try again after p_days, or never (null) (00589, decision 0120): a member who may approve sets it on a sequence to leads (its first step''s again_after_days). Turned on, its words wait for an OK once more (words_ok_at cleared). Answers {root_id, again_after_days}.';

revoke all on function public.reach_out_again_set(uuid, uuid, integer) from public;
grant all on function public.reach_out_again_set(uuid, uuid, integer) to authenticated;
grant all on function public.reach_out_again_set(uuid, uuid, integer) to service_role;

CREATE OR REPLACE FUNCTION public.reach_out_again_count(p_tenant_id uuid, p_root_id uuid, p_days integer DEFAULT 90) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Who this sequence would try again, and from when (00589, decision 0120): the businesses its first email wrote to that
  -- reach_out_comes_back would let back once their last email is p_days old (its rules, the age aside), and the moment
  -- the first of them comes back. {count, first_at}.
  with written as (
    select s.lead_id, max(s.sent_at) as last_at
      from public.sequence_sends s
     where s.lead_id is not null and (s.tenant_id = p_tenant_id and s.sequence_id = p_root_id
       and s.step_id = s.sequence_id and s.state in ('sent', 'handed'))
     group by s.lead_id
  ),
  back as (
    select w.lead_id, w.last_at
      from written w
     where w.lead_id in (select b.lead_id from public.reach_out_comes_back(p_tenant_id, array(select lead_id from written), 0) b)
  )
  select jsonb_build_object(
           'count', count(*),
           'first_at', min(b.last_at) + make_interval(days => greatest(coalesce(p_days, 90), 0)))
    from back b
$$;

comment on function public.reach_out_again_count(p_tenant_id uuid, p_root_id uuid, p_days integer) is
  'Who a sequence to leads would try again after p_days, and from when (00589, decision 0120): {count, first_at}, the businesses its first email wrote to that reach_out_comes_back lets back, the age aside. Service role only; the route that asks it checks the caller.';

revoke all on function public.reach_out_again_count(uuid, uuid, integer) from public;
grant all on function public.reach_out_again_count(uuid, uuid, integer) to service_role;
