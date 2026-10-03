-- 00286 · A yes covers the channels it was given for.
--
-- One message, every channel, step 2 (docs/2026-10-02-one-message-every-channel.md, 2.3 and 4; the campaigns-on-every-
-- channel spec, 4.1 and decisions 6 and 11). A yes is given somewhere, and it covers the channel it was given for: a
-- START sent on WhatsApp is not a text opt-in under the registered flow, and a yes to offers is to offers on WhatsApp.
-- The channels each yes covers are kept on the contact, by the rule contracts' channelsOfYes states
-- (packages/contracts/src/consent/consent-channels.ts), from each contact.consent_changed event as it is written, so the
-- predicate reads a column and never replays a ledger.
--
--   contacts.consent_channels,       the channels each answer's yes covers: 'whatsapp', 'sms', 'email', in that order.
--   contacts.marketing_channels      NULL is "kept none", which reads as WhatsApp alone: a yes recorded before the
--                                    channels were keeps exactly the reach it had, and a row a write reaches without its
--                                    event is no worse off. An empty array is a no that covers nothing.
--   contacts.offers_asked_at         when the receptionist first asked for the yes to offers (it asks once).
--   consent_channels_of              channelsOfYes, for SQL: the channels one yes covers, by how it was given. Pure.
--   consent_channels_union           the channels of two lists, each once, in that order. Pure.
--   events_keep_consent_channels     after a contact.consent_changed event is written: a yes adds the channels it covers
--                                    to its purpose's list, a no or a reset empties it. The event says which purpose
--                                    (conversational events carry none). It never raises: a consent write must not fail
--                                    because of it.
--   note_yes_on_channel              the edge's door, after ingest_inbound for a START: ingest_inbound writes no event for a
--                                    yes the person already gave, so a START by text from someone opted in on WhatsApp
--                                    would cover no text. This writes that event when their list lacks the channel, and
--                                    the trigger above adds it. Service role only; never raises.
--   messages_stamp_offers_asked      after an outbound message that was SENT (status sent, delivered or read, when it is
--                                    written or when its status moves there: a held or cancelled draft asked nobody)
--                                    says YES OFFERS or SI OFERTAS (the words the ask uses: contracts'
--                                    OFFERS_OPT_IN_PHRASES), in any case and with or without the accent on the Spanish
--                                    i, as a word of its own (every spelling the inbound side takes as the yes,
--                                    MARKETING_OPT_IN_PATTERN, and the model's own: "Sí ofertas", "Si Ofertas"): the
--                                    first one stamps its person's offers_asked_at, and a later one leaves it.
--                                    Never raises.
--   consent_channels_on_erase        an erased row holds no answer (00101): its channels and the ask go with it.
--   the backfill                     every yes already on a row keeps the channels its events give it (below), else
--                                    WhatsApp, the reach it had.
--   people_list                      answers the three beside the consent columns (recreated from 00276's; its return
--                                    type changes, so it is dropped and made again with its grants and comment).
--
-- Re-runnable: columns, functions and triggers say what they are, and the backfill fills a list that is still NULL, so a
-- second run changes nothing a trigger has since kept.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------- columns -- */

alter table public.contacts
  add column if not exists consent_channels   text[],
  add column if not exists marketing_channels text[],
  add column if not exists offers_asked_at    timestamptz;

comment on column public.contacts.consent_channels is
  'The channels the yes about messages on their own visit covers (whatsapp, sms, email, in that order), kept by events_keep_consent_channels from each contact.consent_changed event by consent_channels_of''s rule. NULL: none kept, a yes recorded before the channels were, which covers WhatsApp alone; empty: no yes.';
comment on column public.contacts.marketing_channels is
  'The channels the yes to offers covers (whatsapp, sms, email, in that order), kept the same way from the events that name purpose marketing. NULL: none kept, which reads as WhatsApp alone; empty: no yes.';
comment on column public.contacts.offers_asked_at is
  'When the receptionist first asked this person for the yes to offers: the first outbound message that says YES OFFERS or SI OFERTAS, in any case and with or without the accent (messages_stamp_offers_asked). It asks once.';

/* ------------------------------------------------------------------- rules -- */

create or replace function public.consent_channels_of(p_purpose text, p_source text, p_channel text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  -- contracts' channelsOfYes, row by row of its table. A purpose that is not 'marketing' is the conversational one.
  select case
    -- A yes to offers in their own message, by text or email, covers WhatsApp too: offers go by WhatsApp alone, and the
    -- confirmation they are sent says so. (Their own message on WhatsApp is WhatsApp alone, below.)
    when p_purpose = 'marketing' and p_source = 'customer_message' and p_channel in ('sms', 'email')
      then array['whatsapp', p_channel]
    when p_source = 'customer_message' and p_channel in ('whatsapp', 'sms', 'email') then array[p_channel]
    when p_purpose = 'marketing' then
      case when p_source in ('form', 'customer_message') then array['whatsapp'] else '{}'::text[] end
    when p_source in ('form', 'phone') then array['whatsapp', 'sms']
    else array['whatsapp']
  end
$$;
revoke execute on function public.consent_channels_of(text, text, text) from public, anon;
comment on function public.consent_channels_of(text, text, text) is
  'The channels one yes covers (One message, every channel, step 2): contracts'' channelsOfYes, case by case, which consent-channels.db.test.mjs holds equal. p_purpose is marketing or anything else (conversational); p_source how the yes was given (the source every consent event records); p_channel the channel of the message it came in, where it came in one. Their own message covers its channel, and for offers by text or email WhatsApp too (offers go by WhatsApp); the sign-up page or the form, WhatsApp and text for visit messages and WhatsApp for offers; the phone, WhatsApp and text for visit messages and never offers; anything else, WhatsApp for visit messages and never offers.';

create or replace function public.consent_channels_union(p_have text[], p_add text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(c.channel order by c.ord), '{}'::text[])
    from unnest(array['whatsapp', 'sms', 'email']) with ordinality as c(channel, ord)
   where c.channel = any (coalesce(p_have, '{}'::text[]) || coalesce(p_add, '{}'::text[]))
$$;
revoke execute on function public.consent_channels_union(text[], text[]) from public, anon;
comment on function public.consent_channels_union(text[], text[]) is
  'The channels of both lists, each once, in the order whatsapp, sms, email; anything that is not one of the three is dropped, and a NULL list is an empty one.';

/* ---------------------------------------------------- the ledger keeps them -- */

create or replace function public.events_keep_consent_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purpose text := coalesce(new.data->>'purpose', 'conversational');
  v_consent text := new.data->>'consent';
  v_covers  text[];
begin
  if new.subject_id is null or v_purpose not in ('conversational', 'marketing') then
    return null;
  end if;
  if v_consent = 'opted_in' then
    -- A yes adds what it covers to what the person's earlier yeses cover. NULL is no yes kept ('{}'), never WhatsApp: a
    -- person's first yes by text covers text alone, and the backfill below has given every earlier yes its list.
    v_covers := public.consent_channels_of(v_purpose, new.data->>'source', new.data->>'channel');
    if v_purpose = 'marketing' then
      update public.contacts c
         set marketing_channels = public.consent_channels_union(c.marketing_channels, v_covers)
       where c.id = new.subject_id and c.tenant_id = new.tenant_id and c.erased_at is null;
    else
      update public.contacts c
         set consent_channels = public.consent_channels_union(c.consent_channels, v_covers)
       where c.id = new.subject_id and c.tenant_id = new.tenant_id and c.erased_at is null;
    end if;
  elsif v_consent in ('opted_out', 'unknown') then
    -- A no, or a reset, empties the answer it is about. STOP and do-not-contact stay all-channel through dnc.
    if v_purpose = 'marketing' then
      update public.contacts c set marketing_channels = '{}'::text[]
       where c.id = new.subject_id and c.tenant_id = new.tenant_id and c.erased_at is null;
    else
      update public.contacts c set consent_channels = '{}'::text[]
       where c.id = new.subject_id and c.tenant_id = new.tenant_id and c.erased_at is null;
    end if;
  end if;
  return null;
exception when others then
  -- The consent write is the person's word, and the event is its evidence; the channels are read from them, never
  -- a reason to refuse them. A row left without its list reads as WhatsApp alone.
  raise warning 'events_keep_consent_channels: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.events_keep_consent_channels() from public, anon, authenticated;
comment on function public.events_keep_consent_channels() is
  'After a contact.consent_changed event is written (One message, every channel, step 2): a yes adds the channels it covers (consent_channels_of, by the event''s purpose, source and channel) to the person''s consent_channels or marketing_channels, and a no or a reset empties it. A failure warns and never refuses the consent write.';

drop trigger if exists events_keep_consent_channels on public.events;
create trigger events_keep_consent_channels
  after insert on public.events
  for each row
  when (new.kind = 'contact.consent_changed' and new.subject_type = 'contact')
  execute function public.events_keep_consent_channels();

/* ------------------------------------------- a yes on another channel -- */

-- ingest_inbound writes its consent event only when `consent` changes, so a START from someone already opted in on
-- WhatsApp, sent by text, leaves no event and the yes would cover no text. The edge calls this right after ingest_inbound
-- when the words were a START (packages/db ingestInbound): once the person's list does not hold the channel the yes was
-- given on, it writes the event ingest_inbound did not, and the trigger above adds the channel. ingest_inbound itself is
-- not recreated: it handles every inbound message in the product.
create or replace function public.note_yes_on_channel(
  p_tenant_id           uuid,
  p_contact_id          uuid,
  p_channel             text,
  p_message_external_id text,
  p_words               text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts%rowtype;
begin
  if p_tenant_id is null or p_contact_id is null or p_channel is null or p_channel not in ('whatsapp', 'sms', 'email') then
    return false;
  end if;
  -- Locked, so two texts of START at once write one event, not two.
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id and c.erased_at is null
     for update;
  if not found or v_contact.consent is distinct from 'opted_in' then
    return false;
  end if;
  -- NULL is a yes recorded before the channels were kept, which covers WhatsApp alone.
  if public.consent_channels_of('conversational', 'customer_message', p_channel)
       <@ coalesce(v_contact.consent_channels, array['whatsapp']) then
    return false;
  end if;
  if v_contact.consent_channels is null then
    update public.contacts set consent_channels = array['whatsapp'] where id = v_contact.id;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('consent', 'opted_in', 'source', 'customer_message', 'channel', p_channel,
                             'message_external_id', p_message_external_id,
                             'words', nullif(left(coalesce(p_words, ''), 80), ''),
                             'covers_another_channel', true));
  return true;
exception when others then
  -- The customer has been answered; the channel they asked for is repaired, never a reason to refuse the message.
  raise warning 'note_yes_on_channel: %', sqlerrm;
  return false;
end $$;
revoke execute on function public.note_yes_on_channel(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.note_yes_on_channel(uuid, uuid, text, text, text) to service_role;
comment on function public.note_yes_on_channel(uuid, uuid, text, text, text) is
  'The edge''s door, right after ingest_inbound for a START (One message, every channel, step 2): when the person''s answer is a yes and its consent_channels does not hold the channel the START came on (NULL holds WhatsApp), writes the contact.consent_changed event ingest_inbound leaves out for a yes already given, carrying the channel, the message, the words and covers_another_channel, so events_keep_consent_channels adds the channel and the ledger shows the yes. Answers whether it wrote one. A repeat finds the channel held and writes nothing. Never raises. Service role only.';

/* -------------------------------------------------- the receptionist's ask -- */

create or replace function public.messages_stamp_offers_asked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The first ask stands: a later one finds the stamp and leaves it. The person is the conversation's.
  update public.contacts c
     set offers_asked_at = coalesce(new.channel_ts, new.created_at)
   where c.tenant_id = new.tenant_id
     and c.offers_asked_at is null
     and c.id = (select cv.contact_id from public.conversations cv
                  where cv.id = new.conversation_id and cv.tenant_id = new.tenant_id);
  return null;
exception when others then
  -- The message is already on its way; the stamp is a note about it, never a reason to lose it.
  raise warning 'messages_stamp_offers_asked: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.messages_stamp_offers_asked() from public, anon, authenticated;
comment on function public.messages_stamp_offers_asked() is
  'After an outbound message that says YES OFFERS or SI OFERTAS is SENT (One message, every channel, step 2): written with the status sent, delivered or read, or moved to one of them, never a held or cancelled draft or a failure. In any case, with or without the accent on the i (precomposed or with a combining acute), as a word of its own: the first one stamps its person''s offers_asked_at with the message''s time, and a later one leaves it. A failure warns and never refuses the message.';

drop trigger if exists messages_stamp_offers_asked on public.messages;
create trigger messages_stamp_offers_asked
  after insert or update of status on public.messages
  for each row
  -- Only a message that was SENT is an ask: a draft the team held or cancelled, or one that failed, asked nobody, and
  -- must not use up the one ask. A draft that is sent later is stamped by the update that sends it (a later receipt,
  -- delivered or read, finds the stamp and leaves it). The words as a word of their own, in any case: ~* folds ASCII in
  -- every locale, and the capital Í is named so a database that folds no further still reads it. A combining acute
  -- after the i is the same accent.
  when (new.direction = 'outbound'
    and new.status in ('sent', 'delivered', 'read')
    and new.body ~* '(^|[^[:alpha:]])(yes\s+offers|s[iíÍ]\u0301?\s+ofertas)([^[:alpha:]]|$)')
  execute function public.messages_stamp_offers_asked();

/* ---------------------------------------------------------- an erased row -- */

create or replace function public.consent_channels_on_erase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    new.consent_channels := null;
    new.marketing_channels := null;
    new.offers_asked_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.consent_channels_on_erase() from public, anon, authenticated;
comment on function public.consent_channels_on_erase() is
  'Before a person is erased (00101''s rule: an erased row holds no answer about anybody): the channels their yeses covered and when offers were asked go with the yes.';

drop trigger if exists contacts_erase_clears_consent_channels on public.contacts;
create trigger contacts_erase_clears_consent_channels
  before update of erased_at on public.contacts
  for each row execute function public.consent_channels_on_erase();

/* ---------------------------------------------------------------- backfill -- */

-- Every yes already on a row keeps the channels its events give it: the union of consent_channels_of over the person's
-- opted_in events of that purpose since their last opted_out or unknown one. A yes with no such event (it came before
-- the events did, or from a write that left none) keeps the reach it had, WhatsApp. Everyone else stays NULL. Only a list
-- that is still NULL is filled, so a second run leaves what the trigger has kept since.
update public.contacts c
   set consent_channels = coalesce(nullif(k.channels, '{}'::text[]), array['whatsapp'])
  from (
    select ct.id,
           (select public.consent_channels_union('{}'::text[], array_agg(w.channel))
              from public.events e
              cross join lateral unnest(public.consent_channels_of('conversational', e.data->>'source', e.data->>'channel')) as w(channel)
             where e.tenant_id = ct.tenant_id and e.subject_type = 'contact' and e.subject_id = ct.id
               and e.kind = 'contact.consent_changed'
               and coalesce(e.data->>'purpose', 'conversational') = 'conversational'
               and e.data->>'consent' = 'opted_in'
               and e.created_at > coalesce(
                     (select max(n.created_at) from public.events n
                       where n.tenant_id = ct.tenant_id and n.subject_type = 'contact' and n.subject_id = ct.id
                         and n.kind = 'contact.consent_changed'
                         and coalesce(n.data->>'purpose', 'conversational') = 'conversational'
                         and n.data->>'consent' in ('opted_out', 'unknown')),
                     '-infinity'::timestamptz)) as channels
      from public.contacts ct
     where ct.consent = 'opted_in' and ct.consent_channels is null
  ) k
 where c.id = k.id;

update public.contacts c
   set marketing_channels = coalesce(nullif(k.channels, '{}'::text[]), array['whatsapp'])
  from (
    select ct.id,
           (select public.consent_channels_union('{}'::text[], array_agg(w.channel))
              from public.events e
              cross join lateral unnest(public.consent_channels_of('marketing', e.data->>'source', e.data->>'channel')) as w(channel)
             where e.tenant_id = ct.tenant_id and e.subject_type = 'contact' and e.subject_id = ct.id
               and e.kind = 'contact.consent_changed'
               and e.data->>'purpose' = 'marketing'
               and e.data->>'consent' = 'opted_in'
               and e.created_at > coalesce(
                     (select max(n.created_at) from public.events n
                       where n.tenant_id = ct.tenant_id and n.subject_type = 'contact' and n.subject_id = ct.id
                         and n.kind = 'contact.consent_changed'
                         and n.data->>'purpose' = 'marketing'
                         and n.data->>'consent' in ('opted_out', 'unknown')),
                     '-infinity'::timestamptz)) as channels
      from public.contacts ct
     where ct.marketing_consent = 'opted_in' and ct.marketing_channels is null
  ) k
 where c.id = k.id;

/* ------------------------------------------------------------- people_list -- */

-- Its return type changes, so the function is dropped and made again, with the grants and the comment 00276 gave it.
drop function if exists public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid);

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
  -- The channels each yes covers (00286; null: a yes recorded before they were kept, which covers WhatsApp alone), and
  -- when the receptionist first asked for the yes to offers.
  consent_channels             text[],
  marketing_channels           text[],
  offers_asked_at              timestamptz,
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
    select p.id, p.display_name, p.wa_profile_name, p.phone_e164, p.email,
           p.consent, p.consent_source, p.consent_updated_at, p.dnc,
           p.marketing_consent, p.marketing_consent_source, p.marketing_consent_updated_at,
           p.in_touch_at, p.added_at
      from people_page(p_tenant_id, p_contact_id, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) p
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
    ch.consent_channels, ch.marketing_channels, ch.offers_asked_at,
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
    -- What each yes covers, and when offers were asked for (00286): read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
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
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, import, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_contact_id names one person, their row alone. The page is chosen before it is read (0021, people_page): its people come from person_moments in one whole order, latest contact first (in_touch_at, -infinity for never), then the newest added (added_at), then the id, falling, at most p_limit (1000) of them after p_offset or after the cursor p_after_at, p_after_added, p_after_id (the last row''s in_touch_at, added_at and id); every other column is read for them alone. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008). The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written. `consent_channels` and `marketing_channels` are the channels each yes covers (00286; null: a yes recorded before the channels were kept, which covers WhatsApp alone) and `offers_asked_at` is when the receptionist first asked for the yes to offers.';
