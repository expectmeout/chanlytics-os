-- 00484 · A thread keeps when each wire last heard from its person (decision 0001, step 4).
--
-- The reply window is a per-channel rule (contracts replyWindow), and the fact it needs is when this person last wrote
-- on that wire. Until now that fact was one WhatsApp column, conversations.last_wa_inbound_at, written for WhatsApp
-- alone. A second wire with its own window (a Meta DM's, step 8) would have meant a second column.
--
--   conversation_channel_state   One row a thread and wire: when the person last wrote on it. Members read their
--                                workspace's; ingest_inbound writes it for every message it takes in, and merge_people
--                                folds a merged thread's rows into the kept one's, the later clock winning on each wire.
--
-- Nothing reads it yet (step 5 moves the readers), and last_wa_inbound_at goes on being written exactly as before, by
-- the same two functions, until step 7 drops it alone, fourteen days after step 5 is on production in both apps (0001's
-- fifth answer). That double write is what makes either deploy order safe: an older edge writes both facts, an older
-- dashboard reads the column, and the column keeps its writer.
--
-- The rows as they stand are written here: WhatsApp's from the column every reader reads today, so the window step 5
-- reads is the window read now; the other wires from the person's own messages. Its key is its own id, as
-- conversation_drafts' is, with one row a thread and wire a unique constraint beside it (a primary key holding both
-- foreign keys would make PostgREST read the table as a join, #1820). A thread deleted takes its rows with it.
--
-- ingest_inbound is copied from its latest migration (00361) and merge_people from its (00451), each with one block
-- added and nothing else changed; `create or replace` keeps their grants, which are restated. Re-runnable throughout.

set local lock_timeout = '3s';

create table if not exists public.conversation_channel_state (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  -- The wires a person writes on: every channel kind but a call (channels InboundMessage).
  channel         text not null check (channel in ('whatsapp', 'sms', 'email', 'instagram')),
  last_inbound_at timestamptz not null,
  constraint conversation_channel_state_one_per_wire unique (tenant_id, conversation_id, channel)
);
comment on table public.conversation_channel_state is
  'When a thread''s person last wrote on each wire (decision 0001, step 4): one row a thread and wire, the fact a per-channel reply window reads. Written by ingest_inbound for every message it takes in, beside conversations.last_wa_inbound_at until step 7; a merged thread''s rows fold into the kept one''s (merge_people). Members read their workspace''s.';

-- The key names the workspace too (00279): a row names only its own workspace's thread, and goes with it.
alter table public.conversation_channel_state drop constraint if exists conversation_channel_state_conversation_same_workspace;
alter table public.conversation_channel_state add constraint conversation_channel_state_conversation_same_workspace
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade;

alter table public.conversation_channel_state enable row level security;
drop policy if exists conversation_channel_state_member_select on public.conversation_channel_state;
create policy conversation_channel_state_member_select on public.conversation_channel_state for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.conversation_channel_state from anon, authenticated;
grant select on public.conversation_channel_state to authenticated;
grant select, insert, update, delete on public.conversation_channel_state to service_role;

-- The fact as it stands. WhatsApp's from the column, exactly: the window step 5 reads is the one every reader reads now.
insert into public.conversation_channel_state (tenant_id, conversation_id, channel, last_inbound_at)
select c.tenant_id, c.id, 'whatsapp', c.last_wa_inbound_at
  from public.conversations c
 where c.last_wa_inbound_at is not null
on conflict on constraint conversation_channel_state_one_per_wire
  do update set last_inbound_at = greatest(public.conversation_channel_state.last_inbound_at, excluded.last_inbound_at);

-- A text's and an email's from the person's own messages, on the clock ingest_inbound keeps: the wire's own time, or
-- when the message was kept.
insert into public.conversation_channel_state (tenant_id, conversation_id, channel, last_inbound_at)
select m.tenant_id, m.conversation_id, m.channel, max(coalesce(m.channel_ts, m.created_at))
  from public.messages m
 where m.direction = 'inbound' and m.sender = 'customer' and m.channel in ('sms', 'email')
 group by m.tenant_id, m.conversation_id, m.channel
on conflict on constraint conversation_channel_state_one_per_wire
  do update set last_inbound_at = greatest(public.conversation_channel_state.last_inbound_at, excluded.last_inbound_at);

create or replace function public.ingest_inbound(p_tenant_id uuid, p_channel text, p_identity_external_id text, p_phone_e164 text, p_wa_profile_name text, p_message_external_id text, p_type text, p_body text, p_channel_ts timestamp with time zone, p_media jsonb DEFAULT NULL::jsonb, p_meta jsonb DEFAULT '{}'::jsonb, p_opt_out boolean DEFAULT false, p_opt_in boolean DEFAULT false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id      uuid;
  v_conversation_id uuid;
  v_message_id      uuid;
  v_state           text;
  v_paused          timestamptz;
  v_prev_wa         timestamptz;
  v_processed       timestamptz;
  v_consent         text;
  v_dnc             boolean;
  v_ts              timestamptz := coalesce(p_channel_ts, now());
  v_person          jsonb;
begin
  -- The person, through the one door (00342, 00344): the wire's identity, the number, and the address when the wire
  -- is email; what they called themselves follows the wire; seen now. The door takes the identity's lock this door
  -- took before it, so two first messages still make one person, and keeps the identity.
  v_person := public.resolve_person(
    p_tenant_id, p_channel, p_identity_external_id, p_phone_e164,
    case when p_channel = 'email'
          and char_length(p_identity_external_id) between 3 and 254
          and p_identity_external_id ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
         then p_identity_external_id end,
    p_wa_profile_name, 'observed', 'inbound', '{}'::jsonb, now());
  v_contact_id := (v_person->>'contact_id')::uuid;

  -- A STOP or a START is written below, once the message is known to be new (00361). The person's row is locked
  -- here, where that write used to be, so the person, the thread and the message are still locked in that order.
  if p_opt_out or p_opt_in then
    perform 1 from contacts where id = v_contact_id for no key update;
  end if;

  -- monotone recency: a replayed/out-of-order old message can never rewind
  insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
  values (p_tenant_id, v_contact_id, v_ts, v_ts)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                  last_inbound_at = greatest(conversations.last_inbound_at, excluded.last_inbound_at)
  returning id, state, paused_until, last_wa_inbound_at
    into v_conversation_id, v_state, v_paused, v_prev_wa;

  -- the atomic replay gate: a duplicate wamid short-circuits BEFORE any
  -- consent/window/metering/reopen side effect
  insert into messages (tenant_id, conversation_id, contact_id, channel, direction, sender,
                        type, body, media, external_id, channel_ts, status, meta)
  values (p_tenant_id, v_conversation_id, v_contact_id, p_channel, 'inbound', 'customer',
          p_type, p_body, p_media, p_message_external_id, p_channel_ts, 'received', p_meta)
  on conflict (tenant_id, external_id) where external_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
    -- Held already: its answer was written when it was kept, and whatever the person has said since stands. What
    -- the caller is told is their consent as it is now.
    select consent, dnc into v_consent, v_dnc from contacts where id = v_contact_id;
    select id, (meta->>'processed_at')::timestamptz
      into v_message_id, v_processed
      from messages
     where tenant_id = p_tenant_id and external_id = p_message_external_id;
    return jsonb_build_object(
      'message_id', v_message_id, 'conversation_id', v_conversation_id,
      'contact_id', v_contact_id, 'is_new', false,
      'processed', v_processed is not null,
      'state', v_state, 'paused_until', v_paused,
      'consent', v_consent, 'dnc', v_dnc);
  end if;

  if p_opt_out then
    update contacts
       set consent = 'opted_out', dnc = true,
           consent_source = 'customer_message', consent_updated_at = now()
     where id = v_contact_id and consent is distinct from 'opted_out';
    if found then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', v_contact_id,
              jsonb_build_object('consent', 'opted_out', 'source', 'customer_message',
                                 'channel', p_channel, 'message_external_id', p_message_external_id,
                                 'words', left(p_body, 80)));
    end if;
  elsif p_opt_in then
    -- The way back. Only an explicit word (START / ALTA / UNSTOP) reaches here,
    -- never an ordinary message — otherwise the block would lift itself the
    -- moment the customer said anything at all.
    update contacts
       set consent = 'opted_in', dnc = false,
           consent_source = 'customer_message', consent_updated_at = now()
     where id = v_contact_id and consent is distinct from 'opted_in';
    if found then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', v_contact_id,
              jsonb_build_object('consent', 'opted_in', 'source', 'customer_message',
                                 'channel', p_channel, 'message_external_id', p_message_external_id,
                                 'words', left(p_body, 80)));
    end if;
  end if;

  -- Read back AFTER the update above, so a STOP arriving in this very batch is
  -- already reflected in what the caller is told.
  select consent, dnc into v_consent, v_dnc from contacts where id = v_contact_id;

  -- a new customer message reopens a closed thread (never overrides a human)
  if v_state in ('archived', 'snoozed') then
    update conversations
       set state = 'open', snooze_until = null
     where id = v_conversation_id;
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'conversation.reopened', 'conversation', 'conversation', v_conversation_id,
            jsonb_build_object('from_state', v_state, 'trigger', 'customer_message'));
    v_state := 'open';
  end if;

  if p_channel = 'whatsapp' then
    -- Meta bills per service conversation; a >24h gap opens a new one (metering).
    if v_prev_wa is null or v_prev_wa < now() - interval '24 hours' then
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'usage.wa_conversation', 'usage', 'conversation', v_conversation_id, '{}'::jsonb);
    end if;
    update conversations
       set last_wa_inbound_at = greatest(coalesce(last_wa_inbound_at, 'epoch'::timestamptz), v_ts)
     where id = v_conversation_id;
  end if;

  -- When this person last wrote on this wire (decision 0001, step 4), for every wire a person writes on, beside
  -- last_wa_inbound_at above, which is written as it was until no reader is left on it (step 7). The same clock the
  -- column takes, and as monotone: a replayed or late message never rewinds it. A wire this door has never taken is
  -- skipped, never refused: the message is already kept.
  if p_channel in ('whatsapp', 'sms', 'email', 'instagram') then
    insert into conversation_channel_state (tenant_id, conversation_id, channel, last_inbound_at)
    values (p_tenant_id, v_conversation_id, p_channel, v_ts)
    on conflict on constraint conversation_channel_state_one_per_wire
      do update set last_inbound_at = greatest(conversation_channel_state.last_inbound_at, excluded.last_inbound_at);
  end if;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'message.received', 'message', 'message', v_message_id,
          jsonb_build_object('channel', p_channel, 'type', p_type));

  return jsonb_build_object(
    'message_id', v_message_id, 'conversation_id', v_conversation_id,
    'contact_id', v_contact_id, 'is_new', true, 'processed', false,
    'state', v_state, 'paused_until', v_paused,
    'consent', v_consent, 'dnc', v_dnc);
end $$;

revoke all on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.ingest_inbound(uuid, text, text, text, text, text, text, text, timestamp with time zone, jsonb, jsonb, boolean, boolean) to service_role;

create or replace function public.merge_people(p_keep uuid, p_merge uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_user     uuid := auth.uid();
  v_tenant   uuid;
  k          public.contacts%rowtype;
  m          public.contacts%rowtype;
  k_conv     public.conversations%rowtype;
  m_conv     public.conversations%rowtype;
  v_stop     boolean;
  v_consent  text;
  v_offers   text;
  v_email    text;
  v_offers_ended boolean;
  v_email_ended  boolean;
  v_take_control boolean;
  v_n        int;
  v_counts   jsonb := '{}'::jsonb;
  v_decision uuid;
  -- Combine (0052): the record we wrote to at a business and the person who answered from their own address there.
  v_combine  boolean := false;
  v_swap     public.contacts%rowtype;
  v_swap_id  uuid;
begin
  -- The caller is auth.uid(), read HERE, never a parameter (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different records to merge.' using errcode = '22023';
  end if;

  -- Both rows, locked in id order, so two merges that name the same pair wait for each other and never deadlock.
  perform 1 from contacts c where c.id in (p_keep, p_merge) order by c.id for update;
  select * into k from contacts where id = p_keep;
  select * into m from contacts where id = p_merge;
  -- A stranger learns nothing: no such record, another workspace's, or not a member, all read as not found (00027).
  if k.id is null or m.id is null or k.tenant_id is distinct from m.tenant_id then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  v_tenant := k.tenant_id;
  if not exists (select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
  -- OWNER, as erase_contact is: it cannot be undone.
  if not exists (
    select 1 from memberships s where s.tenant_id = v_tenant and s.user_id = v_user and s.role = 'owner'
  ) then
    raise exception 'Only an owner can merge two records.' using errcode = '42501';
  end if;

  if k.erased_at is not null or k.erasing_since is not null
     or m.erased_at is not null or m.erasing_since is not null then
    raise exception 'One of these people was deleted, so there is nothing to merge.' using errcode = '22023';
  end if;
  if k.merged_into_contact_id is not null or m.merged_into_contact_id is not null then
    raise exception 'One of these records was already merged into another.' using errcode = '22023';
  end if;
  -- Combine (0052, amending 0028): a stand-in (named for the business, by its lead) that never wrote, and a person who
  -- works at the same lead, are one human: the stand-in's address is the business's, the person's their own. For
  -- exactly this pair two addresses are no sign of two people, and the person is the one kept, with their own name
  -- and address, whichever of the two pages the owner pressed it from.
  v_combine := k.lead_id is not null and k.lead_id = m.lead_id
    and (coalesce(k.name_source, '') = 'lead') <> (coalesce(m.name_source, '') = 'lead')
    and not exists (select 1 from messages x
                     where x.tenant_id = v_tenant and x.direction = 'inbound'
                       and x.contact_id = case when k.name_source = 'lead' then k.id else m.id end);
  if v_combine and k.name_source = 'lead' then
    v_swap := k; k := m; m := v_swap;
    v_swap_id := p_keep; p_keep := p_merge; p_merge := v_swap_id;
  end if;
  if k.phone_e164 is not null and m.phone_e164 is not null and k.phone_e164 <> m.phone_e164 then
    raise exception 'These two records have different phone numbers, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if k.email is not null and m.email is not null and k.email <> m.email and not v_combine then
    raise exception 'These two records have different email addresses, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
      from deals a
      join deals b on b.tenant_id = a.tenant_id and coalesce(b.service, '') = coalesce(a.service, '')
     where a.tenant_id = v_tenant and a.contact_id = p_keep and b.contact_id = p_merge
       and a.stage in ('proposed', 'won') and b.stage in ('proposed', 'won')
  ) then
    raise exception 'Both records have an open deal for the same service. Close or move one of them first.'
      using errcode = '22023';
  end if;

  /* ---- THE MARK FIRST. From here the guard's exception is true for these two threads, and the merged row holds no
     number and no address: one address, one person (contacts_tenant_phone_uq, contacts_tenant_email_uq), and the
     inbound door, which finds a person by identity and then by number, cannot find the merged row again. Its
     answers are read into the kept record below (k and m hold them) and cleared here, so one person is counted
     once wherever a count reads the table. */
  update contacts
     set merged_into_contact_id = p_keep, phone_e164 = null, email = null,
         consent = 'unknown', consent_source = null, consent_updated_at = null, dnc = false,
         consent_channels = '{}'::text[],
         marketing_consent = 'unknown', marketing_consent_source = null, marketing_consent_updated_at = null,
         marketing_channels = '{}'::text[], offers_asked_at = null,
         email_marketing = 'unknown', email_marketing_source = null, email_marketing_updated_at = null
   where id = p_merge;

  update contact_identities set contact_id = p_keep
   where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('identities', v_n);

  /* ---- THE THREAD. One per person (conversations_tenant_id_contact_id_key). */
  select * into k_conv from conversations where tenant_id = v_tenant and contact_id = p_keep for update;
  select * into m_conv from conversations where tenant_id = v_tenant and contact_id = p_merge for update;
  if m_conv.id is not null and k_conv.id is null then
    -- The kept person had none: the merged one's thread is theirs, whole.
    update conversations set contact_id = p_keep where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'taken');
  elsif m_conv.id is not null then
    -- One open escalation per thread (escalations_one_open): where both had one, the kept thread's stands and the
    -- merged thread's is resolved by the owner who merged them.
    if exists (select 1 from escalations e where e.conversation_id = k_conv.id and e.state = 'open') then
      update escalations
         set state = 'resolved', resolved_by_user_id = v_user
       where tenant_id = v_tenant and conversation_id = m_conv.id and state = 'open';
    end if;
    update escalations set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update messages set conversation_id = k_conv.id, contact_id = p_keep
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('messages', v_n);
    update calls set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    update sequence_replies set conversation_id = k_conv.id
     where tenant_id = v_tenant and conversation_id = m_conv.id;
    -- The reply turn is the thread's own (one row per thread): a reply being written on the merged thread goes on
    -- as the kept thread's where the kept thread holds none, and the kept thread's own stands otherwise.
    update reply_turns set conversation_id = k_conv.id
     where conversation_id = m_conv.id
       and not exists (select 1 from reply_turns t where t.conversation_id = k_conv.id);
    delete from reply_turns where conversation_id = m_conv.id;
    -- Nothing scheduled or running may name a thread that is about to stop existing: it names the kept one.
    update jobs
       set payload = payload || jsonb_build_object('conversation_id', k_conv.id::text)
     where tenant_id = v_tenant and state in ('scheduled', 'fired')
       and payload->>'conversation_id' = m_conv.id::text;
    update decisions set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update events set subject_id = k_conv.id
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id;
    update notifications set subject_id = k_conv.id::text
     where tenant_id = v_tenant and subject_type = 'conversation' and subject_id = m_conv.id::text;
    update notifications set route = 'inbox/th-' || k_conv.id::text
     where tenant_id = v_tenant and route = 'inbox/th-' || m_conv.id::text;
    -- The kept thread takes the later of each clock, stays held if either was (a hold with no end stays one), is
    -- as open as the more open one, keeps who it was assigned to, and is answered by whoever was answering either
    -- (the later hold on it wins: a person typing, or a call in progress).
    v_take_control := k_conv.control_kind is null
                      or (m_conv.control_until is not null and m_conv.control_until > k_conv.control_until);
    update conversations
       set last_message_at    = greatest(k_conv.last_message_at, m_conv.last_message_at),
           last_inbound_at    = greatest(k_conv.last_inbound_at, m_conv.last_inbound_at),
           last_wa_inbound_at = greatest(k_conv.last_wa_inbound_at, m_conv.last_wa_inbound_at),
           paused_until       = case
                                  when (k_conv.state = 'needs_human' and k_conv.paused_until is null)
                                    or (m_conv.state = 'needs_human' and m_conv.paused_until is null) then null
                                  else greatest(k_conv.paused_until, m_conv.paused_until)
                                end,
           assignee_user_id   = coalesce(k_conv.assignee_user_id, m_conv.assignee_user_id),
           control_kind       = case when v_take_control then m_conv.control_kind else k_conv.control_kind end,
           control_by         = case when v_take_control then m_conv.control_by else k_conv.control_by end,
           control_ref        = case when v_take_control then m_conv.control_ref else k_conv.control_ref end,
           control_until      = case when v_take_control then m_conv.control_until else k_conv.control_until end,
           state = case
                     when 'needs_human' in (k_conv.state, m_conv.state) then 'needs_human'
                     when 'open' in (k_conv.state, m_conv.state) then 'open'
                     when 'snoozed' in (k_conv.state, m_conv.state) then 'snoozed'
                     else 'archived'
                   end,
           snooze_until = case
                            when 'needs_human' in (k_conv.state, m_conv.state)
                              or 'open' in (k_conv.state, m_conv.state) then null
                            else greatest(k_conv.snooze_until, m_conv.snooze_until)
                          end
     where id = k_conv.id;
    -- When this person last wrote on each wire (decision 0001, step 4): the kept thread takes the later of each, as it
    -- takes last_wa_inbound_at above. The merged thread's own rows go with it.
    insert into conversation_channel_state (tenant_id, conversation_id, channel, last_inbound_at)
    select s.tenant_id, k_conv.id, s.channel, s.last_inbound_at
      from conversation_channel_state s
     where s.tenant_id = v_tenant and s.conversation_id = m_conv.id
    on conflict on constraint conversation_channel_state_one_per_wire
      do update set last_inbound_at = greatest(conversation_channel_state.last_inbound_at, excluded.last_inbound_at);
    delete from conversations where id = m_conv.id;
    v_counts := v_counts || jsonb_build_object('threads', 'folded');
  end if;

  /* ---- THE PERSON'S OWN ROWS. */
  update messages set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update calls set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('calls', v_n);
  update deals set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('deals', v_n);
  update leads set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  -- Their visits (00345), whatever made them: no key of appointments names its person, so every one moves.
  update appointments set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('appointments', v_n);
  -- A reach-out's note is kept once per person and send (person_notes_reach_out_once): one the kept person already
  -- holds stays with the merged row.
  update person_notes n set contact_id = p_keep
   where n.tenant_id = v_tenant and n.contact_id = p_merge
     and not (n.source = 'reach_out' and exists (
       select 1 from person_notes h
        where h.contact_id = p_keep and h.source = 'reach_out' and h.source_id = n.source_id));
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', v_n);
  update sequence_sends set contact_id = p_keep where sequence_sends.lead_id is not null and ( tenant_id = v_tenant and contact_id = p_merge);
  update sequence_replies set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update sequence_replies set lead_contact_id = p_keep where tenant_id = v_tenant and lead_contact_id = p_merge;
  -- A list holds a person once (segment_members_pkey): the kept person joins the lists they were not on.
  insert into segment_members (segment_id, contact_id, tenant_id, added_by, added_at)
  select s.segment_id, p_keep, s.tenant_id, s.added_by, s.added_at
    from segment_members s
   where s.tenant_id = v_tenant and s.contact_id = p_merge
  on conflict (segment_id, contact_id) do nothing;
  delete from segment_members where tenant_id = v_tenant and contact_id = p_merge;
  -- A run names a person once (broadcast_recipients_pkey): a run both were on keeps the merged row's line as it is.
  update sequence_sends r set contact_id = p_keep
   where r.lead_id is null and ( r.tenant_id = v_tenant and r.contact_id = p_merge
     and not exists (
       select 1 from sequence_sends h where h.lead_id is null and ( h.batch_id = r.batch_id and h.contact_id = p_keep)));
  -- A person's own receptionist mode, one per class. A policy row keeps
  -- its subject for life (00029's guard), so the kept person gets a row of their own and the merged one's goes.
  insert into policies (tenant_id, class, mode, subject_type, subject_id, limits)
  select p.tenant_id, p.class, p.mode, 'contact', p_keep, p.limits
    from policies p
   where p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge
     and not exists (
       select 1 from policies h
        where h.tenant_id = v_tenant and h.class = p.class and h.subject_type = 'contact' and h.subject_id = p_keep);
  -- Where both set one for a class, the stricter stands (never over ask over veto over auto): the most careful answer.
  update policies h
     set mode = p.mode
    from policies p
   where h.tenant_id = v_tenant and h.subject_type = 'contact' and h.subject_id = p_keep
     and p.tenant_id = v_tenant and p.subject_type = 'contact' and p.subject_id = p_merge and p.class = h.class
     and array_position(array['auto', 'veto', 'ask', 'never'], p.mode)
       > array_position(array['auto', 'veto', 'ask', 'never'], h.mode);
  delete from policies where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  -- The ledger and the audit are the person's: what the merged record answered, and what was decided about it.
  update events set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update decisions set subject_id = p_keep
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge;
  update notifications set subject_id = p_keep::text
   where tenant_id = v_tenant and subject_type = 'contact' and subject_id = p_merge::text;
  update jobs
     set payload = payload || jsonb_build_object('contact_id', p_keep::text)
   where tenant_id = v_tenant and state in ('scheduled', 'fired') and payload->>'contact_id' = p_merge::text;

  /* ---- CONSENT (D5): the most careful answer wins on each question. contracts' mergedAnswers is this, case by case. */
  v_stop := k.consent = 'opted_out' or k.dnc or m.consent = 'opted_out' or m.dnc;
  v_consent := case
                 when v_stop then 'opted_out'
                 when 'opted_in' in (k.consent, m.consent) then 'opted_in'
                 else 'unknown'
               end;
  v_offers := case
                when 'opted_out' in (k.marketing_consent, m.marketing_consent) then 'opted_out'
                when v_stop then 'unknown'
                when 'opted_in' in (k.marketing_consent, m.marketing_consent) then 'opted_in'
                else 'unknown'
              end;
  v_email := case
               when 'opted_out' in (k.email_marketing, m.email_marketing) then 'opted_out'
               when v_stop then 'unknown'
               when 'opted_in' in (k.email_marketing, m.email_marketing) then 'opted_in'
               else 'unknown'
             end;

  -- A yes that ends here because the merged person is stopped: how 00323 says a yes ended.
  v_offers_ended := v_offers = 'unknown' and 'opted_in' in (k.marketing_consent, m.marketing_consent);
  v_email_ended := v_email = 'unknown' and 'opted_in' in (k.email_marketing, m.email_marketing);

  -- The ledger first: 00297's trigger on each entry rewrites the channel lists, and the update below is the last word.
  if v_consent is distinct from k.consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('consent', v_consent, 'previous', k.consent, 'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_offers is distinct from k.marketing_consent then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'marketing', 'consent', v_offers, 'previous', k.marketing_consent,
                               'source', 'merge', 'merged_from', p_merge));
  end if;
  if v_email is distinct from k.email_marketing then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_keep,
            jsonb_build_object('purpose', 'email_marketing', 'consent', v_email, 'previous', k.email_marketing,
                               'source', 'merge', 'merged_from', p_merge, 'channel', 'email'));
  end if;

  /* ---- THE KEPT RECORD, in one statement: what it lacked, and the answers. Each answer keeps how and when it was
     given from the record that gave it; a yes a stop ended says so as 00323 does; an answer neither record gave as it
     now stands (a stop held by do-not-contact alone) says the merge. */
  update contacts
     set phone_e164      = coalesce(k.phone_e164, m.phone_e164),
         email           = coalesce(k.email, m.email),
         -- The name (00420): a Combine's kept person keeps their own, or none, never the business's the record we wrote
         -- to was named for; any other merge fills an empty name from the other record, with where it came from and
         -- whether a member settled it, so a name a member typed is not taken for one the wire gave.
         display_name    = case when v_combine then k.display_name else coalesce(k.display_name, m.display_name) end,
         name_source     = case when v_combine or k.display_name is not null then k.name_source else m.name_source end,
         name_settled_at = case when v_combine or k.display_name is not null then k.name_settled_at
                                else m.name_settled_at end,
         wa_profile_name = coalesce(k.wa_profile_name, m.wa_profile_name),
         notes           = coalesce(k.notes, m.notes),
         proposal_url    = coalesce(k.proposal_url, m.proposal_url),
         first_seen_at   = least(k.first_seen_at, m.first_seen_at),
         last_seen_at    = greatest(k.last_seen_at, m.last_seen_at),
         acquired_via    = case when k.acquired_via is not null then k.acquired_via else m.acquired_via end,
         acquired_ref    = case when k.acquired_via is not null then k.acquired_ref else m.acquired_ref end,
         consent         = v_consent,
         dnc             = v_stop,
         consent_source  = case
                             when k.consent = v_consent then k.consent_source
                             when m.consent = v_consent then m.consent_source
                             else 'merge'
                           end,
         consent_updated_at = case
                                when k.consent = v_consent then k.consent_updated_at
                                when m.consent = v_consent then m.consent_updated_at
                                else now()
                              end,
         consent_channels = case
                              when v_consent <> 'opted_in' then '{}'::text[]
                              else public.consent_channels_union(
                                case when k.consent = 'opted_in' then coalesce(k.consent_channels, '{whatsapp}') end,
                                case when m.consent = 'opted_in' then coalesce(m.consent_channels, '{whatsapp}') end)
                            end,
         marketing_consent = v_offers,
         marketing_consent_source = case
                                      when v_offers_ended then 'stop'
                                      when k.marketing_consent = v_offers then k.marketing_consent_source
                                      else m.marketing_consent_source
                                    end,
         marketing_consent_updated_at = case
                                          when v_offers_ended then now()
                                          when k.marketing_consent = v_offers then k.marketing_consent_updated_at
                                          else m.marketing_consent_updated_at
                                        end,
         marketing_channels = case
                                when v_offers <> 'opted_in' then '{}'::text[]
                                else public.consent_channels_union(
                                  case when k.marketing_consent = 'opted_in'
                                       then coalesce(k.marketing_channels, '{whatsapp}') end,
                                  case when m.marketing_consent = 'opted_in'
                                       then coalesce(m.marketing_channels, '{whatsapp}') end)
                              end,
         email_marketing = v_email,
         email_marketing_source = case
                                    when v_email_ended then 'stop'
                                    when k.email_marketing = v_email then k.email_marketing_source
                                    else m.email_marketing_source
                                  end,
         email_marketing_updated_at = case
                                        when v_email_ended then now()
                                        when k.email_marketing = v_email then k.email_marketing_updated_at
                                        else m.email_marketing_updated_at
                                      end,
         offers_asked_at = least(k.offers_asked_at, m.offers_asked_at)
   where id = p_keep;
  -- A suppressed address stays suppressed. Taking the address clears the flag (a changed address is a new one to the
  -- trigger), so it is put back in a statement that does not name the address.
  if k.email is null and m.email is not null and m.email_suppressed_at is not null then
    update contacts
       set email_suppressed_at = m.email_suppressed_at, email_suppressed_reason = m.email_suppressed_reason
     where id = p_keep;
  end if;

  -- What the lists page by (0021), for both rows: the kept person's moments now hold the merged one's words and calls.
  perform public.person_moments_recompute(array[p_keep, p_merge]);

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.merged', 'contact', 'contact', p_keep,
          v_counts || jsonb_build_object('merged', p_merge) || case when v_combine then jsonb_build_object('combine', true) else '{}'::jsonb end);
  insert into decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_keep, 'merge', 'user', v_user,
          jsonb_build_object('merged', p_merge, 'counts', v_counts))
  returning id into v_decision;

  return jsonb_build_object(
    'contact_id', p_keep, 'merged', p_merge, 'tenant_id', v_tenant, 'decision_id', v_decision,
    'consent', v_consent, 'marketing_consent', v_offers, 'email_marketing', v_email, 'counts', v_counts);
end $$;

revoke all on function public.merge_people(uuid, uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated, service_role;
