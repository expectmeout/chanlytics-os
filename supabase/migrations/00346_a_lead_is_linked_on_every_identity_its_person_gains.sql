-- 00346 · A lead is linked on every identity its person gains.
--
-- Decision 0034, step 5. A lead the finder found was linked to a person only by contacts_link_lead (00140), a trigger
-- on the person's insert that ran only when no one was signed in: a person who arrived by message or call took the lead
-- holding their number or address, but a person added by hand, imported, or matched by a number or an address learned
-- later never did, and the link converted the lead by writing it directly, with no version moved and no lead.converted,
-- so the Leads page could not tell it had changed and Activity never said so. Now the door every person passes through
-- (resolve_person, 00342 and 00344) links the lead itself, whenever it learns something a lead could match on.
--
--   person_link_lead(p_tenant_id, p_contact_id, p_assurance, p_source, p_made, p_skip_lead)
--       The lead holding the person's number, else their address, that names nobody yet and is neither erased nor
--       blanked, newest found first (00140's two guarded single-column lookups, each on its own index): its person set,
--       then converted through the one converter (lead_convert_by, any stage, as the trigger converted any stage), which
--       moves its version and writes lead.converted, how `arrived` when they wrote or called (observed) and `added`
--       when a member, a file, the calendar or the finder named them (asserted, found), with the person and the source.
--       A person the link made (p_made) whom no door has said the source of yet (an arrival: the message or the call
--       is their record) gets contact.added {source lead, lead_id}, as the trigger wrote, so People still says "A lead
--       you found" and 00307 stamps their first touch, now with the lead as its ref. The lead a caller is converting
--       itself (lead_set_stage names it in p_detail) is skipped, and chanlytics.link_lead = off holds every link off
--       (reach_out_person's cold first email, whose lead is still being written to). Answers the lead linked, or null.
--       Definer, called by the door alone: no role holds EXECUTE.
--
--   resolve_person
--       The same door, with the link: after the identity, when the person is new, a number or an address was filled,
--       or an identity was added; in a block of its own, so a link that fails warns and is undone alone, never the
--       arrival (as the trigger trapped its own failure). person.resolved and the answer name the lead (`lead`,
--       `lead_id`).
--
--   lead_convert_by
--       The two new words for how a lead converts: arrived, added.
--
--   contacts_link_lead, lead_link_contact
--       Gone: the door is the only writer of a person (00344), so a trigger on the insert would link twice.
--
-- Either deploy order: neither app calls these functions by name or reads the trigger; an older edge's arrival is linked
-- by the door, the same lead the trigger would have taken. Re-runnable: the functions replaced, the trigger and its
-- function dropped if they exist.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- the converter */

create or replace function public.lead_convert_by(
  p_tenant_id uuid,
  p_lead_id   uuid,
  p_how       text,
  p_data      jsonb default null,
  p_any_stage boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
begin
  if p_how is null or p_how not in ('call', 'reply', 'booking', 'deal', 'arrived', 'added') then
    raise exception 'how must be call, reply, booking, deal, arrived or added' using errcode = '22023';
  end if;
  update public.leads l
     set stage        = 'converted',
         closed_reason = null,
         converted_at = coalesce(l.converted_at, now()),
         contacted_at = coalesce(l.contacted_at, now()),
         version      = l.version + 1
   where l.id = p_lead_id and l.tenant_id = p_tenant_id
     and l.erased_at is null and l.blanked_at is null
     and (l.stage in ('ready', 'nurture') or coalesce(p_any_stage, false))
  returning * into v_lead;
  if not found then
    return jsonb_build_object('moved', false, 'version',
      (select l.version from public.leads l where l.id = p_lead_id and l.tenant_id = p_tenant_id));
  end if;
  -- The door's own fact is written last, so no data handed in can say another way.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'lead.converted', 'lead', 'lead', p_lead_id,
          coalesce(p_data, '{}'::jsonb) || jsonb_build_object('how', p_how));
  return jsonb_build_object('moved', true, 'version', v_lead.version);
end $$;

comment on function public.lead_convert_by(uuid, uuid, text, jsonb, boolean) is
  'A lead''s conversion, written once for every door that converts (Reach out Part 5, G19; the person door''s link since 00346): a ready or nurture lead (any, with p_any_stage) becomes converted, closed_reason null, converted_at and contacted_at kept or now, version + 1, with lead.converted {how} and what the caller adds. how is call, reply, booking, deal, arrived (their person wrote or called) or added (their person was named by a member, a file, the calendar or the finder). Answers {moved, version}. Called only by definer doors; nobody holds EXECUTE.';

/* --------------------------------------------------------------------------------------------------- the link */

create or replace function public.person_link_lead(
  p_tenant_id  uuid,
  p_contact_id uuid,
  p_assurance  text,
  p_source     text,
  p_made       boolean default false,
  p_skip_lead  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.contacts%rowtype;
  v_lead uuid;
begin
  if current_setting('chanlytics.link_lead', true) = 'off' then return null; end if;
  select * into v_row from public.contacts c where c.id = p_contact_id and c.tenant_id = p_tenant_id;
  if v_row.id is null or v_row.erased_at is not null or v_row.merged_into_contact_id is not null then return null; end if;
  if v_row.phone_e164 is null and v_row.email is null then return null; end if;
  -- Two guarded single-column lookups, never one OR over two nullable values (00140): each reaches its own index
  -- (leads_tenant_phone, leads_tenant_email); the number first, being the stronger identity.
  if v_row.phone_e164 is not null then
    select l.id into v_lead from public.leads l
     where l.tenant_id = p_tenant_id and l.phone_e164 = v_row.phone_e164
       and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       and l.id is distinct from p_skip_lead
     order by l.found_at desc
     limit 1;
  end if;
  if v_lead is null and v_row.email is not null then
    select l.id into v_lead from public.leads l
     where l.tenant_id = p_tenant_id and l.email = v_row.email
       and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       and l.id is distinct from p_skip_lead
     order by l.found_at desc
     limit 1;
  end if;
  if v_lead is null then return null; end if;
  -- Only a lead still naming nobody: two arrivals of two people cannot both take it.
  update public.leads set contact_id = p_contact_id where id = v_lead and contact_id is null;
  if not found then return null; end if;
  perform public.lead_convert_by(p_tenant_id, v_lead,
                                 case when p_assurance = 'observed' then 'arrived' else 'added' end,
                                 jsonb_build_object('contact_id', p_contact_id, 'source', p_source), true);
  if coalesce(p_made, false) and not exists (
       select 1 from public.events e
        where e.tenant_id = p_tenant_id and e.subject_type = 'contact' and e.subject_id = p_contact_id
          and e.kind = 'contact.added') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.added', 'contact', 'contact', p_contact_id,
            jsonb_build_object('source', 'lead', 'lead_id', v_lead, 'by', auth.uid()));
  end if;
  return v_lead;
end $$;

revoke all on function public.person_link_lead(uuid, uuid, text, text, boolean, uuid) from public, anon, authenticated, service_role;
comment on function public.person_link_lead(uuid, uuid, text, text, boolean, uuid) is
  'The lead a person turns out to be (decision 0034, step 5): the one holding their number, else their address, naming nobody yet, converted onto them through lead_convert_by (how arrived or added), with contact.added {source lead} for a person the link made and no door named. Skips the lead the caller converts itself; held off by chanlytics.link_lead = off. Called by resolve_person alone.';

/* ---------------------------------------------------------------------------------------------- the door */

create or replace function public.resolve_person(
  p_tenant_id uuid,
  p_channel   text default null,
  p_external  text default null,
  p_phone     text default null,
  p_email     text default null,
  p_name      text default null,
  p_assurance text default 'observed',
  p_source    text default 'manual',
  p_detail    jsonb default '{}'::jsonb,
  p_seen_at   timestamptz default null
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

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'person.resolved', 'contact', 'contact', v_id,
          jsonb_build_object(
            'outcome', v_outcome, 'matched_by', v_by, 'source', v_source, 'channel', v_channel,
            'assurance', v_assurance, 'by', v_user, 'filled', to_jsonb(v_filled), 'identity', v_identity,
            'doubt', v_other, 'doubt_seen', v_seen_as, 'lead', v_lead));

  return jsonb_build_object(
    'contact_id', v_id, 'outcome', v_outcome, 'existed', v_existed, 'matched_by', v_by,
    'email', v_email_out, 'filled', to_jsonb(v_filled), 'identity', v_identity,
    'doubt', v_other, 'doubt_seen', v_seen_as, 'doubt_id', v_doubt_id, 'lead_id', v_lead);
end $$;

revoke all on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) to service_role;
comment on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) is
  'The one door a person is resolved by (decision 0034): the erasure digests first on the passive paths, then the identity, the number and the address in that order, two numbers being two people; fills what is empty and never overwrites, a name the wire gave following the wire; never merges, and writes a doubt instead for a pair the merge could join; links the lead holding their number or address whenever it learns one (person_link_lead, 00346); contact.added for a new person a member, a feed or the finder brought, person.resolved for every call. The service role''s and the doors'' alone.';

/* ----------------------------------------------------------------------------------- the trigger it replaces */

drop trigger if exists contacts_link_lead on public.contacts;
drop function if exists public.lead_link_contact();
