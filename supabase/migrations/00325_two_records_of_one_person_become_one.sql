-- 00325 · Two records of one person become one.
--
-- An email from an address nobody holds makes a new person (packages/db ingestInboundEmail), and that person may be one
-- the workspace already knows by their phone. The two rows then answer apart: a STOP on WhatsApp left the email twin
-- free to be written to (the 4 Oct wiring review, P1 5). contacts.merged_into_contact_id has been on the table since
-- 00002 and nothing wrote it. This is the door that does: docs/decisions/0028-two-records-of-one-person-become-one.md.
--
--   merge_people(p_keep, p_merge)   an owner's act, one transaction. The kept record takes the other's identities, its
--                                   thread's messages, calls, escalations and reach-out replies, its deals, leads,
--                                   notes, list memberships, receptionist mode and ledger. The other is left marked
--                                   (merged_into_contact_id), with no number and no address. Never deleted, never
--                                   undone.
--   messages_guard                  00177's, with ONE exception to "a message never changes thread": into the thread of
--                                   the person its own was merged into.
--   decisions_verb_check            00277's list, with 'merge'.
--   erase_contact                   00151's, erasing the records merged into the person with them.
--
-- CONSENT is the review's decision D5: the most careful answer wins on each question. A stop on either is a stop. A no
-- to offers wins, and so does an unsubscribe; a yes survives only where neither said no and nobody is stopped, and the
-- channels it covers join. contracts' mergedAnswers says the same rule, and people/merge/merge-people.db.test.mjs holds the
-- two equal case by case. Each answer that changes on the kept record is written to the ledger with the source 'merge'
-- (a list of channels that only widens is not a change of answer and writes none). A yes to offers that ends because
-- the person is stopped keeps 00323's source on the row, so a START on WhatsApp says how to get offers again.
--
-- REFUSED, each in a sentence contracts holds too (MERGE_REFUSALS): two different phone numbers or two different email
-- addresses (they may be two people); a record that is erased, being erased or already merged; two open deals for one
-- service.
--
-- Either deploy order works: nothing calls the door until the route does, and the guard refuses exactly what it
-- refused for every row no merge has touched. Re-runnable: the constraint is dropped first, the functions replaced.

/* ----------------------------------------------------------------------------------------------- the verb -- */

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check check (
  verb = any (array[
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over',
    'hand_back', 'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent',
    'resume_agent', 'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase',
    'whisper', 'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast', 'start_playbook',
    'pause_playbook', 'reply_review', 'export', 'end_call', 'record_deal', 'make_list',
    'rename_list', 'change_list_rule', 'add_to_list', 'drop_from_list', 'archive_list', 'restore_list',
    'delete_list', 'import', 'open_recording', 'merge'
  ])
);

/* ---------------------------------------------------------------------------------------------- the guard -- */

create or replace function public.messages_guard() returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_rank int;
  new_rank int;
  unknown  boolean;
begin
  -- A message never changes thread, with one exception (00325, decision 0028): into the thread of the person its
  -- own was merged into. Read from the rows, never from a setting: merged_into_contact_id is written by merge_people
  -- alone, so the exception is true only inside a merge and for exactly the two threads it folds.
  if (NEW.conversation_id is distinct from OLD.conversation_id
      and not exists (
        select 1
          from public.conversations was
          join public.contacts gone on gone.id = was.contact_id and gone.tenant_id = was.tenant_id
          join public.conversations kept on kept.tenant_id = was.tenant_id and kept.contact_id = gone.merged_into_contact_id
         where was.id = OLD.conversation_id and kept.id = NEW.conversation_id))
     or NEW.tenant_id   is distinct from OLD.tenant_id
     or NEW.channel     is distinct from OLD.channel
     or NEW.direction   is distinct from OLD.direction
     or NEW.sender      is distinct from OLD.sender
     or NEW.type        is distinct from OLD.type
     or NEW.body        is distinct from OLD.body
     or NEW.template_name is distinct from OLD.template_name
     or NEW.channel_ts  is distinct from OLD.channel_ts
     or NEW.created_at  is distinct from OLD.created_at
     or (OLD.external_id is not null and NEW.external_id is distinct from OLD.external_id)
  then
    raise exception 'messages content columns are immutable (P3)';
  end if;
  -- Terminal, but for one row: an email whose send timed out (00177). The provider may have taken it, so its
  -- receipt may still say what became of it; until one does, it stays failed with outcome 'unknown'.
  unknown := OLD.status = 'failed' and OLD.channel = 'email' and coalesce(OLD.error->>'outcome', '') = 'unknown';
  if OLD.status in ('failed','canceled') and NEW.status is distinct from OLD.status
     and not (unknown and NEW.status in ('sent', 'delivered', 'read')) then
    raise exception 'messages.status is terminal (% -> % rejected)', OLD.status, NEW.status;
  end if;
  -- A message that has left the building cannot be un-sent. 'canceled' asserts
  -- it never went out; on a delivered row that assertion is false, and it also
  -- hides the row from the bot's own history.
  if OLD.status in ('sent','delivered','read') and NEW.status = 'canceled' then
    raise exception 'a message that was already sent cannot be canceled (% -> % rejected)', OLD.status, NEW.status;
  end if;
  old_rank := case when unknown then 1 else case OLD.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end end;
  new_rank := case NEW.status when 'received' then 0 when 'queued' then 1 when 'sent' then 2
                              when 'delivered' then 3 when 'read' then 4 else 9 end;
  if new_rank < old_rank then
    raise exception 'messages.status is monotone (% -> % rejected)', OLD.status, NEW.status;
  end if;
  if NEW.status is distinct from OLD.status then
    NEW.status_updated_at := now();
    -- Each status keeps its own time: status_updated_at knows only the
    -- latest, and "delivered at 10:32, read at 10:40" is what a recipient's
    -- line on a broadcast shows. meta.status_at.<status> = now(), on the row
    -- the receipt already updates.
    NEW.meta := coalesce(NEW.meta, '{}'::jsonb)
      || jsonb_build_object('status_at',
           coalesce(NEW.meta->'status_at', '{}'::jsonb) || jsonb_build_object(NEW.status, now()));
  end if;
  return NEW;
end $$;

/* ------------------------------------------------------------------------------------------------ erasure -- */

-- 00151's, with the records merged into the person erased with them (they held no answer, no number and no address
-- since the merge, and their rows had moved; what is left is a name and a note, which an erasure must not leave).
create or replace function public.erase_contact(p_contact_id uuid, p_legs jsonb default '{}'::jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  v_tenant        uuid;
  v_erased        timestamptz;
  v_conversations uuid[];
  v_messages      uuid[];
  v_escalations   uuid[];
  v_calls         uuid[];
  v_paths         text[];
  v_subjects      uuid[];
  v_jobs_canceled int := 0;
  v_counts        jsonb;
  v_decision_id   uuid;
begin
  -- The caller is auth.uid(), read HERE. It is not a parameter, so it cannot
  -- be spoofed by anyone who can reach the RPC (00021's rule).
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;

  if p_legs is not null and length(p_legs::text) > 4000 then
    raise exception 'Leg report too large.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at into v_tenant, v_erased
    from contacts c where c.id = p_contact_id;
  if v_tenant is null then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;

  -- A signed-in stranger must not learn that this uuid exists. The lookup
  -- above found the row because this function bypasses RLS, so the membership
  -- test has to restore what RLS would have said: no membership at all is
  -- indistinguishable from no such contact.
  if not exists (
    select 1 from memberships m
     where m.tenant_id = v_tenant and m.user_id = v_user
  ) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;

  -- OWNER, not merely a member. This is the most destructive verb in the
  -- product and it is irreversible; an operator who can reply to a customer
  -- must not be able to delete them.
  if not exists (
    select 1 from memberships m
     where m.tenant_id = v_tenant and m.user_id = v_user and m.role = 'owner'
  ) then
    raise exception 'Only an owner can erase a customer''s data.' using errcode = '42501';
  end if;

  -- Idempotent: a second request is answered, not re-executed. The route uses
  -- this to re-drive the legs it runs itself without destroying anything twice.
  if v_erased is not null then
    return jsonb_build_object(
      'already_erased', true,
      'contact_id',     p_contact_id,
      'tenant_id',      v_tenant,
      'erased_at',      v_erased,
      'storage_paths',  '[]'::jsonb,
      'counts',         '{}'::jsonb);
  end if;

  /* ---- COLLECT FIRST. Everything below this block is destructive, and each
     of these sets is unrecoverable the moment the row it comes from is gone. */

  select coalesce(array_agg(cv.id), '{}') into v_conversations
    from conversations cv
   where cv.tenant_id = v_tenant and cv.contact_id = p_contact_id;

  select coalesce(array_agg(m.id), '{}') into v_messages
    from messages m
   where m.tenant_id = v_tenant
     and (m.contact_id = p_contact_id or m.conversation_id = any (v_conversations));

  select coalesce(array_agg(e.id), '{}') into v_escalations
    from escalations e
   where e.tenant_id = v_tenant and e.conversation_id = any (v_conversations);

  select coalesce(array_agg(k.id), '{}') into v_calls
    from calls k
   where k.tenant_id = v_tenant
     and (k.contact_id = p_contact_id or k.conversation_id = any (v_conversations));

  -- Every private object this person's data put in Storage: the copied call
  -- recording (retell-webhook.ts writes
  -- <tenant>/calls/<call_id>.<ext>) and any inbound media (whatsapp.ts writes
  -- <tenant>/<conversation_id>/<message_id>.<ext>). Returned to the caller,
  -- which is the only party that can talk to the Storage API.
  select coalesce(array_agg(distinct q.p), '{}') into v_paths
    from (
      select k.recording->>'storage_path' as p
        from calls k
       where k.tenant_id = v_tenant
         and (k.contact_id = p_contact_id or k.conversation_id = any (v_conversations))
         and k.recording->>'storage_path' is not null
      union
      select m.media->>'storage_path' as p
        from messages m
       where m.tenant_id = v_tenant
         and (m.contact_id = p_contact_id or m.conversation_id = any (v_conversations))
         and m.media->>'storage_path' is not null
    ) q;

  v_counts := jsonb_build_object(
    'conversations',  coalesce(array_length(v_conversations, 1), 0),
    'messages',       coalesce(array_length(v_messages, 1), 0),
    'escalations',    coalesce(array_length(v_escalations, 1), 0),
    'calls',          coalesce(array_length(v_calls, 1), 0),
    'storage_objects',coalesce(array_length(v_paths, 1), 0));

  /* ---- Nothing scheduled may fire at a thread that is about to stop
     existing. Done HERE, in the same transaction as the delete, rather than by
     the caller beforehand: a job scheduled between the caller's cancel and this
     commit would otherwise survive. Comparison is on text, never
     (payload->>'x')::uuid, because a payload key holding a non-uuid would then
     abort the whole erasure. claim_job is the real gate and refuses anything
     not 'scheduled'.

     NO KIND IS SPARED. One was: the route used to queue a blob_thread_erase
     job before calling this function, and cancelling it would have cancelled
     the leg that removed the second copy of the conversation. There is no
     second copy and no such kind (00151), so every scheduled job that names
     this person is withdrawn -- and its payload scrubbed in the same
     statement (jobs_guard allows a payload change on any row): the number it
     carried must not outlive the row, and a re-driven erasure has no digits
     to find it by. */
  update jobs
     set state = 'canceled', last_error = 'contact erased',
         payload = jsonb_build_object('scrubbed_at', now(), 'reason', 'contact erased')
   where tenant_id = v_tenant
     and state = 'scheduled'
     and (payload->>'conversation_id' = any (v_conversations::text[])
          or payload->>'message_id'   = any (v_messages::text[])
          or payload->>'contact_id'   = p_contact_id::text);
  get diagnostics v_jobs_canceled = row_count;

  /* ---- Calls FIRST and EXPLICITLY. calls.contact_id and calls.conversation_id
     are ON DELETE SET NULL, so letting the contact cascade run would leave
     every one of these rows behind carrying from_e164, from_raw, the verbatim
     transcript, the summary and the recording path -- the defect 00027 was
     written to close, unchanged here. */
  delete from calls
   where tenant_id = v_tenant
     and (contact_id = p_contact_id or conversation_id = any (v_conversations));

  /* ---- Messages EXPLICITLY, before the cascade. The conversation cascade
     reaches only messages inside this contact's own conversations; a message
     carrying this contact_id in someone else's thread is reached by nothing,
     and because the contact row survives as a tombstone the NO ACTION FK never
     raises to tell us. It would simply keep the customer's words.
     calls.message_id is ON DELETE SET NULL, so another contact's call that
     linked one of these notes degrades instead of blocking. */
  delete from messages
   where tenant_id = v_tenant and id = any (v_messages);

  -- The cascade: conversations -> messages -> escalations.
  delete from conversations
   where tenant_id = v_tenant and contact_id = p_contact_id;

  -- Not reached by any cascade now that the contact row survives, and these
  -- carry the wa_id and the caller's E.164 verbatim.
  delete from contact_identities
   where tenant_id = v_tenant and contact_id = p_contact_id;

  /* ---- The free-form half of the ledger.
     verb, subject_type, subject_id, actor and created_at stay: that IS the
     audit. payload is the only operator-shaped column in decisions, and 'edit'
     is a declared verb meaning "the operator changed the words" -- so even
     though every payload written today holds ids and booleans only (verified
     against the live tenant: paused_until, message_id, template, window_open),
     the erasure must not depend on that staying true. */
  v_subjects := array[p_contact_id] || v_conversations || v_messages
                || v_escalations || v_calls;
  update decisions
     set payload = jsonb_build_object('scrubbed_at', now())
   where tenant_id = v_tenant
     and subject_id = any (v_subjects)
     and payload <> '{}'::jsonb;

  /* ---- events.data is deliberately NOT scrubbed. Verified against the live
     tenant, every key is a count or an enum -- call.recorded {direction,status},
     message.received {channel,type}, message.sent {sender},
     usage.voice_seconds {seconds}, conversation.reopened {from_state,trigger} --
     and two of them ARE the billing record. Once the contact, conversation,
     messages and calls are gone, those subject_ids resolve to nothing and the
     only surviving link (subject_type='contact') resolves to a tombstone with
     no identifiers. Deleting them would destroy metering, not personal data.
     tooling/scripts/tests/erasure.integration.test.mjs pins that. */

  /* ---- The tombstone. */
  update contacts
     set phone_e164         = null,
         display_name       = null,
         wa_profile_name    = null,
         consent            = 'unknown',
         consent_source     = 'erasure',
         consent_updated_at = now(),
         dnc                = true,
         erased_at          = now()
   where id = p_contact_id;

  -- The records merged into this person ARE this person (00325, decision 0028): each is erased with them, the way
  -- this row is, so none returns as a person of its own once the pointer no longer matters. Their rows moved here
  -- when they were merged and are gone with these. Tenant-scoped, as every statement here is.
  update contacts
     set phone_e164         = null,
         display_name       = null,
         wa_profile_name    = null,
         notes              = null,
         proposal_url       = null,
         consent            = 'unknown',
         consent_source     = 'erasure',
         consent_updated_at = now(),
         dnc                = true,
         erased_at          = now()
   where tenant_id = v_tenant and merged_into_contact_id = p_contact_id and erased_at is null;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.erased', 'contact', 'contact', p_contact_id,
          v_counts || jsonb_build_object('jobs_canceled', v_jobs_canceled));

  -- The ledger row. p_legs is what the caller already did (the Storage
  -- objects it removed) so one row tells the whole story and a failed leg is
  -- visible without joining anything.
  insert into decisions (tenant_id, subject_type, subject_id, verb,
                         actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_contact_id, 'erase', 'user', v_user,
          jsonb_build_object(
            'counts',        v_counts,
            'jobs_canceled', v_jobs_canceled,
            'storage_paths', to_jsonb(v_paths),
            'legs',          coalesce(p_legs, '{}'::jsonb)))
  returning id into v_decision_id;

  return jsonb_build_object(
    'already_erased', false,
    'contact_id',     p_contact_id,
    'tenant_id',      v_tenant,
    'decision_id',    v_decision_id,
    'storage_paths',  to_jsonb(v_paths),
    'counts',         v_counts,
    'jobs_canceled',  v_jobs_canceled);
end $$;

/* ----------------------------------------------------------------------------------------------- the door -- */

create or replace function public.merge_people(p_keep uuid, p_merge uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  if k.phone_e164 is not null and m.phone_e164 is not null and k.phone_e164 <> m.phone_e164 then
    raise exception 'These two records have different phone numbers, so they may be two people. They can''t be merged.'
      using errcode = '22023';
  end if;
  if k.email is not null and m.email is not null and k.email <> m.email then
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
    update reach_out_replies set conversation_id = k_conv.id
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
  -- A reach-out's note is kept once per person and send (person_notes_reach_out_once): one the kept person already
  -- holds stays with the merged row.
  update person_notes n set contact_id = p_keep
   where n.tenant_id = v_tenant and n.contact_id = p_merge
     and not (n.source = 'reach_out' and exists (
       select 1 from person_notes h
        where h.contact_id = p_keep and h.source = 'reach_out' and h.source_id = n.source_id));
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('notes', v_n);
  update reach_out_sends set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update reach_out_replies set contact_id = p_keep where tenant_id = v_tenant and contact_id = p_merge;
  update reach_out_replies set lead_contact_id = p_keep where tenant_id = v_tenant and lead_contact_id = p_merge;
  -- A list holds a person once (segment_members_pkey): the kept person joins the lists they were not on.
  insert into segment_members (segment_id, contact_id, tenant_id, added_by, added_at)
  select s.segment_id, p_keep, s.tenant_id, s.added_by, s.added_at
    from segment_members s
   where s.tenant_id = v_tenant and s.contact_id = p_merge
  on conflict (segment_id, contact_id) do nothing;
  delete from segment_members where tenant_id = v_tenant and contact_id = p_merge;
  -- A run names a person once (broadcast_recipients_pkey): a run both were on keeps the merged row's line as it is.
  update broadcast_recipients r set contact_id = p_keep
   where r.tenant_id = v_tenant and r.contact_id = p_merge
     and not exists (
       select 1 from broadcast_recipients h where h.broadcast_id = r.broadcast_id and h.contact_id = p_keep);
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
         display_name    = coalesce(k.display_name, m.display_name),
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
          v_counts || jsonb_build_object('merged', p_merge));
  insert into decisions (tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_keep, 'merge', 'user', v_user,
          jsonb_build_object('merged', p_merge, 'counts', v_counts))
  returning id into v_decision;

  return jsonb_build_object(
    'contact_id', p_keep, 'merged', p_merge, 'tenant_id', v_tenant, 'decision_id', v_decision,
    'consent', v_consent, 'marketing_consent', v_offers, 'email_marketing', v_email, 'counts', v_counts);
end $$;

revoke execute on function public.merge_people(uuid, uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated;
comment on function public.merge_people(uuid, uuid) is
  'An owner merges two records of one person (decision 0028): the kept record takes the other''s identities, thread (folded into its own), deals, leads, notes, lists, receptionist mode and ledger; the other is left marked merged_into_contact_id with no number or address. Consent is the most careful answer on each question (D5), each change written to the ledger with the source merge. Refuses two different phone numbers or email addresses, an erased or already merged record, and two open deals for one service. One transaction; never undone. The caller is auth.uid(); a stranger is told not found.';
