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
