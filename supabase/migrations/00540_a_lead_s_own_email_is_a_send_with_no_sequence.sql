-- 00540 · A lead's own email is a send with no sequence (decision 0094).
--
-- A member writes one email to a lead and sends it from the workspace's connected mailbox, or says they sent it from
-- their own mail app. What such an email needs, the mailbox's day (mailbox_capacity), the reply's reading
-- (reach_out_reply_of) and the clock's settling (sequence_queued_outcomes), all read sequence_sends, so it is kept there,
-- with no sequence, no batch and no step: nothing joined through a sequence or a batch sees it, and with no step it takes
-- no place. The six functions here read a lead's sends with no such join, and leave it out: a one-off is no sequence's,
-- and does not count as one business written to by a sequence.
--
-- Deploy order: this migration first. No row has a null sequence until the dashboard's door is live. Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------------- the columns -- */

alter table public.sequence_sends alter column sequence_id drop not null;
alter table public.sequence_sends alter column batch_id drop not null;

alter table public.sequence_sends drop constraint if exists sequence_sends_own_is_a_leads;
alter table public.sequence_sends add constraint sequence_sends_own_is_a_leads check (
  (sequence_id is not null and batch_id is not null)
  or (sequence_id is null and batch_id is null and step_id is null and lead_id is not null));

-- One on its way per lead: a double press finds the first.
create unique index if not exists sequence_sends_own_once on public.sequence_sends (tenant_id, lead_id)
  where sequence_id is null and state = 'queued';

comment on table public.sequence_sends is
  'Decision 0060: one message of a sequence to one person. A customer''s (contact_id, no lead_id): queued, then sent, skipped or failed, once. A lead''s (lead_id): planned (a time and a mailbox), held while its check doubts it, claimed under the mailbox''s day, queued as an email or drafted for its owner, then sent, skipped, failed or handed to the team. A lead''s own email (00540) has no sequence, batch or step: a member pressed Send, or said they sent it; it is born queued or sent, the mailbox''s day counts it and a reply finds it.';

/* ----------------------------------------------------------------------------------- lead_chain_of -- */

create or replace function public.lead_chain_of(p_tenant_id uuid, p_lead_id uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select s.sequence_id as root_id from public.sequence_sends s
      where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id and s.sequence_id is not null
        and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back')))
      order by s.created_at desc
      limit 1),
    (select p.id from public.sequence_steps p
       join public.lead_search_members x on x.search_id = p.lead_search_id and x.lead_id = p_lead_id
      where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
        and x.blanked_at is null and x.class = 'qualified' and x.counted
      order by x.created_at desc
      limit 1))
$$;

/* ------------------------------------------------------------------------- reach_out_lead_timeline -- */

create or replace function public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
   where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.lead_id = p_lead_id and s.sequence_id is not null
     and not (s.state = 'skipped' and s.reason in ('run_canceled', 'owner_took_back', 'moved')))
   order by s.created_at desc
   limit 1;
  v_sent := v_root is not null;
  -- Not written yet: the reach-out whose search holds it (a list it was added to, or the search that found it), 00426.
  if v_root is null then
    select p.id, m.created_at into v_root, v_added
      from public.sequence_steps p
      join public.lead_search_members m on m.search_id in (p.lead_search_id, p.source_search_id) and m.lead_id = v_lead.id
     where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'
       and m.blanked_at is null and m.class = 'qualified' and m.counted
     order by m.created_at desc
     limit 1;
  end if;
  select q.via into v_via from public.sequence_steps p
    join public.lead_searches q on q.id = case when p.source_search_id is null
                     or exists (select 1 from public.lead_search_members x
                                 where x.search_id = p.lead_search_id and x.lead_id = v_lead.id and x.blanked_at is null)
                   then p.lead_search_id else p.source_search_id end
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
         join public.lead_searches q on q.tenant_id = p_tenant_id and q.id = case when p.source_search_id is null
                     or exists (select 1 from public.lead_search_members x
                                 where x.search_id = p.lead_search_id and x.lead_id = v_lead.id and x.blanked_at is null)
                   then p.lead_search_id else p.source_search_id end
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
               'hold_detail', s.hold_detail,
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


--
-- Name: FUNCTION reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reach_out_lead_timeline(p_tenant_id uuid, p_lead_id uuid) IS 'One lead''s reach-out (Reach out Part 6, H9, H11), for a member: the lead''s stage, dates and search, whether it was found on a listing, what it is and where it came from (kind, source: 00430), its chain (with fed_by, its steps, run_hour, last_run_for and a waiting run: what the standing line needs, 00426), added_at while it waits on a list, its person''s email thread, its sends (at most 20), its readings (at most 10) and can_stop. A lead nothing was written to yet has the reach-out whose search holds it (00426). Null for a lead the workspace does not hold.';


--
-- Name: reach_out_leave_out(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reach_out_leave_out(p_root_id uuid, p_lead_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user    uuid := auth.uid();
  r         public.sequence_steps;
  q         public.lead_searches;
  m         public.lead_search_members;
  v_skipped integer;
  v_op      uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into r from public.sequence_steps where id = p_root_id and kind = 'reach_out' and trigger = 'lead_first';
  if not found or not public.has_permission(v_user, r.tenant_id, 'approve') then
    raise exception 'Reach-out not found.' using errcode = 'P0002';
  end if;
  select * into q from public.lead_searches where id = r.lead_search_id and tenant_id = r.tenant_id;
  if not found or q.removed_at is not null then
    return jsonb_build_object('error', 'list_gone');
  end if;
  -- A search's reach-out writes to what its search holds: a lead is left out of it on Leads, never here.
  if q.via not in ('chosen', 'import') then
    return jsonb_build_object('error', 'fed_by_search', 'search_id', q.id);
  end if;
  -- The add's own lock: an add and a leave of one lead meet here, never both at once.
  perform pg_advisory_xact_lock(hashtext('reach_out_add:' || r.tenant_id::text || ':' || p_lead_id::text));
  select * into m from public.lead_search_members
   where search_id = q.id and lead_id = p_lead_id and blanked_at is null
     for update;
  if not found then
    return jsonb_build_object('error', 'not_on_it');
  end if;
  -- What left, or is leaving, stays: Stop writing is the true correction there.
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
                and s.state in ('claimed', 'queued'))) then
    return jsonb_build_object('error', 'on_its_way');
  end if;
  if exists (select 1 from public.sequence_sends s
              where s.lead_id is not null and ( s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
                and s.state in ('sent', 'handed', 'failed'))) then
    return jsonb_build_object('error', 'sent');
  end if;
  -- Planned, held or drafted (not sent yet) in a run still live: skipped as taken back, which its undo's next run plans
  -- again.
  update public.sequence_sends s
     set state = 'skipped', reason = case when s.state = 'drafted' then 'draft_withdrawn' else 'owner_took_back' end
    from public.sequence_batches b
   where s.lead_id is not null and ( b.id = s.batch_id and b.state in ('pending_approval', 'scheduled', 'sending')
     and s.tenant_id = r.tenant_id and s.sequence_id = r.id and s.lead_id = p_lead_id
     and s.state in ('planned', 'held', 'drafted'));
  get diagnostics v_skipped = row_count;
  update public.lead_search_members set blanked_at = now(), version = version + 1
   where id = m.id
  returning * into m;
  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (r.tenant_id, 'leave', q.id, array[p_lead_id], jsonb_build_object('skipped', v_skipped),
          jsonb_build_object('root_id', r.id), m.version, v_user)
  returning id into v_op;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (r.tenant_id, 'reach_out.lead_taken_back', 'lead', 'playbook', r.id,
          jsonb_build_object('search_id', q.id, 'n', 1, 'by', v_user, 'left_out', true));
  return jsonb_build_object('ok', true, 'op_id', v_op, 'version', m.version, 'skipped', v_skipped);
end $$;


--
-- Name: FUNCTION reach_out_leave_out(p_root_id uuid, p_lead_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reach_out_leave_out(p_root_id uuid, p_lead_id uuid) IS 'Leave out (00426), the drawer''s door on a lead waiting in a reach-out fed by a list: off its list (blanked), a send planned, held or drafted (00429) for it in a live run skipped as taken back, with an operation of kind leave whose undo (lead_undo, its maker''s or find''s) puts it back; one on its way or sent stays (on_its_way, sent: Stop writing is the correction there). An operator''s, as the add is.';


--
-- Name: reach_out_list_for(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reach_out_list_for(p_tenant_id uuid, p_name text, p_by uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_name   text := left(coalesce(nullif(btrim(p_name), ''), 'Leads you add'), 120);
  v_plan   jsonb;
  v_search uuid;
  v_round  uuid;
begin
  v_plan := jsonb_build_object('version', 1, 'card', 'local_businesses', 'list', 'chosen', 'name', v_name, 'asked', '',
    'terms', '[]'::jsonb, 'count', 0, 'contact', 'email', 'criteria', '[]'::jsonb, 'exclusions', '[]'::jsonb);
  insert into public.lead_searches (tenant_id, created_by, via, card, name, asked, plan)
  values (p_tenant_id, p_by, 'chosen', 'local_businesses', v_name, '', v_plan)
  returning id into v_search;
  insert into public.lead_rounds (tenant_id, search_id, seq, purpose, plan, plan_version, target, state, month, day, platform_day)
  values (p_tenant_id, v_search, 1, 'main', v_plan, 1, 0, 'queued', public.lead_month(p_tenant_id, now()),
          public.lead_day(p_tenant_id, now()), to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
  returning id into v_round;
  update public.lead_rounds set state = 'ended', ending = 'target_reached', ended_at = now() where id = v_round;
  return v_search;
end $$;


--
-- Name: reach_out_month_sent(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reach_out_month_sent(p_tenant_id uuid, p_at timestamp with time zone) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with zone as (
    select public.safe_zone(coalesce(nullif(btrim(t.timezone), ''), 'America/New_York')) as tz
      from public.tenants t where t.id = p_tenant_id
  ), month as (
    select date_trunc('month', p_at at time zone zone.tz) at time zone zone.tz as since,
           (date_trunc('month', p_at at time zone zone.tz) + interval '1 month') at time zone zone.tz as until
      from zone
  )
  select count(*)::int
    from public.messages m, month
   where m.tenant_id = p_tenant_id and m.created_at >= month.since and m.created_at < month.until
     and m.meta->>'source' = 'reach_out' and m.channel = 'email' and m.direction = 'outbound'
     and (public.email_left(m.status, m.error)
          or m.status = 'queued'
          or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
$$;

/* ------------------------------------------------------------------------------- reach_out_why_not -- */

create or replace function public.reach_out_why_not(p_tenant_id uuid, p_lead_ids uuid[], p_include_unconfirmed boolean DEFAULT false) RETURNS TABLE(lead_id uuid, why text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select x.id,
    case
      when l.id is null or l.erased_at is not null or l.blanked_at is not null then 'gone'
      when l.stage <> 'ready' or l.closed_reason is not null then 'closed'
      -- Never a customer's: nobody in People shares the address (as theirs, or one they wrote from) or the number.
      when exists (select 1 from public.contacts c
                    where c.tenant_id = l.tenant_id and c.erased_at is null
                      and ((nullif(btrim(l.email), '') is not null and c.email = lower(btrim(l.email)))
                           or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
        or (nullif(btrim(l.email), '') is not null and exists (
              select 1 from public.contact_identities i
                join public.contacts c on c.id = i.contact_id and c.erased_at is null
               where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email))))
        then 'customer'
      -- Never the never-again list: the address (an opt-out, a customer, an erasure, a no, its business's domain), and
      -- the place or the number (a customer's or an erased person's).
      when (nullif(btrim(l.email), '') is not null and public.lead_address_suppressed(l.tenant_id, lower(btrim(l.email))))
        or exists (select 1 from public.lead_suppressions s where s.tenant_id = l.tenant_id and (
                     (s.kind = 'place' and l.place_id is not null
                      and s.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                  or (s.kind = 'phone' and l.phone_e164 is not null
                      and s.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
        then 'suppressed'
      -- Never twice by the workspace: a send of any reach-out, bar one in a run its owner skipped or one taken back.
      when exists (select 1 from public.sequence_sends ro
                    where ro.lead_id is not null and ( ro.tenant_id = l.tenant_id and ro.lead_id = l.id and ro.sequence_id is not null
                      and not (ro.state = 'skipped' and ro.reason in ('run_canceled', 'owner_took_back', 'moved'))))
        then 'written'
      -- One business written to once: the finder saw it share a number, an own-domain address or a site with another.
      when exists (select 1 from public.lead_search_members m
                    where m.tenant_id = l.tenant_id and m.lead_id = l.id and m.blanked_at is null
                      and coalesce(jsonb_array_length(m.judgment->'shares'), 0) <> 0)
        then 'shared'
      when nullif(btrim(l.email), '') is null then 'no_email'
      when l.email_state = 'ok' then null
      when l.email_state = 'checking' then 'checking'
      when l.email_state = 'catch_all' then case when coalesce(p_include_unconfirmed, false) then null else 'unconfirmed' end
      when l.email_state = 'invalid' then 'invalid'
      else 'unchecked'
    end
    from unnest(coalesce(p_lead_ids, '{}'::uuid[])) as x(id)
    left join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id
$$;

/* ----------------------------------------------------------------------------------- sequence_move -- */

create or replace function public.sequence_move(p_tenant_id uuid, p_lead_id uuid, p_to_root uuid, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_from  uuid;
  v_left  jsonb;
  v_added jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.sequence_steps r where r.id = p_to_root and r.tenant_id = p_tenant_id
                    and r.kind = 'reach_out' and r.trigger = 'lead_first') then
    raise exception 'Sequence not found.' using errcode = 'P0002';
  end if;
  -- One business gets one sequence: a lead written to, or handed an email to send, stays where it is.
  if exists (select 1 from public.sequence_sends s
              where s.tenant_id = p_tenant_id and s.lead_id = p_lead_id and s.sequence_id is not null
                and s.state in ('claimed', 'queued', 'sent', 'handed', 'drafted')) then
    raise exception 'They were written to already: a business gets one sequence.' using errcode = '23505';
  end if;
  select e.sequence_id into v_from from public.sequence_enrollments e
   where e.tenant_id = p_tenant_id and e.lead_id = p_lead_id and e.state = 'in' and e.sequence_id <> p_to_root
   order by e.entered_at desc limit 1;
  if v_from is null then
    select r.sequence_id into v_from from public.sequence_steps r
      join public.lead_search_members m on m.search_id = r.lead_search_id and m.lead_id = p_lead_id and m.blanked_at is null
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first' and r.id <> p_to_root
     order by m.created_at desc limit 1;
  end if;
  if v_from is null then
    raise exception 'They are in no other sequence.' using errcode = 'P0002';
  end if;
  v_left := public.sequence_leave(p_tenant_id, v_from, '{}'::uuid[], 'moved',
                                  coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('moved_to', p_to_root),
                                  p_via, null, array[p_lead_id]);
  -- Off the old list too, so no sequence holds them but the new one (a place that stood stays on its list otherwise).
  update public.lead_search_members m set blanked_at = now(), version = m.version + 1
    from public.sequence_steps r
   where r.id = v_from and m.search_id = r.lead_search_id and m.lead_id = p_lead_id and m.blanked_at is null;
  v_added := public.reach_out_add(p_to_root, array[p_lead_id], false);
  if coalesce((v_added->>'added')::int, 0) = 0 then
    raise exception 'They can''t join that sequence.' using errcode = '22023';
  end if;
  return jsonb_build_object('from', v_from, 'to', p_to_root, 'decision_id', v_left->>'decision_id',
                            'op_id', v_added->>'op_id');
end $$;


--
-- Name: sequence_once_keep(uuid, text, jsonb, uuid, jsonb, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sequence_once_keep(p_tenant_id uuid, p_name text, p_once jsonb, p_id uuid DEFAULT NULL::uuid, p_decision jsonb DEFAULT '{}'::jsonb, p_via text DEFAULT NULL::text, p_undo_of uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_name  text := left(btrim(coalesce(p_name, '')), 80);
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.has_permission(v_actor, p_tenant_id, 'approve') then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'A message sent once is named.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_once) is distinct from 'object' then
    raise exception 'A kept one-off says who, when and what.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.sequences (tenant_id, name, starts, state, created_by, mode, once)
    values (p_tenant_id, v_name, 'date', 'draft', v_actor, null, p_once)
    returning id into v_id;
  else
    update public.sequences set name = v_name, once = p_once, updated_at = now()
     where tenant_id = p_tenant_id and id = p_id and starts = 'date' and state = 'draft'
    returning id into v_id;
    if v_id is null then
      raise exception 'Draft not found.' using errcode = 'P0002';
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'state', 'draft')
    || public.team_decision(p_tenant_id, v_actor, 'sequence', v_id, 'make_sequence',
         coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('once', true, 'kept', p_id is not null), p_via,
         p_undo_of);
end $$;


--
-- Name: FUNCTION sequence_once_keep(p_tenant_id uuid, p_name text, p_once jsonb, p_id uuid, p_decision jsonb, p_via text, p_undo_of uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sequence_once_keep(p_tenant_id uuid, p_name text, p_once jsonb, p_id uuid, p_decision jsonb, p_via text, p_undo_of uuid) IS 'A message sent once, kept as a draft (00465, decision 0065; Ruben''s pick of 20 Oct 2026): a sequence that starts on a date, its state draft, its once New''s {who, at, channels, step}; p_id keeps one already kept. Sends nothing: it goes as it is sent, through the send door, and its draft goes then (sequence_discard). By a member who may approve; the make_sequence decision rides in the same transaction. Answers id and state.';


--
-- Name: sequence_overview(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sequence_overview(p_tenant_id uuid, p_sequence_id uuid DEFAULT NULL::uuid) RETURNS jsonb
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
     order by b.sequence_id, coalesce(b.finished_at, b.started_at, b.scheduled_for) desc, b.id
  ),
  last_counts as (
    select public.sequence_batch_counts(p_tenant_id, coalesce(array_agg(l.id), '{}')) as counts from last l
  ),
  -- Who is in it (00459): everyone whose place stands, as its People tab files them (sequence_places): a lead added and
  -- not yet planned, waiting for an OK, held, for you to send, up next or between steps. Not who left, finished, or wrote
  -- back and waits for an answer.
  in_it as (
    select p.sequence_id, count(*) as n
      from public.sequence_places(p_tenant_id, p_sequence_id, null) p
     where p.grp not in ('done', 'left', 'replied')
     group by p.sequence_id
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

/* -------------------------------------------------------------------------- reach_out_chain_totals -- */

create or replace function public.reach_out_chain_totals(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
begin
  if not public.may_read_workspace(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as reach_out_report reads them (00360): today, or the earlier day a member
  -- picked, never a day that has not come; and the midnight after it, so a window that ended counts nothing after it.
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  return (
    -- An email that left (email_left), dated by when it left (email_sent_at), as reach_out_report counts it.
    with sent as (
      select s.sequence_id as root_id, s.lead_id, s.contact_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at
        from public.sequence_sends s
        left join public.messages m on m.id = s.message_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.sequence_id is not null
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error))))
    ),
    period as (
      select x.* from sent x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    -- Each business once a chain, at its last email of the period.
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.lead_id, x.contact_id
        from period x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    per_chain as (
      select x.root_id, count(*) as written, max(x.sent_at) as last_at
        from period x
       group by x.root_id
    ),
    -- The businesses a chain wrote to (00404): the population wrote_back is a count of.
    written_to as (
      select ls.root_id, count(*) as businesses
        from last_sent ls
       group by ls.root_id
    ),
    wrote_back as (
      select ls.root_id, count(*) as wrote_back
        from last_sent ls
       where ls.contact_id in (select w.contact_id from wrote w)
       group by ls.root_id
    )
    select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object(
             'written', coalesce(c.written, 0),
             'businesses', coalesce(n.businesses, 0),
             'wrote_back', coalesce(b.wrote_back, 0),
             'last_at', c.last_at)), '{}'::jsonb)
      from public.sequence_steps r
      left join per_chain c on c.root_id = r.id
      left join written_to n on n.root_id = r.id
      left join wrote_back b on b.root_id = r.id
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  );
end $$;


--
-- Name: FUNCTION reach_out_chain_totals(p_tenant_id uuid, p_days integer, p_end date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reach_out_chain_totals(p_tenant_id uuid, p_days integer, p_end date) IS 'Every chain of the workspace (a reach-out''s first step), by its id, for a member (may_read_workspace): what it wrote over p_days days (1 to 90) to the window''s last day in the workspace''s zone, the window reach_out_report reads, in emails (written) and in businesses (the ones it wrote to, each once a chain at its last email: the population wrote_back is a count of, so wrote_back is never more than businesses, 00404), how many of them wrote back (outreach_wrote_back) and when it last wrote in it; a chain that wrote nothing is { written: 0, businesses: 0, wrote_back: 0, last_at: null } (00375, 00404). `p_end` is the window''s last day, as 00360 reads it: null is today, and a day that has not come is read as today.';


--
-- Name: reach_out_check_take(uuid, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reach_out_check_take(p_tenant_id uuid, p_cap integer, p_at timestamp with time zone DEFAULT now()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_taken boolean;
begin
  if p_tenant_id is null or coalesce(p_cap, 0) <= 0 then
    return false;
  end if;
  insert into public.reach_out_check_spend as x (tenant_id, day, attempts)
  values (p_tenant_id, (coalesce(p_at, now()) at time zone 'UTC')::date, 1)
  on conflict (tenant_id, day) do update set attempts = x.attempts + 1 where x.attempts < p_cap
  returning true into v_taken;
  return coalesce(v_taken, false);
end $$;


--
-- Name: reach_out_day_due(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reach_out_day_due(p_now timestamp with time zone, p_limit integer) RETURNS TABLE(tenant_id uuid, day date, numbers jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with here as (
    select t.id, z.tz, (p_now at time zone z.tz)::date as day,
           date_trunc('day', p_now at time zone z.tz) at time zone z.tz as since
      from public.tenants t
     cross join lateral (select coalesce(nullif(t.timezone, ''), 'America/New_York') as tz) z
     where extract(hour from p_now at time zone z.tz) >= 18
       and exists (select 1 from public.sequence_steps p
                    where p.tenant_id = t.id and p.kind = 'reach_out' and p.trigger = 'lead_first')
  ), counted as (
    select h.id, h.day, jsonb_build_object(
      'written', (select count(*) from public.sequence_sends s left join public.messages m on m.id = s.message_id
                   where s.lead_id is not null and ( s.tenant_id = h.id
                     and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now)),
      'wrote_back', (select count(*) from public.sequence_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply'),
      'interested', (select count(*) from public.sequence_replies r
                      where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                        and r.claim <> 'auto_reply' and r.undone_at is null
                        and r.intent in ('interested', 'question')),
      'said_no', (select count(*) from public.sequence_replies r
                   where r.tenant_id = h.id and r.read_at >= h.since and r.read_at <= p_now
                     and r.undone_at is null and r.intent = 'no'),
      'booked', (select count(*) from public.appointments a
                  where a.tenant_id = h.id and a.created_at >= h.since and a.created_at <= p_now
                    and a.lead_id is not null and a.status <> 'cancelled'
                    and exists (select 1 from public.sequence_sends s
                                 where s.lead_id is not null and ( s.tenant_id = h.id and s.lead_id = a.lead_id and s.state = 'sent'
                                   and s.sent_at < a.starts_at))),
      'bounced', (select count(*) from public.sequence_sends s join public.messages m on m.id = s.message_id
                   where s.lead_id is not null and ( s.tenant_id = h.id and s.state in ('sent', 'failed')
                     and m.status = 'failed' and m.error->>'provider' = 'bounced'
                     and coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at))
                         between h.since and p_now)),
      'held', (select count(*) from public.sequence_sends s join public.sequence_batches b on b.id = s.batch_id
                where s.lead_id is not null and ( s.tenant_id = h.id and s.state = 'held'
                  and b.state in ('pending_approval', 'scheduled', 'sending')))) as numbers
      from here h
     where not exists (select 1 from public.notifications n
                        where n.tenant_id = h.id and n.created_at >= h.since - interval '1 day'
                          and n.kind = 'reach_out_day' and n.subject_type = 'reach_out_day'
                          and n.subject_id = h.day::text)
  )
  select c.id, c.day, c.numbers
    from counted c
   where (c.numbers->>'written')::int + (c.numbers->>'wrote_back')::int + (c.numbers->>'said_no')::int
         + (c.numbers->>'held')::int + (c.numbers->>'booked')::int > 0
   order by c.id
   limit greatest(coalesce(p_limit, 0), 0)
$$;

/* -------------------------------------------------------------------------------- reach_out_report -- */

create or replace function public.reach_out_report(p_tenant_id uuid, p_days integer, p_end date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tz    text;
  v_today date;
  v_end   date;
  v_since timestamptz;
  v_stop  timestamptz;
  v_prior timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any count of days Reports reads, as its other functions take them (00360): a month so far and a window a member
  -- picked are neither 7, 30 nor 90, and this refused both.
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A period is 1 to 90 days.' using errcode = '22023';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  -- The window's last day and where it stops, as report_series reads them (00360).
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_since := (v_end - (p_days - 1))::timestamp at time zone v_tz;
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
  -- Where the period before begins (00404): the same count of days, ending where the window begins.
  v_prior := (v_end - (p_days * 2 - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left. Read twice now (the
    -- window's `sent` and the period before), so not materialized (00404): each read takes the rows it needs, and the
    -- tenant's whole history of emails is never held for the second.
    with left_ as not materialized (
      select s.id, s.sequence_id as root_id, s.step_id as playbook_id, s.lead_id, s.contact_id, s.mailbox_id,
             -- Sent from its owner's own inbox, on their word (00429): from no mailbox, as an email from before 00424 is.
             s.said_at is not null as yours,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.sequence_sends s
        left join public.messages m on m.id = s.message_id and m.tenant_id = s.tenant_id
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.sequence_id is not null
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error))))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since and x.sent_at < v_stop
    ),
    handed as (
      select s.sequence_id as root_id, s.step_id as playbook_id, count(*) as n
        from public.sequence_sends s
       where s.lead_id is not null and ( s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since and s.sent_at < v_stop)
       group by s.sequence_id, s.step_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at,
             -- Won (00426): a deal that names the lead, won. A count of businesses, never an amount.
             exists (select 1 from public.deals d
                      where d.tenant_id = p_tenant_id and d.lead_id = x.lead_id and d.stage = 'won') as won
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.sequence_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             ls.won,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle) as businesses,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    mailboxes as (
      select x.mailbox_id, x.yours, b.address, b.state, b.held_why, b.held_at, count(*) as sent,
             -- One its owner sent from their own inbox is never counted delivered: nobody can know it landed.
             count(*) filter (where x.status in ('sent', 'delivered', 'read') and not x.yours) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.mailbox_connections b on b.id = x.mailbox_id and b.tenant_id = p_tenant_id
       group by x.mailbox_id, x.yours, b.address, b.state, b.held_why, b.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'end', v_end,
      'since', v_end - (p_days - 1),
      'has_reach_out', exists (select 1 from public.sequence_steps p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'businesses', (select count(*) from last_sent),
        'delivered', (select count(*) from sent where status in ('sent', 'delivered', 'read') and not yours),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'won', (select count(*) from answers where won),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      -- What the period before wrote, counted as the totals count it: emails only (00404).
      'before', (
        select jsonb_build_object(
                 'written', count(*),
                 'delivered', count(*) filter (where x.status in ('sent', 'delivered', 'read') and not x.yours),
                 'bounced', count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'))
          from left_ x where x.sent_at >= v_prior and x.sent_at < v_since),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_end - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.sequence_batches b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_end - (p_days - 1)
                                 and b.run_for <= v_end),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.sequence_steps p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.sequence_steps p join c on p.after_step_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('sent', 'delivered', 'read') and not x.yours),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'businesses', (select count(*) from answers a where a.playbook_id = c.id),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'won', (select count(*) from answers a where a.playbook_id = c.id and a.won),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.sequence_steps p on p.id = c.id)) as body
              from public.sequence_steps r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'businesses', a.businesses,
                                            'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'businesses', coalesce((select sum(a.businesses) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      -- An edge or a page from before mailboxes reads `domains`: none now (decision 0056).
      'domains', '[]'::jsonb,
      'mailboxes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'address', d.address, 'yours', d.yours, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.address)
          from (select * from mailboxes order by sent desc, address limit 10) d), '[]'::jsonb))
  );
end $$;


--
-- Name: FUNCTION reach_out_report(p_tenant_id uuid, p_days integer, p_end date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reach_out_report(p_tenant_id uuid, p_days integer, p_end date) IS 'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over p_days days (1 to 90; any other is refused) to the window''s last day in the workspace''s zone, the emails that left and what came of them. has_reach_out, totals, before (written, delivered and bounced over the same count of days before the window, 00404: outcomes are state now, so they have no period before), series (written per day), chains (at most 20, each with its steps; reach_out_chain_totals counts every chain over the same window, 00375), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Emails are written, delivered and bounced; businesses are the leads written to, each once per chain at its last email of the period, and every outcome (wrote back, interested, booked, won, said no) is a count of them, so it is never more than `businesses`, on the totals, on a step (the businesses whose last email was that step), on an angle (the ones whose last email had it) and past the top 8 (00404); wrote back is outreach_wrote_back; won (00426) is a deal naming the lead, won, a count and never an amount. mailboxes (00429) names the emails their owners sent from their own inbox apart (`yours`), from no mailbox, as an email from before 00424 is, and none of them is counted delivered: nobody can know it landed. `p_end` (00360) is the window''s last day, in the workspace''s zone: null is today, and a day that has not come is read as today.';


--
-- Name: reach_out_root_lines(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reach_out_root_lines(p_tenant_id uuid, p_root_id uuid) RETURNS TABLE(lead_id uuid, line jsonb, ord timestamp with time zone, done boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
       and not exists (select 1 from per p where p.lead_id = m.lead_id)
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
