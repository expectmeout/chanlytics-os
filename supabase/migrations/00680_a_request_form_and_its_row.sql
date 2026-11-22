-- 00680 · A request form a business shares with no website, the links it is shared by, and each request as its own
-- thing to answer (the Forms plan, steps F1 and F2, one build; Ruben's calls of 22 November 2026, the canvas's fourteen).
--
-- 00675 kept a website's form as its own entry. This file gives a business a form of its own: made by telling AI,
-- published as a version that never changes, shared by a short link for each place, and answered one request at a time.
--
--   forms                   A form: its address under the business's page (slug), whether it is a draft, live or off,
--                           the description as it is being changed (draft), and the version that is live. Its name is
--                           its heading: nothing is kept twice. Members read; a member who may act writes the draft
--                           (the columns granted), and form_publish and form_turn alone move its state.
--   form_versions           One published description (contracts FormDescription), numbered from 1, never changed. The
--                           one before it is taken for a day more (replaced_at), so a page left open is not refused.
--   form_entries            Widened: the form and the version the visitor saw, the link it came through, where it came
--                           from (the Ads tracking plan's T4 shape), who it is about as typed (reach), whether it is a
--                           test, why it is held, and the short code its thank-you carries into a chat. A held entry
--                           has no person until it is let through; a test never has one.
--   form_entry_links        What happened to one entry, each written by the act itself: the reply sent from it, the
--                           conversation that arrived with its code, a visit asked for from it, or a member's word that
--                           it was answered another way. Answered is never kept on the entry: it is read from here,
--                           and a reply that failed or was taken back answers nothing.
--   links, link_days        The shared record's link (the content loop PRD's Appendix A): a short code for one place a
--                           thing is shared, and its opens counted by day. An open is a count, never a visitor: no
--                           cookie, no address. A form is the first thing a link opens.
--   form_publish, form_turn A member's doors: the draft made a version and live; a live form turned off, or on again.
--   form_request_take       The hosted form's one write, as form_entry_take is the website's: the version checked, once
--                           by the page's own id, the person through resolve_person (a forgotten one writes nothing),
--                           the entry and its event together. A doubtful entry is kept held, with no person and no
--                           event; a test is kept with neither.
--   form_entry_let_through, form_entry_hold
--                           A held entry let through (its person resolved then, its event written then, so everything
--                           it should have started starts then), and a request a member says is not one, held.
--   form_code_person, form_code_link
--                           A request carried into a chat by its code: before the message is kept, the number that
--                           wrote is added to the request's person where they have none (resolve_person's own rule:
--                           it fills what is empty); after it is kept, the conversation is linked to the request and
--                           the code is spent. A held entry whose code arrives is let through: a person's phone wrote.
--   link_open               A link opened: where it lands, and one more open on its day unless the open is a preview.
--   form_requests_open, form_results
--                           A member's reads, under their own row rules: the requests nobody has answered, and each
--                           form's opens, requests, conversations and visits by the place they came through.
--   form_entries_purge      A held entry goes after 30 days and a test after 7 (contracts RETENTION_DAYS; the health
--                           sweep runs it).
--   notifications           The bell learns a request (form_request).
--   ai_usage                The ledger learns what drafting a form costs (purpose form_draft).
--
-- Deploy order: this file first, then the code. The code before it names nothing here; no event kind and no subscriber
-- is new (a request's arrival is form_entry.accepted, which 00675's note and notice already answer), so the relay never
-- hands an older build a delivery it does not know. Re-runnable.

set local lock_timeout = '3s';

/* -------------------------------------------------------------------------------------------- 1. a form -- */

create table if not exists public.forms (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- Its address under the business's own page: /b/<workspace>/<slug>. Said once, at its making, and kept.
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 60),
  state           text not null default 'draft' check (state in ('draft', 'live', 'off')),
  -- The description as its owner is changing it (contracts FormDescription); the same as the live version's when
  -- nothing waits to be published.
  draft           jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 32000),
  live_version_id uuid,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_entry_at   timestamptz,
  constraint forms_tenant_id_id_key unique (tenant_id, id),
  constraint forms_slug_key unique (tenant_id, slug),
  -- A draft is a form never published; a form published keeps its version when it is turned off.
  constraint forms_draft_has_no_version check ((state = 'draft') = (live_version_id is null))
);

create table if not exists public.form_versions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  form_id       uuid not null,
  n             integer not null check (n >= 1),
  description   jsonb not null check (jsonb_typeof(description) = 'object' and octet_length(description::text) <= 32000),
  published_by  uuid,
  published_at  timestamptz not null default now(),
  -- When the next version took its place: an entry on it is taken for a day after.
  replaced_at   timestamptz,
  constraint form_versions_tenant_id_id_key unique (tenant_id, id),
  constraint form_versions_n_key unique (tenant_id, form_id, n),
  constraint form_versions_form_id_same_workspace foreign key (tenant_id, form_id)
    references public.forms (tenant_id, id) on delete cascade
);

alter table public.forms drop constraint if exists forms_live_version_id_same_workspace;
alter table public.forms add constraint forms_live_version_id_same_workspace
  foreign key (tenant_id, live_version_id) references public.form_versions (tenant_id, id);
create index if not exists forms_live_version on public.forms (tenant_id, live_version_id);

alter table public.forms enable row level security;
drop policy if exists forms_member_select on public.forms;
create policy forms_member_select on public.forms
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
drop policy if exists forms_acting_insert on public.forms;
create policy forms_acting_insert on public.forms
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()));
drop policy if exists forms_acting_update on public.forms;
create policy forms_acting_update on public.forms
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));
-- A draft never published was shared with nobody, so it may go. A form that took requests is turned off instead.
drop policy if exists forms_acting_delete on public.forms;
create policy forms_acting_delete on public.forms
  for delete to authenticated
  using (public.is_acting_member(tenant_id) and state = 'draft');
revoke all on public.forms from anon, authenticated;
grant select, delete on public.forms to authenticated;
grant insert (tenant_id, slug, draft, created_by) on public.forms to authenticated;
grant update (draft, updated_at) on public.forms to authenticated;
grant all on public.forms to service_role;

alter table public.form_versions enable row level security;
drop policy if exists form_versions_member_select on public.form_versions;
create policy form_versions_member_select on public.form_versions
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.form_versions from anon, authenticated;
grant select on public.form_versions to authenticated;
grant all on public.form_versions to service_role;

comment on table public.forms is
  'A request form a business shares with no website (00680; the Forms plan, F1): its address under the business''s page (slug), whether it is a draft, live or off, its description as it is being changed (draft, contracts FormDescription) and the version that is live. Its name is its heading. Members read; a member who may act writes the draft; form_publish and form_turn alone move state and live_version_id. A draft never published may be deleted; a form that took requests is turned off.';
comment on column public.forms.draft is
  'The description as its owner is changing it (contracts FormDescription): equal to the live version''s when nothing waits to be published, and what form_publish makes the next version of.';
comment on column public.forms.last_entry_at is
  'When the form last took a request (form_request_take, form_entry_let_through): a test and a held entry do not move it.';
comment on table public.form_versions is
  'One published description of a form (00680): numbered from 1, written by form_publish, never changed. The version before the live one is taken for a day after replaced_at, so a page left open is not refused. An entry names the version its visitor saw.';

/* ------------------------------------------------------------------------------------------- 2. a link -- */

-- A member's own insert makes a link's code (the column's default), so the function runs as whoever calls it and
-- reads nothing: its bytes are the first six of a random id, which are all random in a version 4 id.
create or replace function public.link_code_new()
returns text
language sql
set search_path = public
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + (get_byte(r.b, g.i) % 31), 1), '' order by g.i)
    from (select uuid_send(gen_random_uuid()) as b) r, generate_series(0, 5) as g(i);
$$;

revoke all on function public.link_code_new() from public, anon;
grant execute on function public.link_code_new() to authenticated, service_role;
comment on function public.link_code_new() is
  'A link''s code (00680): six characters that say nothing, of letters and digits nobody misreads (no i, l, o, 0 or 1).';

create table if not exists public.links (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  code          text not null default public.link_code_new() check (code ~ '^[a-hjkmnp-z2-9]{6}$'),
  -- What it opens. A form is the first; a post and an ad join with their own steps.
  subject_type  text not null check (subject_type in ('form')),
  subject_id    uuid not null,
  -- Where it is shared, in the owner's own words ("Google listing"); the first of a form is "Your link".
  place         text not null check (char_length(btrim(place)) between 1 and 60),
  -- Whether it is the one drawn as a code to print.
  printed       boolean not null default false,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  -- Stopped from this moment: it lands on the business's page and counts nothing.
  stopped_at    timestamptz,
  constraint links_tenant_id_id_key unique (tenant_id, id),
  constraint links_code_key unique (code)
);

create index if not exists links_subject on public.links (tenant_id, subject_type, subject_id);

alter table public.links enable row level security;
drop policy if exists links_member_select on public.links;
create policy links_member_select on public.links
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A link lands only on what the workspace owns.
drop policy if exists links_acting_insert on public.links;
create policy links_acting_insert on public.links
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid())
              and exists (select 1 from public.forms f
                           where f.tenant_id = links.tenant_id and f.id = links.subject_id));
drop policy if exists links_acting_update on public.links;
create policy links_acting_update on public.links
  for update to authenticated
  using (public.is_acting_member(tenant_id))
  with check (public.is_acting_member(tenant_id));
revoke all on public.links from anon, authenticated;
grant select on public.links to authenticated;
grant insert (tenant_id, subject_type, subject_id, place, printed, created_by) on public.links to authenticated;
grant update (place, stopped_at) on public.links to authenticated;
grant all on public.links to service_role;

create table if not exists public.link_days (
  link_id    uuid not null,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  day        date not null,
  opens      integer not null default 0 check (opens >= 0),
  constraint link_days_pkey primary key (link_id, day),
  -- A day is its link's, in its link's own workspace (as 00279 has every child name its parent).
  constraint link_days_link_id_same_workspace foreign key (tenant_id, link_id)
    references public.links (tenant_id, id) on delete cascade
);

create index if not exists link_days_workspace on public.link_days (tenant_id, day);

alter table public.link_days enable row level security;
drop policy if exists link_days_member_select on public.link_days;
create policy link_days_member_select on public.link_days
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.link_days from anon, authenticated;
grant select on public.link_days to authenticated;
grant all on public.link_days to service_role;

comment on table public.links is
  'A short link for one place a thing of the business''s is shared (00680; the content loop PRD''s Appendix A): its code, what it opens (a form, so far), where it is shared in the owner''s words, whether it is the one printed as a code, and when it was stopped. A code says nothing by itself. Members read; a member who may act makes one, renames it and stops it; link_open reads it for a visitor.';
comment on table public.link_days is
  'A link''s opens, counted by day (UTC) and written by link_open alone (00680). An open is a count, never a visitor: no cookie, no address. A chat app''s preview of the link is not counted.';

/* ------------------------------------------------------------------------- 3. an entry of a hosted form -- */

alter table public.form_entries add column if not exists form_id uuid;
alter table public.form_entries add column if not exists version_id uuid;
alter table public.form_entries add column if not exists link_id uuid;
alter table public.form_entries add column if not exists source jsonb;
alter table public.form_entries add column if not exists reach jsonb;
alter table public.form_entries add column if not exists test boolean not null default false;
alter table public.form_entries add column if not exists held_why text;
alter table public.form_entries add column if not exists code text;
alter table public.form_entries add column if not exists code_used_at timestamptz;
alter table public.form_entries alter column contact_id drop not null;

alter table public.form_entries drop constraint if exists form_entries_state_check;
alter table public.form_entries add constraint form_entries_state_check
  check (state in ('accepted', 'processed', 'held'));
alter table public.form_entries drop constraint if exists form_entries_source_check;
alter table public.form_entries add constraint form_entries_source_check
  check (source is null or (jsonb_typeof(source) = 'object' and octet_length(source::text) <= 4000));
alter table public.form_entries drop constraint if exists form_entries_reach_check;
alter table public.form_entries add constraint form_entries_reach_check
  check (reach is null or (jsonb_typeof(reach) = 'object' and octet_length(reach::text) <= 1000));
alter table public.form_entries drop constraint if exists form_entries_held_why_check;
alter table public.form_entries add constraint form_entries_held_why_check
  check (held_why is null or held_why in ('hidden_field', 'too_fast', 'too_many', 'member'));
alter table public.form_entries drop constraint if exists form_entries_code_check;
alter table public.form_entries add constraint form_entries_code_check
  check (code is null or code ~ '^[A-HJ-NP-Z2-9]{6}$');
-- Held says why, and nothing else does.
alter table public.form_entries drop constraint if exists form_entries_held_says_why;
alter table public.form_entries add constraint form_entries_held_says_why
  check ((state = 'held') = (held_why is not null));
-- No accepted entry is ever without its person: only one held for a look, or a test, has none.
alter table public.form_entries drop constraint if exists form_entries_person_unless_held;
alter table public.form_entries add constraint form_entries_person_unless_held
  check (contact_id is not null or state = 'held' or test);
-- A hosted form's entry names its form and the version its visitor saw, together.
alter table public.form_entries drop constraint if exists form_entries_form_names_version;
alter table public.form_entries add constraint form_entries_form_names_version
  check ((form_id is null) = (version_id is null));

alter table public.form_entries drop constraint if exists form_entries_form_id_same_workspace;
alter table public.form_entries add constraint form_entries_form_id_same_workspace
  foreign key (tenant_id, form_id) references public.forms (tenant_id, id);
alter table public.form_entries drop constraint if exists form_entries_version_id_same_workspace;
alter table public.form_entries add constraint form_entries_version_id_same_workspace
  foreign key (tenant_id, version_id) references public.form_versions (tenant_id, id);
alter table public.form_entries drop constraint if exists form_entries_link_id_same_workspace;
alter table public.form_entries add constraint form_entries_link_id_same_workspace
  foreign key (tenant_id, link_id) references public.links (tenant_id, id) on delete set null (link_id);

create index if not exists form_entries_form on public.form_entries (tenant_id, form_id, created_at);
create index if not exists form_entries_version on public.form_entries (tenant_id, version_id);
create index if not exists form_entries_link on public.form_entries (tenant_id, link_id);
create unique index if not exists form_entries_code on public.form_entries (tenant_id, code) where code is not null;
-- The requests a member may still have to answer: a hosted form's, not held, not a test.
create index if not exists form_entries_requests on public.form_entries (tenant_id, created_at)
  where form_id is not null and state <> 'held' and not test;
-- The purge's read, and the held pile's.
create index if not exists form_entries_held on public.form_entries (tenant_id, created_at) where state = 'held';
create index if not exists form_entries_tests on public.form_entries (created_at) where test;

comment on column public.form_entries.form_id is
  'The hosted form the entry is of (00680); null for a website''s own form, which has none.';
comment on column public.form_entries.version_id is
  'The version of the form its visitor saw: the answers are read against it (contracts readFormAnswers).';
comment on column public.form_entries.link_id is
  'The link the entry came through, where its page was opened by one: which place it was shared.';
comment on column public.form_entries.source is
  'Where the entry came from, in the one shape a website entry keeps (contracts EntrySource; the Ads tracking plan''s T4): the link''s code, the page, the site it came from and any campaign labels. Never a click id.';
comment on column public.form_entries.reach is
  'Who a hosted form''s entry is about, as typed: {name, email, phone}. What a held entry is let through with, what a reply''s address is compared with, and what an erased person''s held entries are found by.';
comment on column public.form_entries.test is
  'A test its owner sent: it tells nobody, counts nowhere, has no person, and goes after 7 days.';
comment on column public.form_entries.held_why is
  'Why the entry is held for a look, with state held: a field people cannot see was filled (hidden_field), filled in faster than a person can (too_fast), too many from one sender or to one form (too_many), or a member said it is not a real request (member).';
comment on column public.form_entries.code is
  'The short code the thank-you carries into a chat: six characters, the workspace''s own, good once (code_used_at) and for 30 days.';

-- A person erased takes the held entries typed with their address or their number too: those have no person yet.
create or replace function public.form_entries_held_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    delete from public.form_entries e
     where e.tenant_id = new.tenant_id and e.state = 'held' and e.contact_id is null
       and ((old.email is not null and lower(e.reach ->> 'email') = lower(old.email))
            or (old.phone_e164 is not null and e.reach ->> 'phone' = old.phone_e164));
  end if;
  return null;
end $$;

revoke all on function public.form_entries_held_erase_on_contact() from public, anon, authenticated;
comment on function public.form_entries_held_erase_on_contact() is
  'When a person is erased, the held form entries typed with their address or their number go too (00680, decision 0036): a held entry has no person yet, so it is found by what was typed.';

drop trigger if exists contacts_erase_takes_held_form_entries on public.contacts;
create trigger contacts_erase_takes_held_form_entries
  after update of erased_at on public.contacts
  for each row execute function public.form_entries_held_erase_on_contact();

-- Two records of one person combined (merge_people, decision 0028): what they asked through a form goes to the record
-- that is kept, so a request is still answered from the person's one page. A trigger and not a line of merge_people,
-- as a pair's doubts are settled (contacts_change_settles_doubts): the entries follow whoever merges, by whichever door.
create or replace function public.form_entries_follow_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.merged_into_contact_id is not null and old.merged_into_contact_id is null then
    update public.form_entries e
       set contact_id = new.merged_into_contact_id
     where e.tenant_id = new.tenant_id and e.contact_id = new.id;
  end if;
  return null;
end $$;

revoke all on function public.form_entries_follow_merge() from public, anon, authenticated;
comment on function public.form_entries_follow_merge() is
  'When two records of one person are combined, the form entries of the one merged away go to the one kept (00680, decision 0028): a request is answered from the person''s one page, and a website entry is counted for them once.';

drop trigger if exists contacts_merge_moves_form_entries on public.contacts;
create trigger contacts_merge_moves_form_entries
  after update of merged_into_contact_id on public.contacts
  for each row execute function public.form_entries_follow_merge();

/* -------------------------------------------------------------------------- 4. what happened to an entry -- */

create table if not exists public.form_entry_links (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  entry_id         uuid not null,
  kind             text not null check (kind in ('reply', 'conversation', 'visit', 'marked')),
  message_id       uuid,
  conversation_id  uuid,
  appointment_id   uuid,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  constraint form_entry_links_tenant_id_id_key unique (tenant_id, id),
  -- Each kind names what it is of, and nothing else: a reply its message, a conversation itself (and the message
  -- that carried the code, where one did), a visit itself, a member's word nothing but the member.
  constraint form_entry_links_names_one check (
    (kind = 'reply' and message_id is not null and conversation_id is null and appointment_id is null)
    or (kind = 'conversation' and conversation_id is not null and appointment_id is null)
    or (kind = 'visit' and appointment_id is not null and message_id is null and conversation_id is null)
    or (kind = 'marked' and created_by is not null and message_id is null and conversation_id is null
        and appointment_id is null)),
  constraint form_entry_links_entry_id_same_workspace foreign key (tenant_id, entry_id)
    references public.form_entries (tenant_id, id) on delete cascade,
  constraint form_entry_links_message_id_same_workspace foreign key (tenant_id, message_id)
    references public.messages (tenant_id, id) on delete cascade,
  constraint form_entry_links_conversation_id_same_workspace foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete cascade,
  constraint form_entry_links_appointment_id_same_workspace foreign key (tenant_id, appointment_id)
    references public.appointments (tenant_id, id) on delete cascade
);

create index if not exists form_entry_links_entry on public.form_entry_links (tenant_id, entry_id);
create index if not exists form_entry_links_message on public.form_entry_links (tenant_id, message_id);
create index if not exists form_entry_links_conversation on public.form_entry_links (tenant_id, conversation_id);
create index if not exists form_entry_links_appointment on public.form_entry_links (tenant_id, appointment_id);
-- A member says an entry was answered once, and a conversation takes it over once.
create unique index if not exists form_entry_links_marked on public.form_entry_links (entry_id) where kind = 'marked';
create unique index if not exists form_entry_links_taken_over
  on public.form_entry_links (entry_id, conversation_id) where kind = 'conversation';

alter table public.form_entry_links enable row level security;
drop policy if exists form_entry_links_member_select on public.form_entry_links;
create policy form_entry_links_member_select on public.form_entry_links
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A member's own acts: the reply they sent from the request, and their word that it was answered another way.
drop policy if exists form_entry_links_acting_insert on public.form_entry_links;
create policy form_entry_links_acting_insert on public.form_entry_links
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid())
              and kind in ('reply', 'marked'));
-- Their word taken back (Undo): only that kind.
drop policy if exists form_entry_links_acting_delete on public.form_entry_links;
create policy form_entry_links_acting_delete on public.form_entry_links
  for delete to authenticated
  using (public.is_acting_member(tenant_id) and kind = 'marked');
revoke all on public.form_entry_links from anon, authenticated;
grant select, delete on public.form_entry_links to authenticated;
-- A member writes a reply's link and their own word, never a conversation's or a visit's: the columns those two take.
grant insert (tenant_id, entry_id, kind, message_id, created_by) on public.form_entry_links to authenticated;
grant all on public.form_entry_links to service_role;

comment on table public.form_entry_links is
  'What happened to one form entry (00680; the Forms plan, 3.1 and 3.5), each written by the act itself: reply (the message sent from the request), conversation (the conversation that arrived with its code, and the message that carried it), visit (a visit asked for from it), marked (a member''s word that it was answered another way). Answered is read from here and never kept on the entry: a marked link, a conversation link, or a reply whose message did not fail and was not taken back. It names a message, a conversation or a visit, never a person, and goes with its entry.';

/* --------------------------------------------------------------------------------- 5. a member's doors -- */

create or replace function public.form_publish(p_tenant_id uuid, p_form_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form    public.forms%rowtype;
  v_live    jsonb;
  v_version uuid;
  v_n       integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_form from public.forms f
   where f.tenant_id = p_tenant_id and f.id = p_form_id
   for update;
  if not found then
    raise exception 'That form is not there.' using errcode = 'P0002';
  end if;
  if v_form.live_version_id is not null then
    select v.description into v_live from public.form_versions v
     where v.tenant_id = p_tenant_id and v.id = v_form.live_version_id;
  end if;
  -- Nothing changed since the live version: the form is live again as it was, and no version is made.
  if v_live is not null and v_live = v_form.draft then
    update public.forms set state = 'live', updated_at = now() where tenant_id = p_tenant_id and id = p_form_id;
    return jsonb_build_object('version_id', v_form.live_version_id, 'made', false);
  end if;
  select coalesce(max(v.n), 0) + 1 into v_n from public.form_versions v
   where v.tenant_id = p_tenant_id and v.form_id = p_form_id;
  insert into public.form_versions (tenant_id, form_id, n, description, published_by)
  values (p_tenant_id, p_form_id, v_n, v_form.draft, auth.uid())
  returning id into v_version;
  -- The version before is taken for a day more, so a page left open is not refused.
  update public.form_versions set replaced_at = now()
   where tenant_id = p_tenant_id and id = v_form.live_version_id and replaced_at is null;
  update public.forms set state = 'live', live_version_id = v_version, updated_at = now()
   where tenant_id = p_tenant_id and id = p_form_id;
  return jsonb_build_object('version_id', v_version, 'made', true, 'n', v_n);
end $$;

revoke all on function public.form_publish(uuid, uuid) from public, anon;
grant execute on function public.form_publish(uuid, uuid) to authenticated, service_role;
comment on function public.form_publish(uuid, uuid) is
  'A member''s door (00680; is_acting_member): a form''s draft made its next version and the form live. The version before is taken for a day more (replaced_at). A draft equal to the live version makes no version: the form is only live again. Answers {version_id, made, n}; P0002 for a form that is not the workspace''s.';

create or replace function public.form_turn(p_tenant_id uuid, p_form_id uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turned integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.is_acting_member(p_tenant_id), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- Only a form that was published has a state to turn: a draft goes live by form_publish.
  update public.forms
     set state = case when coalesce(p_on, false) then 'live' else 'off' end, updated_at = now()
   where tenant_id = p_tenant_id and id = p_form_id and live_version_id is not null
     and state = case when coalesce(p_on, false) then 'off' else 'live' end;
  get diagnostics v_turned = row_count;
  return v_turned > 0;
end $$;

revoke all on function public.form_turn(uuid, uuid, boolean) from public, anon;
grant execute on function public.form_turn(uuid, uuid, boolean) to authenticated, service_role;
comment on function public.form_turn(uuid, uuid, boolean) is
  'A member''s door (00680; is_acting_member): a live form turned off (its links land on the business''s page and say it is closed), or one that is off turned on again as it was. Answers whether it turned; a draft never published has nothing to turn.';

/* ----------------------------------------------------------------------------------- 6. the door's write -- */

create or replace function public.form_code_new()
returns text
language sql
set search_path = public, extensions
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(r.b, g.i) % 32), 1), '' order by g.i)
    from (select gen_random_bytes(6) as b) r, generate_series(0, 5) as g(i);
$$;

revoke all on function public.form_code_new() from public, anon, authenticated;
grant execute on function public.form_code_new() to service_role;
comment on function public.form_code_new() is
  'A request''s code (00680): six characters of capitals and digits nobody misreads (no I, O, 0 or 1), made at random.';

create or replace function public.form_request_take(
  p_tenant_id  uuid,
  p_form_id    uuid,
  p_version_id uuid,
  p_ref        text,
  p_answers    jsonb,
  p_reach      jsonb,
  p_words      text,
  p_source     jsonb default null,
  p_link_code  text default null,
  p_test       boolean default false,
  p_held_why   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form     public.forms%rowtype;
  v_replaced timestamptz;
  v_entry    uuid;
  v_code     text;
  v_contact  uuid;
  v_link     uuid;
  v_person   jsonb;
  v_test     boolean := coalesce(p_test, false);
  v_state    text := 'accepted';
  v_owed     text[] := array['note', 'notice'];
begin
  if p_tenant_id is null then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or p_reach is null or jsonb_typeof(p_reach) <> 'object' then
    raise exception 'The answers and the person are objects.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_ref, '')), '') is null then
    raise exception 'A hosted form''s entry carries the id its page made.' using errcode = '22023';
  end if;
  select * into v_form from public.forms f where f.tenant_id = p_tenant_id and f.id = p_form_id;
  if not found then
    raise exception 'That form is not there.' using errcode = 'P0002';
  end if;
  -- Once: the page made the entry's id before it sent, so the same press sent twice is one entry.
  select e.id, e.code, e.contact_id into v_entry, v_code, v_contact
    from public.form_entries e where e.tenant_id = p_tenant_id and e.ref = btrim(p_ref);
  if v_entry is not null then
    return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact, 'code', v_code);
  end if;
  if v_form.state <> 'live' then
    return jsonb_build_object('outcome', 'closed', 'entry_id', null, 'contact_id', null);
  end if;
  -- The version the visitor saw: the live one, or the one before it for a day after it was replaced.
  if p_version_id is distinct from v_form.live_version_id then
    select v.replaced_at into v_replaced from public.form_versions v
     where v.tenant_id = p_tenant_id and v.form_id = p_form_id and v.id = p_version_id;
    if v_replaced is null or v_replaced < now() - interval '1 day' then
      return jsonb_build_object('outcome', 'stale', 'entry_id', null, 'contact_id', null,
                                'version_id', v_form.live_version_id);
    end if;
  end if;
  -- The link it came through, where it is this form's own.
  if nullif(btrim(coalesce(p_link_code, '')), '') is not null then
    select l.id into v_link from public.links l
     where l.tenant_id = p_tenant_id and l.code = lower(btrim(p_link_code))
       and l.subject_type = 'form' and l.subject_id = p_form_id;
  end if;

  if v_test then
    -- A test: no person, nothing owed, no event. It tells nobody and counts nowhere.
    v_state := 'processed';
    v_owed := '{}';
  elsif p_held_why is not null then
    -- Doubtful: kept for a look with no person, never dropped, never the bell.
    v_state := 'held';
    v_owed := '{}';
  else
    -- The person through the one door. A person who asked to be forgotten is not made again, and nothing of theirs
    -- is written: the door's own writes are taken back with it.
    begin
      v_person := public.resolve_person(
        p_tenant_id, '', '', coalesce(p_reach ->> 'phone', ''), coalesce(p_reach ->> 'email', ''),
        coalesce(p_reach ->> 'name', ''), 'found', 'form', jsonb_build_object('form_id', p_form_id));
    exception when sqlstate 'PE001' then
      return jsonb_build_object('outcome', 'forgotten', 'entry_id', null, 'contact_id', null);
    end;
    v_contact := (v_person ->> 'contact_id')::uuid;
  end if;

  -- The code its thank-you carries into a chat: the workspace's own, so one is tried until none holds it.
  loop
    v_code := public.form_code_new();
    exit when not exists (select 1 from public.form_entries e where e.tenant_id = p_tenant_id and e.code = v_code);
  end loop;

  begin
    insert into public.form_entries (tenant_id, contact_id, form, answers, ref, words, owed, state, form_id,
                                     version_id, link_id, source, reach, test, held_why, code)
    values (p_tenant_id, v_contact, 'request', p_answers, btrim(p_ref), p_words, v_owed, v_state, p_form_id,
            p_version_id, v_link, p_source, p_reach, v_test,
            case when v_state = 'held' then p_held_why end, v_code)
    returning id into v_entry;
  exception when unique_violation then
    -- The same page id at the same moment: the other post kept it.
    select e.id, e.code, e.contact_id into v_entry, v_code, v_contact
      from public.form_entries e where e.tenant_id = p_tenant_id and e.ref = btrim(p_ref);
    return jsonb_build_object('outcome', 'again', 'entry_id', v_entry, 'contact_id', v_contact, 'code', v_code);
  end;

  if v_test then
    return jsonb_build_object('outcome', 'test', 'entry_id', v_entry, 'contact_id', null, 'code', v_code);
  end if;
  if v_state = 'held' then
    return jsonb_build_object('outcome', 'held', 'entry_id', v_entry, 'contact_id', null, 'code', v_code);
  end if;

  update public.forms set last_entry_at = now() where tenant_id = p_tenant_id and id = p_form_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', v_entry,
          jsonb_build_object('form', 'request', 'owed', to_jsonb(v_owed), 'form_id', p_form_id));
  return jsonb_build_object('outcome', 'accepted', 'entry_id', v_entry, 'contact_id', v_contact, 'code', v_code,
                            'person', v_person ->> 'outcome');
end $$;

revoke all on function public.form_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, jsonb, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.form_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, jsonb, text, boolean, text)
  to service_role;
comment on function public.form_request_take(uuid, uuid, uuid, text, jsonb, jsonb, text, jsonb, text, boolean, text) is
  'The hosted form door''s one write (00680; the Forms plan, 3.2): once by the page''s own id; a form that is not live answers closed; a version that is neither live nor replaced within a day answers stale with the live one; then the person through resolve_person as a form''s, the entry and its form_entry.accepted event, together. A test (p_test) and a doubtful entry (p_held_why) are kept with no person and no event. Answers {outcome: accepted|again|closed|stale|forgotten|held|test, entry_id, contact_id, code}: forgotten writes nothing at all (PE001). The service role''s alone.';

create or replace function public.form_entry_let_through(p_tenant_id uuid, p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   public.form_entries%rowtype;
  v_person  jsonb;
  v_contact uuid;
  v_owed    text[] := array['note', 'notice'];
begin
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

revoke all on function public.form_entry_let_through(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_entry_let_through(uuid, uuid) to service_role;
comment on function public.form_entry_let_through(uuid, uuid) is
  'A held form entry let through (00680): one held with no person has its person resolved now and its form_entry.accepted written now, so its note and its notice start then; one a member had set aside is a request again, and tells nobody twice. Answers {outcome: accepted|back|forgotten|gone, entry_id, contact_id}: a forgotten person''s entry is deleted. The service role''s alone; the route that calls it asks the member''s role.';

create or replace function public.form_entry_hold(p_tenant_id uuid, p_entry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_held integer;
begin
  update public.form_entries
     set state = 'held', held_why = 'member'
   where tenant_id = p_tenant_id and id = p_entry_id and form_id is not null and state <> 'held' and not test;
  get diagnostics v_held = row_count;
  return v_held > 0;
end $$;

revoke all on function public.form_entry_hold(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_entry_hold(uuid, uuid) to service_role;
comment on function public.form_entry_hold(uuid, uuid) is
  'A request a member says is not a real one, held (00680): it leaves every count and waits in its form''s held pile, where form_entry_let_through brings it back. Answers whether one was held. The service role''s alone; the route that calls it asks the member''s role.';

/* ---------------------------------------------------------------------- 7. a request carried into a chat -- */

create or replace function public.form_code_person(p_tenant_id uuid, p_code text, p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_email   text;
  v_has     text;
begin
  if p_tenant_id is null or nullif(btrim(coalesce(p_code, '')), '') is null
     or nullif(btrim(coalesce(p_phone, '')), '') is null then
    return false;
  end if;
  select e.contact_id into v_contact from public.form_entries e
   where e.tenant_id = p_tenant_id and e.code = upper(btrim(p_code)) and e.code_used_at is null
     and not e.test and e.created_at > now() - interval '30 days';
  if v_contact is null then
    return false;
  end if;
  select c.email, c.phone_e164 into v_email, v_has from public.contacts c
   where c.tenant_id = p_tenant_id and c.id = v_contact and c.erased_at is null;
  -- Only a person with an address and no number, and a number nobody here has: the door then finds them by their
  -- address and fills the number that was empty. Any other case is left as it is, and two people stay two.
  if v_email is null or v_has is not null
     or exists (select 1 from public.contacts o where o.tenant_id = p_tenant_id and o.phone_e164 = btrim(p_phone)) then
    return false;
  end if;
  begin
    perform public.resolve_person(p_tenant_id, '', '', btrim(p_phone), v_email, '', 'asserted', 'form',
                                  jsonb_build_object('by', 'request_code'));
  exception when sqlstate 'PE001' then
    return false;
  end;
  return true;
end $$;

revoke all on function public.form_code_person(uuid, text, text) from public, anon, authenticated;
grant execute on function public.form_code_person(uuid, text, text) to service_role;
comment on function public.form_code_person(uuid, text, text) is
  'Before a message that carries a request''s code is kept (00680): where the request''s person has an address and no number, and nobody in the workspace has the number that wrote, the number is added to that person through resolve_person (which fills what is empty and never overwrites), so the conversation is theirs. Anything else changes nothing. Answers whether a number was added. The service role''s alone.';

create or replace function public.form_code_link(
  p_tenant_id uuid, p_code text, p_conversation_id uuid, p_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry  public.form_entries%rowtype;
  v_writer uuid;
  v_owed   text[] := array['note', 'notice'];
begin
  if p_tenant_id is null or nullif(btrim(coalesce(p_code, '')), '') is null or p_conversation_id is null then
    return jsonb_build_object('linked', false);
  end if;
  select * into v_entry from public.form_entries e
   where e.tenant_id = p_tenant_id and e.code = upper(btrim(p_code)) and e.code_used_at is null
     and not e.test and e.created_at > now() - interval '30 days'
   for update;
  if not found then
    return jsonb_build_object('linked', false);
  end if;
  select c.contact_id into v_writer from public.conversations c
   where c.tenant_id = p_tenant_id and c.id = p_conversation_id;
  if v_writer is null then
    return jsonb_build_object('linked', false);
  end if;
  -- A held entry whose code arrives in a chat is let through: a person's own phone wrote. The one who wrote is its
  -- person, and its event is written now.
  if v_entry.state = 'held' and v_entry.contact_id is null then
    update public.form_entries
       set contact_id = v_writer, state = 'accepted', held_why = null, owed = v_owed
     where tenant_id = p_tenant_id and id = v_entry.id;
    update public.forms set last_entry_at = now() where tenant_id = p_tenant_id and id = v_entry.form_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'form_entry.accepted', 'contact', 'form_entry', v_entry.id,
            jsonb_build_object('form', 'request', 'owed', to_jsonb(v_owed), 'form_id', v_entry.form_id));
    v_entry.contact_id := v_writer;
  end if;
  insert into public.form_entry_links (tenant_id, entry_id, kind, conversation_id, message_id)
  values (p_tenant_id, v_entry.id, 'conversation', p_conversation_id, p_message_id)
  on conflict do nothing;
  -- Good once: the same code written again, from anywhere, links nothing.
  update public.form_entries set code_used_at = now() where tenant_id = p_tenant_id and id = v_entry.id;
  return jsonb_build_object('linked', true, 'entry_id', v_entry.id,
                            'same_person', v_entry.contact_id is not distinct from v_writer);
end $$;

revoke all on function public.form_code_link(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_code_link(uuid, text, uuid, uuid) to service_role;
comment on function public.form_code_link(uuid, text, uuid, uuid) is
  'After a message that carries a request''s code is kept (00680): the conversation is linked to the request (form_entry_links, kind conversation, with the message), which answers it, and the code is spent. A held entry whose code arrives is let through as the one who wrote, its event written then. A code that is unknown, spent, a test''s or older than 30 days links nothing. Answers {linked, entry_id, same_person}. The service role''s alone.';

/* ------------------------------------------------------------------------------------- 8. a link opened -- */

create or replace function public.link_open(p_code text, p_count boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.links%rowtype;
  v_out  jsonb;
begin
  if nullif(btrim(coalesce(p_code, '')), '') is null then
    return null;
  end if;
  select * into v_link from public.links l where l.code = lower(btrim(p_code));
  if not found then
    return null;
  end if;
  if v_link.stopped_at is null and coalesce(p_count, true) then
    insert into public.link_days as d (link_id, tenant_id, day, opens)
    values (v_link.id, v_link.tenant_id, (now() at time zone 'utc')::date, 1)
    on conflict (link_id, day) do update set opens = d.opens + 1;
  end if;
  v_out := jsonb_build_object('link_id', v_link.id, 'tenant_id', v_link.tenant_id, 'code', v_link.code,
                              'subject_type', v_link.subject_type, 'subject_id', v_link.subject_id,
                              'stopped', v_link.stopped_at is not null,
                              'workspace', (select t.slug from public.tenants t where t.id = v_link.tenant_id));
  if v_link.subject_type = 'form' then
    v_out := v_out || coalesce(
      (select jsonb_build_object('slug', f.slug, 'state', f.state) from public.forms f
        where f.tenant_id = v_link.tenant_id and f.id = v_link.subject_id), '{}'::jsonb);
  end if;
  return v_out;
end $$;

revoke all on function public.link_open(text, boolean) from public, anon, authenticated;
grant execute on function public.link_open(text, boolean) to service_role;
comment on function public.link_open(text, boolean) is
  'A link opened by its code (00680): where it lands ({link_id, tenant_id, code, subject_type, subject_id, stopped, workspace, and for a form its slug and state}), and one more open on its day unless it is stopped or the open is not counted (p_count false: a chat app''s preview). Null for a code nobody holds. The service role''s alone.';

/* ---------------------------------------------------------------------------------- 9. a member's reads -- */

create or replace function public.form_requests_open(p_tenant_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  -- A request is open until a link answers it: a member's word, a conversation that took it over, or a reply whose
  -- message did not fail and was not taken back. Sixty days: an older one stays in its form's own list.
  select coalesce(jsonb_agg(r.line order by r.created_at desc), '[]'::jsonb)
    from (
      select e.created_at,
             jsonb_build_object(
               'id', e.id, 'form_id', e.form_id, 'version_id', e.version_id, 'contact_id', e.contact_id,
               'created_at', e.created_at, 'answers', e.answers, 'reach', e.reach, 'place', l.place,
               'heading', v.description ->> 'heading',
               'unreached', exists (
                 select 1 from form_entry_links k
                   join messages m on m.tenant_id = k.tenant_id and m.id = k.message_id
                  where k.tenant_id = e.tenant_id and k.entry_id = e.id and k.kind = 'reply'
                    and m.status = 'failed')) as line
        from form_entries e
        join form_versions v on v.tenant_id = e.tenant_id and v.id = e.version_id
        left join links l on l.tenant_id = e.tenant_id and l.id = e.link_id
       where e.tenant_id = p_tenant_id
         and e.form_id is not null and e.state <> 'held' and not e.test
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

revoke all on function public.form_requests_open(uuid) from public, anon;
grant execute on function public.form_requests_open(uuid) to authenticated, service_role;
comment on function public.form_requests_open(uuid) is
  'The requests of a workspace''s hosted forms nobody has answered (00680; the Forms plan, 3.5), newest first, 200 at most over sixty days, read under the member''s own row rules: each with its answers, who it is about as typed, its form''s heading, the place it came through, and whether a reply to it failed to reach them (unreached). Answered is a marked link, a conversation link, or a reply whose message did not fail and was not taken back.';

create or replace function public.form_results(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with win as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366))) as since
  ), asked as (
    -- Each request in the window: whether its person was new with it, whether it became a conversation (a reply that
    -- left, or their own message with its code), and whether a visit followed by the rule an ad's is read by (00678):
    -- a visit asked for in a chat and confirmed there, or one a member added, made after the request and starting after.
    select e.form_id, e.link_id, e.contact_id,
           c.created_at > e.created_at - interval '1 minute' as new_person,
           exists (select 1 from form_entry_links k
                    where k.tenant_id = e.tenant_id and k.entry_id = e.id
                      and (k.kind = 'conversation'
                           or (k.kind = 'reply' and exists (
                                 select 1 from messages m
                                  where m.tenant_id = k.tenant_id and m.id = k.message_id
                                    and m.status not in ('failed', 'canceled'))))) as talked,
           exists (select 1 from appointments a
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
       and e.form_id is not null and e.state <> 'held' and not e.test
       and e.created_at > win.since
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
               'form_id', x.form_id, 'link_id', x.link_id, 'requests', x.requests, 'talked', x.talked,
               'visits', x.visits, 'people', x.people, 'new_people', x.new_people))
        from (select a.form_id, a.link_id, count(*) as requests,
                     count(distinct a.contact_id) as people,
                     count(*) filter (where a.talked) as talked,
                     count(distinct a.contact_id) filter (where a.booked) as visits,
                     count(distinct a.contact_id) filter (where a.new_person) as new_people
                from asked a group by a.form_id, a.link_id) x), '[]'::jsonb),
    'opens', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', o.link_id, 'opens', o.opens))
        from (select d.link_id, sum(d.opens) as opens
                from link_days d cross join win
               where d.tenant_id = p_tenant_id and d.day >= (win.since at time zone 'utc')::date
               group by d.link_id) o), '[]'::jsonb));
$$;

revoke all on function public.form_results(uuid, integer) from public, anon;
grant execute on function public.form_results(uuid, integer) to authenticated, service_role;
comment on function public.form_results(uuid, integer) is
  'What a workspace''s hosted forms brought over the last p_days (30; 1 to 366), read under the member''s own row rules (00680): by form and by the link each request came through (link_id null: none), the requests, how many became a conversation (talked), the people who asked (people), those who booked after (visits, by 00678''s rule for a visit that follows) and those new with their request; and each link''s opens. Held entries and tests are in no count.';

/* ------------------------------------------------------------------------------------ 10. how long kept -- */

create or replace function public.form_entries_purge()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gone integer;
begin
  -- A held entry nobody let through goes after 30 days; a test after 7 (contracts RETENTION_DAYS).
  delete from public.form_entries e
   where (e.state = 'held' and e.created_at < now() - interval '30 days')
      or (e.test and e.created_at < now() - interval '7 days');
  get diagnostics v_gone = row_count;
  return v_gone;
end $$;

revoke all on function public.form_entries_purge() from public, anon, authenticated;
grant execute on function public.form_entries_purge() to service_role;
comment on function public.form_entries_purge() is
  'A held form entry nobody let through goes after 30 days, and a test after 7 (00680; contracts RETENTION_DAYS form_entries_held and form_entries_test). The health sweep runs it. Answers how many went.';

/* ---------------------------------------------------------------------------------- 10b. the live feed -- */

-- A request arriving, held, let through or answered is a change Today's and the Inbox's Needs you draw (decision
-- 0047): a page left open learns of it as it learns of a message. An entry's update is told only when where it
-- stands or whose it is moved, never for the steps that tell its owner, which every entry writes.
drop trigger if exists workspace_tell_insert on public.form_entries;
create trigger workspace_tell_insert after insert on public.form_entries
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
create or replace trigger workspace_tell_update
  after update of state, held_why, contact_id
  on public.form_entries
  for each row when (
    old.state is distinct from new.state or old.held_why is distinct from new.held_why
    or old.contact_id is distinct from new.contact_id)
  execute function public.workspace_tell_row_change();
drop trigger if exists workspace_tell_delete on public.form_entries;
create trigger workspace_tell_delete after delete on public.form_entries
  referencing old table as changed for each statement execute function public.workspace_tell_changes();

drop trigger if exists workspace_tell_insert on public.form_entry_links;
create trigger workspace_tell_insert after insert on public.form_entry_links
  referencing new table as changed for each statement execute function public.workspace_tell_changes();
drop trigger if exists workspace_tell_delete on public.form_entry_links;
create trigger workspace_tell_delete after delete on public.form_entry_links
  referencing old table as changed for each statement execute function public.workspace_tell_changes();

/* ----------------------------------------------------------------------------------------- 11. the bell -- */

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind = any (array['handoff', 'deadman', 'call', 'number', 'sweep', 'job_failed', 'playbook',
                           'calendar_people', 'alert', 'review', 'billing', 'template_ready', 'template_blocked',
                           'broadcast_sent', 'broadcast_stopped', 'leads_ready', 'leads_question', 'note_for_you',
                           'reach_out_replied', 'reach_out_day', 'booking_notice', 'opted_out', 'booking',
                           'member_joined', 'member_left', 'note_to_keep', 'reply_held', 'ask_cards', 'website_form',
                           'files_waiting', 'video_ready', 'post_up', 'post_stopped', 'preview_tried',
                           'ad_account', 'footage', 'footage_in',
                           'ad_refused', 'ad_unpaid', 'ad_ended', 'ad_spent', 'ad_quiet', 'ad_draft',
                           'ad_unfinished', 'ad_unconfirmed', 'ad_way_in', 'ads_paused', 'booking_lapsed',
                           'form_request']));

/* ---------------------------------------------------------------------------- 12. what drafting a form costs -- */

-- ai_usage.purpose takes form_draft, so what drafting a form costs is a line of the ledger of its own, read apart
-- from every other draft (as an ad's words are: 00656).
alter table public.ai_usage drop constraint if exists ai_usage_purpose_check;
alter table public.ai_usage add constraint ai_usage_purpose_check
  check (purpose in ('receptionist', 'reply_draft', 'ask', 'lead_json', 'template_draft', 'review_reply',
                     'lead_judge', 'note_suggest', 'reach_out_check', 'reply_read', 'booking_read', 'lead_suggest',
                     'ask_journal', 'receptionist_review', 'fix_route', 'website_read', 'sender_read', 'file_look',
                     'preview_starters', 'ad_draft', 'file_words', 'file_hear', 'lead_draft', 'list_draft',
                     'person_draft', 'sequence_draft', 'yes_check', 'form_draft'));

/* ------------------------------------------------------------------- 13. a person a form made says so -- */

-- A person a hosted form made came by a form (resolve_person's source 'form'): their own door, beside the website's.
-- It was no word of the set, so the first touch read it as a hand ("Added by hand"). The set, the trigger that writes
-- the first touch, and people_list's came_from each take the one word more; nothing else of them changes.
alter table public.contacts drop constraint if exists contacts_acquired_via_check;
alter table public.contacts add constraint contacts_acquired_via_check
  check (acquired_via is null or acquired_via in ('whatsapp', 'sms', 'email', 'instagram', 'call', 'ad', 'calendar',
                                                    'import', 'lead', 'manual', 'website', 'form'));

create or replace function public.events_note_first_touch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_word text := NEW.data ->> 'source';
  v_via  text := case when v_word in ('calendar', 'lead', 'import', 'website', 'ad', 'form') then v_word else 'manual' end;
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

comment on function public.events_note_first_touch() is
  'The first touch of a person added at a door (K3): the source of the contact.added event beside them (calendar, lead, import, website, ad, form; any other word or none is manual), through person_set_first_touch, with the lead''s id as the ref where the event names one, and the ad''s (data.ad_ref, keyed by its platform: meta:<id>) for a person an ad''s own door added (0049, 00644). The mapping is people_list''s came_from for a door, written once. Never fails the event''s writer: a failure is a warning.';

-- people_list as 00678 leaves it, with 'form' among the doors came_from says (its one change).
create or replace function public.people_list(p_tenant_id uuid, p_contact_id uuid DEFAULT NULL::uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_added timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, display_name text, wa_profile_name text, phone_e164 text, email text, email_suppressed_at timestamp with time zone, consent text, consent_source text, consent_updated_at timestamp with time zone, dnc boolean, marketing_consent text, marketing_consent_source text, marketing_consent_updated_at timestamp with time zone, consent_channels text[], marketing_channels text[], offers_asked_at timestamp with time zone, email_marketing text, email_marketing_source text, email_marketing_updated_at timestamp with time zone, channels text[], conversation_count integer, escalation_count integer, needs_human boolean, open_escalation_reason text, open_escalation_since timestamp with time zone, latest_conversation_id uuid, latest_state text, latest_paused_until timestamp with time zone, latest_assignee_user_id uuid, latest_snooze_until timestamp with time zone, latest_wa_inbound_at timestamp with time zone, last_message_at timestamp with time zone, last_message_direction text, last_message_sender text, last_inbound_text text, last_inbound_at timestamp with time zone, last_inbound_channel text, last_wrote_at timestamp with time zone, last_call_at timestamp with time zone, last_inbound_call_at timestamp with time zone, last_inbound_call_summary text, call_count integer, call_seconds integer, first_contact_at timestamp with time zone, earliest_row_at timestamp with time zone, has_backfill boolean, has_chat boolean, message_channels text[], queued_reply_at timestamp with time zone, came_from text, deal_id uuid, deal_stage text, deal_service text, deal_proposed_at timestamp with time zone, deal_decided_at timestamp with time zone, deal_ended_at timestamp with time zone, deal_amount_cents integer, deal_per text, deal_proposal_url text, deal_valid_until date, deal_lost_reason text, open_deals jsonb, step_id uuid, step_body text, step_due_on date, step_for_user_id uuid, step_deal_id uuid, in_touch_at timestamp with time zone, added_at timestamp with time zone, lead_id uuid, lead_name text, lead_gone boolean, lead_emails text[], name_source text, name_settled_at timestamp with time zone, signer_message_id uuid, signer_name text, signer_title text, signer_read_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  -- The page first (0021): its people, in the kept order, after the cursor or the offset, and nobody else. Every read
  -- below is for them alone.
  with page as (
    select p.id, p.display_name, p.wa_profile_name, p.phone_e164, p.email,
           p.consent, p.consent_source, p.consent_updated_at, p.dnc,
           p.marketing_consent, p.marketing_consent_source, p.marketing_consent_updated_at,
           p.in_touch_at, p.added_at
      from people_page(p_tenant_id, p_contact_id, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) p
  ),
  ev as not materialized (
    select m.id, m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           e.at, e.moved_in as backfill, e.spoken,
           -- Whether the words are a person's own, not an automatic reply or a list's mail (00299).
           public.message_is_a_persons_words(m.meta) as persons_words
      from messages m
      -- When it happened, whether the customer saw or said it, and whether it came with a history moved in: the one
      -- statement of the three (00259), which the kept moments read too.
      cross join lateral message_moment(m.meta, m.channel_ts, m.created_at, m.type, m.status) e
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email, ch.email_suppressed_at,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    ch.consent_channels, ch.marketing_channels, ch.offers_asked_at,
    ch.email_marketing, ch.email_marketing_source, ch.email_marketing_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.wa_heard_at,
    ma.last_at, ma.last_direction, ma.last_sender,
    ma.last_in_body, ma.last_in_at, ma.last_wrote_on,
    ma.last_wrote_at,
    lk.last_at,
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how a door added them (their acquired_via, written from the door's contact.added event by
    -- 00307, the first word winning), else how a history moved in began, else their first spoken event.
    case
      when ch.acquired_via in ('calendar', 'lead', 'import', 'manual', 'website', 'form') then ch.acquired_via
      when coalesce(ma.has_backfill, false) then case when ma.backfill_first in ('call', 'whatsapp', 'sms', 'email') then ma.backfill_first else 'import' end
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email', 'instagram') then ma.first_channel
    end,
    dl.id, dl.stage, dl.service, dl.proposed_at, dl.decided_at, dl.ended_at, dl.amount_cents, dl.per,
    dl.proposal_url, dl.valid_until, dl.lost_reason,
    od.deals,
    st.id, st.body, st.due_on, st.for_user_id, st.deal_id,
    c.in_touch_at, c.added_at,
    ch.lead_id, case when not coalesce(ld.gone, false) then ld.business_name end, coalesce(ld.gone, false),
    ld.emails,
    ch.name_source, ch.name_settled_at,
    sg.message_id, sg.signer_name, sg.signer_title, sg.read_at
  from page c
  left join lateral (
    -- What each yes covers, when offers were asked for (00297), and when their address stopped being sent to (00126):
    -- read for the page's people alone, by their key.
    select k.consent_channels, k.marketing_channels, k.offers_asked_at, k.email_suppressed_at,
           k.email_marketing, k.email_marketing_source, k.email_marketing_updated_at,
           k.lead_id, k.name_source, k.name_settled_at, k.acquired_via
      from contacts k
     where k.id = c.id and k.tenant_id = p_tenant_id
  ) ch on true
  left join lateral (
    -- The business they work at (0052), by its key: its name, and whether it was erased or blanked since; and, for its
    -- own person alone while it stands, its addresses (its email and its alternates), each once, lower-cased.
    select l.business_name, (l.erased_at is not null or l.blanked_at is not null) as gone,
           case when l.contact_id = c.id and l.erased_at is null and l.blanked_at is null then
             (select array_agg(distinct lower(btrim(a.address)) order by lower(btrim(a.address)))
                from (select l.email as address
                      union all
                      select x->>'email' from jsonb_array_elements(coalesce(l.email_alternates, '[]'::jsonb)) x) a
               where nullif(btrim(coalesce(a.address, '')), '') is not null)
           end as emails
      from leads l
     where l.id = ch.lead_id and l.tenant_id = p_tenant_id
  ) ld on true
  left join lateral (
    -- A reply's signer offered as their name (0052), the newest: the reply's writer's alone, as the name's doors match
    -- it; offered rows are few, and found by reach_out_replies_signer_offered.
    select r.message_id, r.signer_name, r.signer_title, r.read_at
      from sequence_replies r
     where r.tenant_id = p_tenant_id and r.signer_state = 'offered' and r.undone_at is null
       and r.contact_id = c.id
     order by r.read_at desc
     limit 1
  ) sg on true
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until,
           -- The WhatsApp clock, from the per-channel fact through its one accessor (decision 0001, step 5).
           public.last_inbound_on_whatsapp(cv) as wa_heard_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    -- Everything the row says of a person's messages, in one pass over them (00464). It was four looks, each a pass of
    -- its own with a message_moment call for every message, and they were most of the list's time. A newest row is the
    -- one that happened last, then was written last, then has the greater id, so a tie picks the same row every time.
    select -- The newest word in the thread, either way.
           max(e.at) filter (where e.at is not null and e.spoken) as last_at,
           (array_agg(e.direction order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.spoken))[1] as last_direction,
           (array_agg(e.sender order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.spoken))[1] as last_sender,
           -- The newest words that came in.
           max(e.at) filter (where e.at is not null and e.direction = 'inbound' and e.spoken and e.body is not null)
             as last_in_at,
           (array_agg(e.body order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.direction = 'inbound' and e.spoken and e.body is not null))[1]
             as last_in_body,
           -- Where they last WROTE: the wire of their newest own words. Not a call's note (the system's row, never spoken)
           -- and not a program writing from their address (persons_words): an out-of-office made email "where they last
           -- wrote", and a campaign then went there. contracts lastWroteOn is its twin.
           (array_agg(e.channel order by e.at desc, e.created_at desc, e.id desc)
              filter (where e.at is not null and e.direction = 'inbound' and e.sender = 'customer' and e.spoken
                             and e.persons_words))[1] as last_wrote_on,
           min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- When they last wrote words of their own (00299), the statement has_relationship makes of "they wrote".
           max(e.at) filter (where e.direction = 'inbound' and e.spoken and e.at is not null and e.body is not null
                               and e.persons_words) as last_wrote_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel,
           -- The first row of a history moved in, in the order it was written: a call's note is a call, anything else its wire.
           (array_agg(case when e.type = 'call_summary' then 'call' else e.channel end order by e.created_at)
              filter (where e.backfill))[1] as backfill_first
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  left join lateral (
    -- The one deal the row shows: open or current first, then the newest.
    -- pickCurrentDeal in contracts orders a person's list the same way.
    select d.id, d.stage, d.service, d.proposed_at, d.decided_at, d.ended_at, d.amount_cents, d.per,
           d.proposal_url, d.valid_until, d.lost_reason
      from deals d
     where d.contact_id = c.id
     order by (d.stage in ('proposed', 'won')) desc, d.created_at desc
     limit 1
  ) dl on true
  left join lateral (
    -- Every open deal (0029), newest first: a person may hold one per service (deals_open_uq), and the one above hid the
    -- rest. Null for someone with none open.
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'stage', d.stage, 'service', d.service, 'proposed_at', d.proposed_at,
             'decided_at', d.decided_at, 'ended_at', d.ended_at, 'amount_cents', d.amount_cents, 'per', d.per,
             'currency', d.currency, 'proposal_url', d.proposal_url, 'valid_until', d.valid_until,
             'lost_reason', d.lost_reason
           ) order by d.created_at desc) as deals
      from deals d
     where d.contact_id = c.id
       and d.stage in ('proposed', 'won')
  ) od on true
  left join lateral (
    -- Their next step: the earliest open one, by its day, then the one written first. A step is a note with a day,
    -- for the team only, so the receptionist never reads it; the list carries it for the Pipeline and Today.
    select n.id, n.body, n.due_on, n.for_user_id, n.deal_id
      from person_notes n
     where n.tenant_id = p_tenant_id
       and n.contact_id = c.id
       and n.due_on is not null
       and n.done_at is null
     order by n.due_on, n.created_at, n.id
     limit 1
  ) st on true
  order by c.in_touch_at desc, c.added_at desc, c.id desc
$$;
