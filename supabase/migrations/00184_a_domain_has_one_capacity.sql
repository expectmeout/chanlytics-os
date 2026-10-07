-- 00184 · A domain has one capacity, the door is keyed by lead, and a claimed send has its person.
--
-- Reach out, Part 3 (the plan's PR 3).
--
--   sending_domain_capacity(domain, at)   the one read of what a domain may still send: the days it sent on before
--                                         today since it was clean, within the last 90 (D15: the ramp counts them, not
--                                         calendar days, and moves only at midnight; a domain idle for months warms
--                                         again), what it spends in the rolling day at `at` (left, of unknown outcome,
--                                         queued, claimed), and the times it spends them (the timetable's `recent`).
--                                         The claim and the timetable read it; the domains clock writes its days.
--   sending_domains.sent_days             those days as the domains clock last wrote them, beside its other counts
--                                         (00176): the send door and Connections read them, since the days move only
--                                         at midnight or when the domain is clean again, and the door runs per send.
--   outreach_lead_facts(...)              the lead's own facts (its stage, the never-again list, whether they wrote
--                                         back), keyed by the lead a send is for. A step's followers ask this.
--   outreach_facts(..., p_lead_id)        those, and the domain's: what the send door asks. Without a lead, as 00181.
--   reach_out_audience(...)               the leads a chain's first step may write to (§4.2).
--   reach_out_followers(...)              a step's leads, with their own facts and any bounce in the chain.
--   reach_out_person(tenant, lead)        the person a first send needs, made once, without the insert trigger
--                                         calling the lead converted (it is not: nobody has written back).
--   lead_link_contact()                   skips an insert made with chanlytics.link_lead = off, and only then.
--   reach_out_claim(domain, cap, at, n)   up to n due sends of a running chain, claimed under the domain's lock so
--                                         two ticks can never spend its day twice (C7).

set local lock_timeout = '3s';

alter table public.sending_domains add column if not exists sent_days integer;
comment on column public.sending_domains.sent_days is
  'The days it sent on before today since it was clean, within the last 90 (sending_domain_capacity, D15), as the domains clock last wrote them: the ramp the send door and Connections read. Zero when clean again (a hold released, a first verify); null until written, read as none.';

/* ------------------------------------------------------------- capacity -- */

create or replace function public.sending_domain_capacity(p_domain_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select id, tenant_id, host, state, clean_since from public.sending_domains where id = p_domain_id
  ),
  gone as (
    -- What left the domain, or went and nobody knows how: by when it left (00180's clock), back 30 days at most.
    select public.email_sent_at(m.meta, m.status_updated_at, m.created_at) as at
      from public.messages m, d
     where m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = d.host
       and m.created_at >= least(greatest(coalesce(d.clean_since, p_at), p_at - interval '90 days'), p_at - interval '1 day')
                            - interval '30 days'
       and (public.email_left(m.status, m.error)
            or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
  ),
  waiting as (
    -- Queued email rows from the domain (written, not yet left), and claimed sends with no row yet. A row queued a
    -- month ago is stuck, not waiting (the outbox fails a job long before): the bound keeps the read on 00176's index.
    select now() as at from public.messages m, d
     where m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound' and m.status = 'queued'
       and public.email_from_host(m.meta) = d.host
       and m.created_at >= p_at - interval '30 days'
    union all
    select coalesce(s.claimed_at, p_at) from public.reach_out_sends s, d
     where s.domain_id = d.id and s.state = 'claimed'
  ),
  planned as (
    select s.send_at as at from public.reach_out_sends s, d where s.domain_id = d.id and s.state = 'planned'
  )
  select jsonb_build_object(
    'state', d.state,
    'clean_since', d.clean_since,
    -- D15: the days it actually sent on (UTC days) since it was last clean, before today's: the step a day's first
    -- send earns is the next day's, so a domain's share holds all day (as the calendar ramp's did).
    'sent_days', (select count(distinct (g.at at time zone 'UTC')::date) from gone g
                   where d.clean_since is not null and g.at >= greatest(d.clean_since, p_at - interval '90 days')
                     and (g.at at time zone 'UTC')::date < (p_at at time zone 'UTC')::date),
    'used', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at)
            + (select count(*) from waiting),
    'recent', coalesce((select jsonb_agg((extract(epoch from x.at) * 1000)::bigint order by x.at) from (
                 select at from gone where at > p_at - interval '1 day'
                 union all select at from waiting
                 union all select at from planned) x), '[]'::jsonb),
    'last_sent_at', (select max(g.at) from gone g where g.at <= p_at)
  ) from d
$$;
revoke execute on function public.sending_domain_capacity(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_capacity(uuid, timestamptz) to service_role;

/* --------------------------------------------------- the door, by lead -- */

-- The lead's own facts: the one place they are asked, by the send door (below) and by a step's followers.
create or replace function public.outreach_lead_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_lead_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The send's own lead when it names one (a reach-out's always does); else the lead still being written to wins.
    'lead_stage', coalesce(
      (select l.stage from public.leads l
        where p_lead_id is not null and l.id = p_lead_id and l.tenant_id = p_tenant_id
          and l.contact_id = p_contact_id and l.erased_at is null and l.blanked_at is null),
      (select l.stage from public.leads l
        where p_lead_id is null and l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
          and l.erased_at is null and l.blanked_at is null
        order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
        limit 1)),
    'suppressed', exists (
      select 1 from public.lead_suppressions s
       where s.tenant_id = p_tenant_id and s.kind = 'email'
         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),
    'wrote_back', (
      -- 00181's three, unchanged.
      exists (
        select 1 from public.messages m
          join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
         where m.tenant_id = p_tenant_id and c.contact_id = p_contact_id
           and m.direction = 'inbound' and m.sender = 'customer'
           and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') = 'auto_reply'))
      or exists (
        select 1 from public.messages o
          join public.conversations c on c.id = o.conversation_id and c.tenant_id = o.tenant_id
         where o.tenant_id = p_tenant_id and c.contact_id = p_contact_id
           and o.channel = 'email' and o.direction = 'outbound' and o.meta->'email'->>'message_id' is not null
           and (exists (
                  select 1 from public.messages r
                   where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
                     and r.sender = 'customer'
                     and r.meta->'email'->>'in_reply_to' = o.meta->'email'->>'message_id'
                     and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')
                or exists (
                  select 1 from public.messages r
                   where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
                     and r.sender = 'customer'
                     and r.meta->'email'->'references' @> jsonb_build_array(o.meta->'email'->>'message_id')
                     and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')))
      or exists (
        select 1 from public.calls k
         where k.tenant_id = p_tenant_id and k.contact_id = p_contact_id and k.direction = 'inbound'))
  )
$$;
revoke execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) to service_role;
comment on function public.outreach_lead_facts(uuid, uuid, text, uuid) is
  'A cold email''s facts about its lead: lead_stage (the send''s own lead when named, else the one still being written to), suppressed, wrote_back (00181). Service role only.';

drop function if exists public.outreach_facts(uuid, uuid, text, text, timestamptz);
create or replace function public.outreach_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_host text,
  p_since timestamptz,
  p_lead_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.outreach_lead_facts(p_tenant_id, p_contact_id, p_to, p_lead_id) || jsonb_build_object(
    -- The ramp's days as the domains clock wrote them (they move only at midnight, or to none when clean again).
    'domain', (
      select jsonb_build_object('state', d.state, 'from_local', d.from_local, 'clean_since', d.clean_since,
                                'sent_days', coalesce(d.sent_days, 0))
        from public.sending_domains d
       where d.tenant_id = p_tenant_id and d.host = lower(btrim(p_host))),
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(btrim(p_host))
         and m.created_at >= p_since - interval '30 days'
         and public.email_sent_at(m.meta, m.status_updated_at, m.created_at) >= p_since
         and (public.email_left(m.status, m.error)
              or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz, uuid) to service_role;
comment on function public.outreach_facts(uuid, uuid, text, text, timestamptz, uuid) is
  'The facts the send door asks of a cold email (core deliver.ts): the lead''s (outreach_lead_facts), domain {state, from_local, clean_since, sent_days}, sent_since. Service role only.';

/* ------------------------------------------------------------ the audience -- */

create or replace function public.reach_out_audience(p_tenant_id uuid, p_search_id uuid, p_root_id uuid, p_limit int)
returns table (lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, lower(btrim(l.email)), l.business_name, l.city, l.region, l.hours
    from public.lead_search_members sm
    join public.lead_searches s on s.id = sm.search_id and s.tenant_id = sm.tenant_id and s.removed_at is null
    join public.leads l on l.id = sm.lead_id and l.tenant_id = sm.tenant_id
   where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
     and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
     and l.stage = 'ready' and l.closed_reason is null and l.erased_at is null and l.blanked_at is null
     and l.email_state = 'ok' and nullif(btrim(l.email), '') is not null
     -- Never a customer's: nobody in People shares the address (as theirs now, or as one they wrote from) or the number,
     -- and the finder saw no share.
     and coalesce(jsonb_array_length(sm.judgment->'shares'), 0) = 0
     and not exists (select 1 from public.contacts c where c.tenant_id = l.tenant_id and c.erased_at is null
                       and (c.email = lower(btrim(l.email)) or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
     and not exists (select 1 from public.contact_identities i
                       join public.contacts c on c.id = i.contact_id and c.erased_at is null
                      where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email)))
     -- Never the never-again list: the address (an opt-out, a customer, an erasure), and the place or the number
     -- (a customer's or an erased person's, 00140: a number carries no opt-out of its own), so a business erased or
     -- already a customer is not found again under a new address.
     and not exists (select 1 from public.lead_suppressions x where x.tenant_id = l.tenant_id and (
                       (x.kind = 'email' and x.hash = public.lead_suppression_hash(l.tenant_id, lower(btrim(l.email))))
                    or (x.kind = 'place' and l.place_id is not null
                        and x.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                    or (x.kind = 'phone' and l.phone_e164 is not null
                        and x.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
     -- Never twice by one chain: no step of it has a send for this lead, bar one in a run its owner skipped.
     and not exists (select 1 from public.reach_out_sends ro
                      where ro.root_id = p_root_id and ro.lead_id = l.id
                        and not (ro.state = 'skipped' and ro.reason = 'run_canceled'))
   -- The finder's fit, strongest first (the text sorts long, look, strong), then the longest found.
   order by case sm.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, l.found_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_audience(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reach_out_audience(uuid, uuid, uuid, int) to service_role;

-- A step's leads: sent the step before at least p_after_days ago, not on this step yet, each with the lead's own facts
-- (outreach_lead_facts, keyed by the lead: the answer the send door will give about them) and whether any email of the
-- chain to them bounced or failed for good (C4: any bounce stops the chain). A lead whose sent email was erased with
-- its person is no follower: there is nobody to follow up.
create or replace function public.reach_out_followers(
  p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days int, p_limit int)
returns table (lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid,
               facts jsonb, bounced boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, s.contact_id, lower(btrim(l.email)), l.region, l.hours, s.message_id,
         public.outreach_lead_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)), l.id),
         exists (select 1 from public.reach_out_sends b join public.messages bm on bm.id = b.message_id
                  where b.root_id = s.root_id and b.lead_id = l.id
                    and bm.status = 'failed' and bm.error->>'provider' in ('bounced', 'failed'))
    from public.reach_out_sends s
    join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
    join public.messages m on m.id = s.message_id
   where s.tenant_id = p_tenant_id and s.playbook_id = p_parent_id and s.state = 'sent'
     and s.sent_at <= now() - make_interval(days => p_after_days)
     and s.contact_id is not null
     and not exists (select 1 from public.reach_out_sends x where x.playbook_id = p_step_id and x.lead_id = l.id)
   order by s.sent_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;

/* -------------------------------------------------------------- the person -- */

-- 00140's trigger, with one switch: an insert made by reach_out_person says so, and is not a lead converting.
create or replace function public.lead_link_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  begin
    if current_setting('chanlytics.link_lead', true) = 'off' then return null; end if;
    if auth.uid() is not null then return null; end if;
    if NEW.erased_at is not null or NEW.merged_into_contact_id is not null then return null; end if;
    if NEW.phone_e164 is null and NEW.email is null then return null; end if;
    -- Two guarded single-column lookups, never one OR over two nullable
    -- parameters: this runs on EVERY contacts insert (the inbound hot path),
    -- and an OR of two nullable parameters plans as a sequential scan over
    -- leads. Each lookup reaches its own index (leads_tenant_phone,
    -- leads_tenant_email); the number is tried first, being the stronger
    -- identity.
    if NEW.phone_e164 is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = NEW.tenant_id and l.phone_e164 = NEW.phone_e164
         and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       order by l.found_at desc
       limit 1;
    end if;
    if v_lead is null and NEW.email is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = NEW.tenant_id and l.email = NEW.email
         and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       order by l.found_at desc
       limit 1;
    end if;
    if v_lead is null then return null; end if;
    update public.leads
       set contact_id = NEW.id, stage = 'converted', closed_reason = null, converted_at = now(), contacted_at = coalesce(contacted_at, now())
     where id = v_lead;
    if not exists (select 1 from public.events e where e.tenant_id = NEW.tenant_id and e.subject_type = 'contact' and e.subject_id = NEW.id and e.kind = 'contact.added') then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (NEW.tenant_id, 'contact.added', 'contact', 'contact', NEW.id, jsonb_build_object('source', 'lead'));
    end if;
  exception when others then
    raise warning 'lead_link_contact: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.lead_link_contact() from public, anon, authenticated;

create or replace function public.reach_out_person(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_email text;
  v_contact uuid;
  v_conv uuid;
  v_made boolean := false;
begin
  select * into v_lead from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id and erased_at is null and blanked_at is null
   for update;
  if not found then return jsonb_build_object('refused', 'lead_gone'); end if;
  -- A lead no longer being written to: it said no, was set aside, or became a customer since it was planned (a person
  -- with its address came into People, and the insert trigger linked and converted it). Its person is theirs, never a
  -- cold email's: the send is skipped before a row is written into a customer's thread.
  if v_lead.stage not in ('ready', 'nurture') then return jsonb_build_object('refused', 'lead_closed'); end if;
  v_email := nullif(lower(btrim(coalesce(v_lead.email, ''))), '');
  if v_email is null then return jsonb_build_object('refused', 'no_address'); end if;
  if v_lead.contact_id is not null then
    v_contact := v_lead.contact_id;
  else
    -- Somebody in People already has this address, as theirs or as one they wrote from: a customer, never written to
    -- cold (§4.8).
    if exists (select 1 from public.contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.erased_at is null)
       or exists (select 1 from public.contact_identities i
                    join public.contacts c on c.id = i.contact_id and c.erased_at is null
                   where i.tenant_id = p_tenant_id and i.channel = 'email' and i.external_id = v_email) then
      return jsonb_build_object('refused', 'already_yours');
    end if;
    -- The person, made with the lead-link trigger told this insert is not a lead converting. A person with the address
    -- made meanwhile (another lead's claim, an email in) is somebody's already; an address People cannot hold is none.
    -- Either refuses, and the switch goes back with the failed insert.
    begin
      perform set_config('chanlytics.link_lead', 'off', true);
      insert into public.contacts (tenant_id, display_name, email)
      values (p_tenant_id, left(nullif(v_lead.business_name, ''), 80), v_email)
      returning id into v_contact;
      perform set_config('chanlytics.link_lead', 'on', true);
    exception
      when unique_violation then return jsonb_build_object('refused', 'already_yours');
      when check_violation then return jsonb_build_object('refused', 'no_address');
    end;
    insert into public.contact_identities (tenant_id, contact_id, channel, external_id)
    values (p_tenant_id, v_contact, 'email', v_email)
    on conflict (tenant_id, channel, external_id) do nothing;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.added', 'contact', 'contact', v_contact,
            jsonb_build_object('source', 'lead', 'lead_id', p_lead_id, 'by', 'reach_out'));
    update public.leads set contact_id = v_contact, version = version + 1 where id = p_lead_id;
    v_made := true;
  end if;
  insert into public.conversations (tenant_id, contact_id) values (p_tenant_id, v_contact)
  on conflict (tenant_id, contact_id) do nothing;
  select id into v_conv from public.conversations where tenant_id = p_tenant_id and contact_id = v_contact;
  return jsonb_build_object('contact_id', v_contact, 'conversation_id', v_conv, 'made', v_made);
end $$;
revoke execute on function public.reach_out_person(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_person(uuid, uuid) to service_role;

/* --------------------------------------------------------------- the claim -- */

create or replace function public.reach_out_claim(p_domain_id uuid, p_cap int, p_at timestamptz, p_limit int)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room int;
begin
  -- No share, no limit, no moment: nothing is claimed (least() would read a null cap as none at all).
  if p_domain_id is null or p_cap is null or p_limit is null or p_at is null or p_cap <= 0 or p_limit <= 0 then
    return;
  end if;
  -- One claimer per domain at a time: the count below and the claim after it are one step (C7).
  perform pg_advisory_xact_lock(hashtext('reach_out_claim:' || p_domain_id::text));
  if not exists (select 1 from public.sending_domains where id = p_domain_id and state = 'verified') then return; end if;
  v_room := least(p_limit, p_cap - (public.sending_domain_capacity(p_domain_id, p_at)->>'used')::int);
  if v_room is null or v_room <= 0 then return; end if;
  return query
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at
   where s.id in (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.playbooks r on r.id = s2.root_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.domain_id = p_domain_id and s2.state = 'planned' and s2.send_at <= p_at
        -- The step running, and its chain: a paused root pauses every step of it.
        and p.state = 'running' and r.state = 'running' and b.state in ('scheduled', 'sending')
      order by s2.send_at
      limit v_room
      for update of s2 skip locked)
  returning s.*;
end $$;
revoke execute on function public.reach_out_claim(uuid, int, timestamptz, int) from public, anon, authenticated;
grant execute on function public.reach_out_claim(uuid, int, timestamptz, int) to service_role;
