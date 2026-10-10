-- 00376 · A person's resolution is on the ledger only when it changed something.
--
-- resolve_person wrote person.resolved on every call. The calendar's hourly read resolves every person on the calendar,
-- so a workspace with a full week wrote one "matched, nothing new" row per appointment per hour: the largest kind in the
-- ledger by far (about 830 rows a week across six workspaces on 9 October 2026), the evidence of nothing, purged at
-- thirty days (00115, 00342), hidden from Activity (contracts ACTIVITY_NOISE_KINDS) and read by nothing else. The row is
-- written when the call changed something: a person made, a field filled, an identity added or its word raised, a doubt
-- written, or a lead linked. A call that found the person and learned nothing writes no row: the message, the call or
-- the appointment that asked is the record.
--
-- Copied from its latest migration (00367, a number written with its + keeps its country) with that one block changed;
-- nothing else changes. Either deploy order: no reader of person.resolved relies on a row per call
-- (people/doors/resolve-person.db.test.mjs holds which calls write one). Re-runnable.

set local lock_timeout = '3s';

create or replace function public.resolve_person(p_tenant_id uuid, p_channel text DEFAULT NULL::text, p_external text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_assurance text DEFAULT 'observed'::text, p_source text DEFAULT 'manual'::text, p_detail jsonb DEFAULT '{}'::jsonb, p_seen_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_user      uuid := auth.uid();
  v_channel   text := nullif(btrim(coalesce(p_channel, '')), '');
  v_external  text := nullif(btrim(coalesce(p_external, '')), '');
  v_digits    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_plus      boolean := left(btrim(coalesce(p_phone, '')), 1) = '+';
  v_phone     text;
  v_email     text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name      text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_assurance text := coalesce(nullif(btrim(p_assurance), ''), 'observed');
  v_source    text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_seen      timestamptz := coalesce(p_seen_at, now());
  v_observed  boolean;              -- they wrote to us, or called: the wire's own word
  v_id        uuid;
  v_by        text;                 -- identity | phone | email | race
  v_row       public.contacts%rowtype;
  v_new_email text;
  v_email_out text;                 -- set | kept | taken | null
  v_filled    text[] := '{}';
  v_identity  text;                 -- added | raised | kept | null
  v_added     boolean;
  v_other     uuid;                 -- the doubt: the other record one of the identities names
  v_other_row public.contacts%rowtype;
  v_seen_as   text;                 -- name | phone | email
  v_doubt_id  uuid;
  v_lead      uuid;                 -- the lead this person turned out to be (step 5)
  v_outcome   text;
  v_existed   boolean;
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_assurance not in ('observed', 'asserted', 'found') then
    raise exception 'An identity is observed, asserted or found.' using errcode = '22023';
  end if;
  if (v_channel is null) <> (v_external is null) then
    raise exception 'An identity needs its channel and its id.' using errcode = '22023';
  end if;
  if v_channel is not null and v_channel not in ('whatsapp', 'voice', 'sms', 'email', 'instagram') then
    raise exception 'That is not a channel.' using errcode = '22023';
  end if;
  -- The number as contracts normalizePhone reads it: a leading + is the country's word, so eight to fifteen digits
  -- after it are as given; a bare ten digits are North American; eight to fifteen bare digits are as given (00367).
  if v_digits = '' then
    v_phone := null;
  elsif char_length(v_digits) = 10 and not v_plus then
    v_phone := '+1' || v_digits;
  elsif char_length(v_digits) between 8 and 15 then
    v_phone := '+' || v_digits;
  end if;
  if (v_digits <> '' and v_phone is null) or (v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_external is null and v_phone is null and v_email is null and v_name is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  v_observed := v_assurance = 'observed';

  -- The erased stay erased on the passive paths (a member typing, a feed, the finder: 00263, 00331). A person who
  -- asked to be forgotten and then writes or calls again is a new person, as the inbound doors have always made them.
  if not v_observed and (
       (v_phone is not null and exists (
          select 1 from contacts c
           where c.tenant_id = p_tenant_id and c.erased_phone_hash = public.erasure_digest(p_tenant_id, v_phone)))
    or (v_email is not null and exists (
          select 1 from contacts c
           where c.tenant_id = p_tenant_id and c.erased_email_hash = public.erasure_digest(p_tenant_id, v_email)))) then
    raise exception 'That person asked to be forgotten.' using errcode = 'PE001';
  end if;

  -- One resolution at a time per identity (the key ingest_inbound and ingest_call lock), per number and per address,
  -- always in this order, so two doors never make one person twice and never wait on each other in a ring.
  if v_external is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|' || v_channel || '|' || v_external, 42));
  end if;
  if v_phone is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|phone|' || v_phone, 42));
  end if;
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|email|' || v_email, 42));
  end if;

  -- The match: the identity, then the number, then the address.
  if v_external is not null then
    select c.id into v_id
      from contact_identities i
      join contacts c on c.id = i.contact_id
     where i.tenant_id = p_tenant_id and i.channel = v_channel and i.external_id = v_external
       and c.erased_at is null
     limit 1;
    if v_id is not null then
      -- An identity moved by a merge (00326) points at the kept record; one hop is every hop a merge leaves.
      select coalesce(c.merged_into_contact_id, c.id) into v_id from contacts c where c.id = v_id;
      v_by := 'identity';
    end if;
  end if;
  if v_id is null and v_phone is not null then
    select c.id into v_id from contacts c
     where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
       and c.erased_at is null and c.merged_into_contact_id is null
     limit 1;
    if v_id is not null then v_by := 'phone'; end if;
  end if;
  if v_id is null and v_email is not null then
    select c.id into v_id from contacts c
     where c.tenant_id = p_tenant_id and c.email = v_email
       and c.erased_at is null and c.merged_into_contact_id is null
       and (v_phone is null or c.phone_e164 is null)   -- two numbers are two people
     limit 1;
    if v_id is not null then v_by := 'email'; end if;
  end if;

  if v_id is null then
    -- Nobody: they are made, with the address only when nobody here holds it; a held address is a doubt.
    v_new_email := case
      when v_email is not null
       and not exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email)
      then v_email
    end;
    if v_email is not null and v_new_email is null then
      v_email_out := 'taken';
      select c.id into v_other from contacts c
       where c.tenant_id = p_tenant_id and c.email = v_email
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      if v_other is not null then v_seen_as := 'email'; end if;
    end if;
    -- A name alone is never a match: a living record with the same name is a doubt beside the new one.
    if v_name is not null and v_seen_as is null then
      select c.id into v_other from contacts c
       where c.tenant_id = p_tenant_id and lower(c.display_name) = lower(v_name)
         and c.erased_at is null and c.merged_into_contact_id is null and c.display_name is not null
       limit 1;
      if v_other is not null then v_seen_as := 'name'; end if;
    end if;
    begin
      insert into contacts (tenant_id, phone_e164, email, display_name, wa_profile_name, last_seen_at)
      values (p_tenant_id, v_phone, v_new_email,
              case when v_observed then null else v_name end,
              case when v_observed then v_name end,
              v_seen)
      returning id into v_id;
      v_outcome := 'new';
      v_existed := false;
      if v_new_email is not null then v_email_out := 'set'; end if;
      -- Where they came from, when it was not by writing or calling: the message or the call is that record, and the
      -- first-touch trigger on it says the wire (00306).
      if not v_observed then
        insert into events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
                coalesce(p_detail, '{}'::jsonb)
                || jsonb_build_object('source', v_source, 'by', coalesce(p_detail->>'by', v_user::text)));
      end if;
    exception when unique_violation then
      -- Someone else won the race on the number or the address: theirs is the one, and it is filled below.
      v_id := null;
      if v_phone is not null then
        select c.id into v_id from contacts c
         where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
           and c.erased_at is null and c.merged_into_contact_id is null
         limit 1;
      end if;
      if v_id is null and v_new_email is not null then
        select c.id into v_id from contacts c
         where c.tenant_id = p_tenant_id and c.email = v_new_email
           and c.erased_at is null and c.merged_into_contact_id is null
         limit 1;
      end if;
      if v_id is null then raise; end if;
      v_by := 'race';
      v_email_out := null;
      v_seen_as := null;
      v_other := null;
    end;
  end if;

  if v_outcome is null then
    -- Found. What we did not have is worth keeping; what we have is never overwritten, but a name the wire gave
    -- follows the wire.
    select * into v_row from contacts where id = v_id;
    v_outcome := 'matched';
    v_existed := true;
    if v_name is not null then
      if v_observed then
        if v_row.wa_profile_name is distinct from v_name then
          update contacts set wa_profile_name = v_name, updated_at = now() where id = v_id;
          v_filled := array_append(v_filled, 'wa_profile_name');
        end if;
      elsif v_row.display_name is null then
        update contacts set display_name = v_name, updated_at = now() where id = v_id;
        v_filled := array_append(v_filled, 'display_name');
      end if;
    end if;
    if v_phone is not null and v_row.phone_e164 is null then
      begin
        update contacts set phone_e164 = v_phone, updated_at = now() where id = v_id;
        v_filled := array_append(v_filled, 'phone_e164');
      exception when unique_violation then
        -- Another person here holds the number: theirs stays theirs, and the pair is a doubt.
        select c.id into v_other from contacts c
         where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone and c.id <> v_id
         limit 1;
        if v_other is not null then v_seen_as := 'phone'; end if;
      end;
    end if;
    if v_email is not null then
      if v_row.email is not null then
        v_email_out := 'kept';
      elsif exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id) then
        v_email_out := 'taken';
        if v_seen_as is null then
          select c.id into v_other from contacts c
           where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id
             and c.erased_at is null and c.merged_into_contact_id is null
           limit 1;
          if v_other is not null then v_seen_as := 'email'; end if;
        end if;
      else
        begin
          perform public.set_person_email(v_id, v_email);
          v_email_out := 'set';
          v_filled := array_append(v_filled, 'email');
        exception when unique_violation then
          v_email_out := 'taken';   -- another line wrote it between the look and the write
        end;
      end if;
    end if;
    if v_observed then
      update contacts set last_seen_at = v_seen where id = v_id and last_seen_at < v_seen;
    end if;
    if cardinality(v_filled) > 0 then v_outcome := 'filled'; end if;
  end if;

  -- The identity, with how sure the door was; one already held is written only when its word gets stronger.
  if v_external is not null then
    insert into contact_identities (tenant_id, contact_id, channel, external_id, assurance)
    values (p_tenant_id, v_id, v_channel, v_external, v_assurance)
    on conflict (tenant_id, channel, external_id) do update
      set assurance = excluded.assurance
      where contact_identities.contact_id = excluded.contact_id
        and (case excluded.assurance when 'observed' then 3 when 'asserted' then 2 else 1 end)
          > (case contact_identities.assurance when 'observed' then 3 when 'asserted' then 2 else 1 end)
    returning (xmax = 0) into v_added;
    v_identity := case when v_added is null then 'kept' when v_added then 'added' else 'raised' end;
  end if;

  -- The doubt: only a pair 0028's door could join, two numbers and two addresses being two people by rule; written
  -- once per pair, whichever way round it was seen, and left alone once settled.
  if v_other is not null then
    select * into v_row from contacts where id = v_id;
    select * into v_other_row from contacts where id = v_other;
    if (v_row.phone_e164 is null or v_other_row.phone_e164 is null or v_row.phone_e164 = v_other_row.phone_e164)
       and (v_row.email is null or v_other_row.email is null or v_row.email = v_other_row.email) then
      insert into person_doubts (tenant_id, contact_id, other_id, seen)
      values (p_tenant_id, least(v_id, v_other), greatest(v_id, v_other), v_seen_as)
      on conflict (tenant_id, contact_id, other_id) do nothing
      returning id into v_doubt_id;
    else
      v_other := null;
      v_seen_as := null;
    end if;
  end if;

  -- The lead this person is (step 5): whenever the door learns something a lead could be matched on (a new person, a
  -- number or an address filled, an identity added), the lead that holds their number or address and names nobody yet
  -- converts onto them, through the one converter. A caller converting a lead itself names it in p_detail and is left to
  -- it; a reach-out's cold first email holds the link off (chanlytics.link_lead). Never at the cost of the arrival: a
  -- link that fails warns and is undone alone.
  if v_outcome = 'new' or cardinality(v_filled) > 0 or v_identity = 'added' then
    begin
      v_lead := public.person_link_lead(p_tenant_id, v_id, v_assurance, v_source, v_outcome = 'new',
                                        nullif(p_detail->>'lead_id', '')::uuid);
    exception when others then
      raise warning 'person_link_lead: %', sqlerrm;
      v_lead := null;
    end;
  end if;

  -- The ledger's row, when the call changed something (00376): a person made, a field filled (the outcome says
  -- either), an identity added or its word raised, a doubt written, or a lead linked. A call that found the person
  -- and learned nothing writes none: the message, the call or the appointment that asked is the record.
  if v_outcome <> 'matched' or v_identity in ('added', 'raised') or v_doubt_id is not null or v_lead is not null then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'person.resolved', 'contact', 'contact', v_id,
            jsonb_build_object(
              'outcome', v_outcome, 'matched_by', v_by, 'source', v_source, 'channel', v_channel,
              'assurance', v_assurance, 'by', v_user, 'filled', to_jsonb(v_filled), 'identity', v_identity,
              'doubt', v_other, 'doubt_seen', v_seen_as, 'lead', v_lead));
  end if;

  return jsonb_build_object(
    'contact_id', v_id, 'outcome', v_outcome, 'existed', v_existed, 'matched_by', v_by,
    'email', v_email_out, 'filled', to_jsonb(v_filled), 'identity', v_identity,
    'doubt', v_other, 'doubt_seen', v_seen_as, 'doubt_id', v_doubt_id, 'lead_id', v_lead);
end $_$;


COMMENT ON FUNCTION public.resolve_person(p_tenant_id uuid, p_channel text, p_external text, p_phone text, p_email text, p_name text, p_assurance text, p_source text, p_detail jsonb, p_seen_at timestamp with time zone) IS 'The one door a person is resolved by (decision 0034): the erasure digests first on the passive paths, then the identity, the number and the address in that order, two numbers being two people; fills what is empty and never overwrites, a name the wire gave following the wire; never merges, and writes a doubt instead for a pair the merge could join; links the lead holding their number or address whenever it learns one (person_link_lead, 00346); contact.added for a new person a member, a feed or the finder brought, person.resolved when the call changed something (a person made, a field filled, an identity added or raised, a doubt written, a lead linked; 00376). The service role''s and the doors'' alone.';

REVOKE ALL ON FUNCTION public.resolve_person(p_tenant_id uuid, p_channel text, p_external text, p_phone text, p_email text, p_name text, p_assurance text, p_source text, p_detail jsonb, p_seen_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.resolve_person(p_tenant_id uuid, p_channel text, p_external text, p_phone text, p_email text, p_name text, p_assurance text, p_source text, p_detail jsonb, p_seen_at timestamp with time zone) TO service_role;
