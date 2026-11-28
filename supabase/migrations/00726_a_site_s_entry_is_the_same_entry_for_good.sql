-- 00726 · A site's entry is the same entry for good, a flood at the website door is held for a look, a request says
-- where it stands, and a changed address keeps its history (the whole-system plan of 28 Nov 2026, lane 3: the outside
-- reviews' R2.1, R2.3, R2.4 and R3.11, and M3).
--
-- Before this: a site's entry whose id its form already had with other words was kept with its id emptied, so the same
-- entry sent again after ten minutes was a second one. The website door had no limit: a script with a key made a
-- person, a notice and a drafted reply for every post. A member's "Not a real request" on a site's request changed
-- nothing (form_entry_hold named hosted forms alone). The open requests stopped at 200 with no way to read on, and a
-- form's own list called every entry outside that list answered: one past its sixty days, one past the 200, and one
-- whose reply was still waiting to go. And a changed address left a line that named neither address, carried a yes to
-- offers by email to an address that never gave one, and forgot that the old address had bounced.
--
--   form_entries.sent_ref   The id a site sent on an entry kept as a clash (its form already had that id with other
--                           words). Not unique: the form's first entry holds the id itself (`ref`).
--   form_entry_take         Re-made from 00709 with one more optional input, so the code before it calls it as it did.
--                           A clash is the same entry again by its form, the id it was sent with and its words, with no
--                           time limit. `p_held_why`: the entry is kept held for a look, with who it is about as typed
--                           (`reach`) and no person, no event and no stamp on its form or site; the same entry again is
--                           answered `held`.
--   form_entry_let_through  Re-made from 00717: a site's held entry let through is resolved as the website's, owes what
--   form_entry_hold         the door said it owed, stamps its form and site and writes its form_entry.accepted then. A
--                           site's request can be held by a member's word as a hosted form's can.
--   form_requests_open      Re-made from 00709 with an optional place to read on from (`p_before`, `p_before_id`): the
--                           next 200 older than it. With neither, as before.
--   form_entries_standing   New, a member's read: where the named entries stand. Answered (and how: a member's word, a
--                           conversation, a reply that left), sending (its only answer is a reply still waiting to go),
--                           open, or aged (nobody answered it and its sixty days passed).
--   set_person_email        Re-made from 00171: an address that changes is said with the old and the new one in its
--                           event, a yes to offers by email given by the old address is set back to not asked, and what
--                           stopped mail to the old address is kept with the change and stops it again if that address
--                           comes back.
--   scrub_contact_events    Re-made: an erased person's contact.email_set events are scrubbed with their name's.
--
-- Deploy order: this file first, then the code. The code before it calls every door here as it did, and each answers as
-- it did. Taking the code back leaves all of this harmless, but for one thing: an entry held at the door and sent again
-- is answered `held`, which the code before this reads as a failure and refuses (503) until the entry is let through.
-- Locks: one column and one index added on form_entries (hundreds of rows). Three seconds and no more. Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------- 1. the id as sent -- */

alter table public.form_entries
  add column if not exists sent_ref text check (sent_ref is null or char_length(sent_ref) between 1 and 100);
create index if not exists form_entries_sent_ref on public.form_entries (tenant_id, outside_form_id, sent_ref)
  where sent_ref is not null;
comment on column public.form_entries.sent_ref is
  'The id a site sent on an entry kept as a clash (00726): its form already had that id with other words, so the id itself (ref) stays with the first. The same form, this id and the same words again are this entry, with no time limit. Not unique.';

/* ------------------------------------------------------------------------------------- 2. the door's write -- */

drop function if exists public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text, jsonb, boolean);
create or replace function public.form_entry_take(
  p_tenant_id  uuid,
  p_form       text,
  p_answers    jsonb,
  p_person     jsonb,
  p_words      text,
  p_owed       text[],
  p_key_id     uuid default null,
  p_ref        text default null,
  p_form_ref   text default null,
  p_form_name  text default null,
  p_host       text default null,
  p_source     jsonb default null,
  p_test       boolean default false,
  p_held_why   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_site      uuid;
  v_outside   uuid;
  v_entry     uuid;
  v_contact   uuid;
  v_person    jsonb;
  v_same      boolean;
  v_clash     boolean := false;
  v_test      boolean := coalesce(p_test, false);
  v_ref       text := nullif(btrim(coalesce(p_ref, '')), '');
  v_sent      text;
  v_held      text := nullif(btrim(coalesce(p_held_why, '')), '');
  v_form_ref  text := left(nullif(btrim(coalesce(p_form_ref, '')), ''), 100);
  v_form_name text := left(nullif(btrim(coalesce(p_form_name, '')), ''), 120);
  v_host      text := lower(nullif(btrim(coalesce(p_host, '')), ''));
  v_source    jsonb := case when jsonb_typeof(p_source) = 'object' and octet_length(p_source::text) <= 4000
                            then p_source end;
  v_reach     jsonb;
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_form is null or p_form not in ('signup', 'request') then
    raise exception 'A form is a sign-up or a request.' using errcode = '22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or p_person is null or jsonb_typeof(p_person) <> 'object' then
    raise exception 'The answers and the person are objects.' using errcode = '22023';
  end if;
  if p_words is null or p_words !~ '^[0-9a-f]{64}$' then
    raise exception 'The words are a digest.' using errcode = '22023';
  end if;
  if v_held is not null and v_held not in ('too_many') then
    raise exception 'The door holds an entry for one reason: too many.' using errcode = '22023';
  end if;
  if v_host is not null and (char_length(v_host) > 253 or v_host !~ '^[a-z0-9][a-z0-9.-]*$') then
    v_host := null;
  end if;

  -- The site was used, whatever becomes of the entry. The first key is a row from its first use on. Its row is held
  -- until this write ends, so two first entries at once make one site.
  if p_key_id is null then
    insert into public.form_keys as k (tenant_id, first, last_used_at)
    values (p_tenant_id, true, now())
    on conflict (tenant_id) where first do update set last_used_at = now()
    returning k.id, k.site_id into p_key_id, v_site;
  else
    update public.form_keys k set last_used_at = now()
     where k.tenant_id = p_tenant_id and k.id = p_key_id
    returning k.site_id into v_site;
  end if;
  if v_site is null then
    insert into public.form_sites (tenant_id, name)
    values (p_tenant_id, (select k.name from public.form_keys k where k.tenant_id = p_tenant_id and k.id = p_key_id))
    returning id into v_site;
    update public.form_keys k set site_id = v_site where k.tenant_id = p_tenant_id and k.id = p_key_id;
  end if;
  update public.form_sites s set host = v_host
   where s.tenant_id = p_tenant_id and s.id = v_site and s.host is null and v_host is not null;

  -- A test tells nobody, keeps nobody and names no form: the site stands at "test received" from now.
  if v_test then
    insert into public.form_entries (tenant_id, contact_id, key_id, form, answers, words, owed, source, test)
    values (p_tenant_id, null, p_key_id, p_form, p_answers, p_words, '{}', v_source, true)
    returning id into v_entry;
    update public.form_sites s set test_at = now() where s.tenant_id = p_tenant_id and s.id = v_site;
    return jsonb_build_object('outcome', 'test', 'entry_id', v_entry, 'contact_id', null, 'clash', false);
  end if;

  -- Its form: found by its site, kind and id, or made, its requests from now. The name the site sends is kept as sent.
  insert into public.outside_forms as o (tenant_id, kind, site_id, form, ref, sent_name)
  values (p_tenant_id, 'website', v_site, p_form, v_form_ref, v_form_name)
  on conflict (tenant_id, site_id, form, ref) do update set sent_name = coalesce(excluded.sent_name, o.sent_name)
  returning o.id into v_outside;

  -- Once, within its form. The site's own id is the entry's: the same id with the same words is the same entry, and
  -- with other words a new one, its id left with the first and said (`clash`), never merged. That new one keeps the id
  -- as sent (sent_ref), so the same id with ITS words again is that entry, however much later (00726). With no id, the
  -- same words within ten minutes are a retry (call 19), and later they are a new entry. Two at once wait for each
  -- other. An entry found again that is held for a look has no person yet, and is answered as held.
  if v_ref is not null then
    select e.id, e.contact_id, e.words = p_words into v_entry, v_contact, v_same
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.ref = v_ref;
    if v_entry is not null and v_same then
      return jsonb_build_object('outcome', case when v_contact is null then 'held' else 'again' end,
                                'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
    if v_entry is not null then
      v_clash := true;
      v_sent := v_ref;
      v_ref := null;
      v_entry := null;
      v_contact := null;
    end if;
  end if;
  if v_ref is null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|form_entry|' || v_outside::text || '|' || p_words, 0));
    if v_sent is not null then
      select e.id, e.contact_id into v_entry, v_contact
        from public.form_entries e
       where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.sent_ref = v_sent and e.words = p_words
       order by e.created_at
       limit 1;
    end if;
    if v_entry is null then
      select e.id, e.contact_id into v_entry, v_contact
        from public.form_entries e
       where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.words = p_words and e.ref is null
         and e.created_at > now() - interval '10 minutes'
       order by e.created_at desc
       limit 1;
    end if;
    if v_entry is not null then
      return jsonb_build_object('outcome', case when v_contact is null then 'held' else 'again' end,
                                'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
  end if;

  if v_held is not null then
    -- Past the door's limit (00726): kept for a look with who it is about as typed, never dropped, never the bell. No
    -- person is made, and nothing it owes starts, until a member lets it through (form_entry_let_through).
    v_reach := jsonb_strip_nulls(jsonb_build_object(
      'name', nullif(btrim(coalesce(p_person ->> 'name', '')), ''),
      'email', nullif(btrim(coalesce(p_person ->> 'email', '')), ''),
      'phone', nullif(btrim(coalesce(p_person ->> 'phone', '')), '')));
  else
    -- The person through the one door, as the website's. A person who asked to be forgotten is not made again, and
    -- nothing of theirs is written: the door's own writes are taken back with it.
    begin
      v_person := public.resolve_person(
        p_tenant_id, '', '', coalesce(p_person ->> 'phone', ''), coalesce(p_person ->> 'email', ''),
        coalesce(p_person ->> 'name', ''), 'found', 'website', coalesce(p_person -> 'detail', '{}'::jsonb));
    exception when sqlstate 'PE001' then
      return jsonb_build_object('outcome', 'forgotten', 'entry_id', null, 'contact_id', null, 'clash', false);
    end;
    v_contact := (v_person ->> 'contact_id')::uuid;
  end if;

  -- The entry, where its visitor came from, its form: one write.
  begin
    insert into public.form_entries (tenant_id, contact_id, key_id, form, answers, ref, sent_ref, words, owed, state,
                                     held_why, outside_form_id, source, reach)
    values (p_tenant_id, v_contact, p_key_id, p_form, p_answers, v_ref, v_sent, p_words, coalesce(p_owed, '{}'),
            case when v_held is null then 'accepted' else 'held' end, v_held, v_outside, v_source, v_reach)
    returning id into v_entry;
  exception when unique_violation then
    -- The same site id at the same moment, kept by the other post: the same entry where its words are these, and
    -- where they are not, a new one, its id left with the first and said, as above: once by its sent id and words.
    select e.id, e.contact_id, e.words = p_words into v_entry, v_contact, v_same
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.ref = v_ref;
    if v_same then
      return jsonb_build_object('outcome', case when v_contact is null then 'held' else 'again' end,
                                'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|form_entry|' || v_outside::text || '|' || p_words, 0));
    select e.id, e.contact_id into v_entry, v_contact
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.sent_ref = v_ref and e.words = p_words
     order by e.created_at
     limit 1;
    if found then
      return jsonb_build_object('outcome', case when v_contact is null then 'held' else 'again' end,
                                'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
    v_clash := true;
    v_contact := (v_person ->> 'contact_id')::uuid;
    insert into public.form_entries (tenant_id, contact_id, key_id, form, answers, ref, sent_ref, words, owed, state,
                                     held_why, outside_form_id, source, reach)
    values (p_tenant_id, v_contact, p_key_id, p_form, p_answers, null, v_ref, p_words, coalesce(p_owed, '{}'),
            case when v_held is null then 'accepted' else 'held' end, v_held, v_outside, v_source, v_reach)
    returning id into v_entry;
  end;

  if v_held is not null then
    return jsonb_build_object('outcome', 'held', 'entry_id', v_entry, 'contact_id', null, 'clash', v_clash);
  end if;

  update public.outside_forms o
     set first_entry_at = coalesce(o.first_entry_at, now()), last_entry_at = now()
   where o.tenant_id = p_tenant_id and o.id = v_outside;
  update public.form_sites s
     set first_entry_at = coalesce(s.first_entry_at, now()), last_entry_at = now()
   where s.tenant_id = p_tenant_id and s.id = v_site;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', v_entry,
          jsonb_build_object('form', p_form, 'owed', to_jsonb(coalesce(p_owed, '{}'))));

  return jsonb_build_object('outcome', 'accepted', 'entry_id', v_entry, 'contact_id', v_contact,
                            'person', v_person ->> 'outcome', 'clash', v_clash);
end $$;

revoke all on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text, jsonb, boolean, text) to service_role;
comment on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text, jsonb, boolean, text) is
  'The website form door''s one write (00675, 00709, 00726): the key''s last use and its site (the first key''s row and site made at their first use), the form the entry is of (found by its site, kind and the site''s id for it, or made), the once rule within that form (the site''s own id, the same words with it; an id the form had with other words kept as a new entry under the id as sent, and the same again by that id and its words with no time limit; with no id, the same words within ten minutes), the person through resolve_person as the website''s, the entry with where its visitor came from, and its form_entry.accepted event, together. A test keeps no person, owes nothing, names no form, writes no event and stamps its site''s test_at. An entry past the door''s limit (p_held_why: too_many) is kept held with who it is about as typed, no person, no event and no stamp, until form_entry_let_through. Answers {outcome: accepted|again|held|forgotten|test, entry_id, contact_id, person, clash}: clash is an id the form had with other words, kept as a new entry; held is also the answer for a held entry sent again. The service role''s alone.';

/* --------------------------------------------------------------------- 3. a site's entry held, and let through -- */

create or replace function public.form_entry_hold(p_tenant_id uuid, p_entry_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  -- 00717: a signed-in member is asked who they are. The service role (the edge, a deploy from before this door asked)
  -- and a session of the database itself (a clock, a migration) name their workspace themselves, as before.
  v_member boolean := auth.uid() is not null;
  v_held integer;
begin
  if v_member then
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- A hosted form's entry, or a site's (00726): a test names neither and is never held.
  update public.form_entries
     set state = 'held', held_why = 'member'
   where tenant_id = p_tenant_id and id = p_entry_id and (form_id is not null or outside_form_id is not null)
     and state <> 'held' and not test;
  get diagnostics v_held = row_count;
  if v_held > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form_entry.held', 'contact', 'form_entry', p_entry_id,
            jsonb_strip_nulls(jsonb_build_object('why', 'member', 'by', auth.uid())));
  end if;
  return v_held > 0;
end $$;
comment on function public.form_entry_hold(uuid, uuid) is
  'A request a member says is not a real one, held (00680; a site''s too, 00726): it leaves every count and waits in its form''s held pile, where form_entry_let_through brings it back. Answers whether one was held. A member who acts (is_acting_member), or the service role (00717).';

create or replace function public.form_entry_let_through(p_tenant_id uuid, p_entry_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- 00717: a signed-in member is asked who they are. The service role (the edge, a deploy from before this door asked)
  -- and a session of the database itself (a clock, a migration) name their workspace themselves, as before.
  v_member boolean := auth.uid() is not null;
  v_entry   public.form_entries%rowtype;
  v_person  jsonb;
  v_contact uuid;
  v_owed    text[] := array['note', 'notice'];
begin
  if v_member then
    if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
      raise exception 'Not yours to change.' using errcode = '42501';
    end if;
  elsif coalesce((select auth.role()), '') in ('anon', 'authenticated') then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select * into v_entry from public.form_entries e
   where e.tenant_id = p_tenant_id and e.id = p_entry_id and e.state = 'held'
   for update;
  if not found then
    return jsonb_build_object('outcome', 'gone', 'entry_id', p_entry_id, 'contact_id', null);
  end if;
  -- A request a member had set aside has its person and has told its owner already: it is only a request again.
  if v_entry.contact_id is not null then
    update public.form_entries e
       set held_why = null,
           state = case when exists (select 1 from unnest(e.owed) o
                                      where (e.effects -> o ->> 'state') is distinct from 'done')
                        then 'accepted' else 'processed' end
     where e.tenant_id = p_tenant_id and e.id = p_entry_id;
    return jsonb_build_object('outcome', 'back', 'entry_id', p_entry_id, 'contact_id', v_entry.contact_id);
  end if;
  -- A site's entry the door held (00726): its person is resolved now as the website's, from who it is about as typed
  -- and what the site sent with it; it owes what the door said it owed; its form and its site are stamped and its
  -- event written now. A person who asked to be forgotten is not made again, and the entry goes.
  if v_entry.outside_form_id is not null then
    begin
      v_person := public.resolve_person(
        p_tenant_id, '', '', coalesce(v_entry.reach ->> 'phone', ''), coalesce(v_entry.reach ->> 'email', ''),
        coalesce(v_entry.reach ->> 'name', ''), 'found', 'website',
        jsonb_build_object('form', v_entry.form, 'about', v_entry.answers -> 'about', 'page', v_entry.answers -> 'page',
                           'lang', v_entry.answers -> 'lang', 'at', v_entry.answers -> 'at'));
    exception when sqlstate 'PE001' then
      delete from public.form_entries e where e.tenant_id = p_tenant_id and e.id = p_entry_id;
      return jsonb_build_object('outcome', 'forgotten', 'entry_id', null, 'contact_id', null);
    end;
    v_contact := (v_person ->> 'contact_id')::uuid;
    update public.form_entries
       set contact_id = v_contact, state = 'accepted', held_why = null
     where tenant_id = p_tenant_id and id = p_entry_id;
    update public.outside_forms o
       set first_entry_at = coalesce(o.first_entry_at, now()), last_entry_at = now()
     where o.tenant_id = p_tenant_id and o.id = v_entry.outside_form_id;
    update public.form_sites s
       set first_entry_at = coalesce(s.first_entry_at, now()), last_entry_at = now()
     where s.tenant_id = p_tenant_id
       and s.id = (select o.site_id from public.outside_forms o
                    where o.tenant_id = p_tenant_id and o.id = v_entry.outside_form_id);
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', p_entry_id,
            jsonb_build_object('form', v_entry.form, 'owed', to_jsonb(v_entry.owed)));
    return jsonb_build_object('outcome', 'accepted', 'entry_id', p_entry_id, 'contact_id', v_contact);
  end if;
  -- Its person is resolved now, and its event written now: everything it should have started starts now. A person
  -- who asked to be forgotten is not made again, and the entry goes.
  begin
    v_person := public.resolve_person(
      p_tenant_id, '', '', coalesce(v_entry.reach ->> 'phone', ''), coalesce(v_entry.reach ->> 'email', ''),
      coalesce(v_entry.reach ->> 'name', ''), 'found', 'form', jsonb_build_object('form_id', v_entry.form_id));
  exception when sqlstate 'PE001' then
    delete from public.form_entries e where e.tenant_id = p_tenant_id and e.id = p_entry_id;
    return jsonb_build_object('outcome', 'forgotten', 'entry_id', null, 'contact_id', null);
  end;
  v_contact := (v_person ->> 'contact_id')::uuid;
  update public.form_entries
     set contact_id = v_contact, state = 'accepted', held_why = null, owed = v_owed
   where tenant_id = p_tenant_id and id = p_entry_id;
  update public.forms set last_entry_at = now() where tenant_id = p_tenant_id and id = v_entry.form_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', p_entry_id,
          jsonb_build_object('form', 'request', 'owed', to_jsonb(v_owed), 'form_id', v_entry.form_id));
  return jsonb_build_object('outcome', 'accepted', 'entry_id', p_entry_id, 'contact_id', v_contact);
end $$;
comment on function public.form_entry_let_through(uuid, uuid) is
  'A held form entry let through (00680; a site''s too, 00726): one held with no person has its person resolved now and its form_entry.accepted written now, so its note and its notice start then (a site''s as the website''s, owing what the door said it owed, its form and site stamped then); one a member had set aside is a request again, and tells nobody twice. Answers {outcome: accepted|back|forgotten|gone, entry_id, contact_id}: a forgotten person''s entry is deleted. A member who acts (is_acting_member), or the service role (00717).';

/* ---------------------------------------------------------------------------- 4. the open requests, read on -- */

drop function if exists public.form_requests_open(uuid);
create or replace function public.form_requests_open(
  p_tenant_id uuid,
  p_before    timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language sql stable set search_path = public as $$
  -- A request is open until a link answers it: a member's word, a conversation that took it over, or a reply whose
  -- message did not fail and was not taken back. Sixty days: an older one stays in its form's own list. A hosted
  -- form's request says the time it asked for as its visit stands now (00691); a website's is a request from its form's
  -- requests_from on (00709), its heading the form's name, its answers the site's own fields. Read on from where a
  -- list ended (00726): the next 200 older than p_before, and among those of its very moment, below p_before_id.
  select coalesce(jsonb_agg(r.line order by r.created_at desc, r.id desc), '[]'::jsonb)
    from (
      select e.created_at, e.id,
             jsonb_build_object(
               'id', e.id, 'form_id', e.form_id, 'version_id', e.version_id, 'outside_form_id', e.outside_form_id,
               'contact_id', e.contact_id, 'created_at', e.created_at, 'answers', e.answers, 'reach', e.reach,
               'place', l.place,
               'heading', coalesce(v.description ->> 'heading', o.name, o.sent_name),
               'unreached', exists (
                 select 1 from form_entry_links k
                   join messages m on m.tenant_id = k.tenant_id and m.id = k.message_id
                  where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'reply'
                    and m.status = 'failed'),
               'time', (
                 select jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
                                           'service', a.service, 'status', a.status, 'expires_at', a.expires_at,
                                           'timezone', a.timezone)
                   from form_entry_links k
                   join appointments a on a.tenant_id = k.tenant_id and a.id = k.appointment_id
                  where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit'
                  order by k.created_at desc
                  limit 1)) as line
        from form_entries e
        left join form_versions v on v.tenant_id = e.tenant_id and v.id = e.version_id
        left join outside_forms o on o.tenant_id = e.tenant_id and o.id = e.outside_form_id
        left join links l on l.tenant_id = e.tenant_id and l.id = e.link_id
       where e.tenant_id = p_tenant_id
         and e.state <> 'held' and not e.test
         and ((e.form_id is not null and v.id is not null)
              or (o.id is not null and e.form = 'request' and e.created_at >= o.requests_from))
         and e.created_at > now() - interval '60 days'
         and (p_before is null
              or e.created_at < p_before
              or (p_before_id is not null and e.created_at = p_before and e.id < p_before_id))
         and not exists (
               select 1 from form_entry_links k
                where k.tenant_id = e.tenant_id and k.entry_id = e.id
                  and (k.kind in ('marked', 'conversation')
                       or (k.kind = 'reply' and exists (
                             select 1 from messages m
                              where m.tenant_id = k.tenant_id and m.id = k.message_id
                                and m.status not in ('failed', 'canceled')))))
       order by e.created_at desc, e.id desc
       limit 200) r;
$$;
revoke all on function public.form_requests_open(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.form_requests_open(uuid, timestamptz, uuid) to authenticated, service_role;
comment on function public.form_requests_open(uuid, timestamptz, uuid) is
  'The requests of a workspace''s forms nobody has answered (00680, 00691, 00709, 00726; the Forms plan, 3.5), newest first, 200 at most over sixty days, read under the member''s own row rules: a hosted form''s, and a website form''s from its requests_from on. Each with its answers, who it is about as typed (reach: a hosted form''s), its form''s heading (a website form''s name, null where it has none yet), the outside form it is of, the place it came through, whether a reply to it failed to reach them (unreached), and the time it asked for as its visit stands now. Answered is a marked link, a conversation link, or a reply whose message did not fail and was not taken back. p_before and p_before_id read on from where a list ended: the next 200 older than that request. Counted whole by form_requests_open_count; where any one entry stands is form_entries_standing''s.';

/* --------------------------------------------------------------------------- 5. where a named entry stands -- */

create or replace function public.form_entries_standing(p_tenant_id uuid, p_entry_ids uuid[])
returns jsonb
language sql stable set search_path = public as $$
  -- Nothing here is kept apart from the record (00726): each standing is read from the entry's own links and their
  -- messages, by form_requests_open's rule. Answered: a member's word (marked), a conversation that took it over, or a
  -- reply that left (its message neither failed, taken back, nor still waiting to go), said by the first of those
  -- there is and when. Sending: no such answer, and a reply to it still waits to go (queued, for the seconds it can be
  -- taken back); form_requests_open counts it answered until that reply fails. Aged: nobody answered it and its sixty
  -- days in Needs you passed. Open: none of these. Unreached: a reply to it failed. Held and test are the entry's own
  -- columns, which its reader reads beside this.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'standing', s.standing, 'how', s.how, 'at', s.at, 'conversation_id', s.conversation_id,
           'unreached', s.unreached)), '[]'::jsonb)
    from (
      select e.id,
             case when a.how is not null then 'answered'
                  when exists (
                         select 1 from form_entry_links k
                           join messages m on m.tenant_id = k.tenant_id and m.id = k.message_id
                          where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'reply'
                            and m.status = 'queued') then 'sending'
                  when e.created_at <= now() - interval '60 days' then 'aged'
                  else 'open' end as standing,
             a.how, a.at, a.conversation_id,
             exists (
               select 1 from form_entry_links k
                 join messages m on m.tenant_id = k.tenant_id and m.id = k.message_id
                where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'reply'
                  and m.status = 'failed') as unreached
        from form_entries e
        left join lateral (
          select k.kind as how, k.created_at as at, k.conversation_id
            from form_entry_links k
           where k.tenant_id = e.tenant_id and k.entry_id = e.id
             and (k.kind in ('marked', 'conversation')
                  or (k.kind = 'reply' and exists (
                        select 1 from messages m
                         where m.tenant_id = k.tenant_id and m.id = k.message_id
                           and m.status not in ('failed', 'canceled', 'queued'))))
           order by case k.kind when 'marked' then 0 when 'conversation' then 1 else 2 end, k.created_at desc
           limit 1) a on true
       where e.tenant_id = p_tenant_id and e.id = any (coalesce(p_entry_ids, '{}'::uuid[]))) s;
$$;
revoke all on function public.form_entries_standing(uuid, uuid[]) from public, anon;
grant execute on function public.form_entries_standing(uuid, uuid[]) to authenticated, service_role;
comment on function public.form_entries_standing(uuid, uuid[]) is
  'Where the named entries of a workspace''s forms stand (00726), read under the member''s own row rules from each entry''s links and their messages, by form_requests_open''s rule: [{id, standing: answered|sending|open|aged, how: marked|conversation|reply (what answered it, a member''s word first), at, conversation_id, unreached}]. Sending: its only answer is a reply still waiting to go. Aged: nobody answered it and its sixty days passed. Unreached: a reply to it failed. An entry of another workspace, or one the member may not read, is not in the answer.';

/* --------------------------------------------------------------------------- 6. an address that changes -- */

create or replace function public.set_person_email(p_contact_id uuid, p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;
comment on function public.set_person_email(uuid, text) is
  'Set or clear a person''s email address: a member where the person lives, or the edge with no session recording what the customer wrote. One address per person per workspace; the event says which of the two set it, and a first address is never named. Where an address is replaced or cleared (00726) the event also holds the one before and the one after (was, now) and what had stopped mail to the one before (was_stopped, was_stopped_at), dropped when the person is erased; a yes to offers by email given by the address before is set back to not asked (source address_changed, with contact.consent_changed); and an address that comes back stopped as it left is stopped again.';

create or replace function public.scrub_contact_events(p_tenant_id uuid, p_contact_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update events e
     set data = (
           select coalesce(jsonb_object_agg(t.k, t.v), '{}'::jsonb)
             from jsonb_each(e.data) as t(k, v)
            where t.k in ('by', 'source')
         ) || jsonb_build_object('scrubbed_at', now())
   where e.tenant_id    = p_tenant_id
     and e.subject_type = 'contact'
     and e.subject_id   = p_contact_id
     and e.kind in ('contact.named', 'contact.added', 'contact.email_set')
     -- Idempotent, and it does not churn a row that holds nothing: whatever
     -- is left once the kept keys are removed is the reason to write.
     and (e.data - 'by' - 'source' - 'scrubbed_at') <> '{}'::jsonb;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
comment on function public.scrub_contact_events(uuid, uuid) is
  'Rewrite the contact.named, contact.added and contact.email_set events of one erased person to keep only `by`, `source` and a scrubbed_at stamp. Every other key -- the name, the appointment title, the calendar uid and start, an address before and after a change (00726) -- is dropped. Returns the number of rows rewritten.';
