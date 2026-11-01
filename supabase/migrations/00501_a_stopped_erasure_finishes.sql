-- 00501 · A stopped erasure finishes (decision 0036).
--
-- An erasure that stopped at a fail-closed leg (the Ask scrub, the finished jobs, the kept deliveries, other people's
-- notes, the receptionist's kept turns, Storage), or whose press died, left the person blocked (contacts.erasing_since,
-- 00124) and nothing read that to finish it: they stayed blocked, not erased, until the owner pressed Delete again.
-- Now every press puts a finish on the jobs ledger beside the block, and the finish runs the erasure again.
--
--   erasure_finish          A job kind (packages/jobs erasure.ts): payload { contact_id }, keyed
--                           'erasure_finish:<contact>' while one waits, due ten minutes after the block, in lane 1
--                           (someone waiting who is not a customer: the person who asked to be forgotten, and the
--                           owner who pressed). A press that ends well has erase_contact withdraw it with every
--                           scheduled job naming the person; one that stopped leaves it to run, on the service role.
--   erase_contact           re-created: the service role may call it for a person whose block an owner's press wrote
--                           (erasing_since set, erased_at not), and the ledger's row then says the system erased them.
--                           A session is judged as before, in the body, from auth.uid(): the owner, in the person's
--                           own workspace.
--   scrub_ask_for_contact   re-created: the service role admitted on the same terms. It already took only a person
--                           being erased; a session is still an owner's.
--
-- Re-runnable throughout.

set local lock_timeout = '3s';

/* ------------------------------------------------------------- 1. the kind -- */

alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send', 'push_receipts', 'reply_read', 'event_deliver', 'booking_read', 'inbound_answer', 'history_import', 'website_read', 'preview_build', 'erasure_finish'));

alter table public.jobs alter column lane set expression as (
  case
    when kind = 'inbound_answer' then 0
    when kind in ('outbound_send', 'email_ingest', 'push_send')
         and coalesce(payload->>'purpose', '') <> 'outreach' then 0
    when kind in ('line_provision', 'reply_read', 'booking_read', 'website_read', 'preview_build', 'erasure_finish') then 1
    when kind in ('broadcast_send', 'outbound_send', 'lead_round_start', 'lead_collect', 'lead_check',
                  'push_receipts', 'history_import') then 2
    when kind = 'event_deliver' then
      case when payload->>'lane' ~ '^[0-2]$' then (payload->>'lane')::smallint else 2 end
  end
);
comment on column public.jobs.lane is
  'Which work a claim takes first (decision 0018): 0 a reply, 1 someone waiting who is not a customer (a line bought, a lead''s reply read, a booking notice read, a website read for Check, 00479, a lead''s preview built, 00497, an erasure finished, 00501), 2 bulk (a history brought in, 00478, among it). Generated from kind and payload; an event_deliver runs in its subscription''s lane (payload.lane, 00334), a text''s answer in a reply''s (inbound_answer, 00347); null for a kind the case does not name, claimed last.';

/* ------------------------------------------------ 2. the rows, as the system -- */

-- 00326's erase_contact, the same signature, answer and grants: the service role admitted for a person an owner's
-- press blocked, and the ledger's row saying who erased them, the owner or the system.
create or replace function public.erase_contact(p_contact_id uuid, p_legs jsonb default '{}'::jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  -- The system finishing what an owner began (00501): the erasure_finish job, on the service role.
  v_service       boolean := coalesce((select auth.role()), '') = 'service_role';
  v_tenant        uuid;
  v_erased        timestamptz;
  v_erasing       timestamptz;
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
  -- be spoofed by anyone who can reach the RPC (00021's rule). The service
  -- role has none, and is admitted below only for a person whose block an
  -- owner's press wrote.
  if v_user is null and not v_service then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;

  if p_legs is not null and length(p_legs::text) > 4000 then
    raise exception 'Leg report too large.' using errcode = '22023';
  end if;

  select c.tenant_id, c.erased_at, c.erasing_since into v_tenant, v_erased, v_erasing
    from contacts c where c.id = p_contact_id;
  if v_tenant is null then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;

  if not v_service then
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

  -- The service role erases nobody of its own accord: only a person an owner's
  -- press blocked (beginErasure wrote erasing_since once the route had judged
  -- the owner) and left unfinished. The block is the owner's word, kept.
  if v_service and v_erasing is null then
    raise exception 'erase_contact: only a person being erased' using errcode = '55000';
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
     to find it by. The erasure's own finish (erasure_finish, 00501) is among
     them: a press that reaches this row needs none. */
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

  -- The records merged into this person ARE this person (00326, decision 0028): each is erased with them, the way
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
  -- visible without joining anything. The owner's, or the system's when the
  -- finish erased them (actor_user_id is null then, as decisions' CHECK asks).
  insert into decisions (tenant_id, subject_type, subject_id, verb,
                         actor_type, actor_user_id, payload)
  values (v_tenant, 'contact', p_contact_id, 'erase',
          case when v_user is null then 'system' else 'user' end, v_user,
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

revoke execute on function public.erase_contact(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.erase_contact(uuid, jsonb) to authenticated, service_role;
comment on function public.erase_contact(uuid, jsonb) is
  'Erase one customer: delete their calls and messages explicitly (the call FKs are SET NULL and the message FK is NO ACTION), cascade the conversation, cancel every scheduled job that names them, scrub decision payloads, and tombstone the contact. Returns the Storage paths the caller must remove. Owner-only, checked against auth.uid() inside the body; the service role may finish one an owner began (erasing_since set: the erasure_finish job, 00501), and the ledger''s row then says the system erased them.';

/* -------------------------------------------- 3. the Ask scrub, as the system -- */

-- 00470's scrub, the same signature, return and grants: the service role admitted for a person being erased, which it
-- already took nobody but.
create or replace function public.scrub_ask_for_contact(p_tenant_id uuid, p_contact_id uuid, p_needles text[])
returns integer
language plpgsql
security definer
set search_path = public
as $_$
declare
  v_display  text;
  v_wa       text;
  v_erasing  boolean;
  v_convs    uuid[];
  v_calls    uuid[];
  v_ids      text[];
  v_find     text[];
  v_names    text[];
  v_re       text;
  v_row      record;
  v_text     text;
  v_words    uuid[] := '{}';
  v_raws     uuid[] := '{}';
  v_own      uuid[] := '{}';
  v_deleted  integer;
  v_stripped integer;
  v_forgot   integer;
  v_days     integer;
begin
  -- An owner of the workspace, or the system finishing what an owner began (the erasure_finish job, on the service
  -- role, 00501): either way only a person being erased, checked next.
  if coalesce((select auth.role()), '') <> 'service_role' and not exists (
    select 1 from public.memberships m
     where m.user_id = (select auth.uid()) and m.tenant_id = p_tenant_id and m.role = 'owner'
  ) then
    raise exception 'scrub_ask_for_contact: owner role required';
  end if;
  select c.display_name, c.wa_profile_name, c.erasing_since is not null or c.erased_at is not null
    into v_display, v_wa, v_erasing
    from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id;
  if v_erasing is not true then
    raise exception 'scrub_ask_for_contact: only a person being erased' using errcode = '55000';
  end if;

  /* ---- who they are: their ids, what to look for, their names ---- */
  v_convs := array(select cv.id from public.conversations cv
                    where cv.tenant_id = p_tenant_id and cv.contact_id = p_contact_id);
  v_calls := array(select k.id from public.calls k
                    where k.tenant_id = p_tenant_id
                      and (k.contact_id = p_contact_id or k.conversation_id = any (v_convs)));
  v_ids := array[p_contact_id::text] || v_convs::text[] || v_calls::text[];
  v_find := array(select distinct lower(n) from unnest(v_ids || coalesce(p_needles, '{}')) as n
                   where char_length(n) >= 7);
  v_names := array(
    select distinct q.n
      from (select lower(regexp_replace(btrim(x), '\s+', ' ', 'g')) as n
              from unnest(array[v_display, v_wa]
                          || array(select k.caller_name from public.calls k where k.id = any (v_calls))
                          || regexp_split_to_array(btrim(coalesce(v_display, '')), '\s+')) as x) q
     where char_length(q.n) >= 3);
  -- A name as a whole word: a backslash before anything not a letter, a digit or a space makes it that character.
  if cardinality(v_names) > 0 then
    v_re := '(^|[^[:alnum:]_])('
         || array_to_string(array(select regexp_replace(n, '([^[:alnum:][:space:]])', '\\\1', 'g')
                                    from unnest(v_names) as n), '|')
         || ')($|[^[:alnum:]_])';
  end if;

  /* ---- one scan: each row's words, then its raw only when the words miss ---- */
  -- `|| '{}'` hands the row's content back detoasted (jsonb_concat returns its other side as it is), so the words and
  -- the raw are read from one copy instead of fetching and decompressing the row twice.
  for v_row in
    select m.id, m.thread_id, m.content || '{}'::jsonb as content
      from public.ask_messages m
     where m.tenant_id = p_tenant_id
  loop
    v_text := lower((v_row.content - 'raw')::text);
    if exists (select 1 from unnest(v_find) as n where strpos(v_text, n) > 0) then
      v_words := v_words || v_row.id;
      v_own := v_own || v_row.thread_id;
    else
      v_text := v_row.content -> 'raw' ->> 'blocks';
      if v_text is not null and exists (select 1 from unnest(v_find) as n where strpos(v_text, n) > 0) then
        v_raws := v_raws || v_row.id;
      end if;
    end if;
  end loop;
  -- And a thread whose title or scope quotes one: a scope on them, or on one of theirs, holds its id.
  v_own := array(
    select x from unnest(v_own) as x
    union
    select t.id from public.ask_threads t
     where t.tenant_id = p_tenant_id
       and exists (select 1 from unnest(v_find) as n
                    where strpos(lower(t.title || ' ' || coalesce(t.scope::text, '')), n) > 0));

  /* ---- what goes ---- */
  delete from public.ask_messages m
   where m.tenant_id = p_tenant_id
     and (m.id = any (v_words)
          or (v_re is not null and m.thread_id = any (v_own)
              and exists (select 1
                            from jsonb_path_query(m.content - 'raw', 'strict $.** ? (@.type() == "string")') as s(v)
                           where (s.v #>> '{}') ~* v_re)));
  get diagnostics v_deleted = row_count;

  update public.ask_messages m
     set content = m.content - 'raw'
   where m.tenant_id = p_tenant_id
     and (m.id = any (v_raws) or (m.thread_id = any (v_own) and jsonb_typeof(m.content -> 'raw') <> 'null'));
  get diagnostics v_stripped = row_count;

  update public.ask_threads t
     set title = '', scope = null
   where t.tenant_id = p_tenant_id and t.id = any (v_own) and (t.title <> '' or t.scope is not null);

  delete from public.ask_threads t
   where t.tenant_id = p_tenant_id and t.id = any (v_own)
     and not exists (select 1 from public.ask_messages m where m.thread_id = t.id);

  -- What Ask remembers: a line or a day that names them goes.
  delete from public.ask_memory_lines a
   where a.tenant_id = p_tenant_id
     and (exists (select 1 from unnest(v_find) as n where strpos(lower(a.text), n) > 0)
          or (v_re is not null and a.text ~* v_re));
  get diagnostics v_forgot = row_count;

  delete from public.ask_journal_days j
   where j.tenant_id = p_tenant_id and j.text is not null
     and (exists (select 1 from unnest(v_find) as n where strpos(lower(j.text), n) > 0)
          or (v_re is not null and j.text ~* v_re));
  get diagnostics v_days = row_count;

  return v_deleted + v_stripped + v_forgot + v_days;
end $_$;

revoke execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) from public, anon;
grant execute on function public.scrub_ask_for_contact(uuid, uuid, text[]) to authenticated, service_role;
comment on function public.scrub_ask_for_contact(uuid, uuid, text[]) is
  'An owner''s, or the service role''s finishing what an owner began (the erasure_finish job, 00501), and only for a person being erased: removes every Ask message in the workspace whose words hold their id, a conversation or call id of theirs, or a spelling of their number or address; strips the raw turn off a message whose raw alone does; and in the threads those make theirs (or that are scoped to them) removes every message naming them, strips every raw, clears the title and scope, and removes a thread left empty (00238). Then every line of Ask''s memory and every day of its journal that holds one of those, or their name as a whole word (00470). Returns the messages removed, the raws stripped, the lines and the days removed.';
