-- 00733 · A session with no person in it is nobody, and a partner's saved view asks for the second step (the
-- whole-system plan of 28 Nov 2026, lane 9: every door a member may call, called as the wrong person; decision 0150).
--
-- Decision 0150 says who a door lets through: a member it asks about, the service role, and a session of the database
-- itself; an API session with no person in it is refused (28000). The twelve doors of 00717 are written so, and the
-- doors since. The door walk (tests/database/doors/) calls every door a signed-in person may execute as each wrong
-- caller, and five doors answered otherwise:
--
--   set_marketing_consent   Took a signed-in role that names no person as the edge: it wrote the answer. Re-made from
--   set_person_email        their newest bodies (00100's rule as it stands; 00726) with the one question first.
--   lead_allowance          Answered such a session the workspace's allowance. Re-made with the question first.
--   lead_search_widens      Answered such a session the platform's switch for the workspace. Re-made: a member who may
--                           read the workspace, the service role, or a session of the database itself.
--   member_view_set         Kept a partner's saved view on a password alone, where its sibling (member_push_off_set)
--                           asks for the second step (00261, 00280). Re-made with the same line.
--
-- No sign-in issues a token for the session role that names no person, so no browser could make the first four calls.
-- Nothing else changes: every signature, return, grant and comment stays, the service role and the database's own
-- session are let through as before, and a member is asked what they were asked.
--
-- Deploy order: either. The code calls each door as it did and is answered as it was.
-- Locks: none beyond each function's own row in the catalog. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.set_marketing_consent(p_tenant_id uuid, p_contact_id uuid, p_consent text, p_source text, p_note text DEFAULT NULL::text, p_evidence jsonb DEFAULT NULL::jsonb, p_message_id uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row      public.contacts%rowtype;
  v_msg      public.messages%rowtype;
  v_words    text;
  v_evidence jsonb := p_evidence;
begin
  -- A signed-in role that names no person is nobody (00733, decision 0150). The edge holds the service key and a session
  -- of the database itself carries no role: each is let through as before.
  if auth.uid() is null and coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_consent not in ('unknown', 'opted_in', 'opted_out') then
    raise exception 'consent must be unknown, opted_in or opted_out' using errcode = '22023';
  end if;
  if p_source not in ('in_person', 'phone', 'form', 'customer_message', 'operator') then
    raise exception 'source must be in_person, phone, form, customer_message or operator' using errcode = '22023';
  end if;
  -- A yes to offers is written, or it is not a yes to offers (00100).
  if p_consent = 'opted_in' and p_source not in ('form', 'customer_message') then
    raise exception 'a yes to offers must be in writing: a form the customer signed, or their own message' using errcode = '22023';
  end if;
  if p_note is not null and length(p_note) > 200 then
    raise exception 'note is too long' using errcode = '22023';
  end if;

  -- A signed-in caller must be allowed to act in this workspace. No session at
  -- all is the edge, holding the service key, recording what a customer texted.
  if auth.uid() is not null and not public.is_acting_member(p_tenant_id) then
    raise exception 'Not allowed to act in this workspace.' using errcode = '42501';
  end if;

  -- A member's evidence is read from the message they name, never handed in.
  if auth.uid() is not null and p_evidence is not null then
    raise exception 'The evidence is read from their message. Name the message instead.' using errcode = '22023';
  end if;
  if p_message_id is not null and p_source <> 'customer_message' then
    raise exception 'Only an answer in their own message names a message.' using errcode = '22023';
  end if;
  if auth.uid() is not null and p_source = 'customer_message' and p_message_id is null then
    raise exception 'Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn''t see, record a sign-up form and say where in the note.' using errcode = '22023';
  end if;

  select * into v_row from public.contacts
   where id = p_contact_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'no such contact' using errcode = 'P0002';
  end if;
  if v_row.erased_at is not null then
    raise exception 'that person has been erased' using errcode = '42501';
  end if;

  -- A converted lead's yes comes only from them (PRD decision 19; permanent,
  -- replacing v2's 90 days). A signed-in caller may record a no, or unknown,
  -- for a person a lead is linked to; never a yes, whatever the source, and
  -- however the message is named. The edge (no session) records what they
  -- texted; the yes page records what they chose. The sentence is contracts'
  -- LEAD_CONSENT_REFUSAL; consent-paths.db.test.mjs holds the two doors equal.
  -- 0052: and for everyone who works at a lead (contacts.lead_id: linked by a reply that cited ours, or by a member's
  -- hand); "Not at this business" (person_leave_lead) lifts it, for anyone but the lead's own person.
  if auth.uid() is not null and p_consent = 'opted_in'
     and (exists (select 1 from public.leads l where l.contact_id = p_contact_id and l.tenant_id = p_tenant_id)
          or exists (select 1 from public.contacts k
                      where k.id = p_contact_id and k.tenant_id = p_tenant_id and k.lead_id is not null)) then
    raise exception 'This person came from a lead you found. A yes has to come from them: their own message, or your sign-up page.' using errcode = '42501';
  end if;

  -- The message, read here: theirs, to this workspace, on a written wire. A
  -- call's note is the system's, and a reply is ours.
  if p_message_id is not null then
    select m.* into v_msg
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where m.id = p_message_id
       and m.tenant_id = p_tenant_id
       and c.tenant_id = p_tenant_id
       and c.contact_id = p_contact_id
       and m.direction = 'inbound'
       and m.sender = 'customer'
       and m.channel not in ('voice', 'system');
    if not found then
      raise exception 'That isn''t a message this person sent you. Choose one of theirs.' using errcode = '22023';
    end if;
    v_words := coalesce(
      nullif(btrim(regexp_replace(coalesce(v_msg.body, ''), '\s+', ' ', 'g')), ''),
      nullif(btrim(regexp_replace(coalesce(v_msg.media->>'caption', ''), '\s+', ' ', 'g')), ''));
    if v_words is null then
      raise exception 'That message has no words in it to show their answer. Choose the one where they said it.' using errcode = '22023';
    end if;
    v_evidence := jsonb_build_object(
      'message_id', v_msg.id,
      'channel', v_msg.channel,
      'message_external_id', case when v_msg.external_id like 'backfill:%' then null else v_msg.external_id end,
      'words', left(v_words, 80));
  end if;

  -- `dnc` is deliberately NOT touched (00095): declining offers is not a
  -- request to stop hearing about your own appointment.
  update public.contacts
     set marketing_consent            = p_consent,
         marketing_consent_source     = p_source,
         marketing_consent_updated_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id
  returning * into v_row;

  -- The same ledger the conversational answer writes to, with the purpose named.
  -- Consent events are never purged (00038).
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
          jsonb_build_object('purpose', 'marketing', 'consent', p_consent, 'source', p_source, 'note', p_note)
          || coalesce(v_evidence, '{}'::jsonb));

  return jsonb_build_object(
    'marketing_consent', v_row.marketing_consent,
    'marketing_consent_source', v_row.marketing_consent_source,
    'marketing_consent_updated_at', v_row.marketing_consent_updated_at
  );
end $$;

create or replace function public.set_person_email(p_contact_id uuid, p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $_$
declare
  v_user    uuid := auth.uid();
  v_tenant  uuid;
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_was     text;
  v_offers  text;
  v_stopped timestamptz;
  v_why     text;
  v_moved   boolean;
  v_back    record;
begin
  -- A signed-in role that names no person is nobody (00733, decision 0150). The edge holds the service key and a session
  -- of the database itself carries no role: each is let through as before.
  if auth.uid() is null and coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  -- No session is the edge recording what a customer wrote; a session must be
  -- a member's where the person lives. Either way an erased person, or one in
  -- a workspace the caller does not act in, does not exist.
  if v_tenant is null or (v_user is not null and not public.is_acting_member(v_tenant)) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  -- What the change leaves behind (00726), read under the row's lock: the address before, whether it had a yes to
  -- offers by email, and what had stopped mail to it.
  select nullif(lower(btrim(coalesce(c.email, ''))), ''), c.email_marketing, c.email_suppressed_at,
         c.email_suppressed_reason
    into v_was, v_offers, v_stopped, v_why
    from contacts c where c.id = p_contact_id
     for update;
  v_moved := v_was is distinct from v_email;
  begin
    update contacts set email = v_email, updated_at = now() where id = p_contact_id;
  exception when unique_violation then
    raise exception 'Another person here already has that address.' using errcode = '23505';
  end;
  if v_moved then
    -- A yes to offers by email is the address's that gave it (set_email_offers_yes refuses one for an address the
    -- person no longer has): it is not carried to another. Not asked again, said with why; a no is the person's and stays.
    if v_was is not null and v_offers = 'opted_in' then
      update contacts
         set email_marketing = 'unknown', email_marketing_source = 'address_changed', email_marketing_updated_at = now()
       where id = p_contact_id;
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (v_tenant, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
              jsonb_build_object('purpose', 'email_marketing', 'consent', 'unknown', 'source', 'address_changed',
                                 'previous', 'opted_in', 'channel', 'email'));
    end if;
    -- The change clears what stopped mail to the old address (contacts_email_change_clears_suppression: a changed
    -- address is a new one to the wire). It is kept with the change below, and an address this person had before that
    -- was stopped when it left is stopped again as it comes back: the newest change away from it says.
    if v_email is not null then
      select e.data ->> 'was_stopped' as why, (e.data ->> 'was_stopped_at')::timestamptz as at into v_back
        from events e
       where e.tenant_id = v_tenant and e.subject_type = 'contact' and e.subject_id = p_contact_id
         and e.kind = 'contact.email_set' and e.data ->> 'was' = v_email
       order by e.created_at desc
       limit 1;
      if v_back.why in ('hard_bounce', 'complaint', 'provider') then
        update contacts
           set email_suppressed_at = coalesce(v_back.at, now()), email_suppressed_reason = v_back.why
         where id = p_contact_id;
      end if;
    end if;
  end if;
  -- Who, and which path: a member's id and 'member', or null and 'customer_message'. A first address is not named, as
  -- before. Where an address is replaced or cleared (00726), the one before would be lost with the change: the event
  -- holds it, the one after, and what had stopped mail to the one before. A person's own data, so scrub_contact_events
  -- drops them when the person is erased.
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.email_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_email is not null, 'by', v_user,
                             'source', case when v_user is null then 'customer_message' else 'member' end)
          || case when v_moved and v_was is not null
                  then jsonb_strip_nulls(jsonb_build_object('was', v_was, 'now', v_email, 'was_stopped', v_why,
                                                            'was_stopped_at', v_stopped))
                  else '{}'::jsonb end);
  return jsonb_build_object('contact_id', p_contact_id, 'email', v_email);
end $_$;

create or replace function public.lead_allowance(p_tenant_id uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  -- A signed-in role that names no person is nobody (00733, decision 0150). The edge holds the service key and a session
  -- of the database itself carries no role: each is let through as before.
  if auth.uid() is null and coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A member reads their own workspace's; the service role (no session: lead_reserve asked by the edge) any.
  if auth.uid() is not null and not public.may_read_workspace(p_tenant_id) then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;
  -- contracts leadAllowanceFor: the trial's leads while the workspace is on a trial, else the month's.
  return case when exists (select 1 from public.billing_accounts b
                            where b.tenant_id = p_tenant_id and b.mode = 'stripe' and b.status = 'trialing')
              then public.lead_cap('trial_leads') else public.lead_cap('month_leads') end;
end;
$$;

create or replace function public.lead_search_widens(p_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.widen_on or p_tenant_id = any (p.widen_tenants) from public.lead_platform p where p.id), false)
     and (public.may_read_workspace(p_tenant_id)
          -- The service role and a session of the database itself, never a signed-in role that names no person (00733).
          or (auth.uid() is null and coalesce((select auth.role()), '') not in ('anon', 'authenticated')))
$$;

create or replace function public.member_view_set(p_tenant_id uuid, p_page text, p_view jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $_$
declare
  v_user  uuid := auth.uid();
  v_views jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_page is null or p_page !~ '^[a-z][a-z0-9_-]{0,31}$' then
    raise exception 'A page is a short lowercase name.' using errcode = '22023';
  end if;
  if p_view is null or jsonb_typeof(p_view) <> 'object' or pg_column_size(p_view) > 4096 then
    raise exception 'A view is a small object.' using errcode = '22023';
  end if;
  update public.memberships
     set views = coalesce(views, '{}'::jsonb) || jsonb_build_object(p_page, p_view)
   where tenant_id = p_tenant_id and user_id = v_user
     -- A partner's seat counts for this session only with its second factor (00261, 00280), as it does where they
     -- say which notices ring their phone (member_push_off_set): 00733.
     and (role <> 'partner' or public.session_shows_second_factor())
  returning views into v_views;
  if v_views is null then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;
  return v_views;
end $_$;
