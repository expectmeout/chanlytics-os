-- 00148 · The Blob thread erase goes.
--
-- The receptionist's memory used to be a Vercel Blob object per thread, and
-- `blob_thread_erase` was the job that deleted one when a person asked to be
-- forgotten. Postgres has been the only memory since PG_READS, and the store's
-- code goes with this change -- so every row of this kind is a finished
-- erasure of a store that no longer exists, and a kind no build can run. The
-- rows are deleted and the CHECK is tightened to the seven kinds that have a
-- handler (the list as it stands after 00140, less this one).
--
-- erase_contact is re-declared from its last text (00027) with two deltas: it
-- spares no kind when it withdraws what is scheduled, because the only kind it
-- ever spared was that job; and it no longer collects the customer's phone
-- digits as thread keys, which only that job had a use for. `counts` loses
-- `threads` and the return loses `thread_ids` with them. A third delta: the
-- jobs it cancels have their payload scrubbed in the same statement, because
-- the number a canceled job carried must not outlive the row that owned it,
-- and a re-driven erasure has no digits left to find it by.
--
-- APPLY AFTER BOTH APPS CARRY THIS CHANGE. A dashboard still queuing
-- blob_thread_erase would be refused by the tightened CHECK, and every
-- erasure would answer 500 until it redeployed.

/* --------------------------------------------- the rows, then the set --- */

delete from public.jobs where kind = 'blob_thread_erase';

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check'));

/* ----------------------------------------------------------- the erase --- */

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
     second copy and no such kind (00148), so every scheduled job that names
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

comment on function public.erase_contact(uuid, jsonb) is
  'Erase one customer: delete their calls and messages explicitly (the call FKs are SET NULL and the message FK is NO ACTION), cascade the conversation, cancel every scheduled job that names them, scrub decision payloads, and tombstone the contact. Returns the Storage paths the caller must remove. Owner-only, checked against auth.uid() inside the body.';

revoke execute on function public.erase_contact(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.erase_contact(uuid, jsonb) to authenticated;
