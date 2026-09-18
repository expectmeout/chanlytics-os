-- 00136 · A person says where they came from.
--
-- People's table gains a "Came from" column (docs/plans/2026-09-18-people-table.md),
-- and the answer is decided here, once, for every reader of people_list: the
-- page, the profile, Ask and the playbooks read the same thing.
--
--   * A contact.added event wins. The doors that add a person by hand or from
--     the calendar write one (create_person, 00053; the calendar sweep,
--     apps/edge/lib/calendar-people.ts); a message or a call that makes a
--     person writes none. Source 'calendar' is calendar, 'lead' is lead, and
--     any other -- 'manual', or whatever POST contacts was given -- is manual.
--     The event is the record: purge_events never touches it (00038), and an
--     erasure keeps its source (00131).
--   * Else an imported history is import: what we hold of them began before
--     Chanlytics did, so their first word is not ours to name.
--   * Else their first spoken event: a connected call is call; a message is the
--     wire it travelled, whatsapp, sms or email. Spoken is the ev CTE's rule: a
--     queued, canceled or failed send is nobody's first word.
--   * Else null: there is nothing to say yet.
--
-- The body is 00127's. The change: the `added` CTE (one index range per events
-- partition for the whole call, never one per person), one aggregate in `ma`,
-- the column, and the order's last key. `c.id` makes the order whole: people
-- alike in everything it reads -- a calendar sweep adds several in one
-- statement, with one created_at and no contact yet -- come back in one order,
-- so a page of them never repeats a person or skips one.
--
-- Dropped and recreated because a returned column cannot be added in place.
-- The signature is the same, so every caller keeps calling it as it does; the
-- guard, the grants and the comment are restated.
drop function if exists public.people_list(uuid, uuid, text, integer, integer);

create function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  email                   text,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
  channels                text[],
  conversation_count      integer,
  escalation_count        integer,
  needs_human             boolean,
  open_escalation_reason  text,
  open_escalation_since   timestamptz,
  latest_conversation_id  uuid,
  latest_state            text,
  latest_paused_until     timestamptz,
  latest_assignee_user_id uuid,
  latest_snooze_until     timestamptz,
  latest_wa_inbound_at    timestamptz,
  last_message_at         timestamptz,
  last_message_direction  text,
  last_message_sender     text,
  last_inbound_text       text,
  last_inbound_at         timestamptz,
  last_call_at            timestamptz,
  last_inbound_call_at    timestamptz,
  last_inbound_call_summary text,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  message_channels        text[],
  queued_reply_at         timestamptz,
  came_from               text
)
language sql
stable
set search_path = public
as $$
  with ev as (
    select m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           case when coalesce(m.meta->>'backfill', 'false') = 'true'
                then m.channel_ts
                else coalesce(m.channel_ts, m.created_at) end as at,
           coalesce(m.meta->>'backfill', 'false') = 'true' as backfill,
           -- Something the customer actually saw or said. A reply still in its
           -- cancel window, a canceled or failed send, an internal note and a
           -- call's own summary row are not "the last word" in the thread.
           m.type in ('text', 'template', 'media')
             and m.status not in ('queued', 'canceled', 'failed') as spoken
      from messages m
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  ),
  -- How they were added, when a door added them: the first contact.added event
  -- for each person, should a door ever write two.
  added as (
    select distinct on (e.subject_id)
           e.subject_id,
           coalesce(e.data->>'source', 'manual') as source
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.added'
       and e.subject_type = 'contact'
       and (p_contact_id is null or e.subject_id = p_contact_id)
     order by e.subject_id, e.created_at
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at,
    lk.last_at,
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how they were added, else an import, else their
    -- first spoken event.
    case
      when ad.source = 'calendar' then 'calendar'
      when ad.source = 'lead' then 'lead'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then 'import'
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end
  from contacts c
  left join added ad on ad.subject_id = c.id
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    select e.at, e.direction, e.sender
      from ev e
     where e.contact_id = c.id and e.at is not null and e.spoken
     order by e.at desc
     limit 1
  ) lm on true
  left join lateral (
    select e.at, e.body
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.spoken and e.body is not null
     order by e.at desc
     limit 1
  ) li on true
  left join lateral (
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  where c.tenant_id = p_tenant_id
    and c.erased_at is null
    and c.merged_into_contact_id is null
    and (p_contact_id is null or c.id = p_contact_id)
    -- The search: a name, their name on WhatsApp, their email address, or
    -- three digits of the number, the way the page's own box matches.
    -- Nothing else is indexed here; the page still narrows by state and
    -- list over what it holds.
    and (
      nullif(trim(p_query), '') is null
      or c.display_name ilike '%' || trim(p_query) || '%'
      or c.wa_profile_name ilike '%' || trim(p_query) || '%'
      or c.email ilike '%' || trim(p_query) || '%'
      or (length(regexp_replace(p_query, '\D', '', 'g')) >= 3
          and regexp_replace(coalesce(c.phone_e164, ''), '\D', '', 'g') like '%' || regexp_replace(p_query, '\D', '', 'g') || '%')
    )
  order by greatest(lm.at, lk.last_at) desc nulls last, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.people_list(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, manual), an imported history (import), else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one whole order: latest contact first, then the newest added, then the id.';
