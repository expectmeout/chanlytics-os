-- 00344 · The other writers match through the door, and a doubt is a row.
--
-- Decision 0034, the rest of step 2, and step 4. 00342 made resolve_person the one door a person is matched through
-- and moved the two member doors onto it. Now the four SQL writers that were left follow (ingest_inbound, ingest_call,
-- lead_set_stage, reach_out_person), the three TypeScript ones call it through packages/db in the same change (the
-- calendar sweep, the booking link, the email intake), and a doubt the door raises is kept on a row an owner can
-- settle, instead of in the door's answer alone.
--
--   resolve_person (made again, with p_seen_at, and a default on every argument but the workspace)
--       The same door, with what the hot path needs of it (a caller names only what it saw, so the typed client
--       passes no null for what it did not):
--       - an observed arrival (they wrote to us, they called) writes no contact.added: the message or the call is the
--         record, and the first-touch trigger on it says how they came (00306); a person who asked to be forgotten and
--         writes again is a new person, as the inbound door has always made them, so the erasure digests refuse only a
--         member's, a feed's and the finder's words (asserted, found), never their own;
--       - a name the wire gave (observed) is the wire's: it follows the wire, as ingest_inbound kept WhatsApp's profile
--         name, in wa_profile_name; a member's or the finder's name fills display_name only where it is empty;
--       - last_seen_at moves to p_seen_at (now() when null) only forward, and only for an observed arrival, so a
--         call's every transcript turn and a replayed message write nothing;
--       - an identity already held is written only when its word gets stronger (added | raised | kept), never on every
--         message;
--       - a person with a name and nothing else can be made (a lead converting with neither number nor address, as
--         lead_set_stage made them), and a name alone is never a match;
--       - `by` on contact.added is the caller's word in p_detail where a door has one (reach_out), else the session;
--       - a doubt is raised only for a pair 0028's door could join (no two numbers, no two addresses: those are two
--         people by rule), and is written on person_doubts, once per pair whichever way round, open until settled.
--
--   person_doubts
--       The queue in front of merge_people (00326): two living records one identity could belong to, which of the
--       three it was (name, phone, email), and how it was settled: merged, through 0028's door, or not the same, through
--       person_doubt_dismiss. One row per pair, the lower id first. A member reads their workspace's; only the door and
--       the two settlers write. An erasure takes every doubt that names the person; a merge settles the pair's own and
--       moves the merged record's other doubts onto the kept record, unless it already holds them.
--
--   person_doubt_dismiss(p_doubt_id)
--       Not the same: a member of the workspace (owner, operator, or a partner who showed their second factor) settles
--       the pair, which is then never raised again by the next arrival. Settling twice is one settlement; a pair the
--       merge settled is refused in words.
--
--   ingest_inbound, ingest_call, lead_set_stage, reach_out_person
--       Each keeps its signature and its answer and asks the door for the person: the inbound door with the wire's
--       identity and the address when the wire is email, seen now; the call door with the voice identity, seen when the
--       call started, and only when the call's row does not already name its person; the lead doors as the finder's
--       word (found), the lead's id on the added event, and reach_out_person with the lead link held off and its
--       own refusals kept, rolled back whole where it refuses.
--
-- Either deploy order: the doors answer as they did; an edge or a dashboard that calls the door with 00342's arguments
-- is answered (the new argument has a default), and one that does not yet call it changes nothing. Re-runnable: the
-- table, its index and its policy if not exists, the functions replaced, the one whose signature changed dropped first.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- the queue */

create table if not exists public.person_doubts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  contact_id  uuid not null,
  other_id    uuid not null,
  seen        text not null,
  settled_at  timestamptz,
  settled_by  uuid,
  settled_as  text,
  created_at  timestamptz not null default now(),
  -- Each record named with its workspace (the fence every child keeps, database/fences): a pair across two workspaces
  -- cannot be written.
  constraint person_doubts_contact_id_same_workspace
    foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  constraint person_doubts_other_id_same_workspace
    foreign key (tenant_id, other_id) references public.contacts (tenant_id, id) on delete cascade,
  constraint person_doubts_seen_check check (seen in ('name', 'phone', 'email')),
  constraint person_doubts_settled_as_check check (settled_as is null or settled_as in ('merged', 'not_the_same')),
  constraint person_doubts_settled_whole check ((settled_at is null) = (settled_as is null)),
  constraint person_doubts_two_records check (contact_id <> other_id),
  constraint person_doubts_pair_once unique (tenant_id, contact_id, other_id)
);
create index if not exists person_doubts_open_contact on public.person_doubts (tenant_id, contact_id) where settled_at is null;
create index if not exists person_doubts_open_other on public.person_doubts (tenant_id, other_id) where settled_at is null;
alter table public.person_doubts enable row level security;
drop policy if exists person_doubts_member_select on public.person_doubts;
create policy person_doubts_member_select on public.person_doubts
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.person_doubts from anon, authenticated;
grant select on public.person_doubts to authenticated;
grant all on public.person_doubts to service_role;
comment on table public.person_doubts is
  'The queue in front of merge_people (decision 0034, step 4): two living records one identity could belong to, written by resolve_person once per pair (the lower id first), open until an owner merges them (00326) or a member says they are not the same (person_doubt_dismiss). Never the identity itself: `seen` says which of the three it was. An erasure takes every row that names the person; a merge settles the pair and moves the merged record''s other doubts onto the kept one.';
comment on column public.person_doubts.seen is
  'Which identity either record could own, as the door saw it: name, phone or email. Never the value.';
comment on column public.person_doubts.settled_as is
  'How the pair was settled: merged (0028''s door, through the contacts trigger) or not_the_same (person_doubt_dismiss). Null while open.';

/* The erasure and the merge, on the doubts that name the record: the legs the other triggers on contacts run. */
create or replace function public.person_doubts_on_contact_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep uuid := new.merged_into_contact_id;
begin
  if new.erased_at is not null and old.erased_at is null then
    delete from public.person_doubts d where d.contact_id = new.id or d.other_id = new.id;
  end if;
  if v_keep is not null and old.merged_into_contact_id is null then
    -- The pair itself: settled by the merge.
    update public.person_doubts d
       set settled_at = now(), settled_as = 'merged', settled_by = auth.uid()
     where d.tenant_id = new.tenant_id and d.settled_at is null
       and ((d.contact_id = new.id and d.other_id = v_keep) or (d.contact_id = v_keep and d.other_id = new.id));
    -- A third record's doubt with the merged one is the kept record's now, unless the kept record already has the pair.
    delete from public.person_doubts d
     where d.tenant_id = new.tenant_id and d.settled_at is null
       and (d.contact_id = new.id or d.other_id = new.id)
       and exists (
         select 1 from public.person_doubts k
          where k.tenant_id = d.tenant_id and k.id <> d.id
            and least(k.contact_id, k.other_id) = least(v_keep, case when d.contact_id = new.id then d.other_id else d.contact_id end)
            and greatest(k.contact_id, k.other_id) = greatest(v_keep, case when d.contact_id = new.id then d.other_id else d.contact_id end));
    update public.person_doubts d
       set contact_id = least(v_keep, d.other_id), other_id = greatest(v_keep, d.other_id)
     where d.tenant_id = new.tenant_id and d.settled_at is null and d.contact_id = new.id and d.other_id <> v_keep;
    update public.person_doubts d
       set contact_id = least(v_keep, d.contact_id), other_id = greatest(v_keep, d.contact_id)
     where d.tenant_id = new.tenant_id and d.settled_at is null and d.other_id = new.id and d.contact_id <> v_keep;
  end if;
  return new;
end $$;

-- A definer trigger function fires for every writer and is callable by none of them (database/privileges.db.test.mjs).
revoke all on function public.person_doubts_on_contact_change() from public, anon, authenticated;

drop trigger if exists contacts_change_settles_doubts on public.contacts;
create trigger contacts_change_settles_doubts
  after update of erased_at, merged_into_contact_id on public.contacts
  for each row execute function public.person_doubts_on_contact_change();

create or replace function public.person_doubt_dismiss(p_doubt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.person_doubts%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_row from public.person_doubts d where d.id = p_doubt_id for update;
  if v_row.id is null or not public.is_acting_member(v_row.tenant_id) then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  if v_row.settled_as = 'merged' then
    raise exception 'These two records were merged already.' using errcode = '22023';
  end if;
  if v_row.settled_at is null then
    update public.person_doubts
       set settled_at = now(), settled_as = 'not_the_same', settled_by = v_user
     where id = p_doubt_id
     returning * into v_row;
  end if;
  return jsonb_build_object('doubt_id', v_row.id, 'contact_id', v_row.contact_id, 'other_id', v_row.other_id,
                            'settled_as', v_row.settled_as, 'settled_at', v_row.settled_at);
end $$;

revoke execute on function public.person_doubt_dismiss(uuid) from public, anon;
grant execute on function public.person_doubt_dismiss(uuid) to authenticated;
comment on function public.person_doubt_dismiss(uuid) is
  'Not the same (decision 0034, step 4): a member settles a doubt, and the pair is never raised again by the next arrival. Twice is once; a pair the merge settled is refused in words.';

/* ---------------------------------------------------------------------------------------------- the door */

drop function if exists public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb);

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

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'person.resolved', 'contact', 'contact', v_id,
          jsonb_build_object(
            'outcome', v_outcome, 'matched_by', v_by, 'source', v_source, 'channel', v_channel,
            'assurance', v_assurance, 'by', v_user, 'filled', to_jsonb(v_filled), 'identity', v_identity,
            'doubt', v_other, 'doubt_seen', v_seen_as));

  return jsonb_build_object(
    'contact_id', v_id, 'outcome', v_outcome, 'existed', v_existed, 'matched_by', v_by,
    'email', v_email_out, 'filled', to_jsonb(v_filled), 'identity', v_identity,
    'doubt', v_other, 'doubt_seen', v_seen_as, 'doubt_id', v_doubt_id);
end $$;

revoke all on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) to service_role;
comment on function public.resolve_person(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) is
  'The one door a person is resolved by (decision 0034): the erasure digests first on the passive paths, then the identity, the number and the address in that order, two numbers being two people; fills what is empty and never overwrites, a name the wire gave following the wire; never merges, and writes a doubt instead for a pair the merge could join; contact.added for a new person a member, a feed or the finder brought, person.resolved for every call. The service role''s and the doors'' alone.';

/* ----------------------------------------------------------------------------------- the inbound door */

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

  -- monotone recency: a replayed/out-of-order old message can never rewind
  insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
  values (p_tenant_id, v_contact_id, v_ts, v_ts)
  on conflict (tenant_id, contact_id)
    do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                  last_inbound_at = greatest(conversations.last_inbound_at, excluded.last_inbound_at)
  returning id, state, paused_until, last_wa_inbound_at
    into v_conversation_id, v_state, v_paused, v_prev_wa;

  -- the atomic replay gate: a duplicate wamid short-circuits BEFORE any
  -- window/metering/reopen side effect
  insert into messages (tenant_id, conversation_id, contact_id, channel, direction, sender,
                        type, body, media, external_id, channel_ts, status, meta)
  values (p_tenant_id, v_conversation_id, v_contact_id, p_channel, 'inbound', 'customer',
          p_type, p_body, p_media, p_message_external_id, p_channel_ts, 'received', p_meta)
  on conflict (tenant_id, external_id) where external_id is not null do nothing
  returning id into v_message_id;

  if v_message_id is null then
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

  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'message.received', 'message', 'message', v_message_id,
          jsonb_build_object('channel', p_channel, 'type', p_type));

  return jsonb_build_object(
    'message_id', v_message_id, 'conversation_id', v_conversation_id,
    'contact_id', v_contact_id, 'is_new', true, 'processed', false,
    'state', v_state, 'paused_until', v_paused,
    'consent', v_consent, 'dnc', v_dnc);
end $$;

/* -------------------------------------------------------------------------------------- the call door */

create or replace function public.ingest_call(p_tenant_id uuid, p_retell_call_id text, p_agent_id text, p_from_e164 text, p_from_raw text, p_to_e164 text, p_direction text, p_call_type text, p_status text, p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_duration_ms integer, p_disconnection text, p_sentiment text, p_successful boolean, p_in_voicemail boolean, p_summary text, p_transcript text, p_transcript_obj jsonb, p_recording jsonb, p_public_log_url text, p_cost jsonb, p_latency jsonb, p_raw jsonb, p_analysis jsonb DEFAULT NULL::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id      uuid;
  v_conversation_id uuid;
  v_channel_id      uuid;
  v_call_id         uuid;
  v_is_new          boolean := false;
  v_rec_state       text;
  v_rec_attempts    integer;
  v_prev_duration   integer;
  v_had_row         boolean := false;
  v_ts              timestamptz := coalesce(p_started_at, now());
  v_raw             jsonb := public.scrub_call_raw(p_raw);
  -- The provider's custom analysis, filed as columns: what the caller
  -- wanted, how it ended, what a person should do next, the name they gave.
  v_wanted          text := nullif(btrim(p_analysis->>'caller_wanted'), '');
  v_outcome         text := case when p_analysis->>'outcome' in ('answered','booking_link_sent','callback_needed','voicemail','no_request','other')
                                 then p_analysis->>'outcome' end;
  v_follow_up       text := nullif(btrim(p_analysis->>'follow_up'), '');
  v_caller_name     text := nullif(btrim(p_analysis->>'caller_name'), '');
  v_analysis        jsonb := case when jsonb_typeof(p_analysis) = 'object' and p_analysis <> '{}'::jsonb then p_analysis end;
  v_person          jsonb;
begin
  -- Only the call's own workspace's line (00164): whatever agent id it
  -- carries, a call is never filed under another workspace's channel.
  select id into v_channel_id from tenant_channels
   where kind = 'voice' and external_id = p_agent_id and tenant_id = p_tenant_id;

  -- ONE ingest of a given call at a time. Taken BEFORE the prior-state read
  -- below: two concurrent deliveries that both read "no duration yet" would
  -- both meter the call.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|call|' || p_retell_call_id, 42));

  -- What we already knew about this call. The usage event must fire exactly
  -- once, when the duration FIRST becomes known -- which, for a call that
  -- arrived as `call_started`, is the second or third event, not the first.
  select true, duration_ms into v_had_row, v_prev_duration
    from calls where tenant_id = p_tenant_id and retell_call_id = p_retell_call_id;

  if p_from_e164 is not null then
    -- The caller, through the one door (00342, 00344), once per call: a row that already names them is read, not
    -- resolved again, so a live call's every transcript turn writes nothing of the person. The door takes the voice
    -- identity's lock this door took before it, keeps the identity, and moves last_seen_at to the call's start only
    -- forward.
    if v_had_row then
      select contact_id into v_contact_id from calls
       where tenant_id = p_tenant_id and retell_call_id = p_retell_call_id;
    end if;
    if v_contact_id is null then
      v_person := public.resolve_person(p_tenant_id, 'voice', p_from_e164, p_from_e164, null, null, 'observed', 'call',
                                        '{}'::jsonb, greatest(v_ts, now() - interval '10 years'));
      v_contact_id := (v_person->>'contact_id')::uuid;
    end if;

    insert into conversations (tenant_id, contact_id, last_message_at, last_inbound_at)
    values (p_tenant_id, v_contact_id, v_ts, v_ts)
    on conflict (tenant_id, contact_id)
      do update set last_message_at = greatest(conversations.last_message_at, excluded.last_message_at),
                    last_inbound_at = greatest(conversations.last_inbound_at, excluded.last_inbound_at)
      -- Only when something moves. Every transcript turn of a live call
      -- re-ingests the same started_at; an unconditional DO UPDATE wrote the
      -- row -- and fired a realtime event that repainted every surface --
      -- for no change at all.
      where conversations.last_message_at is distinct from greatest(conversations.last_message_at, excluded.last_message_at)
         or conversations.last_inbound_at is distinct from greatest(conversations.last_inbound_at, excluded.last_inbound_at)
    returning id into v_conversation_id;
    if v_conversation_id is null then
      select id into v_conversation_id from conversations
       where tenant_id = p_tenant_id and contact_id = v_contact_id;
    end if;
  end if;

  insert into calls (
    tenant_id, channel_id, retell_call_id, agent_id, contact_id, conversation_id,
    direction, call_type, from_e164, to_e164, from_raw, status,
    started_at, ended_at, duration_ms, disconnection_reason,
    sentiment, call_successful, in_voicemail, summary, transcript, transcript_object,
    recording, public_log_url, cost, latency, raw,
    wanted, outcome, follow_up, caller_name, analysis
  ) values (
    p_tenant_id, v_channel_id, p_retell_call_id, p_agent_id, v_contact_id, v_conversation_id,
    coalesce(p_direction, 'inbound'), p_call_type, p_from_e164, p_to_e164, p_from_raw,
    coalesce(p_status, 'ended'),
    p_started_at, p_ended_at, p_duration_ms, p_disconnection,
    p_sentiment, p_successful, p_in_voicemail, p_summary, p_transcript, p_transcript_obj,
    p_recording, null, p_cost, p_latency, v_raw,
    v_wanted, v_outcome, v_follow_up, v_caller_name, v_analysis
  )
  on conflict (tenant_id, retell_call_id) do update set
    status               = excluded.status,
    ended_at             = coalesce(excluded.ended_at, calls.ended_at),
    duration_ms          = coalesce(excluded.duration_ms, calls.duration_ms),
    disconnection_reason = coalesce(excluded.disconnection_reason, calls.disconnection_reason),
    sentiment            = coalesce(excluded.sentiment, calls.sentiment),
    call_successful      = coalesce(excluded.call_successful, calls.call_successful),
    in_voicemail         = coalesce(excluded.in_voicemail, calls.in_voicemail),
    summary              = coalesce(excluded.summary, calls.summary),
    transcript           = coalesce(excluded.transcript, calls.transcript),
    -- a live `transcript_updated` turn replaces the previous partial; the
    -- final transcript on call_ended replaces the last partial the same way
    transcript_object    = coalesce(excluded.transcript_object, calls.transcript_object),
    -- a stored, given-up or purged copy is TERMINAL: a re-ingest must never
    -- regress it to pending, a purged one least of all -- pending sends the
    -- copy to fetch the audio again (00148); a pending one keeps its attempt
    -- count across events
    recording            = case
                             when calls.recording->>'fetch_state' in ('stored', 'failed', 'purged') then calls.recording
                             when calls.recording->>'fetch_state' = 'pending' and excluded.recording is not null
                               then calls.recording || excluded.recording
                             else coalesce(excluded.recording, calls.recording)
                           end,
    public_log_url       = null,
    cost                 = coalesce(excluded.cost, calls.cost),
    latency              = coalesce(excluded.latency, calls.latency),
    -- the analysis arrives on call_analyzed and stays: a retried call_ended
    -- carries none and must not blank it
    wanted               = coalesce(excluded.wanted, calls.wanted),
    outcome              = coalesce(excluded.outcome, calls.outcome),
    follow_up            = coalesce(excluded.follow_up, calls.follow_up),
    caller_name          = coalesce(excluded.caller_name, calls.caller_name),
    analysis             = coalesce(excluded.analysis, calls.analysis),
    contact_id           = coalesce(calls.contact_id, excluded.contact_id),
    conversation_id      = coalesce(calls.conversation_id, excluded.conversation_id),
    -- the audit copy keeps the analysis: a retried call_ended landing after
    -- call_analyzed ranks equal and must not replace the richer payload
    raw                  = case
                             when (calls.raw ? 'call_analysis') and not (excluded.raw ? 'call_analysis') then calls.raw
                             else excluded.raw
                           end
  -- FORWARD ONLY. An event older than the row (a retried call_started after
  -- call_ended, a partial transcript after the final one) changes nothing.
  where public.call_status_rank(excluded.status) >= public.call_status_rank(calls.status)
  returning id, (xmax = 0), recording->>'fetch_state', (recording->>'attempts')::int
    into v_call_id, v_is_new, v_rec_state, v_rec_attempts;

  if v_call_id is null then
    -- The upsert declined: nothing moved, including updated_at, so a stale
    -- event cannot restart the heartbeat isLiveCall() reads. Answer from the
    -- row as it stands.
    select id, recording->>'fetch_state', (recording->>'attempts')::int, contact_id, conversation_id
      into v_call_id, v_rec_state, v_rec_attempts, v_contact_id, v_conversation_id
      from calls where tenant_id = p_tenant_id and retell_call_id = p_retell_call_id;
    return jsonb_build_object(
      'call_id', v_call_id, 'is_new', false, 'skipped', true,
      'recording_state', v_rec_state, 'recording_attempts', v_rec_attempts,
      'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
  end if;

  if v_is_new then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'call.recorded', 'call', 'call', v_call_id,
            jsonb_build_object('direction', coalesce(p_direction, 'inbound'), 'status', coalesce(p_status, 'ended')));
  end if;

  -- Metered once, on the event that first carries a duration -- and never a
  -- second row for the same call, whatever the caller believed it knew.
  if p_duration_ms is not null and p_duration_ms > 0
     and (not v_had_row or v_prev_duration is null)
     and not exists (select 1 from events e
                      where e.kind = 'usage.voice_seconds'
                        and e.subject_type = 'call'
                        and e.subject_id = v_call_id) then
    insert into events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'usage.voice_seconds', 'usage', 'call', v_call_id,
            jsonb_build_object('seconds', round(p_duration_ms / 1000.0)));
  end if;

  return jsonb_build_object(
    'call_id', v_call_id, 'is_new', v_is_new, 'skipped', false,
    'recording_state', v_rec_state, 'recording_attempts', v_rec_attempts,
    'contact_id', v_contact_id, 'conversation_id', v_conversation_id);
end $$;

/* -------------------------------------------------------------------------------------- the lead door */

create or replace function public.lead_set_stage(p_lead_id uuid, p_stage text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_fit_reason text DEFAULT NULL::text, p_outcome text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_lead     public.leads%rowtype;
  v_before   jsonb;
  v_contact  uuid;
  v_made     jsonb;
  v_existed  boolean := false;
  v_convert  boolean := coalesce(p_outcome = 'interested', false);   -- the one act that makes a person (§9.6)
  v_stage    text;
  v_hash     text;
  v_supp     boolean := false;
  v_op       uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_lead from public.leads where id = p_lead_id;
  -- A stranger learns nothing: not a member reads as not found (00027's rule).
  -- Viewers read only, so they are strangers to this door too.
  if not found or not public.is_acting_member(v_lead.tenant_id) then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.erased_at is not null or v_lead.blanked_at is not null then
    raise exception 'This lead is gone.' using errcode = 'P0002';
  end if;
  if p_stage is not null and p_stage not in ('ready', 'nurture', 'converted', 'archived') then
    raise exception 'stage must be ready, nurture, converted or archived' using errcode = '22023';
  end if;
  if p_reason is not null and p_reason not in ('said_no', 'not_a_fit', 'customer', 'stale', 'search_removed') then
    raise exception 'reason must be one of the closed reasons' using errcode = '22023';
  end if;
  if p_fit_reason is not null and p_fit_reason not in ('chain', 'wrong_kind', 'too_far', 'customer', 'other') then
    raise exception 'fit_reason must be chain, wrong_kind, too_far, customer or other' using errcode = '22023';
  end if;
  if p_outcome is not null and p_outcome not in ('interested', 'call_back', 'not_interested', 'voicemail', 'no_answer', 'wrong_number', 'emailed') then
    raise exception 'outcome must be one of the six, or emailed' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'Note too long.' using errcode = '22023';
  end if;

  v_before := jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                                 'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id);
  v_stage  := case when v_convert then 'converted' else p_stage end;

  if v_convert then
    -- A real conversation. The person whose number this is, else the person
    -- whose address it is, else a new one named for the business.
    if v_lead.contact_id is not null then
      v_contact := v_lead.contact_id;
      v_existed := true;
    else
      -- The person, through the one door (00342, 00344): whose number this is, else whose address, else a new one
      -- named for the business, as the finder's word (found), with the lead on the added event (what People reads
      -- back as "A lead you found", 00138), the address filled where nobody here holds it, and a person who asked to
      -- be forgotten refused (PE001). A number not in international form is no number.
      v_made := public.resolve_person(
        v_lead.tenant_id, null, null,
        case when v_lead.phone_e164 ~ '^\+[1-9][0-9]{7,14}$' then v_lead.phone_e164 end,
        v_lead.email, left(nullif(v_lead.business_name, ''), 80), 'found', 'lead',
        jsonb_build_object('lead_id', p_lead_id));
      v_contact := (v_made->>'contact_id')::uuid;
      v_existed := coalesce((v_made->>'existed')::boolean, false);
    end if;
  end if;

  -- One statement, so the version moves exactly once however the lead was
  -- worked, and a stage that was not named is kept (wrong_number). A conversion
  -- is lead_convert_by's (its stage, closed reason, days and version), below.
  update public.leads
     set stage         = case when v_convert then stage else coalesce(v_stage, stage) end,
         closed_reason = case when v_convert then closed_reason
                              when v_stage = 'archived' then p_reason
                              when v_stage is not null then null
                              else closed_reason end,
         phone_wrong   = (phone_wrong or coalesce(p_outcome, '') = 'wrong_number'),
         contact_id    = coalesce(v_contact, contact_id),
         contacted_at  = case when not v_convert and coalesce(v_stage, '') in ('nurture', 'converted') then coalesce(contacted_at, now()) else contacted_at end,
         last_outcome  = coalesce(p_outcome, last_outcome),
         last_note     = case when p_outcome is not null then p_note else last_note end,
         version       = case when v_convert then version else version + 1 end
   where id = p_lead_id
  returning * into v_lead;

  if v_convert then
    -- Erased or blanked since it was read above: nothing converts, and the door says so rather than claim it.
    if not coalesce((public.lead_convert_by(v_lead.tenant_id, p_lead_id, 'call',
                       jsonb_build_object('contact_id', v_contact, 'existed', v_existed, 'by', v_user), true)->>'moved')::boolean, false) then
      raise exception 'This lead is gone.' using errcode = 'P0002';
    end if;
    select * into v_lead from public.leads where id = p_lead_id;
  end if;

  if p_outcome is not null and p_outcome <> 'emailed' then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.call', 'lead', 'lead', p_lead_id,
            jsonb_build_object('outcome', p_outcome, 'note', p_note, 'by', v_user));
  elsif p_outcome = 'emailed' then
    -- S12: what is recorded is that the OWNER said they sent it.
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.emailed', 'lead', 'lead', p_lead_id,
            jsonb_build_object('by', v_user));
  elsif p_reason in ('not_a_fit', 'customer') then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.not_a_fit', 'lead', 'lead', p_lead_id,
            jsonb_build_object('why', p_fit_reason, 'by', v_user));
    -- "Already a customer" hides the place from every future search (§0.4,
    -- S8). The hash is A's keyed digest, so the collect's suppression read
    -- refuses the place byte for byte.
    if p_reason = 'customer' and v_lead.place_id is not null then
      v_hash := public.lead_suppression_hash(v_lead.tenant_id, v_lead.place_id);
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (v_lead.tenant_id, 'place', v_hash, 'customer')
      on conflict (tenant_id, kind, hash) do nothing;
      v_supp := found;
    end if;
  else
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (v_lead.tenant_id, 'lead.stage', 'lead', 'lead', p_lead_id,
            jsonb_build_object('stage', v_stage, 'reason', p_reason, 'by', v_user));
  end if;

  insert into public.lead_operations (tenant_id, kind, search_id, lead_ids, before, after, version, by)
  values (v_lead.tenant_id, 'stage', null, array[p_lead_id], v_before,
          jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                             'phone_wrong', v_lead.phone_wrong, 'contact_id', v_lead.contact_id,
                             'converted', v_convert, 'suppressed', v_supp, 'place_hash', v_hash),
          v_lead.version, v_user)
  returning id into v_op;

  return jsonb_build_object('stage', v_lead.stage, 'closed_reason', v_lead.closed_reason,
                            'contact_id', v_lead.contact_id, 'existed', v_existed, 'converted', v_convert,
                            'op_id', v_op, 'version', v_lead.version);
end $$;

/* --------------------------------------------------------------------------------- the reach-out door */

create or replace function public.reach_out_person(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_email text;
  v_contact uuid;
  v_conv uuid;
  v_made boolean := false;
  v_person jsonb;
begin
  select * into v_lead from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id and erased_at is null and blanked_at is null
   for update;
  if not found then return jsonb_build_object('refused', 'lead_gone'); end if;
  -- A lead no longer being written to: it said no, was set aside, or became a customer since it was planned (a person
  -- with its address came into People, and the insert trigger linked and converted it). Its person is theirs, never a
  -- cold email's: the send is skipped before a row is written into a customer's thread.
  if v_lead.stage not in ('ready', 'nurture') then return jsonb_build_object('refused', 'lead_closed'); end if;
  v_email := nullif(lower(btrim(coalesce(v_lead.email, ''))), '');
  if v_email is null then return jsonb_build_object('refused', 'no_address'); end if;
  if v_lead.contact_id is not null then
    v_contact := v_lead.contact_id;
  else
    -- Somebody in People already has this address, as theirs or as one they wrote from: a customer, never written to
    -- cold (§4.8).
    if exists (select 1 from public.contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.erased_at is null)
       or exists (select 1 from public.contact_identities i
                    join public.contacts c on c.id = i.contact_id and c.erased_at is null
                   where i.tenant_id = p_tenant_id and i.channel = 'email' and i.external_id = v_email) then
      return jsonb_build_object('refused', 'already_yours');
    end if;
    -- The person, through the one door (00342, 00344), with the lead-link trigger told this is not a lead converting:
    -- the address as the identity, the finder's word (found), the lead on the added event, `by` the sender. A person
    -- the door finds instead of making (another lead's claim, an email in, between the look above and here) is
    -- somebody's already; an address People cannot hold is none; a person who asked to be forgotten is left alone.
    -- Each refuses, and the door's writes go back with the refusal (the block is its own transaction).
    begin
      perform set_config('chanlytics.link_lead', 'off', true);
      v_person := public.resolve_person(p_tenant_id, 'email', v_email, null, v_email,
                                        left(nullif(v_lead.business_name, ''), 80), 'found', 'lead',
                                        jsonb_build_object('lead_id', p_lead_id, 'by', 'reach_out'));
      perform set_config('chanlytics.link_lead', 'on', true);
      if coalesce((v_person->>'existed')::boolean, false) then
        raise exception 'already_yours' using errcode = 'P0003';
      end if;
      v_contact := (v_person->>'contact_id')::uuid;
    exception
      when sqlstate 'P0003' then return jsonb_build_object('refused', 'already_yours');
      when sqlstate 'PE001' then return jsonb_build_object('refused', 'erased');
      when unique_violation then return jsonb_build_object('refused', 'already_yours');
      when check_violation or sqlstate '22023' then return jsonb_build_object('refused', 'no_address');
    end;
    update public.leads set contact_id = v_contact, version = version + 1 where id = p_lead_id;
    v_made := true;
  end if;
  insert into public.conversations (tenant_id, contact_id) values (p_tenant_id, v_contact)
  on conflict (tenant_id, contact_id) do nothing;
  select id into v_conv from public.conversations where tenant_id = p_tenant_id and contact_id = v_contact;
  return jsonb_build_object('contact_id', v_contact, 'conversation_id', v_conv, 'made', v_made);
end $$;
