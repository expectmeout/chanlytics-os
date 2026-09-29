-- 00268 · People are paged by their kept moments.
--
-- Decision 0021, step 2 (docs/decisions/0021-people-are-paged-by-a-moment-the-database-keeps.md). people_list ordered
-- everyone by the later of their last spoken word and their last connected call, two of its eleven reads, so to answer
-- any page it read every live person's rows, sorted them all and kept a thousand: every page cost the whole workspace,
-- and reading everyone cost its pages times it. The moments are kept now (00259), so the page is chosen first: its
-- people come from person_moments by person_moments_order, after an offset or a cursor, and the eleven reads run for
-- them alone.
--
--   the order     in_touch_at (the later of the two; -infinity for someone never in touch, where `nulls last` put
--                 them), then added_at (when they were added), then the id, all falling. The id rose until now, so two
--                 people alike in both come back the other way round; the order is still whole.
--   the cursor    p_after_at, p_after_added, p_after_id: the last row's in_touch_at, added_at and id, which every row
--                 now carries. The next page starts just past it, in one row comparison the index walks, so someone who
--                 writes between two pages is never read twice in one pass; they are read on the next.
--   the offset    still answered, and the page's people still come from the index: a caller from before this pages as
--                 it did. Every argument keeps its name and default, so the older form is dropped rather than kept
--                 beside this one (00137), and a call that names fewer arguments resolves here.
--   the messages  read through message_moment (00259), the rule's one statement, which the kept moments read too.
--
-- Modelled on the local replay (Postgres 17) with 0021's model: a workspace of 10,050 people beside ten of 1,000,
-- eight messages each, the two read in turn five times. The first page took 853 ms as 00250 reads it (the median) and
-- 151 ms here; every page, eleven calls, 9.7 s and 1.65 s. Every row and column is the same, and each row's kept moment
-- is the one its columns show. Written out again in place of message_moment the messages cost 60 ms a page less, and
-- would be the rule's second statement.
--
-- The kept moments must be whole first: a live person with no row would not be on any page. The fill
-- (tooling/scripts/ops/person-moments-fill.mjs) makes every person's row, and person_moments_check says who is whole;
-- this file refuses to apply while any live person has none. Only the function changes: nothing is dropped but its
-- older form, and the grants and the comment are restated for the new one.

do $$
declare
  v_missing bigint;
begin
  select count(*) into v_missing
    from public.contacts c
   where c.erased_at is null
     and c.merged_into_contact_id is null
     and not exists (select 1 from public.person_moments pm where pm.contact_id = c.id);
  if v_missing > 0 then
    raise exception '% live people have no kept moments: run tooling/scripts/ops/person-moments-fill.mjs --apply, and person_moments_check, before this file', v_missing
      using errcode = '55000';
  end if;
end $$;

drop function if exists public.people_list(uuid, uuid, text, integer, integer);

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0,
                                              p_after_at timestamptz default null, p_after_added timestamptz default null, p_after_id uuid default null)
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
  came_from               text,
  -- The newest open or current deal (proposed or won), else the newest of any (0004).
  deal_id                 uuid,
  deal_stage              text,
  deal_service            text,
  deal_proposed_at        timestamptz,
  deal_decided_at         timestamptz,
  deal_ended_at           timestamptz,
  deal_amount_cents       integer,
  deal_per                text,
  -- Its link, the last day it stands, and why they passed (0008).
  deal_proposal_url       text,
  deal_valid_until        date,
  deal_lost_reason        text,
  -- The earliest open step on them (0007, amended): by its day, then as it was written.
  step_id                 uuid,
  step_body               text,
  step_due_on             date,
  step_for_user_id        uuid,
  step_deal_id            uuid,
  -- The row's place in the order (0021): when they were last in touch (-infinity for never), and when they were added.
  -- A caller pages on by passing the last row's two and its id as p_after_at, p_after_added and p_after_id.
  in_touch_at             timestamptz,
  added_at                timestamptz
)
language sql
stable
set search_path = public
as $$
  -- The page first (0021): its people, in the kept order, after the cursor or the offset, and nobody else. Every read
  -- below is for them alone.
  with page as (
    select c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
           c.consent, c.consent_source, c.consent_updated_at, c.dnc,
           c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
           pm.in_touch_at, pm.added_at
      from person_moments pm
      join contacts c on c.id = pm.contact_id
     where pm.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.erased_at is null
       and c.merged_into_contact_id is null
       and (p_contact_id is null or pm.contact_id = p_contact_id)
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
       -- After the cursor: just past the last row the caller holds. Without one, a place past every row, so the
       -- comparison is always the index's own condition: written `p_after_id is null or ...`, a function planned
       -- without its arguments' values would filter the whole workspace's order to reach a later page.
       and (pm.in_touch_at, pm.added_at, pm.contact_id)
           < (coalesce(p_after_at, 'infinity'), coalesce(p_after_added, 'infinity'),
              coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'))
     order by pm.in_touch_at desc, pm.added_at desc, pm.contact_id desc
     limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
     offset greatest(coalesce(p_offset, 0), 0)
  ),
  ev as not materialized (
    select m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           e.at, e.moved_in as backfill, e.spoken
      from messages m
      -- When it happened, whether the customer saw or said it, and whether it came with a history moved in: the one
      -- statement of the three (00259), which the kept moments read too.
      cross join lateral message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
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
    -- Where they came from: how they were added, else how a history moved in
    -- began, else their first spoken event.
    case
      when ad.source = 'calendar' then 'calendar'
      when ad.source = 'lead' then 'lead'
      when ad.source = 'import' then 'import'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at
  from page c
  left join lateral (
    -- How they were added, when a door added them: their first contact.added
    -- event, should a door ever write two.
    select coalesce(e.data->>'source', 'manual') as source
      from events e
     where e.tenant_id = p_tenant_id
       and e.subject_type = 'contact'
       and e.subject_id = c.id
       and e.kind = 'contact.added'
     order by e.created_at
     limit 1
  ) ad on true
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
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel,
           -- The first row of a history moved in, in the order it was written: a call's note is a call, anything else its wire.
           (array_agg(case when e.type = 'call_summary' then 'call' else e.channel end order by e.created_at)
              filter (where e.backfill))[1] as backfill_first
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
  left join lateral (
    -- The one deal the row shows: open or current first, then the newest.
    -- pickCurrentDeal in contracts orders a person's list the same way.
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per,
           d.proposal_url, d.valid_until, d.lost_reason
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  left join lateral (
    -- Their next step: the earliest open one, by its day, then the one written first. A step is a note with a day,
    -- for the team only, so the receptionist never reads it; the list carries it for the Pipeline and Today.
    select n.id, n.body, n.due_on, n.for_user_id, n.deal_id
      from person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id = c.id
       and n.due_on is not null
       and n.done_at is null
     order by n.due_on, n.created_at, n.id
     limit 1
  ) st on true
  order by c.in_touch_at desc, c.added_at desc, c.id desc
$$;

revoke execute on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, import, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number. The page is chosen before it is read (0021): its people come from person_moments in one whole order, latest contact first (in_touch_at, -infinity for never), then the newest added (added_at), then the id, falling, at most p_limit (1000) of them after p_offset or after the cursor p_after_at, p_after_added, p_after_id (the last row''s in_touch_at, added_at and id); every other column is read for them alone. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008). The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written.';
