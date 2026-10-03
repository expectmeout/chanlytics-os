-- 00288 · An offer by email goes only where it is owed.
--
-- One message, every channel, step 4 (docs/2026-10-02-one-message-every-channel.md, 4; the campaigns-on-every-channel
-- spec, 4.1, 4.5 and 4.6). Offers by email were refused at the door. They go now, under the rule of 4.1, to someone who has not
-- unsubscribed and who either asked for offers by email or has a relationship with the business on record (they wrote, they
-- called, or they have a deal), from the campaigns domain, with an unsubscribe the person can press. This migration is the
-- database's side of it. Nothing here changes what a send does until the edge has a verified campaigns domain
-- (EMAIL_CAMPAIGNS_DOMAIN): offers by email stay refused until then, and code that ships before this migration reads a
-- database without it as having no relationship and no pause, which sends no offer by email.
--
--   message_is_a_persons_words    whether an inbound message's words are a person's own: not an email the intake read as
--   (meta)                        automated mail, an automatic reply or a delivery report (meta.email.claim, from the
--                                 headers: channels classifyReceived). THE one statement of it, read by has_relationship and
--                                 people_list's last_wrote_at: an out-of-office or a list's mail from someone's address is not
--                                 that person dealing with the business.
--   has_relationship(contacts)    whether the person has dealt with the business: they wrote a spoken message in their own words
--                                 (message_is_a_persons_words), they placed a call that connected, or they have a deal. THE one
--                                 reading in SQL of what contracts' relationshipOnRecord reads of People's columns (a test holds
--                                 the two equal). A function of a table's row is a column PostgREST serves, so the send door
--                                 reads it with the person.
--   mailboxes.offers_paused_at,   the gates (contracts' OFFER_GATES): complaints above 0.1% of the last 1,000 offers (judged over
--   offers_paused_reason,         at least 200), or hard bounces above 2% of the last 500 (over at least 100), pause a workspace's
--   offers_resumed_at             offers by email, and only its offers: reminders and replies go on. pause_email_offers sets it
--                                 (the receipts' door), and resume_email_offers clears it, which is the back office's, once the list
--                                 is fixed, and stamps offers_resumed_at: the gates are then judged over the offers sent after it,
--                                 so a resumed workspace is not paused again by the very offers that paused it. Each writes its
--                                 events row (mailbox.offers_paused, mailbox.offers_resumed), as the workspace's ledger says.
--   email_offer_counts(tenant,    what the gates are judged by: the last 1,000 and the last 500 offers that left the campaigns
--   host)                         domain since the last resume, with the complaints and the bounces among them (the receipts the
--                                 edge already stores, read as sending_domain_counts reads a cold domain's, over email_left).
--   set_email_offers_yes          the email yes: a person who wrote YES OFFERS by email (or signed a form) is opted_in to offers
--                                 by email, with the channel as evidence on the event, unless they have unsubscribed: a yes never
--                                 overwrites that no. Service role only.
--   stop_all_messages             the second, confirmed act on the unsubscribe page: STOP for everything, as ingest_inbound
--                                 records one, with the same ledger entry, plus the email unsubscribe. Service role only.
--   offers_email_reach(tenant)    how many people an offer by email would reach (Setup's count of them): the rule of 4.1 in
--                                 SQL, over the same has_relationship, and the person's own no to offers elsewhere (a recorded no
--                                 to offers on WhatsApp bars an offer by email too: contracts' mayMessageFor).
--   people_list                   also returns email_marketing, its source and when (the person's answer about offers by
--                                 email), and last_wrote_at (when they last wrote words that were a person's own: what
--                                 relationshipOnRecord reads), so People's rows and lists judge an offer by email with the rule
--                                 (recreated from 00287's: the return type changes, so it is dropped and made again with its
--                                 grants and comment).
--
-- Re-runnable: columns say what they are, the CHECK is dropped and made again, the functions are replaced (the one whose
-- signature changed, pause_email_offers, drops its first spelling).

set local lock_timeout = '3s';

/* ----------------------------------------------------------- the relationship -- */

-- Whether an inbound message's words are a person's own. The intake keeps what an email CLAIMS to be beside it
-- (meta.email.claim: person, automated, auto_reply; a delivery report is never kept), and a message of any other kind has no
-- claim and is somebody's words: an out-of-office, a list's mail or a form's notification is a program writing from their
-- address, which is not the person dealing with the business.
create or replace function public.message_is_a_persons_words(p_meta jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_meta->'email'->>'claim', 'person') not in ('automated', 'auto_reply', 'report')
$$;
revoke execute on function public.message_is_a_persons_words(jsonb) from public, anon;
grant execute on function public.message_is_a_persons_words(jsonb) to authenticated, service_role;
comment on function public.message_is_a_persons_words(jsonb) is
  'Whether an inbound message''s words are a person''s own: false for an email read as automated mail, an automatic reply or a delivery report (meta.email.claim), true for everything else, a message with no claim included. The one statement of it: has_relationship and people_list''s last_wrote_at read it.';

create or replace function public.has_relationship(c public.contacts)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
           -- They wrote: a message of theirs the customer could see or say, with words in it and a moment (people_list's
           -- last_inbound_at: message_moment, 00259), and the words a person's own: not an automatic reply or a list's mail.
           select 1
             from public.messages m
            cross join lateral public.message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
            where m.tenant_id = c.tenant_id and m.contact_id = c.id
              and m.direction = 'inbound' and e.spoken and e.at is not null and m.body is not null
              and public.message_is_a_persons_words(m.meta))
      -- They called: a call they placed that connected (last_inbound_call_at).
      or exists (
           select 1 from public.calls k
            where k.contact_id = c.id and k.direction = 'inbound' and k.status <> 'not_connected')
      -- They have a deal, in any stage (deal_id).
      or exists (select 1 from public.deals d where d.contact_id = c.id)
$$;
revoke execute on function public.has_relationship(public.contacts) from public, anon;
grant execute on function public.has_relationship(public.contacts) to authenticated, service_role;
comment on function public.has_relationship(public.contacts) is
  'Whether a person has a relationship with the business on record (spec 4.1): they wrote (a spoken message of theirs, with words and a moment, that a person wrote: not an automatic reply or a list''s mail), they called (a call they placed that connected), or they have a deal. What contracts'' relationshipOnRecord reads of People''s columns, in SQL, for the rows the send door reads. A function of the contacts row, so PostgREST serves it as a column.';

/* ------------------------------------------------------------- the gates -- */

alter table public.mailboxes
  add column if not exists offers_paused_at timestamptz,
  add column if not exists offers_paused_reason text,
  add column if not exists offers_resumed_at timestamptz;

alter table public.mailboxes drop constraint if exists mailboxes_offers_paused_reason_check;
alter table public.mailboxes add constraint mailboxes_offers_paused_reason_check
  check (offers_paused_reason is null or offers_paused_reason in ('complaints', 'bounces'));

comment on column public.mailboxes.offers_paused_at is
  'When a gate paused this workspace''s offers by email (complaints or bounces over their limits, contracts'' OFFER_GATES), or NULL while they are not paused. Offers hold; reminders and replies by email go on. Cleared by resume_email_offers.';
comment on column public.mailboxes.offers_paused_reason is
  'Which gate paused them: complaints or bounces.';
comment on column public.mailboxes.offers_resumed_at is
  'When the back office last turned this workspace''s offers by email back on (resume_email_offers), or NULL if it never has. The gates are judged over the offers sent after it, so the offers that paused them are not counted again.';

-- Its first spelling took no counts: dropped, so the one function below is the only one (nothing has ever called it but the
-- edge's receipts, which pass the counts they judged by).
drop function if exists public.pause_email_offers(uuid, text);

create or replace function public.pause_email_offers(p_tenant_id uuid, p_reason text, p_counts jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mailbox uuid;
begin
  if p_reason is null or p_reason not in ('complaints', 'bounces') then
    raise exception 'pause_email_offers: the reason is complaints or bounces' using errcode = '22023';
  end if;
  -- Once: a pause already in force keeps its first moment and reason, and writes no second event.
  update public.mailboxes
     set offers_paused_at = now(), offers_paused_reason = p_reason
   where tenant_id = p_tenant_id and offers_paused_at is null
  returning id into v_mailbox;
  if v_mailbox is null then
    return false;
  end if;
  -- The workspace's ledger says it, with what the gate judged by (the counts, when the caller gave them).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox.offers_paused', 'system', 'mailbox', v_mailbox,
          coalesce(p_counts, '{}'::jsonb) || jsonb_build_object('reason', p_reason));
  return true;
end $$;
revoke execute on function public.pause_email_offers(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.pause_email_offers(uuid, text, jsonb) to service_role;
comment on function public.pause_email_offers(uuid, text, jsonb) is
  'Pauses a workspace''s offers by email (the gates, contracts'' OFFER_GATES): true when this call paused them, false when they were already paused or the workspace has no mailbox. Writes a mailbox.offers_paused event with the reason and the counts it was judged by. Service role only: the edge''s receipts judge the gates.';

create or replace function public.resume_email_offers(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mailbox uuid;
  v_since   timestamptz;
  v_reason  text;
begin
  select m.id, m.offers_paused_at, m.offers_paused_reason into v_mailbox, v_since, v_reason
    from public.mailboxes m
   where m.tenant_id = p_tenant_id and m.offers_paused_at is not null
     for update;
  if not found then
    return false;
  end if;
  -- The gates are judged afresh from here: only the offers sent after this moment count (email_offer_counts).
  update public.mailboxes
     set offers_paused_at = null, offers_paused_reason = null, offers_resumed_at = now()
   where id = v_mailbox;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox.offers_resumed', 'system', 'mailbox', v_mailbox,
          jsonb_build_object('reason', v_reason, 'paused_at', v_since));
  return true;
end $$;
revoke execute on function public.resume_email_offers(uuid) from public, anon, authenticated;
grant execute on function public.resume_email_offers(uuid) to service_role;
comment on function public.resume_email_offers(uuid) is
  'The back office''s: turns a workspace''s offers by email back on, once its list is fixed, stamps offers_resumed_at (the gates are then judged over the offers sent after it) and writes a mailbox.offers_resumed event. True when they were paused. Service role only.';

-- What the gates are judged by: the last 1,000 and the last 500 emails that left from this host (the campaigns domain, so
-- only offers) since the workspace's last resume, by what the receipts stored: a complaint is stamped on its row (00176), a
-- bounce is its status and error. Whether an email left is the one spelling, email_left (00179): a send the door refused, or
-- the provider never took, never left and is not counted. The last 90 days only, as 00176's. How many offers a gate needs
-- before it judges at all is contracts' (OFFER_GATES), not this function's.
create or replace function public.email_offer_counts(p_tenant_id uuid, p_host text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ours as (
    select m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = lower(p_host)
       and m.created_at >= now() - interval '90 days'
       and m.created_at > coalesce(
             (select b.offers_resumed_at from public.mailboxes b where b.tenant_id = p_tenant_id),
             '-infinity'::timestamptz)
       and public.email_left(m.status, m.error)
  ), complaint_window as (
    select o.* from ours o order by o.created_at desc limit 1000
  ), bounce_window as (
    select o.* from ours o order by o.created_at desc limit 500
  )
  select jsonb_build_object(
    'complaint_sample', (select count(*) from complaint_window),
    'complaints', (select count(*) from complaint_window where meta->'email' ? 'complained_at'),
    'bounce_sample', (select count(*) from bounce_window),
    'bounces', (select count(*) from bounce_window where status = 'failed' and error->>'provider' = 'bounced'))
$$;
revoke execute on function public.email_offer_counts(uuid, text) from public, anon, authenticated;
grant execute on function public.email_offer_counts(uuid, text) to service_role;
comment on function public.email_offer_counts(uuid, text) is
  'What the gates on offers by email are judged by (contracts'' OFFER_GATES): of the emails that left from this host in the last 90 days and since the workspace''s last resume (mailboxes.offers_resumed_at), the last 1,000 (complaint_sample) and the complaints among them, and the last 500 (bounce_sample) and the hard bounces among them. Service role only.';

/* ------------------------------------------------------------- the email yes -- */

create or replace function public.set_email_offers_yes(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_source text,
  p_message_id uuid default null,
  p_evidence jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact  public.contacts%rowtype;
  v_previous text;
begin
  -- A yes to offers is in writing and only in writing (00100): their own message, or a form they signed.
  if p_source is null or p_source not in ('customer_message', 'form') then
    raise exception 'set_email_offers_yes records a yes given in writing: customer_message or form' using errcode = '22023';
  end if;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  if not found then
    return jsonb_build_object('changed', false, 'found', false);
  end if;
  -- A person who asked to be forgotten, or is being, is written nothing.
  if v_contact.erased_at is not null or v_contact.erasing_since is not null then
    return jsonb_build_object('changed', false, 'found', true);
  end if;
  -- An unsubscribe is the person's no, and a yes in an email NEVER overwrites it: the message that says YES OFFERS may be
  -- forged, mis-sent or old, and nothing but the person's own act (the owner's, on their page, or a form they sign afresh:
  -- neither of which writes through this function) may put offers back on for someone who pressed Unsubscribe. A refusal,
  -- said by name so the caller can log it.
  if v_contact.email_marketing = 'opted_out' then
    return jsonb_build_object('changed', false, 'found', true, 'refused', 'unsubscribed');
  end if;
  -- Once: a yes already given writes no second event.
  if v_contact.email_marketing = 'opted_in' then
    return jsonb_build_object('changed', false, 'found', true);
  end if;
  v_previous := v_contact.email_marketing;
  update public.contacts
     set email_marketing = 'opted_in', email_marketing_source = p_source, email_marketing_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id;
  -- The door's own facts are written last, so no evidence handed in can say another purpose or answer; the channel is
  -- email, whatever the evidence says (a yes by email is a yes on that channel).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          coalesce(p_evidence, '{}'::jsonb)
          || jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_in', 'source', p_source,
                                'previous', v_previous, 'channel', 'email')
          || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);
  return jsonb_build_object('changed', true, 'found', true);
end $$;
revoke execute on function public.set_email_offers_yes(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_offers_yes(uuid, uuid, text, uuid, jsonb) to service_role;
comment on function public.set_email_offers_yes(uuid, uuid, text, uuid, jsonb) is
  'The email yes: a person who asked for offers by email in writing (YES OFFERS in their own message, or a form they signed) is opted_in to them (contacts.email_marketing), once, with a contact.consent_changed event of purpose email_marketing and the channel email as its evidence. A person erased or being erased is left alone, and so is one who unsubscribed (email_marketing opted_out): a yes never overwrites that no, and the answer says refused: unsubscribed. The caller proves the sender before it asks (the receiving side''s authentication of the From domain: channels senderAuthenticated). Service role only.';

/* --------------------------------------------------------- stop all messages -- */

-- The unsubscribe page's second, confirmed act (spec 4.6): a person who pressed Unsubscribe and then "Stop all messages"
-- has said STOP, and it is recorded as ingest_inbound records one (consent opted_out and do-not-contact, their own message,
-- the ledger entry that says so), on the channel they said it on. The email unsubscribe is recorded with it, once.
create or replace function public.stop_all_messages(p_tenant_id uuid, p_contact_id uuid, p_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact  public.contacts%rowtype;
  v_changed  boolean := false;
  v_business text;
begin
  select t.name into v_business from public.tenants t where t.id = p_tenant_id;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  if not found then
    return jsonb_build_object('changed', false, 'found', false, 'business', v_business);
  end if;
  if v_contact.erased_at is not null then
    return jsonb_build_object('changed', false, 'found', true, 'business', v_business);
  end if;
  if v_contact.consent is distinct from 'opted_out' or v_contact.dnc is not true then
    update public.contacts
       set consent = 'opted_out', dnc = true, consent_source = 'customer_message', consent_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            jsonb_build_object('consent', 'opted_out', 'previous', v_contact.consent, 'source', 'customer_message',
                               'channel', 'email', 'words', 'Stop all messages', 'via', 'unsubscribe_page')
            || case when p_message_id is null then '{}'::jsonb else jsonb_build_object('message_id', p_message_id) end);
    v_changed := true;
  end if;
  -- They said no to emails too: the same door the link's first press writes through (a repeat changes nothing).
  perform public.set_email_marketing(p_tenant_id, p_contact_id, 'opted_out', 'unsubscribe', p_message_id,
                                     jsonb_build_object('channel', 'email', 'via', 'stop_all'));
  return jsonb_build_object('changed', v_changed, 'found', true, 'business', v_business);
end $$;
revoke execute on function public.stop_all_messages(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stop_all_messages(uuid, uuid, uuid) to service_role;
comment on function public.stop_all_messages(uuid, uuid, uuid) is
  'The unsubscribe page''s second, confirmed act: STOP for everything, recorded as ingest_inbound records one (consent opted_out and do-not-contact, source customer_message, channel email, a contact.consent_changed event), and the email unsubscribe through set_email_marketing. Once: a repeat writes nothing. Service role only.';

/* ------------------------------------------------------------ the reach count -- */

-- Setup's count of the people an offer by email would reach: an address that has not stopped, no STOP or do-not-contact, no
-- unsubscribe, and their own yes or a relationship on record: contracts' mayMessageFor for (email, marketing) and
-- whyNotReceive's address, in SQL. Under the caller's row security, as the count it sits beside.
create or replace function public.offers_email_reach(p_tenant_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::int
    from public.contacts c
   where c.tenant_id = p_tenant_id
     and c.erased_at is null and c.erasing_since is null and c.merged_into_contact_id is null
     and c.email is not null and c.email_suppressed_at is null
     and c.dnc = false and c.consent is distinct from 'opted_out'
     -- A recorded no to offers elsewhere (on WhatsApp) bars an offer by email too: the conservative reading, contracts'
     -- mayMessageFor, which holds it even over a yes to offers by email.
     and c.marketing_consent is distinct from 'opted_out'
     and (c.email_marketing = 'opted_in' or (c.email_marketing = 'unknown' and public.has_relationship(c)))
$$;
revoke execute on function public.offers_email_reach(uuid) from public, anon;
grant execute on function public.offers_email_reach(uuid) to authenticated, service_role;
comment on function public.offers_email_reach(uuid) is
  'How many people an offer by email would reach in this workspace (Setup): an address that has not bounced or complained, no STOP, do-not-contact, unsubscribe or recorded no to offers (on WhatsApp), and their own yes to offers by email or a relationship on record (has_relationship). Contracts'' mayMessageFor for (email, marketing), in SQL.';

/* ------------------------------------------------------------- people_list -- */

-- Its return type changes, so the function is dropped and made again, with the grants and the comment 00287 gave it.
drop function if exists public.people_list(uuid, uuid, text, integer, integer, timestamptz, timestamptz, uuid);

create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0,
                                              p_after_at timestamptz default null, p_after_added timestamptz default null, p_after_id uuid default null)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  email                   text,
  -- When that address stopped being sent to (00126: a permanent bounce, a complaint, the provider's own suppression), or
  -- null: a campaign does not pick email for a person whose address is dead, so the door never has to refuse them.
  email_suppressed_at     timestamptz,
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
  -- Email's own answer about offers (00174), how it was given and when (00288): People's rows judge an offer by email by it.
  email_marketing              text,
  email_marketing_source       text,
  email_marketing_updated_at   timestamptz,
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
  -- The wire of that message (00287): the channel they last wrote on, which a campaign reaches them on first.
  last_inbound_channel    text,
  -- When they last wrote words that were a person's own (00288): last_inbound_at less an automatic reply, a list's mail and a
  -- delivery report (message_is_a_persons_words). The one fact of "they wrote" that relationshipOnRecord reads.
  last_wrote_at           timestamptz,
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
           e.at, e.moved_in as backfill, e.spoken,
           -- Whether the words are a person's own, not an automatic reply or a list's mail (00288).
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
    lm.at, lm.direction, lm.sender,
    li.body, li.at, li.channel,
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
    -- What each yes covers, when offers were asked for (00286), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at,
           k.email_marketing, k.email_marketing_source, k.email_marketing_updated_at
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
    select e.at, e.body, e.channel
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
           -- When they last wrote words of their own (00288), the statement has_relationship makes of "they wrote".
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
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, import, manual); else a history moved in from before the database says how it began, in the thread''s own order (a call''s note is call, anything else its wire; import only when it names none); else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_contact_id names one person, their row alone. The page is chosen before it is read (0021, people_page): its people come from person_moments in one whole order, latest contact first (in_touch_at, -infinity for never), then the newest added (added_at), then the id, falling, at most p_limit (1000) of them after p_offset or after the cursor p_after_at, p_after_added, p_after_id (the last row''s in_touch_at, added_at and id); every other column is read for them alone. The deal_* columns carry the newest open or current deal, else the newest of any (0004), with its link, its valid-until day and why they passed (0008). The step_* columns carry their next step: the earliest open note with a day (0007, amended), by its day and then as written. `consent_channels` and `marketing_channels` are the channels each yes covers (00286; null: a yes recorded before the channels were kept, which covers WhatsApp alone) and `offers_asked_at` is when the receptionist first asked for the yes to offers. `last_inbound_channel` is the channel of the last written message they sent (whatsapp, sms or email; null when they have sent none): the channel a campaign reaches them on first (00287, contracts'' reachFor). `last_wrote_at` is when they last wrote words that were a person''s own, an automatic reply, a list''s mail or a delivery report left out (00288, message_is_a_persons_words): the fact of "they wrote" that contracts'' relationshipOnRecord reads. `email_suppressed_at` is when their address stopped being sent to (a bounce, a complaint; null while it is good): a campaign does not pick email for a person who has it. `email_marketing`, `email_marketing_source` and `email_marketing_updated_at` are the person''s own answer about offers by email (00174, 00288): an offer by email goes to someone who has not unsubscribed and who asked for offers by email or has a relationship with the business on record (contracts'' mayMessageFor).';
