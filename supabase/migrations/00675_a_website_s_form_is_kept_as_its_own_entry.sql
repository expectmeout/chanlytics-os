-- 00675 · A website's form is kept as its own entry, in one write with its person and its event, and each website
-- has a key of its own (the Forms plan, step F0; Ruben's calls 2, 9 and 19 of 21 November 2026).
--
-- Today's door (apps/edge/lib/website/form-door.ts) kept the person first and then wrote the note and the notice one
-- after the other, each only logged when it failed, and answered the site ok whatever became of them. An entry was
-- told apart by its own words forever, so the same request sent again weeks later added nothing and told nobody. And
-- the site's key was made from the service role's key, so rotating that refused every site at once.
--
--   form_keys               A website's key: its name, a hash of it (sha-256, hex), who made it and when, when it was
--                           last used, and when it ends (null: it does not). One per site, made at random by the
--                           dashboard and shown once; only its hash is kept. A key changed is a new one beside it, the
--                           old one honoured a day. The first key, made from the platform's own key as before, is a
--                           row too (`first`, no hash) once a site uses it, so it has its own "last used"; it keeps
--                           working until it is ended. Members read the workspace's keys; the doors below write them.
--   form_entries            One entry as the site sent it: the person it is about, the key it came with, the kind of
--                           form, the answers, the site's own id for it where it sent one, a digest of the words (the
--                           ten-minute rule), what is owed after it (the note, the notice, a sign-up's confirmation),
--                           each one's outcome, how far it got (accepted, then processed once all owed are done), and
--                           when the owner was first told. No entry is ever without its person. Members read them; the
--                           service role writes them, through form_entry_take and form_entry_settled.
--   form_entry_take         The door's one write: the key's "last used", the once rule, the person through the one door
--                           (resolve_person, source website), the entry and its event (form_entry.accepted), together.
--                           A person who asked to be forgotten (PE001): nothing is written, and the answer says so. The
--                           same site id again, or with none the same words within ten minutes, is the same entry.
--   form_entry_settled      One effect's outcome kept on its entry (done, or failed with why), the entry processed once
--                           every owed effect is done, and when the owner was first told. A step done is never written
--                           again. A sign-up's ask says its first outcome as form_entry.asked, which tells the owner
--                           (the notice says what became of the ask).
--   form_key_make, form_key_change, form_key_end   An owner's or a partner's doors (caller_has_permission settings),
--                           each kept on the record as form_key.set ({ act: made, changed or ended, by }), never the key.
--   form_entries_erase_on_contact   A person erased takes their entries with them (decision 0036).
--   event_subscriptions     form_entry.accepted to form_entry_note, form_entry_notice and form_entry_confirm, and
--                           form_entry.asked to form_entry_notice, in the lane of a person who waits.
--
-- Deploy order: this file first, then the code. The code before it names nothing here, and nothing before the code
-- writes either event kind, so the relay never hands an older build a delivery it does not know. The code after it
-- keeps every entry through form_entry_take, and refuses a form (503, so the site sends it again) where the door is
-- not there yet: this file goes on at the push, never once the code is live. Re-runnable.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------- 1. the keys -- */

create table if not exists public.form_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- What the owner calls the site it is for. The first key has none: the screen says what it is.
  name          text check (name is null or char_length(name) between 1 and 60),
  -- The key's sha-256 in hex; the key itself is shown once and never kept. The first key has none: it is made from the
  -- platform's own key and the workspace's id, as before.
  hash          text check (hash is null or hash ~ '^[0-9a-f]{64}$'),
  first         boolean not null default false,
  made_by       uuid,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  -- Refused from this moment on: now, for a key ended; a day on, for a key changed.
  ends_at       timestamptz,
  constraint form_keys_one_way check (first = (hash is null) and first = (name is null)),
  constraint form_keys_tenant_id_id_key unique (tenant_id, id)
);

create unique index if not exists form_keys_hash on public.form_keys (hash) where hash is not null;
create unique index if not exists form_keys_first on public.form_keys (tenant_id) where first;

alter table public.form_keys enable row level security;
drop policy if exists form_keys_member_select on public.form_keys;
create policy form_keys_member_select on public.form_keys
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.form_keys from anon, authenticated;
grant select on public.form_keys to authenticated;
grant all on public.form_keys to service_role;

comment on table public.form_keys is
  'A website''s key for the form door (00675; the Forms plan, F0): named, made at random by the dashboard, shown once and kept only as its sha-256, with when it was last used and when it ends. A key changed is a new one, the old one honoured a day. The first key, made from the platform''s own key as before 00675, is a row (first, no hash, no name) once a site uses it, so its "last used" shows when the site has moved; it keeps working until it is ended. Members read them; form_key_make, form_key_change and form_key_end write them, and form_entry_take stamps last_used_at.';
comment on column public.form_keys.ends_at is
  'From when the key is refused: the moment it was ended, or a day after it was changed. Null: it does not end.';

/* ---------------------------------------------------------------------------------------- 2. the entries -- */

create table if not exists public.form_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  contact_id    uuid not null,
  key_id        uuid,
  form          text not null check (form in ('signup', 'request')),
  -- What the site sent, as contracts WebsiteFormBody reads it, without its workspace and its key.
  answers       jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 16000),
  -- The site's own id for the entry, where it sends one: the same id again is the same entry.
  ref           text check (ref is null or char_length(ref) between 1 and 100),
  -- A digest of what was typed (sha-256, hex): with no id, the same words within ten minutes are the same entry.
  words         text not null check (words ~ '^[0-9a-f]{64}$'),
  -- What is owed after the entry, each by its own subscriber, and what each came to.
  owed          text[] not null check (owed <@ array['note', 'notice', 'confirm']),
  effects       jsonb not null default '{}'::jsonb check (jsonb_typeof(effects) = 'object'),
  state         text not null default 'accepted' check (state in ('accepted', 'processed')),
  told_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint form_entries_tenant_id_id_key unique (tenant_id, id),
  constraint form_entries_contact_id_same_workspace foreign key (tenant_id, contact_id)
    references public.contacts (tenant_id, id) on delete cascade,
  constraint form_entries_key_id_same_workspace foreign key (tenant_id, key_id)
    references public.form_keys (tenant_id, id) on delete set null (key_id)
);

create unique index if not exists form_entries_ref on public.form_entries (tenant_id, ref) where ref is not null;
create index if not exists form_entries_words on public.form_entries (tenant_id, words, created_at);
create index if not exists form_entries_contact on public.form_entries (tenant_id, contact_id);
create index if not exists form_entries_key on public.form_entries (tenant_id, key_id);
create index if not exists form_entries_made on public.form_entries (tenant_id, created_at);
-- The watch's read: entries nobody has been told of yet.
create index if not exists form_entries_untold on public.form_entries (created_at) where told_at is null;

alter table public.form_entries enable row level security;
drop policy if exists form_entries_member_select on public.form_entries;
create policy form_entries_member_select on public.form_entries
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.form_entries from anon, authenticated;
grant select on public.form_entries to authenticated;
grant all on public.form_entries to service_role;

comment on table public.form_entries is
  'One entry of a website''s form (00675; the Forms plan, F0), written with its person and its event in one transaction by form_entry_take: who it is about, the key it came with, the kind of form, the answers as sent, the site''s own id for it, a digest of the words, what is owed after it and what each came to (form_entry_settled), how far it got, and when the owner was first told. Never without its person: a person who asked to be forgotten has no entry at all. Goes with its person when they are erased (form_entries_erase_on_contact).';
comment on column public.form_entries.owed is
  'What the entry owes after it, each by its own subscriber: note (what they asked, waiting on their page for Keep), notice (the owner told), confirm (a sign-up with an address that arrived as it was sent is asked to confirm).';
comment on column public.form_entries.effects is
  'Each owed effect''s outcome, by name: {state: done|failed, why?, outcome?, told?, at}. Written only by form_entry_settled.';
comment on column public.form_entries.told_at is
  'When the owner first had a notice of the entry (its bell row kept). An accepted entry nobody was told of after ten minutes is paged (apps/edge/lib/website/form-watch.ts).';

create or replace function public.form_entries_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    delete from public.form_entries where tenant_id = new.tenant_id and contact_id = new.id;
  end if;
  return null;
end $$;

revoke all on function public.form_entries_erase_on_contact() from public, anon, authenticated;
comment on function public.form_entries_erase_on_contact() is
  'When a person is erased, their website form entries go with them (00675, decision 0036).';

drop trigger if exists contacts_erase_takes_form_entries on public.contacts;
create trigger contacts_erase_takes_form_entries
  after update of erased_at on public.contacts
  for each row execute function public.form_entries_erase_on_contact();

/* ------------------------------------------------------------------------------------------ 3. the write -- */

create or replace function public.form_entry_take(
  p_tenant_id uuid,
  p_form      text,
  p_answers   jsonb,
  p_person    jsonb,
  p_words     text,
  p_owed      text[],
  p_key_id    uuid default null,
  p_ref       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   uuid;
  v_contact uuid;
  v_person  jsonb;
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

  -- The site was used, whatever becomes of the entry. The first key is a row from its first use on.
  if p_key_id is null then
    insert into public.form_keys as k (tenant_id, first, last_used_at)
    values (p_tenant_id, true, now())
    on conflict (tenant_id) where first do update set last_used_at = now()
    returning k.id into p_key_id;
  else
    update public.form_keys set last_used_at = now() where tenant_id = p_tenant_id and id = p_key_id;
  end if;

  -- Once. The site's own id is the entry's; with none, the same words within ten minutes are a retry (call 19), and
  -- later they are a new entry. Two posts of the same words at once wait for each other here.
  if nullif(btrim(coalesce(p_ref, '')), '') is not null then
    select e.id, e.contact_id into v_entry, v_contact
      from public.form_entries e where e.tenant_id = p_tenant_id and e.ref = btrim(p_ref);
  else
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|form_entry|' || p_words, 0));
    select e.id, e.contact_id into v_entry, v_contact
      from public.form_entries e
     where e.tenant_id = p_tenant_id and e.words = p_words and e.ref is null
       and e.created_at > now() - interval '10 minutes'
     order by e.created_at desc
     limit 1;
  end if;
  if v_entry is not null then
    return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact);
  end if;

  -- The person through the one door, as the website's. A person who asked to be forgotten is not made again, and
  -- nothing of theirs is written: the door's own writes are taken back with it.
  begin
    v_person := public.resolve_person(
      p_tenant_id, '', '', coalesce(p_person ->> 'phone', ''), coalesce(p_person ->> 'email', ''),
      coalesce(p_person ->> 'name', ''), 'found', 'website', coalesce(p_person -> 'detail', '{}'::jsonb));
  exception when sqlstate 'PE001' then
    return jsonb_build_object('outcome', 'forgotten', 'entry_id', null, 'contact_id', null);
  end;
  v_contact := (v_person ->> 'contact_id')::uuid;

  begin
    insert into public.form_entries (tenant_id, contact_id, key_id, form, answers, ref, words, owed)
    values (p_tenant_id, v_contact, p_key_id, p_form, p_answers, nullif(btrim(coalesce(p_ref, '')), ''), p_words,
            coalesce(p_owed, '{}'))
    returning id into v_entry;
  exception when unique_violation then
    -- The same site id at the same moment: the other post kept it.
    select e.id, e.contact_id into v_entry, v_contact
      from public.form_entries e where e.tenant_id = p_tenant_id and e.ref = btrim(p_ref);
    return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact);
  end;

  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', v_entry,
          jsonb_build_object('form', p_form, 'owed', to_jsonb(coalesce(p_owed, '{}'))));

  return jsonb_build_object('outcome', 'accepted', 'entry_id', v_entry, 'contact_id', v_contact,
                            'person', v_person ->> 'outcome');
end $$;

revoke all on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text) from public, anon, authenticated;
grant execute on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text) to service_role;
comment on function public.form_entry_take(uuid, text, jsonb, jsonb, text, text[], uuid, text) is
  'The website form door''s one write (00675; the Forms plan, F0): the key''s last use (the first key''s row made at its first use, p_key_id null), the once rule (the site''s own id; with none, the same words within ten minutes), the person through resolve_person as the website''s, the entry and its form_entry.accepted event, together. Answers {outcome: accepted|again|forgotten, entry_id, contact_id, person}: forgotten writes nothing of the person at all (PE001). The service role''s alone.';

/* ------------------------------------------------------------------------------------- 4. what came of it -- */

create or replace function public.form_entry_settled(p_tenant_id uuid, p_entry_id uuid, p_effect text, p_outcome jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   public.form_entries%rowtype;
  v_before  jsonb;
  v_effects jsonb;
  v_done    boolean;
begin
  if p_effect is null or p_effect not in ('note', 'notice', 'confirm') then
    raise exception 'An effect is the note, the notice or the confirmation.' using errcode = '22023';
  end if;
  if p_outcome is null or jsonb_typeof(p_outcome) <> 'object'
     or coalesce(p_outcome ->> 'state', '') not in ('done', 'failed') then
    raise exception 'An outcome is done or failed.' using errcode = '22023';
  end if;
  select * into v_entry from public.form_entries e
   where e.tenant_id = p_tenant_id and e.id = p_entry_id
   for update;
  -- Gone: its person was erased since. Nothing is owed any more.
  if not found then
    return jsonb_build_object('settled', false, 'gone', true, 'effects', '{}'::jsonb);
  end if;
  v_before := v_entry.effects -> p_effect;
  -- A step once done stays as it was: a second run, or a twin delivery that lost to it, never says something else of
  -- it (an ask done is never called open; a notice told is never called failed).
  if v_before ->> 'state' = 'done' then
    return jsonb_build_object('settled', false, 'gone', false, 'effects', v_entry.effects);
  end if;
  v_effects := v_entry.effects || jsonb_build_object(p_effect, p_outcome || jsonb_build_object('at', now()));
  v_done := not exists (
    select 1 from unnest(v_entry.owed) o where (v_effects -> o ->> 'state') is distinct from 'done');
  update public.form_entries e
     set effects = v_effects,
         state = case when v_done then 'processed' else e.state end,
         told_at = case when p_effect = 'notice' and coalesce((p_outcome ->> 'told')::boolean, false)
                        then coalesce(e.told_at, now()) else e.told_at end
   where e.tenant_id = p_tenant_id and e.id = p_entry_id;
  -- The confirmation's first outcome is news to the notice, which says what became of the ask.
  if p_effect = 'confirm' and v_before is null then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form_entry.asked', 'contact', 'form_entry', p_entry_id,
            jsonb_build_object('state', p_outcome ->> 'state'));
  end if;
  return jsonb_build_object('settled', true, 'gone', false, 'effects', v_effects);
end $$;

revoke all on function public.form_entry_settled(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.form_entry_settled(uuid, uuid, text, jsonb) to service_role;
comment on function public.form_entry_settled(uuid, uuid, text, jsonb) is
  'One effect of a website form entry settled (00675): its outcome kept on the entry ({state: done|failed, ...}, with its moment), the entry processed once every owed effect is done, told_at stamped the first time the notice says told. A step done is never written again (settled false). The ask''s first outcome writes form_entry.asked. Answers {settled, gone, effects}; gone for an entry erased since. The service role''s alone.';

/* ------------------------------------------------------------------------------------ 5. an owner's keys -- */

create or replace function public.form_key_make(p_tenant_id uuid, p_name text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
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
  -- One key a site: a workspace has at most ten that still work.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|form_keys', 0));
  if (select count(*) from public.form_keys k
       where k.tenant_id = p_tenant_id and (k.ends_at is null or k.ends_at > now())) >= 10 then
    raise exception 'A workspace has at most ten keys that work. End one first.' using errcode = '22023';
  end if;
  insert into public.form_keys (tenant_id, name, hash, made_by)
  values (p_tenant_id, btrim(p_name), p_hash, auth.uid())
  returning id into v_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_key.set', 'settings', 'form_key', v_id,
          jsonb_build_object('act', 'made', 'by', auth.uid()));
  return v_id;
end $$;

revoke all on function public.form_key_make(uuid, text, text) from public, anon;
grant execute on function public.form_key_make(uuid, text, text) to authenticated, service_role;
comment on function public.form_key_make(uuid, text, text) is
  'An owner''s or a partner''s door (00675; caller_has_permission settings): a website''s key kept by its name and its sha-256, the key itself made and shown once by the dashboard. At most ten keys that still work a workspace (22023). Answers the key''s id.';

create or replace function public.form_key_change(p_tenant_id uuid, p_key_id uuid, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old  public.form_keys%rowtype;
  v_id   uuid;
  v_name text;
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
  -- The new key keeps the site's name; the first key had none, and its new one is the website's.
  v_name := coalesce(v_old.name, 'Website');
  insert into public.form_keys (tenant_id, name, hash, made_by)
  values (p_tenant_id, v_name, p_hash, auth.uid())
  returning id into v_id;
  -- The old one keeps working for a day, so the site can be given the new one without a form refused.
  update public.form_keys set ends_at = now() + interval '1 day' where tenant_id = p_tenant_id and id = p_key_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_key.set', 'settings', 'form_key', v_id,
          jsonb_build_object('act', 'changed', 'was', p_key_id, 'by', auth.uid()));
  return jsonb_build_object('id', v_id, 'name', v_name);
end $$;

revoke all on function public.form_key_change(uuid, uuid, text) from public, anon;
grant execute on function public.form_key_change(uuid, uuid, text) to authenticated, service_role;
comment on function public.form_key_change(uuid, uuid, text) is
  'An owner''s or a partner''s door (00675): a key that works and is not already ending changed for a new one by the same name (the first key''s new one is named Website), the old one honoured for a day more. Answers the new key as {id, name}; P0002 for a key that is ending or has ended.';

create or replace function public.form_key_end(p_tenant_id uuid, p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ended integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  update public.form_keys
     set ends_at = now()
   where tenant_id = p_tenant_id and id = p_key_id and (ends_at is null or ends_at > now());
  get diagnostics v_ended = row_count;
  if v_ended > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form_key.set', 'settings', 'form_key', p_key_id,
            jsonb_build_object('act', 'ended', 'by', auth.uid()));
  end if;
  return v_ended > 0;
end $$;

revoke all on function public.form_key_end(uuid, uuid) from public, anon;
grant execute on function public.form_key_end(uuid, uuid) to authenticated, service_role;
comment on function public.form_key_end(uuid, uuid) is
  'An owner''s or a partner''s door (00675): a key refused from now on, the first key too. Answers whether one still working was ended.';

/* ---------------------------------------------------------------------------------- 6. who reacts to it -- */

insert into public.event_subscriptions (kind, subscriber, lane) values
  ('form_entry.accepted', 'form_entry_note', 1),
  ('form_entry.accepted', 'form_entry_notice', 1),
  ('form_entry.accepted', 'form_entry_confirm', 1),
  ('form_entry.asked', 'form_entry_notice', 1)
on conflict (kind, subscriber) do nothing;
