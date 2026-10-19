-- 00464 · A message keeps when it left, and People reads how a person was added from their own row.
--
-- The 19 Oct 2026 loadability review, lane B: the first reads of Today, Reports and People were slow cold because two
-- readers looked a fact up in the events ledger, by subject and with no time bound, so every call planned and probed
-- each of its fifteen monthly partitions (and one more each month):
--
--   first_replies   when each outbound row LEFT: the min created_at of its message.sent event, else its created_at, per
--                   row and per reference (metrics_summary, report_series, receptionist_series, platform_metrics_roll).
--   people_list     how a door added a person: their first contact.added event's source, per person on the page.
--
-- Production, 19 Oct, the busiest workspace, as its owner, on a fresh backend: first_replies planned in 45.8 ms and ran
-- in 39.7 ms over 32.6K buffers for 127 asks; with the time on the row, 9.3 + 11.3 ms over 4.6K. people_list's page:
-- 21.0 + 38.5 ms over 15.5K buffers; with the door's word on the row, 12.4 + 32.0 ms over 9.0K. The plan doc is
-- docs/plans/2026-10-19-first-reads-own-columns.md.
--
--   messages.sent_at   New. When the row's words left, stamped by the database the first time the row holds a sent
--                      status (sent, delivered, read): a row written already sent left as it was written (its own
--                      created_at, so a history moved in or a fixture keeps its moment), and a row moved there later
--                      left at that update (the send door's queued -> sent, deliver.ts; a timed-out email a receipt
--                      settles). The send door's message.sent event is written beside that update, a few milliseconds
--                      later, and stays the Activity line it always was. A row that never left keeps null, and so does a
--                      failed or canceled one, unless it had left first (a late failure keeps the moment it left).
--   backfill           Every outbound row that holds a sent status or had a message.sent event: the first event's
--                      created_at, else its created_at. That is first_replies' old answer, row for row, written down
--                      (production: 21 rows from an event, 250 from their own created_at).
--   contacts           acquired_via already holds how a door added a person (00307's trigger, from the same event, first
--                      word wins), so People reads it there. Four people added before 00307 have the event and no word:
--                      each gets it now through the same door and the same mapping (calendar, lead and import are
--                      themselves, any other word or none is manual; a lead's id where the event names one).
--   first_replies      Reads coalesce(sent_at, created_at); the events lookup goes. Nothing else in it changes.
--   people_list        came_from's first arm reads the person's acquired_via when it names a door; the events lookup
--                      goes. And each person's messages are read once, not four times: the newest word, the newest
--                      words in and where they last wrote were three looks of their own beside the totals, each a pass
--                      over the person's messages with a message_moment call (plpgsql, so never inlined) per message.
--                      They are one pass now, with a tie broken the same way every time (when it happened, when it was
--                      written, its id) where a look took either row. Production, the same page, warm: the message
--                      reads went from ~19 ms of a 27-30 ms run to ~9.5 ms of 19.5-20.6. Its signature and every
--                      column stay; every workspace's answer on production was the same row for row.
--
-- What People says differently: a person whose first touch was their own message or call and whom a door then also
-- added (a lead converted onto someone who wrote first) came from that message or call, as Reports' people lens has said
-- since 00306, not from the door. Production has none. People the sample data wrote with a door's word and no event (58,
-- in the chanlytics and melanys-old-test workspaces) now show that door, as Reports already did.
--
-- Locks, and the one way this file could hurt a customer. In one transaction it takes ROW EXCLUSIVE on contacts (the four
-- rows, first), then ACCESS EXCLUSIVE on messages (add column; the trigger and the backfill run under it). A customer's
-- ingest_inbound holds a person's row and then wants messages; were it holding one of those four people while this file
-- held messages, Postgres would end the cycle after deadlock_timeout (1 s) by cancelling one side. This file's
-- lock_timeout is 500 ms, below that, so the side that gives up is this file, never a customer's insert (00306's reasoning).
-- If it times out nothing was applied: re-run it when the line is quiet. The backfill's UPDATE names sent_at alone, so no
-- trigger written for a change of status fires; the guard (messages_guard) allows it, and the two statement triggers see
-- nothing they act on (person_moments: no moment changed; workspace_tell: one notice per workspace, as any update sends).
-- Either deploy order works: no app reads or writes the new column. Every statement re-runs.
set local lock_timeout = '500ms';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '500ms' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------- 1. how the four people were added -- */

-- Their first contact.added event decides, read as 00307's trigger reads it; person_set_first_touch writes a person who
-- has no word yet and nobody else, so a second run finds no one.
do $$
declare
  v_set int := 0;
  r record;
begin
  for r in
    select distinct on (e.subject_id) e.tenant_id, e.subject_id, e.data ->> 'source' as word, e.data ->> 'lead_id' as lead_id
      from public.events e
      join public.contacts c on c.id = e.subject_id and c.tenant_id = e.tenant_id
     where e.kind = 'contact.added' and e.subject_type = 'contact' and c.acquired_via is null
     order by e.subject_id, e.created_at, e.id
  loop
    if public.person_set_first_touch(
         r.tenant_id,
         r.subject_id,
         case when r.word in ('calendar', 'lead', 'import') then r.word else 'manual' end,
         case when r.word = 'lead' then r.lead_id end) then
      v_set := v_set + 1;
    end if;
  end loop;
  raise notice 'people given how a door added them: %', v_set;
end $$;

/* ------------------------------------------------------------------------- 2. when a message left -- */

alter table public.messages add column if not exists sent_at timestamptz;

comment on column public.messages.sent_at is
  'When the row''s words left: stamped by messages_note_sent_at the first time the row holds sent, delivered or read (its own created_at for a row written already sent; the moment of the update for one moved there, the send door''s queued -> sent). Null for a row that never left. first_replies reads it (00464).';

create or replace function public.messages_note_sent_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A row written already sent left as it was written; a row moved to a sent status leaves now.
  NEW.sent_at := case when TG_OP = 'INSERT' then NEW.created_at else now() end;
  return NEW;
end $$;

revoke execute on function public.messages_note_sent_at() from public, anon, authenticated;

-- Before the row is written, so the stamp is part of the same write and costs no second one. The WHEN keeps every other
-- row out of the function: inbound rows, rows that have not left, and rows already stamped.
create or replace trigger messages_note_sent_at before insert or update of status on public.messages
  for each row
  when (NEW.sent_at is null and NEW.direction = 'outbound' and NEW.status in ('sent', 'delivered', 'read'))
  execute function public.messages_note_sent_at();

-- What first_replies said of every row that left, written down: the first message.sent event, else the row itself. A
-- row that failed or was canceled after its event had left all the same, and keeps the moment.
update public.messages m
   set sent_at = coalesce(ev.first_at, m.created_at)
  from (
    select m2.id, (select min(e.created_at)
                     from public.events e
                    where e.tenant_id = m2.tenant_id
                      and e.kind = 'message.sent'
                      and e.subject_type = 'message'
                      and e.subject_id = m2.id) as first_at
      from public.messages m2
     where m2.direction = 'outbound' and m2.sent_at is null
  ) ev
 where ev.id = m.id
   and (m.status in ('sent', 'delivered', 'read') or ev.first_at is not null);

/* ------------------------------------------------------------------------------- 3. the readers -- */

create or replace function public.first_replies(p_tenant_id uuid, p_start timestamptz)
returns table (
  asked_at        timestamptz,
  conversation_id uuid,
  ai_at           timestamptz,
  human_at        timestamptz,
  who             text,
  ai_seconds      numeric,
  ai_hold_s       numeric
)
language sql
stable
set search_path = public
as $$
  with real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  asks as (
    select m.created_at as asked_at, m.conversation_id
      from real_msgs m
     where m.created_at >= p_start
       and m.direction = 'inbound' and m.sender = 'customer'
       and public.message_is_a_persons_words(m.meta)
  ),
  -- when each outbound row actually LEFT: its sent_at (00464), which the send door stamps as it marks a queued row sent;
  -- a row written already sent left as it was written
  sent as not materialized (
    select o.id, o.conversation_id, o.sender, o.created_at,
           coalesce(o.sent_at, o.created_at) as sent_at,
           -- the hold the owner set, as the reply was queued (draft-queue.ts); none for a reply sent at once
           case when jsonb_typeof(o.meta->'delay_ms') = 'number'
                then (o.meta->>'delay_ms')::numeric / 1000.0 else 0 end as hold_s,
           -- written as 'human' and nobody's answer (00303)
           public.automated_send(o.meta) as automated
      from real_msgs o
     where o.direction = 'outbound'
       and o.status in ('sent', 'delivered', 'read')
  ),
  firsts as (
    select a.asked_at, a.conversation_id, ai.sent_at as ai_at, ai.hold_s,
           (select min(s.sent_at) from sent s
             where s.conversation_id = a.conversation_id and s.sender = 'human' and not s.automated
               and s.created_at > a.asked_at) as human_at
      from asks a
      left join lateral (
        select s.sent_at, s.hold_s from sent s
         where s.conversation_id = a.conversation_id and s.sender = 'ai' and s.created_at > a.asked_at
         order by s.sent_at
         limit 1
      ) ai on true
  )
  select asked_at, conversation_id, ai_at, human_at,
         case when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'
              when human_at is not null then 'you'
              else 'none' end as who,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then extract(epoch from (ai_at - asked_at)) end as ai_seconds,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then hold_s end as ai_hold_s
    from firsts
$$;

revoke all on function public.first_replies(uuid, timestamptz) from public, anon;
grant execute on function public.first_replies(uuid, timestamptz) to authenticated, service_role;

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
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
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
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
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
