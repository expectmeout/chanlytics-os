-- 00644 · An ad tap keeps what the ad said (decision 0049, step P0a; the Ads build plan's step 1, 18 November 2026).
--
-- A person who taps an ad and writes arrives with Meta's referral: which ad, and what it said. Until now the message kept
-- the ad's id and kind (meta.referral, 00306) and the person was stamped `ad` with that id; the ad's own words were
-- dropped on the edge. So the page can say "An ad" and never which. From this file:
--
--   ad_entries                  One row each time someone reaches a workspace through an ad: the platform and the ad's
--                               id there, the kind of entry, whether it made the person, the message that carried it,
--                               and what the ad said (its headline, its words, its kind of media, its link). No click
--                               id: 0049 was amended on 18 November 2026, and it waits for the step that tells a
--                               platform who booked. It enriches and counts nothing: every count of people per ad reads
--                               contacts.acquired_via and acquired_ref (0049, call 5).
--   ad_entry_keep               The one door that writes it, by the message's id. Called twice. The first-touch trigger
--                               calls it with no words, in the message's own transaction, so a message whose referral is
--                               an ad has its entry from the moment it exists, whether or not it made the person. The
--                               edge calls it after the ingest with what the ad said: each part is kept or dropped
--                               alone, and the first words stand (a message delivered twice changes nothing). It reads
--                               the ad and `new_person` (00306's test) from the message's own row, so either caller
--                               opens the same entry. The service role's alone.
--   messages_note_first_touch   Calls that door where the referral is an ad, in a block of its own, so an entry that
--                               cannot be written never takes the stamp with it, and neither ever fails the message.
--   events_note_first_touch     A contact.added event whose source is `ad` stamps `ad`, with the ad the event names
--                               (data.ad_ref, keyed as 0049's call 4 keys it: meta:<id>). Nothing writes one yet: a
--                               form lead will, and without this it would be stamped `manual` and keep it.
--
-- Why the entry is opened with the message and not by a nightly pass. 0049 drew the edge making the entry and a nightly
-- check rebuilding the ones whose keep had failed. That check has to find its candidates among `messages` or
-- `contacts`, which means reading every workspace's recent messages each night or an index on one of the two busiest
-- tables. Opening the entry where the stamp is written needs neither: no read, no clock, and no hour in which a person
-- counted for an ad has no entry. What a failed keep loses is then exactly the ad's words, never the entry and never a
-- count, and the loss is counted on the row itself: an entry whose `said_at` is null is one whose words never arrived.
--
-- Whose it is. An entry names its message and no person: its person is its message's. So two people combined need
-- nothing moved (their messages move, 00420), and an erasure, which deletes the person's messages (erase_contact), takes
-- the entry with them (`on delete cascade`): what an ad said goes with the person.
--
-- The door is not a definer: it runs as its caller, which is the first-touch trigger (a definer already) or the service
-- role, and both may write the table. An entry is no fact of its own with an event of its own: it is part of the message
-- that carried it, whose door writes that message's events in the same transaction (0031).
--
-- Locks, and why this file waits half a second and no more. Creating the table takes SHARE ROW EXCLUSIVE on `tenants`
-- and on `messages` (a foreign key adds its triggers to the table it names); each is held to commit, and the file waits
-- for the second while it holds the first. A customer's write that holds one and wants the other could then wait for
-- this file while this file waits for it, and Postgres would end that after a second by cancelling whichever looked
-- first (the cycle 00306 describes). So, as 00306 does, this file's lock_timeout is 500 ms, under that second: a wait of
-- this file's ends by cancelling this file, never a customer's insert. If it times out nothing was applied (one
-- transaction): run it again when the line is quiet.
--
-- Deploy order: either. An edge ahead of this file gets PGRST202 from ad_entry_keep and goes on; a database ahead of the
-- edge opens entries whose words never arrive, which is what today's edge loses anyway. Every statement re-runs.

set local lock_timeout = '500ms';

/* ---------------------------------------------------------------------------------------------- 1. the entry -- */

create table if not exists public.ad_entries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  -- The ad as Chanlytics keeps it (0049's `ads`, which a later step makes and keys this to). Null until an account is
  -- connected and its ads adopted, and for an ad Chanlytics cannot name.
  ad_id          uuid,
  platform       text not null check (platform in ('meta', 'google', 'tiktok')),
  -- The platform's own id for the ad, as the referral gave it: the raw reference, never cut.
  platform_ad_id text not null check (char_length(platform_ad_id) between 1 and 200),
  -- chat: they tapped an ad and wrote. number and call are the entries of the doors 0049 names for later steps.
  kind           text not null check (kind in ('chat', 'number', 'call')),
  -- Whether the message that carried it is the one that made the person: 00306's test, read from the two rows. An
  -- entry that made nobody is a person who was already here, tapping an ad.
  new_person     boolean not null,
  message_id     uuid,
  -- A form lead's id at its platform, so a lead delivered twice is one entry. Nothing writes one yet.
  external_ref   text check (char_length(external_ref) between 1 and 200),
  -- What the ad said: headline, body, media_type and link, each present only where the referral said it soundly.
  -- Null with said_at until the edge's keep arrives; an empty object is an ad that said nothing that is kept.
  said           jsonb,
  said_at        timestamptz,
  created_at     timestamptz not null default now(),
  constraint ad_entries_said_is_whole
    check ((said is null) = (said_at is null) and (said is null or jsonb_typeof(said) = 'object')),
  constraint ad_entries_chat_names_its_message check (kind <> 'chat' or message_id is not null),
  -- The house fence (00279): a row that names one of this table's rows names it with its workspace.
  constraint ad_entries_tenant_id_id unique (tenant_id, id),
  constraint ad_entries_message_id_same_workspace
    foreign key (tenant_id, message_id) references public.messages (tenant_id, id) on delete cascade
);

-- One entry a message: the trigger and the edge, or a delivery handled twice, write one row.
create unique index if not exists ad_entries_one_a_message on public.ad_entries (message_id);
-- One entry a lead at its platform, in a workspace.
create unique index if not exists ad_entries_one_a_ref on public.ad_entries (tenant_id, platform, external_ref);
-- An ad's entries, newest first: who it brought, and the newest words Chanlytics holds for it.
create index if not exists ad_entries_ad on public.ad_entries (tenant_id, platform, platform_ad_id, created_at desc);

alter table public.ad_entries enable row level security;
drop policy if exists ad_entries_member_select on public.ad_entries;
create policy ad_entries_member_select on public.ad_entries
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- Members read; nothing of a session writes: an entry is opened by the database and its words kept by the edge, as the
-- service role. Every right is taken from a visitor and a member first, so the one given back is all they hold.
revoke all on public.ad_entries from anon, authenticated;
grant select on public.ad_entries to authenticated;
grant all on public.ad_entries to service_role;

comment on table public.ad_entries is
  'One row each time someone reaches a workspace through an ad (decision 0049, 00644): the platform and its own id for the ad, the kind of entry, whether it made the person, the message that carried it, and what the ad said. Its person is its message''s. Written by one door, ad_entry_keep: opened by the first-touch trigger in the message''s own transaction, its words kept by the edge afterwards. It enriches and counts nothing: counts of people per ad read contacts.acquired_via and acquired_ref. No click id is kept. Members read; the service role writes.';
comment on column public.ad_entries.ad_id is
  'The ad as Chanlytics keeps it, once an ad account is connected and its ads are adopted (0049''s ads, a later step). Null until then, and for an ad Chanlytics cannot name.';
comment on column public.ad_entries.new_person is
  'Whether the message that carried the ad is the one that made the person (00306''s test: the two rows share one created_at). False for a person who was already here and tapped an ad.';
comment on column public.ad_entries.said is
  'What the ad said where it was tapped: headline, body, media_type (Meta''s word: image or video) and link, each present only where the referral said it soundly, each bounded (ad_entry_keep). Null until the edge''s keep arrives, so an entry whose said_at is null is one whose words were lost; an empty object is an ad that said nothing that is kept. Goes with the person: an erasure deletes their messages, and the entry with them.';

/* ------------------------------------------------------------------------------------------ 2. the one door -- */

create or replace function public.ad_entry_keep(p_tenant_id uuid, p_message_id uuid, p_said jsonb)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_ad   text;
  v_new  boolean;
  v_said jsonb := '{}'::jsonb;
  v_part text;
begin
  -- The message says which ad it came from, and whether it made its person: a person and the message that made them
  -- are written in one transaction, so their created_at are one now() (00306's test).
  select nullif(btrim(m.meta #>> '{referral,source_id}'), ''),
         exists (select 1 from contacts c
                  where c.id = m.contact_id and c.tenant_id = m.tenant_id and c.created_at = m.created_at)
    into v_ad, v_new
    from messages m
   where m.id = p_message_id and m.tenant_id = p_tenant_id
     and m.direction = 'inbound' and m.sender = 'customer'
     and m.meta #>> '{referral,source_type}' = 'ad';
  if v_ad is null or char_length(v_ad) > 200 then
    return 'none';
  end if;

  insert into ad_entries (tenant_id, message_id, platform, platform_ad_id, kind, new_person)
  values (p_tenant_id, p_message_id, 'meta', v_ad, 'chat', v_new)
  on conflict (message_id) do nothing;
  if p_said is null then
    return 'opened';
  end if;

  -- Each part alone: a string within its bound is kept, anything else is dropped, and the rest stands. The edge has
  -- read them by the same bounds already (channels first-touch.ts); nothing here trusts that it did.
  if jsonb_typeof(p_said) = 'object' then
    v_part := case when jsonb_typeof(p_said -> 'headline') = 'string' then p_said ->> 'headline' end;
    if char_length(v_part) between 1 and 300 then
      v_said := v_said || jsonb_build_object('headline', v_part);
    end if;
    v_part := case when jsonb_typeof(p_said -> 'body') = 'string' then p_said ->> 'body' end;
    if char_length(v_part) between 1 and 2000 then
      v_said := v_said || jsonb_build_object('body', v_part);
    end if;
    v_part := case when jsonb_typeof(p_said -> 'media_type') = 'string' then p_said ->> 'media_type' end;
    if char_length(v_part) between 1 and 32 and v_part !~ '[[:space:]]' then
      v_said := v_said || jsonb_build_object('media_type', v_part);
    end if;
    v_part := case when jsonb_typeof(p_said -> 'link') = 'string' then p_said ->> 'link' end;
    if char_length(v_part) between 1 and 2000 and v_part ~* '^https?://' and v_part !~ '[[:space:]]' then
      v_said := v_said || jsonb_build_object('link', v_part);
    end if;
  end if;

  update ad_entries
     set said = v_said, said_at = now()
   where tenant_id = p_tenant_id and message_id = p_message_id and said_at is null;
  if found then
    return 'kept';
  end if;
  return 'already';
end $$;

revoke execute on function public.ad_entry_keep(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_entry_keep(uuid, uuid, jsonb) to service_role;
comment on function public.ad_entry_keep(uuid, uuid, jsonb) is
  'The one door that writes an ad''s entry (decision 0049, 00644), by its message''s id. It opens the entry where the message''s referral is an ad and none stands (the ad and new_person read from the message''s own row), and, given what the ad said, keeps it: headline (300), body (2000), media_type (a word, 32) and link (a web address, 2000), each kept only as a string within its bound and dropped alone otherwise. The first words stand. Answers opened (no words given), kept, already (the entry has its words: a message delivered twice) or none (the message came from no ad). Runs as its caller: the first-touch trigger, and the service role (the edge, after the ingest).';

/* ----------------------------------------------------------------------- 3. the entry is opened with the stamp -- */

-- Copied from 00306 with one addition: where the message's referral is an ad, the door is asked to open its entry, in
-- a block of its own. The trigger itself (00486) is unchanged, so no lock is taken on messages for it.
create or replace function public.messages_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text := case when NEW.meta #>> '{referral,source_type}' = 'ad'
                    then nullif(btrim(NEW.meta #>> '{referral,source_id}'), '') end;
begin
  perform public.person_set_first_touch(
    NEW.tenant_id,
    NEW.contact_id,
    case when v_ad is not null then 'ad' else NEW.channel end,
    case when v_ad is not null then v_ad else NEW.meta ->> 'line' end,
    NEW.created_at
  );
  if v_ad is not null then
    begin
      perform public.ad_entry_keep(NEW.tenant_id, NEW.id, null);
    exception when others then
      raise warning 'messages_note_first_touch: the ad entry: %', sqlerrm;
    end;
  end if;
  return null;
exception when others then
  raise warning 'messages_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.messages_note_first_touch() from public, anon, authenticated;
comment on function public.messages_note_first_touch() is
  'The first touch of the person an inbound customer message made (K3): its wire, or the ad it came from (meta.referral.source_id, when meta.referral.source_type is ad, on WhatsApp or Instagram; a post, a link or any other referral is the wire''s), with the line it came in on (meta.line). A message from an ad also has its entry opened (ad_entry_keep, 00644), whether or not it made the person, in a block of its own. Never fails the insert: a failure is a warning.';

/* --------------------------------------------------------------------- 4. a person an ad's door added is an ad's -- */

-- Copied from 00488 with one change: `ad` is a source the stamp knows, with the ad the event names as its ref.
create or replace function public.events_note_first_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_word text := NEW.data ->> 'source';
  v_via  text := case when v_word in ('calendar', 'lead', 'import', 'website', 'ad') then v_word else 'manual' end;
begin
  perform public.person_set_first_touch(
    NEW.tenant_id,
    NEW.subject_id,
    v_via,
    case when v_via = 'lead' then NEW.data ->> 'lead_id'
         when v_via = 'ad' then NEW.data ->> 'ad_ref' end
  );
  return null;
exception when others then
  raise warning 'events_note_first_touch: %', sqlerrm;
  return null;
end $$;

revoke execute on function public.events_note_first_touch() from public, anon, authenticated;
comment on function public.events_note_first_touch() is
  'The first touch of a person added at a door (K3): the source of the contact.added event beside them (calendar, lead, import, website, ad; any other word or none is manual), through person_set_first_touch, with the lead''s id as the ref where the event names one, and the ad''s (data.ad_ref, keyed by its platform: meta:<id>) for a person an ad''s own door added (0049, 00644). The mapping is people_list''s came_from for a door, written once. Never fails the event''s writer: a failure is a warning.';
