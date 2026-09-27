-- 00217 · A no reaches the business's own domain.
--
-- Reach out, Part 5 (docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md, PR 2, with Ruben's N6). The doors a
-- reply's reading will call, shipped inert: nothing writes a reply's no, a domain row, a resume_at or a reach-out step
-- until the reading arrives (00218). What changes now is who asks the never-again list, and how a lead converts.
--
--   lead_suppressions          a `domain` row (N6: the business's own domain, when a no came from it) and the what
--                              `said_no` (a reply read as no), both CHECKs re-issued with their full lists.
--   lead_addresses_suppressed  the one predicate for "this address is on the never-again list": its own `email` row, or
--                              a `domain` row for the part after its last "@". Set-based, for the finder's batch;
--   lead_address_suppressed    its one-row form. The door's facts, the audience and the finder all ask it.
--   outreach_lead_facts        00211's, whole, with `suppressed` asked through the predicate.
--   reach_out_audience         00197's, whole, with the address's arm of the never-again test asked through it. The
--                              place and the number keep their own arms: a place is not an address.
--   set_email_marketing        00177's, whole, with a reply's two sources: `reply` (a no, like an unsubscribe) and
--                              `reply_undone` (the one way back, only while a reply's no is what holds it, and only
--                              to the answer that no found). An unsubscribe or a complaint after a reply's no makes the
--                              no theirs.
--   sending_domain_counts      00188's, whole: D18's count takes a reply's no beside an unsubscribe, unless it was
--                              undone since, and counts a person once.
--   leads.resume_at            the day a "not now" or a person's "back on" named (G12).
--   person_step_from_playbook  a dated step the product makes for the team (G11), once per source (one is required),
--                              service role only.
--   lead_convert_by            a lead's conversion, written once for the doors that convert (G19), called only by
--                              definer doors (00184's lead_link_contact still converts on its own: owed);
--   lead_set_stage             00142's, whole, with its Interested converting through it.
--
-- Every statement re-runs. The new column and the CHECKs take ACCESS EXCLUSIVE on tables a live workspace reads, so the
-- same lock guard as 00140, 00142 and 00166.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------ 1. the domain on the never-again list -- */

alter table public.lead_suppressions drop constraint if exists lead_suppressions_kind_check;
alter table public.lead_suppressions add constraint lead_suppressions_kind_check
  check (kind in ('email', 'place', 'phone', 'domain'));
alter table public.lead_suppressions drop constraint if exists lead_suppressions_what_check;
alter table public.lead_suppressions add constraint lead_suppressions_what_check
  check (what in ('email_opt_out', 'customer', 'erased', 'said_no'));
comment on table public.lead_suppressions is
  'By what happened (S8): an email opt-out stops email to that address (calls stay); a customer is hidden from every search; an erasure hides the place, the number and the address for good; a reply read as no (Reach out Part 5) stops the address that said it and, when it is the business''s own, the domain (kind domain, the hash of the part after the "@", N6). A bounce is email_state = invalid on the lead, never a row here. The hash is lead_suppression_hash(). The send door''s facts, the audience and the finder ask an address through lead_addresses_suppressed.';

-- The one predicate (G9): which of these addresses the never-again list holds, each lower-cased and trimmed as it is
-- stored (00125), by its own email row or by a domain row for the part after its last "@". The finder asks it for a
-- page of addresses at once, the send door's facts and the audience ask it for one.
create or replace function public.lead_addresses_suppressed(p_tenant_id uuid, p_addresses text[])
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  with asked as (
    select distinct lower(btrim(a)) as address
      from unnest(coalesce(p_addresses, '{}'::text[])) as a
     where nullif(btrim(a), '') is not null
  )
  select q.address from asked q
   where exists (
     select 1 from public.lead_suppressions s
      where s.tenant_id = p_tenant_id
        and ((s.kind = 'email' and s.hash = public.lead_suppression_hash(p_tenant_id, q.address))
          or (s.kind = 'domain' and position('@' in q.address) > 0 and split_part(q.address, '@', -1) <> ''
              and s.hash = public.lead_suppression_hash(p_tenant_id, split_part(q.address, '@', -1)))))
$$;
revoke execute on function public.lead_addresses_suppressed(uuid, text[]) from public, anon, authenticated;
grant execute on function public.lead_addresses_suppressed(uuid, text[]) to service_role;
comment on function public.lead_addresses_suppressed(uuid, text[]) is
  'The never-again list for addresses (Reach out Part 5, G9): each asked address, lower-cased and trimmed, that an email row holds, or whose domain (after its last "@") a domain row holds. The one predicate the send door''s facts, the audience and the finder ask. Service role only.';

create or replace function public.lead_address_suppressed(p_tenant_id uuid, p_address text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.lead_addresses_suppressed(p_tenant_id, array[p_address]))
$$;
revoke execute on function public.lead_address_suppressed(uuid, text) from public, anon, authenticated;
grant execute on function public.lead_address_suppressed(uuid, text) to service_role;
comment on function public.lead_address_suppressed(uuid, text) is
  'Whether one address is on the never-again list: lead_addresses_suppressed for one, so the rule is written once. Service role only.';

-- 00211's lead facts, unchanged but for suppressed, which is now the one predicate above.
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
    'suppressed', public.lead_address_suppressed(p_tenant_id, p_to),
    'wrote_back', exists (select 1 from public.outreach_wrote_back(p_tenant_id, array[p_contact_id]))
  )
$$;
revoke execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.outreach_lead_facts(uuid, uuid, text, uuid) to service_role;

-- 00197's audience, unchanged but for the address's arm of the never-again test, which is now the one predicate above.
-- The place and the number keep their own arms.
create or replace function public.reach_out_audience(
  p_tenant_id uuid,
  p_search_id uuid,
  p_limit int,
  p_include_unconfirmed boolean default false
)
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
     -- A checked address; a catch-all one (unconfirmed) only when the chain's owner includes them.
     and (l.email_state = 'ok' or (l.email_state = 'catch_all' and coalesce(p_include_unconfirmed, false)))
     and nullif(btrim(l.email), '') is not null
     -- Never a customer's: nobody in People shares the address (as theirs now, or as one they wrote from) or the number,
     -- and the finder saw no share.
     and coalesce(jsonb_array_length(sm.judgment->'shares'), 0) = 0
     and not exists (select 1 from public.contacts c where c.tenant_id = l.tenant_id and c.erased_at is null
                       and (c.email = lower(btrim(l.email)) or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
     and not exists (select 1 from public.contact_identities i
                       join public.contacts c on c.id = i.contact_id and c.erased_at is null
                      where i.tenant_id = l.tenant_id and i.channel = 'email' and i.external_id = lower(btrim(l.email)))
     -- Never the never-again list: the address (an opt-out, a customer, an erasure, a no, or its business's domain:
     -- the one predicate), and the place or the number (a customer's or an erased person's, 00140: a number carries no
     -- opt-out of its own), so a business erased or already a customer is not found again under a new address.
     and not public.lead_address_suppressed(l.tenant_id, lower(btrim(l.email)))
     and not exists (select 1 from public.lead_suppressions x where x.tenant_id = l.tenant_id and (
                       (x.kind = 'place' and l.place_id is not null
                        and x.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))
                    or (x.kind = 'phone' and l.phone_e164 is not null
                        and x.hash = public.lead_suppression_hash(l.tenant_id, l.phone_e164))))
     -- Never twice by the workspace: no chain of it has a send for this lead, bar one in a run its owner skipped.
     and not exists (select 1 from public.reach_out_sends ro
                      where ro.tenant_id = l.tenant_id and ro.lead_id = l.id
                        and not (ro.state = 'skipped' and ro.reason = 'run_canceled'))
   -- The finder's fit, strongest first (the text sorts long, look, strong), then the longest found.
   order by case sm.fit when 'strong' then 0 when 'look' then 1 when 'long' then 2 else 3 end, l.found_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_audience(uuid, uuid, int, boolean) from public, anon, authenticated;
grant execute on function public.reach_out_audience(uuid, uuid, int, boolean) to service_role;

/* ------------------------------------------------------------ 2. consent: a reply's two sources -- */

-- 00177's door, with a reply's no and its one way back. Who calls each source:
--   unsubscribe   the public unsubscribe page (dashboard server/public/unsubscribe.ts), a press of the link;
--   complaint     the email receipt's spam report (db recordEmailNo, on the edge);
--   reply         a reply read as no (the reading's door, reach_out_reply_apply, 00218);
--   reply_undone  a member's "read as no · undo" (reach_out_reply_undo, 00218), back to exactly the answer the no found,
--                 which its event keeps as `previous`: an undo never gives a yes the person did not.
-- A reply's no is the only one that can be taken back, and only while it is what holds the no: an unsubscribe or a
-- complaint after it makes the no theirs (the source moves on), and then the undo is refused.
create or replace function public.set_email_marketing(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_state text,
  p_source text,
  p_message_id uuid default null,
  p_evidence jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business text;
  v_contact  public.contacts%rowtype;
  v_changed  boolean := false;
  v_sent_to  text;
  v_address  text;
  v_lead     record;
  v_previous text;
begin
  -- The noes a door can be trusted with: an unsubscribe link pressed, a complaint the mail provider reported (00177),
  -- and a reply read as no (00217). And one way back, a reply's no undone, to the answer it found.
  if p_source = 'reply_undone' then
    if p_state is null or p_state not in ('unknown', 'opted_in') then
      raise exception 'set_email_marketing takes a reply''s no back to unknown or opted_in' using errcode = '22023';
    end if;
  elsif p_state is distinct from 'opted_out' or p_source is null or p_source not in ('unsubscribe', 'complaint', 'reply') then
    raise exception 'set_email_marketing records a no: opted_out, from unsubscribe, complaint or reply' using errcode = '22023';
  end if;
  select t.name into v_business from public.tenants t where t.id = p_tenant_id;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  -- A person who is gone, or asked to be forgotten, receives nothing already: nothing is written about them.
  if not found then
    return jsonb_build_object('changed', false, 'found', false, 'business', v_business);
  end if;
  if v_contact.erased_at is not null then
    return jsonb_build_object('changed', false, 'found', true, 'business', v_business);
  end if;

  -- A reply's no taken back: the answer only, and only while a reply's no is what holds it. Whether another reply's
  -- no of theirs still stands, the suppressions and the leads are the undo door's, which holds the readings (00218).
  if p_source = 'reply_undone' then
    if v_contact.email_marketing is distinct from 'opted_out' or v_contact.email_marketing_source is distinct from 'reply' then
      return jsonb_build_object('changed', false, 'found', true, 'business', v_business, 'refused', 'moved');
    end if;
    -- Back to exactly the answer the no found (its event's `previous`), never to one the person did not give.
    select coalesce(e.data->>'previous', 'unknown') into v_previous
      from public.events e
     where e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed' and e.subject_id = p_contact_id
       and e.data->>'purpose' = 'email_marketing' and e.data->>'source' = 'reply' and e.data->>'consent' = 'opted_out'
     order by e.created_at desc
     limit 1;
    v_previous := coalesce(v_previous, 'unknown');
    if p_state is distinct from v_previous then
      return jsonb_build_object('changed', false, 'found', true, 'business', v_business, 'refused', 'not_previous',
                                'previous', v_previous);
    end if;
    update public.contacts
       set email_marketing = p_state, email_marketing_source = p_source, email_marketing_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            coalesce(p_evidence, '{}'::jsonb)
            || jsonb_build_object('purpose', 'email_marketing', 'consent', p_state, 'source', p_source)
            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);
    return jsonb_build_object('changed', true, 'found', true, 'business', v_business);
  end if;

  -- The no is recorded once. A reply's no that an unsubscribe or a complaint follows becomes theirs: the source moves,
  -- so nothing can take it back (the undo asks for source 'reply').
  if v_contact.email_marketing is distinct from 'opted_out'
     or (v_contact.email_marketing_source = 'reply' and p_source in ('unsubscribe', 'complaint')) then
    update public.contacts
       set email_marketing = 'opted_out', email_marketing_source = p_source, email_marketing_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    -- The door's own facts are written last, so no evidence handed in can say another purpose or answer.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            coalesce(p_evidence, '{}'::jsonb)
            || jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_out', 'source', p_source)
            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end
            -- A reply's no keeps the answer it found, the one its undo may go back to.
            || case when p_source = 'reply' then jsonb_build_object('previous', v_contact.email_marketing) else '{}'::jsonb end);
    v_changed := true;
  end if;

  -- The address the email itself went to, read off its frozen request (channels buildEmailRequest), when that
  -- email is this person's: an address changed between the send and the press is still the one that said stop.
  if p_message_id is not null then
    select lower(btrim(coalesce(m.meta->'email'->'request'->'to'->>0, m.meta->'email'->>'to'))) into v_sent_to
      from public.messages m
     where m.id = p_message_id and m.tenant_id = p_tenant_id and m.contact_id = p_contact_id
       and m.channel = 'email' and m.direction = 'outbound';
  end if;

  -- The never-again list, by each address as it is stored (lower-cased, 00125): the finder drops a suppressed
  -- address from every lead it finds later (core leads runner), and the audience (Part 3) skips it.
  for v_address in
    select distinct a from unnest(array[v_contact.email, v_sent_to]) as a where coalesce(a, '') <> ''
  loop
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_address),
            case when p_source = 'reply' then 'said_no' else 'email_opt_out' end)
    on conflict (tenant_id, kind, hash) do nothing;
  end loop;

  -- The leads still being written to are closed as said no, each with its event. No lead_operations row: the
  -- person's own stop is not the owner's to undo, and the version moves, so an undo of an older step is refused.
  for v_lead in
    update public.leads
       set stage = 'archived', closed_reason = 'said_no', version = version + 1
     where tenant_id = p_tenant_id and contact_id = p_contact_id
       and stage in ('ready', 'nurture') and erased_at is null and blanked_at is null
    returning id
  loop
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
            jsonb_build_object('stage', 'archived', 'reason', 'said_no', 'by', null, 'source', p_source));
  end loop;

  return jsonb_build_object('changed', v_changed, 'found', true, 'business', v_business);
end $$;

revoke execute on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) to service_role;
comment on function public.set_email_marketing(uuid, uuid, text, text, uuid, jsonb) is
  'The door a no from email goes through: an unsubscribe pressed, a complaint the provider reported (00177), or a reply read as no (00217). Records opted_out once (an unsubscribe or a complaint after a reply''s no makes it theirs), puts the address and the one the email went to on the never-again list, closes the leads still being written to as said no. A reply''s no records the answer it found (previous). With source reply_undone it takes a reply''s no back to exactly that answer, the answer only: refused moved once anything but a reply''s no holds it, refused not_previous for any other answer. Service role only.';

/* ------------------------------------------------------------ 3. D18: a reply's no counts -- */

-- 00188's counts, unchanged but for `unsubscribed`: a reply read as no names the email it answers the way an
-- unsubscribe names the email it was pressed in (set_email_marketing's event), and counts beside it, unless a
-- reply_undone naming the same email for the same person came after it (the reading was a mistake, reach_out_reply_undo).
create or replace function public.sending_domain_counts(p_tenant_id uuid, p_host text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ours as (
    select m.id, m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = lower(p_host)
       and m.created_at >= now() - interval '90 days'
  ), recent as (
    select o.id, o.status, o.error from ours o
     where o.created_at >= coalesce(p_since, '-infinity'::timestamptz)
       and public.email_left(o.status, o.error)
     order by o.created_at desc
     limit 500
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    -- A permanent bounce only: a full mailbox or a greylisting server says nothing about the domain that wrote.
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
                  and lower(coalesce(error->>'kind', '')) = 'permanent'),
    'complained', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)),
    'complained_new', (
      select count(*) from ours
       where (meta->'email'->>'complained_at')::timestamptz >= coalesce(p_since, '-infinity'::timestamptz)
         and created_at >= coalesce(p_since, '-infinity'::timestamptz)),
    -- An unsubscribe comes after its email left, so after the count began: read from then (the index on the
    -- workspace's events by kind and time), never before the ninety days the emails are read over.
    -- A person counts once, however many of the window's emails their noes name (a reply's no and then an
    -- unsubscribe are two events).
    'unsubscribed', (
      select count(distinct e.subject_id) from recent r
        join public.events e
          on e.tenant_id = p_tenant_id and e.kind = 'contact.consent_changed'
         and e.created_at >= greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '90 days')
         and e.data->>'purpose' = 'email_marketing' and e.data->>'source' in ('unsubscribe', 'reply')
         and e.data->>'message_id' = r.id::text
         and not (e.data->>'source' = 'reply' and exists (
           select 1 from public.events u
            where u.tenant_id = p_tenant_id and u.kind = 'contact.consent_changed'
              and u.created_at >= e.created_at and u.subject_id = e.subject_id
              and u.data->>'purpose' = 'email_marketing' and u.data->>'source' = 'reply_undone'
              and u.data->>'message_id' = e.data->>'message_id'))))
$$;
revoke execute on function public.sending_domain_counts(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_counts(uuid, text, timestamptz) to service_role;

/* ------------------------------------------------------------ 4. the day they named -- */

alter table public.leads add column if not exists resume_at timestamptz;
comment on column public.leads.resume_at is
  'The day a reply said to write again (a "not now") or that they are back (an "away" in their own words), at 9:00 in the business''s zone (Reach out Part 5, G12). Written by the reading''s door; the undo of a no never touches it. The chain is stopped by the reply itself (outreach_wrote_back), so nothing sends by it: Leads says it, and a dated step on Today is due that day.';

/* ------------------------------------------------------------ 5. the dated-step door -- */

alter table public.person_notes drop constraint if exists person_notes_source_check;
alter table public.person_notes add constraint person_notes_source_check
  check (source in ('page', 'bulk', 'moved', 'call', 'thread', 'reach_out'));

-- A reach-out's step is made once per what made it (a reply, a lead's hand step).
create unique index if not exists person_notes_reach_out_once
  on public.person_notes (contact_id, source_id) where source = 'reach_out';

create or replace function public.person_step_from_playbook(
  p_tenant_id   uuid,
  p_contact_id  uuid,
  p_due_on      date,
  p_words       text,
  p_for_user_id uuid default null,
  p_source_id   uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
-- A step the product makes for the team (Reach out, Part 5, G11): the words at most 600 characters, a day, for anyone
-- or for one member of the workspace. Once per source, which is required: a second call answers {error: 'already'} and
-- writes nothing.
-- The person must be this workspace's, not erased or merged. The event and the ring are person_note_add's (00166).
declare
  v_body text := nullif(btrim(coalesce(p_words, '')), '');
  v_row  public.person_notes%rowtype;
begin
  if v_body is null then
    return jsonb_build_object('error', 'empty');
  end if;
  if char_length(v_body) > 600 then
    return jsonb_build_object('error', 'too_long');
  end if;
  if p_due_on is null then
    return jsonb_build_object('error', 'no_day');
  end if;
  if p_source_id is null then
    return jsonb_build_object('error', 'no_source');
  end if;
  if not exists (
    select 1 from contacts c
     where c.id = p_contact_id and c.tenant_id = p_tenant_id
       and c.erased_at is null and c.merged_into_contact_id is null
  ) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_for_user_id is not null and not exists (
    select 1 from memberships m where m.tenant_id = p_tenant_id and m.user_id = p_for_user_id
  ) then
    return jsonb_build_object('error', 'not_a_member');
  end if;
  insert into person_notes (tenant_id, contact_id, body, author_kind, state, for_user_id, team_only, source, source_id,
                            due_on)
  values (p_tenant_id, p_contact_id, v_body, 'receptionist', 'kept', p_for_user_id, true, 'reach_out', p_source_id,
          p_due_on)
  on conflict (contact_id, source_id) where source = 'reach_out' do nothing
  returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('error', 'already');
  end if;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.noted', 'contact', 'contact', p_contact_id,
          jsonb_build_object('note_id', v_row.id, 'chars', char_length(v_body), 'by', null,
                             'for', p_for_user_id, 'team_only', v_row.team_only, 'source', 'reach_out',
                             'due_on', v_row.due_on, 'deal_id', v_row.deal_id));
  perform public.note_for_you_notify(p_tenant_id, p_contact_id, v_row.id, null, p_for_user_id);
  return jsonb_build_object('note', to_jsonb(v_row));
end $$;
revoke execute on function public.person_step_from_playbook(uuid, uuid, date, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.person_step_from_playbook(uuid, uuid, date, text, uuid, uuid) to service_role;
comment on function public.person_step_from_playbook(uuid, uuid, date, text, uuid, uuid) is
  'A dated step the product makes for the team on a person (Reach out Part 5, G11): kept, the team''s only, by the receptionist, source reach_out, once per source_id. Writes contact.noted (by null) and rings the member it is for. Answers {note} or {error: empty | too_long | no_day | no_source | not_found | not_a_member | already}. Service role only.';

/* ------------------------------------------------------------ 6. the converter -- */

-- A lead's conversion, written once for the doors that convert (G19; 00184's lead_link_contact trigger still converts
-- on its own, which is owed): converted, no closed reason, converted and contacted from now unless
-- they were already, its version moved, and lead.converted saying how, with what the caller adds. A lead still being
-- written to (ready or nurture) converts; with p_any_stage, any lead does, whatever its stage: the member's Interested
-- converts a lead closed, or one a click already marked Talking, into its person, as 00142 did. Only definer doors call
-- it: a reading (reply), a booking, a deal, and the member's door (call). Answers {moved, version}.
create or replace function public.lead_convert_by(
  p_tenant_id uuid,
  p_lead_id   uuid,
  p_how       text,
  p_data      jsonb default null,
  p_any_stage boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  if p_how is null or p_how not in ('call', 'reply', 'booking', 'deal') then
    raise exception 'how must be call, reply, booking or deal' using errcode = '22023';
  end if;
  update public.leads l
     set stage        = 'converted',
         closed_reason = null,
         converted_at = coalesce(l.converted_at, now()),
         contacted_at = coalesce(l.contacted_at, now()),
         version      = l.version + 1
   where l.id = p_lead_id and l.tenant_id = p_tenant_id
     and l.erased_at is null and l.blanked_at is null
     and (l.stage in ('ready', 'nurture') or coalesce(p_any_stage, false))
  returning * into v_lead;
  if not found then
    return jsonb_build_object('moved', false, 'version',
      (select l.version from public.leads l where l.id = p_lead_id and l.tenant_id = p_tenant_id));
  end if;
  -- The door's own fact is written last, so no data handed in can say another way.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,
          coalesce(p_data, '{}'::jsonb) || jsonb_build_object('how', p_how));
  return jsonb_build_object('moved', true, 'version', v_lead.version);
end $$;
revoke execute on function public.lead_convert_by(uuid, uuid, text, jsonb, boolean) from public, anon, authenticated, service_role;
comment on function public.lead_convert_by(uuid, uuid, text, jsonb, boolean) is
  'A lead''s conversion, written once for the doors that convert (Reach out Part 5, G19; lead_link_contact still converts on its own): a ready or nurture lead (any, with p_any_stage) becomes converted, closed_reason null, converted_at and contacted_at kept or now, version + 1, with lead.converted {how} and what the caller adds. how is call, reply, booking or deal. Answers {moved, version}. Called only by definer doors; nobody holds EXECUTE.';

-- 00142's door, unchanged but for Interested: the one update no longer converts the lead (its stage, closed reason,
-- converted_at and contacted_at, and its version) and the door converts it through lead_convert_by, how 'call', any
-- stage, in place of its own lead.converted. The version still moves once, and the operation records where it ends.
create or replace function public.lead_set_stage(
  p_lead_id    uuid,
  p_stage      text default null,   -- ready | nurture | converted | archived, or null to keep it (wrong_number)
  p_reason     text default null,   -- said_no | not_a_fit | customer when archived
  p_fit_reason text default null,   -- chain | wrong_kind | too_far | customer | other (Not a fit's why)
  p_outcome    text default null,   -- a call's outcome, or 'emailed'
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_made     jsonb;
  v_existed  boolean := false;
  v_convert  boolean := coalesce(p_outcome = 'interested', false);   -- the one act that makes a person (§9.6)
  v_stage    text;
  v_hash     text;
  v_supp     boolean := false;
  v_op       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  -- A stranger learns nothing: not a member reads as not found (00027's rule).
  -- Viewers read only, so they are strangers to this door too.
  if not found or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed') then
    raise exception 'reason must be one of the closed reasons' using errcode = '22023';
  end if;
  if p_fit_reason is not null and p_fit_reason not in ('chain', 'wrong_kind', 'too_far', 'customer', 'other') then
    raise exception 'fit_reason must be chain, wrong_kind, too_far, customer or other' using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in ('interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number', 'emailed') then
    raise exception 'outcome must be one of the six, or emailed' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                                 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);
  v_stage  := case when v_convert then 'converted' else p_stage end;

  if v_convert then
    -- A real conversation. The person whose number this is, else the person
    -- whose address it is, else a new one named for the business.
    if v_lead.contact_id is not null then
      v_contact := v_lead.contact_id;
      v_existed := true;
    elsif v_lead.phone_e164 ~ '^\+[1-9][0-9]{7,14}$' then
      -- create_person is get-or-create by number (00053), so the workspace
      -- never gets a second person for a number it already has (25), and its
      -- contact.added event with source 'lead' is what People reads back as
      -- "A lead you found" (00138).
      v_made    := public.create_person(v_lead.tenant_id, v_lead.phone_e164, left(nullif(v_lead.business_name, ''), 80), 'lead');
      v_contact := (v_made->>'contact_id')::uuid;
      v_existed := coalesce((v_made->>'existed')::boolean, false);
      -- 00125's door adds the address to a person created by phone, but only
      -- when they have none and nobody else here holds it: a unique violation
      -- inside this door would lose the whole act.
      if v_lead.email is not null
         and not exists (select 1 from public.contacts c where c.id = v_contact and c.email is not null)
         and not exists (select 1 from public.contacts c where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(v_lead.email))) then
        perform public.set_person_email(v_contact, v_lead.email);
      end if;
    else
      -- A lead with no number converts the way an email-only person arrives:
      -- the address is the identity, and the same contact.added event says
      -- where they came from.
      select c.id into v_contact from public.contacts c
       where c.tenant_id = v_lead.tenant_id and c.email = lower(btrim(coalesce(v_lead.email, '')))
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      v_existed := v_contact is not null;
      if v_contact is null then
        insert into public.contacts (tenant_id, display_name, email)
        values (v_lead.tenant_id, left(nullif(v_lead.business_name, ''), 80), nullif(lower(btrim(coalesce(v_lead.email, ''))), ''))
        returning id into v_contact;
        insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
        values (v_lead.tenant_id, 'contact.added', 'contact', 'contact', v_contact,
                jsonb_build_object('source', 'lead', 'title', null, 'by', v_user));
      end if;
    end if;
  end if;

  -- One statement, so the version moves exactly once however the lead was
  -- worked, and a stage that was not named is kept (wrong_number). A conversion
  -- is lead_convert_by's (its stage, closed reason, days and version), below.
  update public.leads
     set stage         = case when v_convert then stage else coalesce(v_stage, stage) end,
         closed_reason = case when v_convert then closed_reason
                              when v_stage = 'archived' then p_reason
                              when v_stage is not null then null
                              else closed_reason end,
         phone_wrong   = (phone_wrong or coalesce(p_outcome, '') = 'wrong_number'),
         contact_id    = coalesce(v_contact, contact_id),
         contacted_at  = case when not v_convert and coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,
         last_outcome  = coalesce(p_outcome, last_outcome),
         last_note     = case when p_outcome is not null then p_note else last_note end,
         version       = case when v_convert then version else version + 1 end
   where id = p_lead_id
  returning * into v_lead;

  if v_convert then
    -- Erased or blanked since it was read above: nothing converts, and the door says so rather than claim it.
    if not coalesce((public.lead_convert_by(v_lead.tenant_id, p_lead_id, 'call',
                       jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'by', v_user), true)->>'moved')::boolean, false) then
      raise exception 'This lead is gone.' using errcode = 'P0002';
    end if;
    select * into v_lead from public.leads where id = p_lead_id;
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id,
            jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', v_user));
  elsif p_outcome = 'emailed' then
    -- S12: what is recorded is that the OWNER said they sent it.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('by', v_user));
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id,
            jsonb_build_object('why', p_fit_reason, 'by', v_user));
    -- "Already a customer" hides the place from every future search (§0.4,
    -- S8). The hash is A's keyed digest, so the collect's suppression read
    -- refuses the place byte for byte.
    if p_reason = 'customer' and v_lead.place_id is not null then
      v_hash := public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id);
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (v_lead.tenant_id, 'place', v_hash, 'customer')
      on conflict (tenant_id, kind, hash) do nothing;
      v_supp := found;
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id,
            jsonb_build_object('stage', v_stage, 'reason', p_reason, 'by', v_user));
  end if;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (v_lead.tenant_id, 'stage', null, array[p_lead_id], v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                             'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id,
                             'converted', v_convert, 'suppressed', v_supp, 'place_hash', v_hash),
          v_lead.version, v_user)
  returning id into v_op;

  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                            'contact_id', v_lead.contact_id, 'existed', v_existed, 'converted', v_convert,
                            'op_id', v_op, 'version', v_lead.version);
end $$;
revoke execute on function public.lead_set_stage(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.lead_set_stage(uuid, text, text, text, text, text) to authenticated;
