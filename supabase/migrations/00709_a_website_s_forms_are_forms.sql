-- 00709 · A website's forms are forms: each site a business sends entries from is a record with its keys under it, each
-- form it sends is a record of its own beside the forms made here, and a request from it is answered like one from a
-- form made here (Campaigns in three tabs, Lane B; the plan's section 3 and Ruben's calls 2, 3 and 5 of 23 Nov 2026).
--
-- Before this, a website's entry named no form: the open requests and the results joined each entry to its version
-- (form_requests_open, form_results: 00680, 00691), so a request from the business's own site got a note and a bell and
-- nothing else; its "where they came from" was a second write after the entry (the edge's keepFormEntrySource), lost
-- where that write failed; and a site's own entry id was held unique across the workspace (form_entries_ref, 00675), so
-- two sites that both sent entry "123" lost the second as a repeat.
--
--   form_sites            A website the business sends entries from: the name the owner gave it with its first key, its
--                         host as its entries' pages name it, when its first and last real entry came, and when a test
--                         last came. Every key belongs to one (form_keys.site_id): a key is how a site proves itself and
--                         it changes, so nothing that must last hangs on a key.
--   outside_forms         A form owned elsewhere (kind `website` now; Meta's lead forms later): its site, a request or a
--                         sign-up, the site's own stable id for it (`ref`, where it sends one), the name the site last sent
--                         and the owner's own (which wins), listed or hidden (hidden never stops its entries), from when its
--                         entries are requests, and its first and last entry. One per (workspace, site, kind of form, ref):
--                         a form renamed on the site keeps its row and its history.
--   form_entries.outside_form_id   The outside form an entry is of. An entry names a form made here or an outside form,
--                         never both; a test names neither.
--   form_entries_ref      Loosened: a site's entry id is the same entry within its own form, never across the workspace
--                         (form_entries_ref_outside); a hosted form's keep their own rule (form_entries_ref, now theirs).
--   form_entry_take       Re-made with five more inputs, each optional so the code before it calls it as it did: the
--                         site's id and name for the form, the host its page is on, where the visitor came from (kept in
--                         the same write as the entry, its event and its person), and a test. It finds the key's site
--                         (making one for a key that has none), finds or makes the outside form, keeps the once rule
--                         within that form (the same id with other words is a new entry, said as `clash`, never merged),
--                         and stamps the site and the form. A test keeps no person, owes nothing, names no form, writes
--                         no event, and moves its site to "test received"; it goes in 7 days as every test does.
--   form_key_make         Re-made with an optional site: with none, the key's name makes a site; a key changed
--   form_key_change       (form_key_change) keeps the old key's site.
--   outside_form_rename, outside_form_listed   A member's doors (is_acting_member, as form_turn): the owner's name for a
--                         form (blank goes back to the site's), and whether it is on the list.
--   form_requests_open    Re-made: a website form's requests from its `requests_from` on beside the hosted forms', each
--                         line naming its outside form; the reader before it skips a line that names no version.
--   form_requests_open_count   The open requests counted whole: Needs you and Today never count a list that stops at 200.
--   form_results          Re-made: beside each hosted form's places, each outside form's entries (`outside`), and for a
--                         sign-up, how many of its people confirmed from the email it sent them (`confirmed`).
--
-- Filling in the past: every key gets a site (one per name a workspace's keys go by, a key changed having kept its name;
-- the first key one of its own), every website entry its outside form (one per site and kind, as no site sent an id for a
-- form before), and every site its host and times. Plain SQL, so it fires no event: no bell, no draft, no second ask to
-- confirm. Each outside form made here has `requests_from` now, so no entry from before becomes an open request.
--
-- Deploy order: this file first, then the code. The code before it calls form_entry_take, form_key_make and
-- form_key_change as it did, and they answer as they did (with `clash` beside); its readers skip what they do not know (a
-- request line with no version, a results line with no form). Taking the code back leaves all of this harmless.
-- Re-runnable.

set local lock_timeout = '3s';

/* --------------------------------------------------------------------------------------------- 1. the sites -- */

create table if not exists public.form_sites (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- What the owner called it, with its first key ("Main site"); null for the first key's site, which had no name.
  name            text check (name is null or char_length(name) between 1 and 60),
  -- Its host as its entries' pages name it, without www. (contracts websiteHostOf), learned from the first that says one.
  host            text check (host is null or (char_length(host) between 1 and 253 and host ~ '^[a-z0-9][a-z0-9.-]*$')),
  first_entry_at  timestamptz,
  last_entry_at   timestamptz,
  -- When a test from it last came: a site with nothing real yet stands at "test received" from then.
  test_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint form_sites_tenant_id_id_key unique (tenant_id, id)
);

alter table public.form_sites enable row level security;
drop policy if exists form_sites_member_select on public.form_sites;
create policy form_sites_member_select on public.form_sites
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.form_sites from anon, authenticated;
grant select on public.form_sites to authenticated;
grant all on public.form_sites to service_role;

comment on table public.form_sites is
  'A website a business sends form entries from (00709; Campaigns in three tabs, Lane B): the name the owner gave it with its first key, its host as its entries'' pages name it, when its first and last real entry came, and when a test last came. Its keys name it (form_keys.site_id), so a key changed keeps the site. Members read them; form_key_make makes one, and form_entry_take stamps it.';

alter table public.form_keys add column if not exists site_id uuid;
alter table public.form_keys drop constraint if exists form_keys_site_id_same_workspace;
alter table public.form_keys add constraint form_keys_site_id_same_workspace
  foreign key (tenant_id, site_id) references public.form_sites (tenant_id, id);
create index if not exists form_keys_site on public.form_keys (tenant_id, site_id);
comment on column public.form_keys.site_id is
  'The site the key proves (00709): set as the key is made, carried to the key it is changed for, and made at the first key''s first use.';

/* ---------------------------------------------------------------------------------- 2. the outside forms -- */

create table if not exists public.outside_forms (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- Whose form it is: the business's own website now; Meta's lead forms later (the plan's F5).
  kind            text not null default 'website' check (kind in ('website')),
  site_id         uuid,
  form            text not null check (form in ('signup', 'request')),
  -- The site's own stable id for the form, where it sends one ("colour-consultation"); null: the site's one form of
  -- that kind.
  ref             text check (ref is null or char_length(ref) between 1 and 100),
  -- The name the site last sent for it, and the owner's own, which wins where set. Neither names a person.
  sent_name       text check (sent_name is null or char_length(sent_name) between 1 and 120),
  name            text check (name is null or char_length(name) between 1 and 120),
  -- Hidden only takes it off the list: its entries still arrive, still reach the Inbox and still count.
  listed          boolean not null default true,
  -- From when its entries are requests: the moment it was made, or this file's for a form that was there before it.
  requests_from   timestamptz not null default now(),
  first_entry_at  timestamptz,
  last_entry_at   timestamptz,
  created_at      timestamptz not null default now(),
  constraint outside_forms_tenant_id_id_key unique (tenant_id, id),
  constraint outside_forms_site_id_same_workspace foreign key (tenant_id, site_id)
    references public.form_sites (tenant_id, id),
  constraint outside_forms_website_has_site check (kind <> 'website' or site_id is not null)
);

-- One form per site, kind and id; a site that sends no id has one form of each kind.
create unique index if not exists outside_forms_one on public.outside_forms (tenant_id, site_id, form, ref) nulls not distinct;

alter table public.outside_forms enable row level security;
drop policy if exists outside_forms_member_select on public.outside_forms;
create policy outside_forms_member_select on public.outside_forms
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.outside_forms from anon, authenticated;
grant select on public.outside_forms to authenticated;
grant all on public.outside_forms to service_role;

comment on table public.outside_forms is
  'A form owned elsewhere (00709; Campaigns in three tabs, Lane B): a website''s own form now, Meta''s lead forms later. Its site, a request or a sign-up, the site''s own stable id for it, the name the site last sent and the owner''s own, listed or hidden (hidden never stops its entries), from when its entries are requests (requests_from), and its first and last entry. One per workspace, site, kind of form and id, so a form renamed on the site keeps its history. Members read them; form_entry_take makes them, and outside_form_rename and outside_form_listed are a member''s.';

alter table public.form_entries add column if not exists outside_form_id uuid;
alter table public.form_entries drop constraint if exists form_entries_outside_form_id_same_workspace;
alter table public.form_entries add constraint form_entries_outside_form_id_same_workspace
  foreign key (tenant_id, outside_form_id) references public.outside_forms (tenant_id, id);
alter table public.form_entries drop constraint if exists form_entries_one_form;
alter table public.form_entries add constraint form_entries_one_form
  check (form_id is null or outside_form_id is null);
create index if not exists form_entries_outside on public.form_entries (tenant_id, outside_form_id, created_at);
comment on column public.form_entries.outside_form_id is
  'The form owned elsewhere this entry is of (00709): a website''s. An entry names a form made here (form_id) or one of these, never both; a test names neither.';

/* ---------------------------------------------------------------------------------- 3. the past, filled in -- */

-- Every key with no site: one site for each name a workspace's keys go by (a key changed kept its name), the first key
-- one of its own, named as the key was.
create temporary table keys_to_site on commit drop as
  select k.tenant_id, k.name, min(k.created_at) as made, gen_random_uuid() as site_id
    from public.form_keys k
   where k.site_id is null
   group by k.tenant_id, k.name;
insert into public.form_sites (id, tenant_id, name, created_at)
  select t.site_id, t.tenant_id, t.name, t.made from keys_to_site t;
update public.form_keys k
   set site_id = t.site_id
  from keys_to_site t
 where k.site_id is null and k.tenant_id = t.tenant_id and k.name is not distinct from t.name;

-- A website entry whose key is gone: its workspace's oldest site, or one made for it.
insert into public.form_sites (tenant_id, created_at)
  select distinct e.tenant_id, now()
    from public.form_entries e
   where e.form_id is null and e.outside_form_id is null and not e.test
     and not exists (select 1 from public.form_keys k where k.tenant_id = e.tenant_id and k.id = e.key_id)
     and not exists (select 1 from public.form_sites s where s.tenant_id = e.tenant_id);

-- Every website entry's form: one per site and kind (no site sent an id for its form before), its requests from now.
create temporary table entries_to_form on commit drop as
  select e.id as entry_id, e.tenant_id, e.form, e.created_at,
         coalesce(k.site_id, (select s.id from public.form_sites s where s.tenant_id = e.tenant_id
                                order by s.created_at, s.id limit 1)) as site_id
    from public.form_entries e
    left join public.form_keys k on k.tenant_id = e.tenant_id and k.id = e.key_id
   where e.form_id is null and e.outside_form_id is null and not e.test;
insert into public.outside_forms (tenant_id, kind, site_id, form, first_entry_at, last_entry_at, created_at)
  select t.tenant_id, 'website', t.site_id, t.form, min(t.created_at), max(t.created_at), min(t.created_at)
    from entries_to_form t
   group by t.tenant_id, t.site_id, t.form
  on conflict (tenant_id, site_id, form, ref) do nothing;
update public.form_entries e
   set outside_form_id = o.id
  from entries_to_form t
  join public.outside_forms o
    on o.tenant_id = t.tenant_id and o.site_id = t.site_id and o.form = t.form and o.ref is null
 where e.id = t.entry_id and e.outside_form_id is null;

-- Every site's times, and its host from its newest entry whose page names one.
update public.form_sites s
   set first_entry_at = coalesce(s.first_entry_at, w.first_at),
       last_entry_at = greatest(s.last_entry_at, w.last_at),
       host = coalesce(s.host, w.host)
  from (
    select o.tenant_id, o.site_id, min(e.created_at) as first_at, max(e.created_at) as last_at,
           (array_agg(h.host order by e.created_at desc) filter (where h.host is not null))[1] as host
      from public.outside_forms o
      join public.form_entries e on e.tenant_id = o.tenant_id and e.outside_form_id = o.id
      cross join lateral (
        select lower(regexp_replace(substring(e.answers ->> 'page' from '^https?://([^/?#:]+)'), '^www\.', ''))
          as raw) p
      cross join lateral (
        select case when p.raw ~ '^[a-z0-9][a-z0-9.-]*$' and char_length(p.raw) <= 253 then p.raw end as host) h
     where o.site_id is not null
     group by o.tenant_id, o.site_id
  ) w
 where s.tenant_id = w.tenant_id and s.id = w.site_id;

/* ------------------------------------------------------------------------ 4. a site's entry id, per form -- */

-- A hosted form's own once rule, as before; a site's id is the same entry within its own form alone.
drop index if exists public.form_entries_ref;
create unique index if not exists form_entries_ref on public.form_entries (tenant_id, ref)
  where ref is not null and outside_form_id is null;
create unique index if not exists form_entries_ref_outside on public.form_entries (tenant_id, outside_form_id, ref)
  where ref is not null and outside_form_id is not null;

/* ------------------------------------------------------------------------------------ 5. the door's write -- */

drop function if exists public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text);
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
  p_test       boolean default false
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
  v_form_ref  text := left(nullif(btrim(coalesce(p_form_ref, '')), ''), 100);
  v_form_name text := left(nullif(btrim(coalesce(p_form_name, '')), ''), 120);
  v_host      text := lower(nullif(btrim(coalesce(p_host, '')), ''));
  v_source    jsonb := case when jsonb_typeof(p_source) = 'object' and octet_length(p_source::text) <= 4000
                            then p_source end;
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
  -- with other words a new one, its id left with the first and said (`clash`), never merged. With no id, the same
  -- words within ten minutes are a retry (call 19), and later they are a new entry. Two at once wait for each other.
  if v_ref is not null then
    select e.id, e.contact_id, e.words = p_words into v_entry, v_contact, v_same
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.ref = v_ref;
    if v_entry is not null and v_same then
      return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
    if v_entry is not null then
      v_clash := true;
      v_ref := null;
      v_entry := null;
      v_contact := null;
    end if;
  end if;
  if v_ref is null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|form_entry|' || v_outside::text || '|' || p_words, 0));
    select e.id, e.contact_id into v_entry, v_contact
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.words = p_words and e.ref is null
       and e.created_at > now() - interval '10 minutes'
     order by e.created_at desc
     limit 1;
    if v_entry is not null then
      return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
  end if;

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

  -- The entry, where its visitor came from, its form: one write.
  begin
    insert into public.form_entries (tenant_id, contact_id, key_id, form, answers, ref, words, owed, outside_form_id,
                                     source)
    values (p_tenant_id, v_contact, p_key_id, p_form, p_answers, v_ref, p_words, coalesce(p_owed, '{}'), v_outside,
            v_source)
    returning id into v_entry;
  exception when unique_violation then
    -- The same site id at the same moment, kept by the other post: the same entry where its words are these, and
    -- where they are not, a new one, its id left with the first and said, as above.
    select e.id, e.contact_id, e.words = p_words into v_entry, v_contact, v_same
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.outside_form_id = v_outside and e.ref = v_ref;
    if v_same then
      return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact, 'clash', false);
    end if;
    v_clash := true;
    v_contact := (v_person ->> 'contact_id')::uuid;
    insert into public.form_entries (tenant_id, contact_id, key_id, form, answers, ref, words, owed, outside_form_id,
                                     source)
    values (p_tenant_id, v_contact, p_key_id, p_form, p_answers, null, p_words, coalesce(p_owed, '{}'), v_outside,
            v_source)
    returning id into v_entry;
  end;

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

revoke all on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text, jsonb,
  boolean) from public, anon, authenticated;
grant execute on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text,
  jsonb, boolean) to service_role;
comment on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text, text, text, text, jsonb,
  boolean) is
  'The website form door''s one write (00675, 00709): the key''s last use and its site (the first key''s row and site made at their first use), the form the entry is of (found by its site, kind and the site''s id for it, or made), the once rule within that form (the site''s own id, the same words with it; with none, the same words within ten minutes), the person through resolve_person as the website''s, the entry with where its visitor came from, and its form_entry.accepted event, together. A test keeps no person, owes nothing, names no form, writes no event and stamps its site''s test_at. Answers {outcome: accepted|again|forgotten|test, entry_id, contact_id, person, clash}: clash is an id the form had with other words, kept as a new entry. The service role''s alone.';

/* ------------------------------------------------------------------------------------------ 6. the keys -- */

drop function if exists public.form_key_make(uuid, text, text);
create or replace function public.form_key_make(p_tenant_id uuid, p_name text, p_hash text, p_site_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_site uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'A key is named for its site, in at most 60 characters.' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A key is kept as its digest.' using errcode = '22023';
  end if;
  -- At most ten keys that still work a workspace.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|form_keys', 0));
  if (select count(*) from public.form_keys k
       where k.tenant_id = p_tenant_id and (k.ends_at is null or k.ends_at > now())) >= 10 then
    raise exception 'A workspace has at most ten keys that work. End one first.' using errcode = '22023';
  end if;
  -- Its site: the one named, or a new one, named as the key is.
  if p_site_id is null then
    insert into public.form_sites (tenant_id, name) values (p_tenant_id, btrim(p_name)) returning id into v_site;
  else
    select s.id into v_site from public.form_sites s where s.tenant_id = p_tenant_id and s.id = p_site_id;
    if v_site is null then
      raise exception 'That site isn''t here any more.' using errcode = 'P0002';
    end if;
  end if;
  insert into public.form_keys (tenant_id, name, hash, made_by, site_id)
  values (p_tenant_id, btrim(p_name), p_hash, auth.uid(), v_site)
  returning id into v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_key.set', 'settings', 'form_key', v_id,
          jsonb_build_object('act', 'made', 'by', auth.uid()));
  return v_id;
end $$;

revoke all on function public.form_key_make(uuid, text, text, uuid) from public, anon;
grant execute on function public.form_key_make(uuid, text, text, uuid) to authenticated, service_role;
comment on function public.form_key_make(uuid, text, text, uuid) is
  'An owner''s or a partner''s door (00675, 00709; caller_has_permission settings): a website''s key kept by its name and its sha-256, the key itself made and shown once by the dashboard, for the site named (p_site_id) or a new site named as the key is. At most ten keys that still work a workspace (22023); a site that is not the workspace''s, P0002. Answers the key''s id.';

create or replace function public.form_key_change(p_tenant_id uuid, p_key_id uuid, p_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old  public.form_keys%rowtype;
  v_id   uuid;
  v_name text;
  v_site uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'A key is kept as its digest.' using errcode = '22023';
  end if;
  -- A key that works and is not already on its last day: one changed twice would leave two old keys working.
  select * into v_old from public.form_keys k
   where k.tenant_id = p_tenant_id and k.id = p_key_id and k.ends_at is null
   for update;
  if not found then
    raise exception 'That key is ending or has ended already.' using errcode = 'P0002';
  end if;
  -- The new key keeps the site and its name; the first key had none, and its new one is the website's.
  v_name := coalesce(v_old.name, 'Website');
  v_site := v_old.site_id;
  if v_site is null then
    insert into public.form_sites (tenant_id, name) values (p_tenant_id, v_old.name) returning id into v_site;
    update public.form_keys k set site_id = v_site where k.tenant_id = p_tenant_id and k.id = p_key_id;
  end if;
  insert into public.form_keys (tenant_id, name, hash, made_by, site_id)
  values (p_tenant_id, v_name, p_hash, auth.uid(), v_site)
  returning id into v_id;
  -- The old one keeps working for a day, so the site can be given the new one without a form refused.
  update public.form_keys set ends_at = now() + interval '1 day' where tenant_id = p_tenant_id and id = p_key_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_key.set', 'settings', 'form_key', v_id,
          jsonb_build_object('act', 'changed', 'was', p_key_id, 'by', auth.uid()));
  return jsonb_build_object('id', v_id, 'name', v_name);
end $$;

comment on function public.form_key_change(uuid, uuid, text) is
  'An owner''s or a partner''s door (00675, 00709): a key that works and is not already ending changed for a new one by the same name and for the same site (the first key''s new one is named Website), the old one honoured for a day more. Answers the new key as {id, name}; P0002 for a key that is ending or has ended.';

/* ------------------------------------------------------------------------- 7. a member's word on a form -- */

create or replace function public.outside_form_rename(p_tenant_id uuid, p_form_id uuid, p_name text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_renamed integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if v_name is not null and char_length(v_name) > 120 then
    raise exception 'A form''s name is at most 120 characters.' using errcode = '22023';
  end if;
  -- Blank goes back to the name the site sends.
  update public.outside_forms o set name = v_name where o.tenant_id = p_tenant_id and o.id = p_form_id;
  get diagnostics v_renamed = row_count;
  return v_renamed > 0;
end $$;

revoke all on function public.outside_form_rename(uuid, uuid, text) from public, anon;
grant execute on function public.outside_form_rename(uuid, uuid, text) to authenticated, service_role;
comment on function public.outside_form_rename(uuid, uuid, text) is
  'A member''s door (00709; is_acting_member, as form_turn): the owner''s own name for a form owned elsewhere, which wins over the name the site sends; blank goes back to it. Answers whether the form was the workspace''s.';

create or replace function public.outside_form_listed(p_tenant_id uuid, p_form_id uuid, p_listed boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_set integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.outside_forms o set listed = coalesce(p_listed, true)
   where o.tenant_id = p_tenant_id and o.id = p_form_id;
  get diagnostics v_set = row_count;
  return v_set > 0;
end $$;

revoke all on function public.outside_form_listed(uuid, uuid, boolean) from public, anon;
grant execute on function public.outside_form_listed(uuid, uuid, boolean) to authenticated, service_role;
comment on function public.outside_form_listed(uuid, uuid, boolean) is
  'A member''s door (00709; is_acting_member): a form owned elsewhere listed or hidden. Hidden only takes it off the list: its entries still arrive, reach the Inbox and count. Answers whether the form was the workspace''s.';

/* ------------------------------------------------------------------------------------ 8. the open requests -- */

create or replace function public.form_requests_open(p_tenant_id uuid)
returns jsonb
language sql stable set search_path = public as $$
  -- A request is open until a link answers it: a member's word, a conversation that took it over, or a reply whose
  -- message did not fail and was not taken back. Sixty days: an older one stays in its form's own list. A hosted
  -- form's request says the time it asked for as its visit stands now (00691); a website's is a request from its form's
  -- requests_from on (00709), its heading the form's name, its answers the site's own fields.
  select coalesce(jsonb_agg(r.line order by r.created_at desc), '[]'::jsonb)
    from (
      select e.created_at,
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
         and not exists (
               select 1 from form_entry_links k
                where k.tenant_id = e.tenant_id and k.entry_id = e.id
                  and (k.kind in ('marked', 'conversation')
                       or (k.kind = 'reply' and exists (
                             select 1 from messages m
                              where m.tenant_id = k.tenant_id and m.id = k.message_id
                                and m.status not in ('failed', 'canceled')))))
       order by e.created_at desc
       limit 200) r;
$$;

comment on function public.form_requests_open(uuid) is
  'The requests of a workspace''s forms nobody has answered (00680, 00691, 00709; the Forms plan, 3.5), newest first, 200 at most over sixty days, read under the member''s own row rules: a hosted form''s, and a website form''s from its requests_from on. Each with its answers, who it is about as typed (reach: a hosted form''s), its form''s heading (a website form''s name, null where it has none yet), the outside form it is of, the place it came through, whether a reply to it failed to reach them (unreached), and the time it asked for as its visit stands now. Answered is a marked link, a conversation link, or a reply whose message did not fail and was not taken back. Counted whole by form_requests_open_count.';

create or replace function public.form_requests_open_count(p_tenant_id uuid)
returns integer
language sql stable set search_path = public as $$
  -- form_requests_open's rule, counted with no cap: what Needs you and Today say.
  select count(*)::integer
    from form_entries e
    left join form_versions v on v.tenant_id = e.tenant_id and v.id = e.version_id
    left join outside_forms o on o.tenant_id = e.tenant_id and o.id = e.outside_form_id
   where e.tenant_id = p_tenant_id
     and e.state <> 'held' and not e.test
     and ((e.form_id is not null and v.id is not null)
          or (o.id is not null and e.form = 'request' and e.created_at >= o.requests_from))
     and e.created_at > now() - interval '60 days'
     and not exists (
           select 1 from form_entry_links k
            where k.tenant_id = e.tenant_id and k.entry_id = e.id
              and (k.kind in ('marked', 'conversation')
                   or (k.kind = 'reply' and exists (
                         select 1 from messages m
                          where m.tenant_id = k.tenant_id and m.id = k.message_id
                            and m.status not in ('failed', 'canceled')))));
$$;

revoke all on function public.form_requests_open_count(uuid) from public, anon;
grant execute on function public.form_requests_open_count(uuid) to authenticated, service_role;
comment on function public.form_requests_open_count(uuid) is
  'How many of a workspace''s requests nobody has answered (00709): form_requests_open''s rule over its sixty days, with no cap, read under the member''s own row rules. What Needs you and Today count, never the list that stops at 200.';

/* ------------------------------------------------------------------------------------------ 9. the results -- */

create or replace function public.form_results(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language sql stable set search_path = public as $$
  with win as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366))) as since
  ), asked as (
    -- Each entry of a form in the window, made here or owned elsewhere: whether its person was new with it, whether it
    -- became a conversation (a reply that left, or their own message with its code), whether it asked for a time
    -- (00691), and whether a visit followed: the time it asked for, confirmed (00691), or by the rule an ad's is read by
    -- (00678), a visit asked for in a chat and confirmed there, or one a member added, made after it and starting after.
    select e.form_id, e.outside_form_id, e.link_id, e.contact_id,
           c.created_at > e.created_at - interval '1 minute' as new_person,
           -- A sign-up confirmed: its person said yes to offers from the email it sent them, after it came (00489).
           (e.form = 'signup' and c.email_marketing = 'opted_in' and c.email_marketing_source = 'confirmed_signup'
            and c.email_marketing_updated_at >= e.created_at) as confirmed,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id
                      and (k.kind = 'conversation'
                           or (k.kind = 'reply' and exists (
                                 select 1 from messages m
                                  where m.tenant_id = k.tenant_id and m.id = k.message_id
                                    and m.status not in ('failed', 'canceled'))))) as talked,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit') as timed,
           -- The time it asked for, confirmed: made in the entry's own statement, so the rule below cannot see it.
           exists (select 1 from form_entry_links k
                     join appointments a on a.tenant_id = k.tenant_id and a.id = k.appointment_id
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'visit'
                      and a.status not in ('cancelled', 'proposed'))
           or exists (select 1 from appointments a
                    where a.tenant_id = e.tenant_id
                      and a.source in ('receptionist', 'person')
                      and a.status not in ('cancelled', 'proposed')
                      and a.created_at > e.created_at
                      and a.starts_at > e.created_at
                      and (a.contact_id = e.contact_id
                           or (a.contact_id is null
                               and ((a.client_phone is not null and a.client_phone = c.phone_e164)
                                    or (a.client_email is not null and lower(a.client_email) = lower(c.email))))))
             as booked
      from form_entries e
      join contacts c on c.tenant_id = e.tenant_id and c.id = e.contact_id
      cross join win
     where e.tenant_id = p_tenant_id
       and (e.form_id is not null or e.outside_form_id is not null) and e.state <> 'held' and not e.test
       and e.created_at > win.since
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'form_id', x.form_id, 'link_id', x.link_id, 'requests', x.requests, 'talked', x.talked,
               'visits', x.visits, 'people', x.people, 'new_people', x.new_people, 'asked', x.asked))
        from (select a.form_id, a.link_id, count(*) as requests,
                     count(distinct a.contact_id) as people,
                     count(*) filter (where a.talked) as talked,
                     count(*) filter (where a.timed) as asked,
                     count(distinct a.contact_id) filter (where a.booked) as visits,
                     count(distinct a.contact_id) filter (where a.new_person) as new_people
                from asked a where a.form_id is not null group by a.form_id, a.link_id) x), '[]'::jsonb),
    'outside', coalesce((
      select jsonb_agg(jsonb_build_object(
               'outside_form_id', y.outside_form_id, 'entries', y.entries, 'talked', y.talked, 'visits', y.visits,
               'people', y.people, 'new_people', y.new_people, 'confirmed', y.confirmed))
        from (select a.outside_form_id, count(*) as entries,
                     count(distinct a.contact_id) as people,
                     count(*) filter (where a.talked) as talked,
                     count(distinct a.contact_id) filter (where a.booked) as visits,
                     count(distinct a.contact_id) filter (where a.new_person) as new_people,
                     count(distinct a.contact_id) filter (where a.confirmed) as confirmed
                from asked a where a.outside_form_id is not null group by a.outside_form_id) y), '[]'::jsonb),
    'opens', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', o.link_id, 'opens', o.opens))
        from (select d.link_id, sum(d.opens) as opens
                from link_days d cross join win
               where d.tenant_id = p_tenant_id and d.day >= (win.since at time zone 'utc')::date
               group by d.link_id) o), '[]'::jsonb),
    'booking_opens', coalesce((
      select jsonb_agg(jsonb_build_object('form_id', b.form_id, 'opens', b.opens))
        from (select d.form_id, sum(d.booking_opens) as opens
                from form_days d cross join win
               where d.tenant_id = p_tenant_id and d.day >= (win.since at time zone 'utc')::date
               group by d.form_id) b), '[]'::jsonb));
$$;

comment on function public.form_results(uuid, integer) is
  'What a workspace''s forms brought over the last p_days (30; 1 to 366), read under the member''s own row rules (00680, 00691, 00709): each hosted form by the link each request came through (places; link_id null: none), with the requests, how many asked for a time (asked), how many became a conversation (talked), the people who asked (people), those who booked after (visits, by 00678''s rule for a visit that follows) and those new with their request; each form owned elsewhere (outside) with its entries and the same counts, and for a sign-up how many of its people confirmed from its email (confirmed); each link''s opens; and how often each form''s business''s own booking page was opened from it (booking_opens). Held entries and tests are in no count.';
