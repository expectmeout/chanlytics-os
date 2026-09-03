-- "Delete my data" could not be honoured, and privacy.html promises it.
--
-- apps/edge/public/privacy.html is the Meta-app-review policy the public reads:
-- deletion on verified request within 30 days. There has never been a way to do
-- that. Deleting a contact cascades to contact_identities, conversations,
-- messages and escalations -- but calls_contact_id_fkey and
-- calls_conversation_id_fkey are both ON DELETE SET NULL (verified against the
-- live catalog), so every call row SURVIVES holding from_e164, from_raw, the
-- verbatim transcript, the summary and recording.storage_path. The recording
-- itself and any inbound media stay in the private `media` bucket, and the
-- Vercel Blob thread -- a second full copy of the conversation, outside RLS and
-- outside Postgres -- stays too.
--
-- WHY A TOMBSTONE AND NOT A DELETE. Two foreign keys into contacts are NO
-- ACTION: messages_contact_id_fkey and contacts_merged_into_contact_id_fkey. A
-- hard delete therefore succeeds only while every message carrying a contact_id
-- also lives in that contact's own conversation, which nothing enforces. The
-- row survives with every identifier removed; what remains is a uuid and
-- timestamps, and every decisions.subject_id / events.subject_id naming it
-- still resolves.
--
-- Because the row survives, the NO ACTION message FK no longer raises -- which
-- means a message attributed to this contact but living in ANOTHER contact's
-- conversation would silently SURVIVE the cascade, carrying its body. That is
-- the same scenario the tombstone exists to tolerate, so the messages this
-- contact is attributed to are deleted EXPLICITLY below, before the cascade.
--
-- The CHECK widenings use `check (col in (...))`, never `= any (array[...])`:
-- the two are identical to Postgres and only the first is visible to
-- tooling/scripts/tests/enums-vs-checks.test.mjs, which diffs the latest CHECK
-- in the migration text against packages/contracts/src/enums.ts.

/* --------------------------------------------------------- the tombstone -- */

alter table public.contacts
  add column if not exists erased_at timestamptz;

comment on column public.contacts.erased_at is
  'Set by erase_contact(). The row is a tombstone: no phone, no names, no identities. It exists so decisions.subject_id and events.subject_id still resolve, and so a repeat request is a no-op rather than a second destruction.';

create index if not exists contacts_erased
  on public.contacts (tenant_id, erased_at)
  where erased_at is not null;

/* ------------------------------------------- the second copy needs a job -- */

-- The DASHBOARD orchestrates erasure and cannot reach Vercel Blob; the EDGE
-- holds BLOB_READ_WRITE_TOKEN and cannot publish QStash jobs. A jobs row is the
-- only seam that joins them, and it is durable -- queued before anything is
-- destroyed, so a crash mid-erasure leaves a retryable request rather than an
-- orphaned transcript nobody can find again.
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in (
    'outbound_send', 'veto_fire', 'snooze_wake', 'pause_expire', 'media_fetch',
    'rollup_daily', 'deadman', 'report_weekly', 'broadcast_send',
    'blob_thread_erase'
  ));

/* ------------------------------------------------------- the ledger verb -- */

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase'
  ));

/* ------------------------------------------------------------- the erase -- */

create or replace function public.erase_contact(
  p_contact_id uuid,
  p_legs       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  v_tenant        uuid;
  v_erased        timestamptz;
  v_thread_ids    text[];
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
  -- this to re-drive an outstanding Blob leg without destroying anything twice.
  if v_erased is not null then
    return jsonb_build_object(
      'already_erased', true,
      'contact_id',     p_contact_id,
      'tenant_id',      v_tenant,
      'erased_at',      v_erased,
      'thread_ids',     '[]'::jsonb,
      'storage_paths',  '[]'::jsonb,
      'counts',         '{}'::jsonb);
  end if;

  /* ---- COLLECT FIRST. Everything below this block is destructive, and each
     of these sets is unrecoverable the moment the row it comes from is gone. */

  -- The Blob store is keyed by phone DIGITS (apps/edge/lib/store.ts: the key is
  -- threads/<tenant>/<digits>.json; the WhatsApp path uses the wa_id and the
  -- Retell path strips the leading "+" from from_number). The identities carry
  -- the wa_id and the caller's E.164, which is why they are read before the
  -- cascade removes them.
  select coalesce(array_agg(distinct s.d), '{}') into v_thread_ids
    from (
      select regexp_replace(coalesce(c.phone_e164, ''), '\D', '', 'g') as d
        from contacts c where c.id = p_contact_id
      union
      select regexp_replace(coalesce(ci.external_id, ''), '\D', '', 'g') as d
        from contact_identities ci where ci.contact_id = p_contact_id
    ) s
   where s.d <> '';

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
  -- recording (retell-webhook.ts / backfill-calls.ts write
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
    'storage_objects',coalesce(array_length(v_paths, 1), 0),
    'threads',        coalesce(array_length(v_thread_ids, 1), 0));

  /* ---- Nothing scheduled may fire at a thread that is about to stop
     existing. Done HERE, in the same transaction as the delete, rather than by
     the caller beforehand: a job scheduled between the caller's cancel and this
     commit would otherwise survive. Comparison is on text, never
     (payload->>'x')::uuid, because a payload key holding a non-uuid would then
     abort the whole erasure. QStash still calls the fire endpoint; claim_job is
     the real gate and refuses anything not 'scheduled'.

     `kind <> 'blob_thread_erase'` IS LOAD-BEARING. The route queues the Blob
     job BEFORE calling this function, with { contact_id } in its payload, so
     without this predicate the erasure cancels the one job that removes the
     second full copy of the conversation -- and reports success. Whether it
     did so was a race with QStash's delivery, which is worse than always. */
  update jobs
     set state = 'canceled', last_error = 'contact erased'
   where tenant_id = v_tenant
     and state = 'scheduled'
     and kind <> 'blob_thread_erase'
     and (payload->>'conversation_id' = any (v_conversations::text[])
          or payload->>'message_id'   = any (v_messages::text[])
          or payload->>'contact_id'   = p_contact_id::text);
  get diagnostics v_jobs_canceled = row_count;

  /* ---- Calls FIRST and EXPLICITLY. calls.contact_id and calls.conversation_id
     are ON DELETE SET NULL, so letting the contact cascade run would leave
     every one of these rows behind carrying from_e164, from_raw, the verbatim
     transcript, the summary and the recording path -- the exact defect this
     migration exists to close. */
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

  -- A contact merged INTO this one must stop pointing at it. No merge path
  -- exists today and every value is null; this is here because
  -- contacts_merged_into_contact_id_fkey is NO ACTION and would otherwise be
  -- the thing that breaks the day one does. Tenant-scoped: this function runs
  -- as its owner, so an unscoped predicate would be a cross-tenant write.
  update contacts set merged_into_contact_id = null
   where tenant_id = v_tenant and merged_into_contact_id = p_contact_id;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.erased', 'contact', 'contact', p_contact_id,
          v_counts || jsonb_build_object('jobs_canceled', v_jobs_canceled));

  -- The ledger row. p_legs is what the caller already did (the Blob job it
  -- queued, the Storage objects it removed) so one row tells the whole story
  -- and a failed leg is visible without joining anything.
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
    'thread_ids',     to_jsonb(v_thread_ids),
    'storage_paths',  to_jsonb(v_paths),
    'counts',         v_counts,
    'jobs_canceled',  v_jobs_canceled);
end $$;

comment on function public.erase_contact(uuid, jsonb) is
  'Erase one customer: delete their calls and messages explicitly (the call FKs are SET NULL and the message FK is NO ACTION), cascade the conversation, cancel scheduled jobs except the Blob-erase job itself, scrub decision payloads, and tombstone the contact. Returns the Blob thread keys and Storage paths the caller must remove. Owner-only, checked against auth.uid() inside the body.';

revoke execute on function public.erase_contact(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.erase_contact(uuid, jsonb) to authenticated;

/* ------------------------------ the tombstone must not become a metric ---- */

-- metrics_summary's fresh_contacts CTE scores a contact by the earliest thing
-- it ever said or called, and coalesces "nothing" to 'infinity'. An erased
-- contact has no messages and no calls, so it scores infinity >= v_start and is
-- counted as a NEW CONTACT -- in this window, and in every window, forever. The
-- dashboard would report growth that is a deletion.
--
-- This is 00011_metrics_final.sql lines 20-170 VERBATIM (comments included)
-- apart from ONE added predicate, `and c.erased_at is null`, marked below.

create or replace function public.metrics_summary(p_tenant_id uuid, p_days integer default 1)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tz     text;
  v_name   text;
  v_status text;
  v_days   integer := greatest(coalesce(p_days, 1), 1);
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone, name, status into v_tz, v_name, v_status
    from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_start := (date_trunc('day', now() at time zone v_tz) at time zone v_tz)
             - make_interval(days => v_days - 1);

  with
  -- everything the tenant has ever said or heard, minus the import's
  -- timestamp-less rows: they carry no true event time and can never be
  -- placed on a calendar day.
  real_msgs as (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (select * from real_msgs where created_at >= v_start),
  -- an outbound message counts only once it has actually left
  out_sent as (select * from msgs where direction = 'outbound'
                 and status in ('sent', 'delivered', 'read')),
  replies as (
    select m.created_at as asked_at, m.conversation_id,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'ai'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as ai_at,
           (select min(o.created_at) from real_msgs o
             where o.conversation_id = m.conversation_id
               and o.direction = 'outbound'
               and o.sender = 'human'
               and o.status in ('sent', 'delivered', 'read')
               and o.created_at > m.created_at) as human_at
      from msgs m
     where m.direction = 'inbound' and m.sender = 'customer'
  ),
  calls_win as (
    select * from calls where tenant_id = p_tenant_id and started_at >= v_start
  ),
  fresh_contacts as (
    select c.id from contacts c
     where c.tenant_id = p_tenant_id
       -- ADDED (00026): an erased contact has no messages and no calls, so it
       -- scores 'infinity' below and would be counted as new in every window
       -- from now on. A deletion must never be reported as growth.
       and c.erased_at is null
       and not exists (select 1 from messages b
                        where b.contact_id = c.id
                          and coalesce(b.meta->>'backfill', 'false') = 'true')
       and least(
             coalesce((select min(m.channel_ts) from messages m where m.contact_id = c.id),
                      'infinity'::timestamptz),
             coalesce((select min(k.started_at) from calls k where k.contact_id = c.id),
                      'infinity'::timestamptz)
           ) >= v_start
  ),
  -- live state: whose turn is it? the last thing said in the thread was theirs.
  awaiting as (
    select cv.id from conversations cv
     where cv.tenant_id = p_tenant_id
       and cv.state in ('open', 'needs_human')
       and (select r.sender from real_msgs r
             where r.conversation_id = cv.id
             order by r.created_at desc limit 1) = 'customer'
  )
  select jsonb_build_object(
    'workspace', jsonb_build_object(
      'name', v_name, 'timezone', v_tz, 'status', v_status),

    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', tc.kind, 'status', tc.status, 'number', tc.number_e164)
             order by tc.kind)
        from tenant_channels tc where tc.tenant_id = p_tenant_id), '[]'::jsonb),

    'window', jsonb_build_object(
      'days', v_days,
      'since', v_start,
      'since_local', to_char(v_start at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'now_local',   to_char(now()   at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS')),

    'now', jsonb_build_object(
      'escalations_open', (select count(*) from escalations
                            where tenant_id = p_tenant_id and state = 'open'),
      'oldest_open_escalation_at', (select min(created_at) from escalations
                                     where tenant_id = p_tenant_id and state = 'open'),
      'threads_needing_human', (select count(*) from conversations
                                 where tenant_id = p_tenant_id and state = 'needs_human'),
      'threads_snoozed', (select count(*) from conversations
                           where tenant_id = p_tenant_id and state = 'snoozed'),
      'threads_awaiting_reply', (select count(*) from awaiting),
      'last_inbound_at',  (select max(coalesce(channel_ts, created_at)) from real_msgs
                            where direction = 'inbound' and sender = 'customer'),
      'last_outbound_at', (select max(created_at) from real_msgs
                            where direction = 'outbound'
                              and status in ('sent', 'delivered', 'read'))),

    'period', jsonb_build_object(
      'messages_in',  (select count(*) from msgs where direction = 'inbound' and sender = 'customer'),
      'messages_out_ai',  (select count(*) from out_sent where sender = 'ai'),
      'messages_out_you', (select count(*) from out_sent where sender = 'human'),
      'conversations_active',
        (select count(distinct conversation_id) from msgs
          where direction = 'inbound' and sender = 'customer'),

      'answered_by_ai',  (select count(*) from replies where ai_at is not null),
      'answered_by_you', (select count(*) from replies where human_at is not null),
      'unanswered_in_window',
        (select count(*) from replies where ai_at is null and human_at is null),
      'median_reply_seconds_ai',
        (select round(percentile_cont(0.5) within group (
                  order by extract(epoch from (ai_at - asked_at))))
           from replies where ai_at is not null),

      'send_failures', (select count(*) from msgs
                         where direction = 'outbound' and status = 'failed'),

      'escalations_new', (select count(*) from escalations
                           where tenant_id = p_tenant_id and created_at >= v_start),
      'escalation_reasons',
        coalesce((select jsonb_object_agg(reason, n) from (
          select reason, count(*) as n from escalations
           where tenant_id = p_tenant_id and state = 'open'
           group by reason) r), '{}'::jsonb),

      'calls',        (select count(*) from calls_win),
      'call_seconds', (select coalesce(round(sum(duration_ms) / 1000.0), 0) from calls_win),
      'call_sentiments',
        coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
          select sentiment, count(*) as n from calls_win group by sentiment) s), '{}'::jsonb),
      'calls_voicemail', (select count(*) from calls_win where in_voicemail),

      'new_contacts', (select count(*) from fresh_contacts))
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.metrics_summary(uuid, integer) to authenticated;
