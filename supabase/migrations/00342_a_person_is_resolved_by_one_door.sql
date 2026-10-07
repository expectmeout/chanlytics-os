-- 00342 · A person is resolved by one door.
--
-- Decision 0034, steps 1 to 3. A contacts row came to exist on nine paths, each matching its own way (the wiring
-- trace, 5 October 2026): ingest_inbound by identity then number, ingest_call by voice identity then number,
-- create_person by number, import_person by number then address, the calendar sweep's own insert, lead_set_stage,
-- reach_out_person by address, the call's booking link, and the email backfill with no match at all. Nothing merged by
-- itself and nothing said when two records might be one person. Now one door does the matching, and the writers move
-- onto it one at a time, each keeping its signature so an older app calls what it called:
--
--   resolve_person(p_tenant_id, p_channel, p_external, p_phone, p_email, p_name, p_assurance, p_source, p_detail)
--       The identity as a door saw it: a provider's identity (its channel and id), a number, an address, a name, and
--       how sure the door is of it (observed: they wrote to us on that wire; asserted: a member typed it; found: the
--       finder or a feed named it). The erasure digests are read first, so a person who asked to be forgotten is not
--       brought back by any path (PE001, as 00263 and 00331 refuse). The number is normalised as contracts'
--       normalizePhone reads it (ten digits are North American until the workspace's country decides, 0034's third
--       risk), the address lower-cased and trimmed. Then the match, in the order the inbound doors make it: the
--       identity, then the number, then the address, where two numbers are two people (import_person's rule, 00170).
--       A match fills what is empty (a name, a number, an address through set_person_email so its event is written)
--       and never overwrites; an observed arrival moves last_seen_at. Nobody: one row, with the address only when
--       nobody here holds it, and the contact.added event that says where they came from (its data as 00053 and 00170
--       wrote it: source, by, and the caller's own words in p_detail, a calendar guest's title). The identity is kept
--       on contact_identities with its assurance; one already held keeps its stronger word (a found identity never
--       overrides an observed one). Never a merge: a number or an address that names another person, or a new person
--       whose name another living record already carries, is a doubt, answered in the result (doubt, doubt_seen) for
--       the queue 0034's step 4 builds, and nothing is joined. Every call writes person.resolved in its transaction:
--       outcome new, matched or filled, how it matched, what it filled, and the doubt; never the number or the address.
--       Serialised per identity, number and address with the locks ingest_inbound and ingest_call take, so the hot
--       path and a member's door never make the same person twice; a race lost on the unique keys is looked up again.
--       Answers { contact_id, outcome, existed, matched_by, email (set | kept | taken | null), filled, identity,
--       doubt, doubt_seen }. The service role's and the doors' alone: no session calls it.
--
--   create_person (00053, 00331) and import_person (00170, 00263) keep their signatures, their checks and their
--       answers, and call the door for the match: asserted, since a member typed the line. Their events, their
--       refusals and the shapes event-shapes.db.test.mjs holds are the door's now.
--
--   contact_identities.assurance (step 3): observed | asserted | found, written by the door, observed by default for
--       every identity the inbound doors wrote before it. Readers ignore it until the doubt queue reads it.
--
--   contacts_tenant_name_lower_idx: the name a new person is compared with, so the doubt costs one index read.
--
--   purge_events (00115): person.resolved is evidence, not the record (the record is the contacts row and its
--       contact.added), so it goes with the other evidence kinds after RETENTION_DAYS.events_evidence, and the activity
--       log hides it unless asked for by name (contracts EVENT_EVIDENCE_KINDS, ACTIVITY_NOISE_KINDS).
--
-- The calendar sweep, the lead doors, ingest_call, the booking link, the email backfill and ingest_inbound move in
-- 0034's step 2 order, each in its own change; lead_set_stage reaches the door through create_person already.
-- Either deploy order: the two doors answer as they did, and a dashboard that knows nothing of the door changes
-- nothing. Re-runnable: column, constraint and index if not exists, the functions replaced.

set local lock_timeout = '3s';

alter table public.contact_identities
  add column if not exists assurance text not null default 'observed';
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'contact_identities_assurance_check' and conrelid = 'public.contact_identities'::regclass
  ) then
    alter table public.contact_identities
      add constraint contact_identities_assurance_check check (assurance in ('observed', 'asserted', 'found'));
  end if;
end $$;
comment on column public.contact_identities.assurance is
  'How sure the door that kept this identity was of it (decision 0034): observed, they wrote to us on that wire; asserted, a member typed it; found, the finder or a feed named it. A stronger word replaces a weaker one, never the reverse.';

create index if not exists contacts_tenant_name_lower_idx
  on public.contacts (tenant_id, lower(display_name))
  where erased_at is null and merged_into_contact_id is null and display_name is not null;

create or replace function public.resolve_person(
  p_tenant_id uuid,
  p_channel   text,
  p_external  text,
  p_phone     text,
  p_email     text,
  p_name      text,
  p_assurance text,
  p_source    text,
  p_detail    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_channel   text := nullif(btrim(coalesce(p_channel, '')), '');
  v_external  text := nullif(btrim(coalesce(p_external, '')), '');
  v_digits    text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone     text;
  v_email     text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name      text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_assurance text := coalesce(nullif(btrim(p_assurance), ''), 'observed');
  v_source    text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_profile   boolean;              -- the name is a WhatsApp profile's, not a member's word
  v_id        uuid;
  v_by        text;                 -- identity | phone | email | race
  v_row       public.contacts%rowtype;
  v_new_email text;
  v_email_out text;                 -- set | kept | taken | null
  v_filled    text[] := '{}';
  v_identity  text;                 -- added | kept | null
  v_added     boolean;
  v_other     uuid;                 -- the doubt: the other record one of the identities names
  v_seen      text;                 -- name | phone | email
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
  -- The number as contracts normalizePhone reads it: ten digits are North American, eight to fifteen are as given.
  if v_digits = '' then
    v_phone := null;
  elsif char_length(v_digits) = 10 then
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
  if v_external is null and v_phone is null and v_email is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  v_profile := v_channel = 'whatsapp' and v_assurance = 'observed';

  -- The erased stay erased, whichever path brings their number or address back (00263, 00331).
  if (v_phone is not null and exists (
        select 1 from contacts c
         where c.tenant_id = p_tenant_id and c.erased_phone_hash = public.erasure_digest(p_tenant_id, v_phone)))
     or (v_email is not null and exists (
        select 1 from contacts c
         where c.tenant_id = p_tenant_id and c.erased_email_hash = public.erasure_digest(p_tenant_id, v_email))) then
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
      if v_other is not null then v_seen := 'email'; end if;
    end if;
    if v_external is null and v_phone is null and v_new_email is null then
      raise exception 'A number or an address is needed.' using errcode = '22023';
    end if;
    -- A name alone is never a match: a living record with the same name is a doubt beside the new one.
    if v_name is not null and v_seen is null then
      select c.id into v_other from contacts c
       where c.tenant_id = p_tenant_id and lower(c.display_name) = lower(v_name)
         and c.erased_at is null and c.merged_into_contact_id is null and c.display_name is not null
       limit 1;
      if v_other is not null then v_seen := 'name'; end if;
    end if;
    begin
      insert into contacts (tenant_id, phone_e164, email, display_name, wa_profile_name)
      values (p_tenant_id, v_phone, v_new_email,
              case when v_profile then null else v_name end,
              case when v_profile then v_name end)
      returning id into v_id;
      v_outcome := 'new';
      v_existed := false;
      if v_new_email is not null then v_email_out := 'set'; end if;
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
              coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('source', v_source, 'by', v_user));
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
      v_seen := null;
      v_other := null;
    end;
  end if;

  if v_outcome is null then
    -- Found. What we did not have is worth keeping; what we have is never overwritten.
    select * into v_row from contacts where id = v_id;
    v_outcome := 'matched';
    v_existed := true;
    if v_name is not null then
      if v_profile then
        if v_row.wa_profile_name is null then
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
        if v_other is not null then v_seen := 'phone'; end if;
      end;
    elsif v_phone is not null and v_row.phone_e164 <> v_phone then
      select c.id into v_other from contacts c
       where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone and c.id <> v_id
         and c.erased_at is null and c.merged_into_contact_id is null
       limit 1;
      if v_other is not null then v_seen := 'phone'; end if;
    end if;
    if v_email is not null then
      if v_row.email is not null then
        v_email_out := 'kept';
        if v_row.email <> v_email and v_seen is null then
          select c.id into v_other from contacts c
           where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id
             and c.erased_at is null and c.merged_into_contact_id is null
           limit 1;
          if v_other is not null then v_seen := 'email'; end if;
        end if;
      elsif exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id) then
        v_email_out := 'taken';
        if v_seen is null then
          select c.id into v_other from contacts c
           where c.tenant_id = p_tenant_id and c.email = v_email and c.id <> v_id
             and c.erased_at is null and c.merged_into_contact_id is null
           limit 1;
          if v_other is not null then v_seen := 'email'; end if;
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
    if v_assurance = 'observed' then
      update contacts set last_seen_at = now() where id = v_id;
    end if;
    if cardinality(v_filled) > 0 then v_outcome := 'filled'; end if;
  end if;

  -- The identity, with how sure the door was; one already held keeps its stronger word.
  if v_external is not null then
    insert into contact_identities (tenant_id, contact_id, channel, external_id, assurance)
    values (p_tenant_id, v_id, v_channel, v_external, v_assurance)
    on conflict (tenant_id, channel, external_id) do update
      set assurance = case
        when (case excluded.assurance when 'observed' then 3 when 'asserted' then 2 else 1 end)
           > (case contact_identities.assurance when 'observed' then 3 when 'asserted' then 2 else 1 end)
        then excluded.assurance else contact_identities.assurance end
      where contact_identities.contact_id = excluded.contact_id
    returning (xmax = 0) into v_added;
    v_identity := case when v_added then 'added' else 'kept' end;
  end if;

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'person.resolved', 'contact', 'contact', v_id,
          jsonb_build_object(
            'outcome', v_outcome, 'matched_by', v_by, 'source', v_source, 'channel', v_channel,
            'assurance', v_assurance, 'by', v_user, 'filled', to_jsonb(v_filled), 'identity', v_identity,
            'doubt', v_other, 'doubt_seen', v_seen));

  return jsonb_build_object(
    'contact_id', v_id, 'outcome', v_outcome, 'existed', v_existed, 'matched_by', v_by,
    'email', v_email_out, 'filled', to_jsonb(v_filled), 'identity', v_identity,
    'doubt', v_other, 'doubt_seen', v_seen);
end $$;

revoke all on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb) to service_role;
comment on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb) is
  'The one door a person is resolved by (decision 0034): the erasure digests first, then the identity, the number and the address in that order, two numbers being two people; fills what is empty and never overwrites; never merges, and answers a doubt instead; writes contact.added for a new person and person.resolved for every call. The service role''s and the member doors'' alone.';

-- The two member doors: their checks, their words and their answers as before, the match the door's.
create or replace function public.create_person(p_tenant_id uuid, p_phone_e164 text, p_display_name text, p_source text, p_title text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_name   text := nullif(btrim(regexp_replace(coalesce(p_display_name, ''), '\s+', ' ', 'g')), '');
  v_phone  text := btrim(coalesce(p_phone_e164, ''));
  v_source text := coalesce(nullif(btrim(p_source), ''), 'manual');
  v_out    jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'A name is at most 80 characters.' using errcode = '22023';
  end if;
  -- Asserted: a member typed it. The door refuses a forgotten number (PE001) and writes the added event with the
  -- appointment's title where the board gave one.
  v_out := public.resolve_person(p_tenant_id, null, null, v_phone, null, v_name, 'asserted', v_source,
                                 jsonb_build_object('title', p_title));
  return jsonb_build_object('contact_id', v_out->>'contact_id', 'existed', (v_out->>'existed')::boolean, 'source', v_source);
end $$;

revoke execute on function public.create_person(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_person(uuid, text, text, text, text) to authenticated;
comment on function public.create_person(uuid, text, text, text, text) is
  'Owner or operator adds a person by phone, through resolve_person (00342): get-or-create; a name fills only an empty one; consent stays unknown; the added event says where they came from. A number whose person asked to be forgotten is refused (PE001, 00331).';

create or replace function public.import_person(p_tenant_id uuid, p_name text, p_phone_e164 text, p_email text, p_phone_digest text default null, p_email_digest text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_phone text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_out   jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  -- The digests a caller hands in are not read: the door makes its own (00263). Asserted: a member brought the list.
  v_out := public.resolve_person(p_tenant_id, null, null, v_phone, v_email, v_name, 'asserted', 'import',
                                 jsonb_build_object('title', null));
  return jsonb_build_object('contact_id', v_out->>'contact_id', 'existed', (v_out->>'existed')::boolean, 'email', v_out->'email');
end $$;

revoke execute on function public.import_person(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.import_person(uuid, text, text, text, text, text) to authenticated;
comment on function public.import_person(uuid, text, text, text, text, text) is
  'One line of an imported client list, through resolve_person (00342): find by number, then address (two numbers are two people); fill what is empty; never a yes; the erased stay erased (PE001).';

-- The purge (00115), with the new evidence kind in its list; its comment and its clock stay as they are.
create or replace function public.purge_events(p_keep interval default '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.events
   where kind in (
     'webhook.auth', 'webhook.delivery',
     'ingest.allowlist_skip', 'ingest.unreachable_sender', 'ingest.unroutable',
     'usage.llm_tokens', 'usage.ask_tokens',
     'person.resolved'
   )
     and created_at < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.purge_events(interval) from public, anon, authenticated;
grant execute on function public.purge_events(interval) to service_role;
comment on function public.purge_events(interval) is
  'Drops the evidence kinds (webhook receipts and deliveries, the allowlist''s skips, unreachable and unroutable inbounds, the two model-usage rows, and person.resolved, a door''s own record of a match, 00342) older than p_keep (default 30 days; contracts RETENTION_DAYS.events_evidence). Every other event kind is the record and is never purged here.';
