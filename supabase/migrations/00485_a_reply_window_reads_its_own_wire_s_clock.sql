-- 00485 · A reply window reads its own wire's clock (decision 0001, step 5).
--
-- The readers of conversations.last_wa_inbound_at move to the per-channel fact 00484 keeps, through one accessor:
--
--   last_inbound_on_whatsapp(conversations)   When the thread's person last wrote on WhatsApp, read from
--                                             conversation_channel_state. A computed column: PostgREST serves it
--                                             with a thread, so the dashboard's reads name it where they named the
--                                             column (aliased to the field their pages read), and a page still
--                                             hears the thread's own changes, which every message makes.
--   people_list                               A person's latest thread's WhatsApp clock is read through it.
--
-- replyWindow keeps its signature: only the value handed to its second argument comes from here now. The column goes on
-- being written by ingest_inbound and merge_people exactly as before, and nothing else reads it
-- (inbound/a-reply-window-reads-its-own-wire.db.test.mjs holds that, for the fourteen days before step 7 drops it).
-- Either deploy order works: an older dashboard reads the column, which keeps its writers; this one reads the row,
-- which 00484 backfilled and both writers keep.
--
-- people_list is copied from its latest migration (00464) with the one read changed, its lateral naming the clock
-- `wa_heard_at` so no text of it names the column; nothing else changes. `create or replace` keeps its grants, which
-- are restated. Re-runnable throughout.

set local lock_timeout = '3s';

-- Its one argument is the thread's row, unnamed, as a computed column's is: that is how the typed client knows it for a
-- column of conversations (supabase-js reads a function whose one argument is a table's Row, by no name, as one). A
-- parameter's name cannot change in place, so it is dropped first: nothing depends on it but the bodies that call it.
drop function if exists public.last_inbound_on_whatsapp(public.conversations);
create function public.last_inbound_on_whatsapp(public.conversations)
returns timestamptz
language sql
stable
set search_path to 'public'
as $$
  select s.last_inbound_at
    from public.conversation_channel_state s
   where s.tenant_id = $1.tenant_id and s.conversation_id = $1.id and s.channel = 'whatsapp'
$$;
comment on function public.last_inbound_on_whatsapp(public.conversations) is
  'When a thread''s person last wrote on WhatsApp (decision 0001, step 5): the per-channel fact (conversation_channel_state, 00484), served with a thread as a computed column. The one accessor the reply window''s readers read in place of conversations.last_wa_inbound_at.';
revoke all on function public.last_inbound_on_whatsapp(public.conversations) from public, anon;
grant execute on function public.last_inbound_on_whatsapp(public.conversations) to authenticated, service_role;

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_added timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid)
 returns TABLE(id uuid, display_name text, wa_profile_name text, phone_e164 text, email text, email_suppressed_at timestamp with time zone, consent text, consent_source text, consent_updated_at timestamp with time zone, dnc boolean, marketing_consent text, marketing_consent_source text, marketing_consent_updated_at timestamp with time zone, consent_channels text[], marketing_channels text[], offers_asked_at timestamp with time zone, email_marketing text, email_marketing_source text, email_marketing_updated_at timestamp with time zone, channels text[], conversation_count integer, escalation_count integer, needs_human boolean, open_escalation_reason text, open_escalation_since timestamp with time zone, latest_conversation_id uuid, latest_state text, latest_paused_until timestamp with time zone, latest_assignee_user_id uuid, latest_snooze_until timestamp with time zone, latest_wa_inbound_at timestamp with time zone, last_message_at timestamp with time zone, last_message_direction text, last_message_sender text, last_inbound_text text, last_inbound_at timestamp with time zone, last_inbound_channel text, last_wrote_at timestamp with time zone, last_call_at timestamp with time zone, last_inbound_call_at timestamp with time zone, last_inbound_call_summary text, call_count integer, call_seconds integer, first_contact_at timestamp with time zone, earliest_row_at timestamp with time zone, has_backfill boolean, has_chat boolean, message_channels text[], queued_reply_at timestamp with time zone, came_from text, deal_id uuid, deal_stage text, deal_service text, deal_proposed_at timestamp with time zone, deal_decided_at timestamp with time zone, deal_ended_at timestamp with time zone, deal_amount_cents integer, deal_per text, deal_proposal_url text, deal_valid_until date, deal_lost_reason text, open_deals jsonb, step_id uuid, step_body text, step_due_on date, step_for_user_id uuid, step_deal_id uuid, in_touch_at timestamp with time zone, added_at timestamp with time zone, lead_id uuid, lead_name text, lead_gone boolean, lead_emails text[], name_source text, name_settled_at timestamp with time zone, signer_message_id uuid, signer_name text, signer_title text, signer_read_at timestamp with time zone)
 language sql
 stable
 set search_path to 'public'
as $$
  -- The page first (0021): its people, in the kept order, after the cursor or the offset, and nobody else. Every read
  -- below is for them alone.
  with page as (
    select p.id, p.display_name, p.wa_profile_name, p.phone_e164, p.email,
           p.consent, p.consent_source, p.consent_updated_at, p.dnc,
           p.marketing_consent, p.marketing_consent_source, p.marketing_consent_updated_at,
           p.in_touch_at, p.added_at
      from people_page(p_tenant_id, p_contact_id, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) p
  ),
  ev as not materialized (
    select m.id, m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           e.at, e.moved_in as backfill, e.spoken,
           -- Whether the words are a person's own, not an automatic reply or a list's mail (00299).
           public.message_is_a_persons_words(m.meta) as persons_words
      from messages m
      -- When it happened, whether the customer saw or said it, and whether it came with a history moved in: the one
      -- statement of the three (00259), which the kept moments read too.
      cross join lateral message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email, ch.email_suppressed_at,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    ch.consent_channels, ch.marketing_channels, ch.offers_asked_at,
    ch.email_marketing, ch.email_marketing_source, ch.email_marketing_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.wa_heard_at,
    ma.last_at, ma.last_direction, ma.last_sender,
    ma.last_in_body, ma.last_in_at, ma.last_wrote_on,
    ma.last_wrote_at,
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
    -- Where they came from: how a door added them (their acquired_via, written from the door's contact.added event by
    -- 00307, the first word winning), else how a history moved in began, else their first spoken event.
    case
      when ch.acquired_via in ('calendar', 'lead', 'import', 'manual') then ch.acquired_via
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    od.deals,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at,
    ch.lead_id, case when not coalesce(ld.gone, false) then ld.business_name end, coalesce(ld.gone, false),
    ld.emails,
    ch.name_source, ch.name_settled_at,
    sg.message_id, sg.signer_name, sg.signer_title, sg.read_at
  from page c
  left join lateral (
    -- What each yes covers, when offers were asked for (00297), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at,
           k.email_marketing, k.email_marketing_source, k.email_marketing_updated_at,
           k.lead_id, k.name_source, k.name_settled_at, k.acquired_via
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
  left join lateral (
    -- The business they work at (0052), by its key: its name, and whether it was erased or blanked since; and, for its
    -- own person alone while it stands, its addresses (its email and its alternates), each once, lower-cased.
    select l.business_name, (l.erased_at is not null or l.blanked_at is not null) as gone,
           case when l.contact_id = c.id and l.erased_at is null and l.blanked_at is null then
             (select array_agg(distinct lower(btrim(a.address)) order by lower(btrim(a.address)))
                from (select l.email as address
                      union all
                      select x->>'email' from jsonb_array_elements(coalesce(l.email_alternates, '[]'::jsonb)) x) a
               where nullif(btrim(coalesce(a.address, '')), '') is not null)
           end as emails
      from leads l
     where l.id = ch.lead_id and l.tenant_id = p_tenant_id
  ) ld on true
  left join lateral (
    -- A reply's signer offered as their name (0052), the newest: the reply's writer's alone, as the name's doors match
    -- it; offered rows are few, and found by reach_out_replies_signer_offered.
    select r.message_id, r.signer_name, r.signer_title, r.read_at
      from sequence_replies r
     where r.tenant_id = p_tenant_id and r.signer_state = 'offered' and r.undone_at is null
       and r.contact_id = c.id
     order by r.read_at desc
     limit 1
  ) sg on true
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
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until,
           -- The WhatsApp clock, from the per-channel fact through its one accessor (decision 0001, step 5).
           public.last_inbound_on_whatsapp(cv) as wa_heard_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    -- Everything the row says of a person's messages, in one pass over them (00464). It was four looks, each a pass of
    -- its own with a message_moment call for every message, and they were most of the list's time. A newest row is the
    -- one that happened last, then was written last, then has the greater id, so a tie picks the same row every time.
    select -- The newest word in the thread, either way.
           max(e.at) filter (where e.at is not null and e.spoken) as last_at,
           (array_agg(e.direction order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.spoken))[1] as last_direction,
           (array_agg(e.sender order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.spoken))[1] as last_sender,
           -- The newest words that came in.
           max(e.at) filter (where e.at is not null and e.direction = 'inbound' and e.spoken and e.body is not null)
             as last_in_at,
           (array_agg(e.body order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.direction = 'inbound' and e.spoken and e.body is not null))[1]
             as last_in_body,
           -- Where they last WROTE: the wire of their newest own words. Not a call's note (the system's row, never spoken)
           -- and not a program writing from their address (persons_words): an out-of-office made email "where they last
           -- wrote", and a campaign then went there. contracts lastWroteOn is its twin.
           (array_agg(e.channel order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.direction = 'inbound' and e.sender = 'customer' and e.spoken
                             and e.persons_words))[1] as last_wrote_on,
           min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- When they last wrote words of their own (00299), the statement has_relationship makes of "they wrote".
           max(e.at) filter (where e.direction = 'inbound' and e.spoken and e.at is not null and e.body is not null
                               and e.persons_words) as last_wrote_at,
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
    -- Every open deal (0029), newest first: a person may hold one per service (deals_open_uq), and the one above hid the
    -- rest. Null for someone with none open.
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'stage', d.stage, 'service', d.service, 'proposed_at', d.proposed_at,
             'decided_at', d.decided_at, 'ended_at', d.ended_at, 'amount_cents', d.amount_cents, 'per', d.per,
             'currency', d.currency, 'proposal_url', d.proposal_url, 'valid_until', d.valid_until,
             'lost_reason', d.lost_reason
           ) order by d.created_at desc) as deals
      from deals d
     where d.contact_id = c.id
       and d.stage in ('proposed', 'won')
  ) od on true
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

revoke all on function public.people_list(uuid, uuid, text, integer, integer, timestamp with time zone, timestamp with time zone, uuid) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer, timestamp with time zone, timestamp with time zone, uuid) to authenticated, service_role;
