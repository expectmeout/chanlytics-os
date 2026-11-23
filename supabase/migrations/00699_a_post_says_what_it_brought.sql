-- 00699 · A post says what it brought (the content loop PRD v3.4, pass 2, M4; sections 5.2, 5.3, 9 and Appendix A).
--
-- A post that went up said nothing back: its numbers were read by nobody, a comment on it was kept as a delivery and
-- dropped, a reply to a story reached Inbox with nothing of the story on it, and no visit recorded what it answered.
-- This file keeps what a place says back, and the one fact a booking needs to be put down to a post with evidence.
--
--   post_observations         One row per number per read of a post (an hour, a day, 3, 7 and 28 days after it went
--                             up), as the place gave it: a running total, or why there is none. A missing number is
--                             never zero. Written by post_observations_keep alone.
--   touches                   A known person's reply, comment, reply to a story or coded first message, about a post or
--                             through a link (Appendix A.1): one row per event, once per place by the place's own id.
--                             The person and the evidence are emptied when the person is erased, follow the kept record
--                             when two are combined, and are emptied by age (touches_age_out: 180 days, but never the
--                             one that made a person). Ads keep their own home (ad_entries); a form's entry is Forms'.
--   comment_answers           A public answer to a comment, one per comment: AI's draft or why it could not answer
--                             safely, then what the owner sent and what Instagram said. The business's own words.
--   links                     A link may be of a post now, one per post, landing on a chat with the post's code or on
--                             the booking page (lands). link_open answers a post's landing.
--   appointments              through_type, through_id: what a visit answered when it was asked for or added in a
--                             conversation, stamped before it is written (appointments_through_stamp): the latest touch
--                             of that conversation in the 72 hours before, unless another visit was asked for there
--                             since (call 39). Written at the insert only: no update of a visit moves updated_at.
--   post_comment_keep         The edge's door for a person's comment: on a post Chanlytics sent, its person found or
--                             made, its touch kept once.
--   post_own_comment_keep     The business's own comment answering one kept: that comment is answered, by hand.
--   touches_keep                The edge's door for any other touch (a reply to a story, a coded message): kept once.
--   post_observations_keep    The job's door: one read of a post, every number at once.
--   comment_answer_draft_keep The job's door: AI's draft of a public answer, or why it could not.
--   comment_answer_send       A member's door: the owner's words sent as the business's public answer (its job).
--   comment_answer_settle     The job's door: what Instagram said of the answer.
--   comment_answer_leave      A member's door: a comment left unanswered, or answered after all.
--   post_link_make            A member's door: a post's one link, made on first ask.
--   post_observations_due     The health sweep's: each read of a post that is due and not kept, for its job.
--   touches_age_out           The health sweep's: touches older than 180 days keep their counts only.
--   job_kinds                 post_observe (bulk lane) and comment_reply (the lane of someone waiting).
--   ai_usage                  purposes comment_reply and comment_rewrite: what drafting a public answer costs, and
--                             writing it again as the owner asks.
--
-- Locks: links' and appointments' checks are added NOT VALID and validated after (a brief ACCESS EXCLUSIVE to add, a
-- SHARE UPDATE EXCLUSIVE to validate); ai_usage's purpose check is re-made from the purposes it holds (00682's way, so a
-- change applied beside this one keeps its own); three new tables; two rows into job_kinds. Three seconds each and no
-- more. Re-runnable. Deploy order: this file first, then the code (the job runner refuses a kind it does not hold, so a
-- kind's row and its handler arrive in one change). The code before it reads none of it; the code after it reads each
-- table through its repository, and a door that is not there yet is a refusal it says in words.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------ 1. a post's numbers -- */

create table if not exists public.post_observations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  post_id             uuid not null,
  place               text not null check (place in ('instagram', 'google')),
  -- Which read it was: an hour, a day, 3, 7 or 28 days after the post went up.
  step                text not null check (step in ('1h', '1d', '3d', '7d', '28d')),
  metric              text not null check (metric in ('reach', 'views', 'likes', 'comments', 'saves', 'shares',
                                                      'link_opens', 'profile_visits', 'follows')),
  availability        text not null check (availability in ('available', 'unsupported', 'delayed', 'failed',
                                                            'withheld')),
  value               numeric check (value is null or value >= 0),
  -- A running total since the post went up: from then to the read.
  period_start        timestamptz not null,
  period_end          timestamptz not null,
  observed_at         timestamptz not null default now(),
  -- Which reading of the place's numbers this is: a change in what the place counts is a new edition.
  definition_edition  integer not null default 1 check (definition_edition >= 1),
  -- Whether paid reach is in the number (a post run as an ad: pass 6). Never set yet.
  paid_mixed          boolean not null default false,
  -- What the place answered, numbers only: a comment's words are never written here.
  raw                 jsonb not null default '{}'::jsonb check (jsonb_typeof(raw) = 'object'),
  constraint post_observations_tenant_id_id_key unique (tenant_id, id),
  constraint post_observations_once unique (tenant_id, post_id, step, metric),
  constraint post_observations_value_only_when_there check ((availability = 'available') = (value is not null)),
  constraint post_observations_post_same_workspace foreign key (tenant_id, post_id)
    references public.posts (tenant_id, id) on delete cascade
);

create index if not exists post_observations_newest on public.post_observations (tenant_id, post_id, observed_at desc);

alter table public.post_observations enable row level security;
drop policy if exists post_observations_member_select on public.post_observations;
create policy post_observations_member_select on public.post_observations
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.post_observations from anon, authenticated;
grant select on public.post_observations to authenticated;
grant all on public.post_observations to service_role;

comment on table public.post_observations is
  'A post''s numbers as its place gave them (00699; the content loop PRD''s 5.3 and 9.1): one row per number per read, at an hour, a day, 3, 7 and 28 days after it went up. Each is a running total since then; a day''s change is two reads apart. availability says why a number is missing (unsupported, delayed, failed, or withheld: a story too few saw), and a missing number is never zero. Written by post_observations_keep alone; members read.';

/* ------------------------------------------------------------------------------------------ 2. touches -- */

create table if not exists public.touches (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  -- What was touched: a post Chanlytics sent, or a link. An ad's touch lives in ad_entries, a form's in form_entries.
  subject_type       text not null check (subject_type in ('post', 'link')),
  subject_id         uuid not null,
  kind               text not null check (kind in ('reply', 'comment', 'dm', 'story_reply', 'mention',
                                                   'coded_message')),
  -- Who: null only once emptied (erased, or past 180 days).
  contact_id         uuid,
  -- Where it happened, where it was in a conversation: its thread and its message.
  conversation_id    uuid,
  message_id         uuid,
  -- Whether this touch made the person, as ad_entries.new_person says for an ad.
  new_person         boolean not null default false,
  place              text not null check (place in ('instagram', 'whatsapp', 'google')),
  -- The place's own id for it (a comment's id, a message's id): what makes a touch once.
  provider_event_id  text not null check (char_length(provider_event_id) between 1 and 200),
  at                 timestamptz not null,
  -- What only this kind carries: a comment's words and its thread, a story's address. Emptied with the person.
  evidence           jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  emptied_at         timestamptz,
  created_at         timestamptz not null default now(),
  constraint touches_tenant_id_id_key unique (tenant_id, id),
  constraint touches_once unique (tenant_id, place, provider_event_id),
  constraint touches_person_until_emptied check (contact_id is not null or emptied_at is not null),
  constraint touches_contact_same_workspace foreign key (tenant_id, contact_id)
    references public.contacts (tenant_id, id) on delete set null (contact_id),
  constraint touches_conversation_same_workspace foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id) on delete set null (conversation_id),
  constraint touches_message_same_workspace foreign key (tenant_id, message_id)
    references public.messages (tenant_id, id) on delete set null (message_id)
);

create index if not exists touches_by_person on public.touches (tenant_id, contact_id, at desc);
create index if not exists touches_by_subject on public.touches (tenant_id, subject_type, subject_id, at desc);
create index if not exists touches_by_conversation on public.touches (tenant_id, conversation_id, at desc);
create index if not exists touches_by_message on public.touches (tenant_id, message_id);
create index if not exists touches_by_time on public.touches (tenant_id, at desc);

alter table public.touches enable row level security;
drop policy if exists touches_member_select on public.touches;
create policy touches_member_select on public.touches
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.touches from anon, authenticated;
grant select on public.touches to authenticated;
grant all on public.touches to service_role;

comment on table public.touches is
  'A known person''s reply, comment, reply to a story or coded first message, about a post or through a link (00699; the content loop PRD''s Appendix A.1, A.3, A.5): one row per event, once per place by the place''s own id. Events, never edited, written by post_comment_keep and touches_keep. The business''s own replies and comments are never touches. Emptied with the person (touches_erase_on_contact), moved with a combined record (touches_follow_merge), emptied by age after 180 days except the one that made a person (touches_age_out). Members read.';

create or replace function public.touches_erase_on_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    update public.touches t
       set contact_id = null, conversation_id = null, message_id = null, evidence = '{}'::jsonb,
           emptied_at = coalesce(t.emptied_at, now())
     where t.tenant_id = new.tenant_id and t.contact_id = new.id;
  end if;
  return null;
end $$;

revoke all on function public.touches_erase_on_contact() from public, anon, authenticated;
comment on function public.touches_erase_on_contact() is
  'A person erased (decision 0036; erase_contact keeps the person''s row as a tombstone, so no foreign key reaches this): their touches keep only that they happened, of what and when; who, where and what was said are emptied (00699).';

drop trigger if exists contacts_erase_takes_touches on public.contacts;
create trigger contacts_erase_takes_touches
  after update of erased_at on public.contacts
  for each row execute function public.touches_erase_on_contact();

create or replace function public.touches_follow_merge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.merged_into_contact_id is not null and old.merged_into_contact_id is null then
    update public.touches t
       set contact_id = new.merged_into_contact_id
     where t.tenant_id = new.tenant_id and t.contact_id = new.id;
  end if;
  return null;
end $$;

revoke all on function public.touches_follow_merge() from public, anon, authenticated;
comment on function public.touches_follow_merge() is
  'When two records of one person are combined, the touches of the one merged away go to the one kept (00699; Appendix A.3): what a person answered is theirs, in the merge itself.';

drop trigger if exists contacts_merge_moves_touches on public.contacts;
create trigger contacts_merge_moves_touches
  after update of merged_into_contact_id on public.contacts
  for each row execute function public.touches_follow_merge();

create or replace function public.touches_age_out(p_before timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before timestamptz := coalesce(p_before, now() - interval '180 days');
  v_count integer;
begin
  update public.touches t
     set contact_id = null, conversation_id = null, message_id = null, evidence = '{}'::jsonb, emptied_at = now()
   where t.emptied_at is null and t.at < v_before and not t.new_person;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.touches_age_out(timestamptz) from public, anon, authenticated;
grant execute on function public.touches_age_out(timestamptz) to service_role;
comment on function public.touches_age_out(timestamptz) is
  'Touches older than 180 days (or p_before) keep their counts only: who, where and what was said are emptied (00699; Appendix A.9, call 35). The touch that made a person stays while the person does. Answers how many it emptied. The service role''s, run by the health sweep.';

/* ---------------------------------------------------------------------------- 3. a public answer to a comment -- */

create table if not exists public.comment_answers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  touch_id     uuid not null,
  state        text not null check (state in ('drafted', 'cannot', 'sending', 'sent', 'failed', 'left')),
  -- AI's draft, or why AI could not answer it safely (a complaint, a price it has no claim for).
  draft        text check (draft is null or char_length(draft) between 1 and 2200),
  cannot_why   text check (cannot_why is null or char_length(cannot_why) between 1 and 300),
  -- What the owner sent, or is sending.
  words        text check (words is null or char_length(words) between 1 and 2200),
  sent_by      uuid,
  -- Answered in the Instagram app, not from here: seen as the business's own comment under it.
  by_hand      boolean not null default false,
  external_id  text check (external_id is null or char_length(external_id) between 1 and 200),
  -- Instagram's refusal, in the house's words.
  said         text check (said is null or char_length(said) between 1 and 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  sent_at      timestamptz,
  constraint comment_answers_tenant_id_id_key unique (tenant_id, id),
  constraint comment_answers_one_a_comment unique (tenant_id, touch_id),
  constraint comment_answers_shape check (
    (state <> 'sending' or words is not null)
    and (state <> 'sent' or external_id is not null)
    and (state <> 'cannot' or cannot_why is not null)),
  constraint comment_answers_touch_same_workspace foreign key (tenant_id, touch_id)
    references public.touches (tenant_id, id) on delete cascade
);

create index if not exists comment_answers_newest on public.comment_answers (tenant_id, updated_at desc);

alter table public.comment_answers enable row level security;
drop policy if exists comment_answers_member_select on public.comment_answers;
create policy comment_answers_member_select on public.comment_answers
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.comment_answers from anon, authenticated;
grant select on public.comment_answers to authenticated;
grant all on public.comment_answers to service_role;

comment on table public.comment_answers is
  'A public answer to a comment on a post, one per comment (00699; the content loop PRD''s 12.4): AI''s draft or why it could not answer safely, then the owner''s words and what Instagram said. The business speaking in public: AI drafts, the owner sends, until that rung is moved. Written by comment_answer_draft_keep, comment_answer_send, comment_answer_settle, comment_answer_leave and post_own_comment_keep; members read.';

/* ------------------------------------------------------------------------------------------ 4. a post's link -- */

alter table public.links drop constraint if exists links_subject_type_check;
alter table public.links add constraint links_subject_type_check check (subject_type in ('form', 'post')) not valid;
alter table public.links validate constraint links_subject_type_check;
alter table public.links add column if not exists lands text;
alter table public.links drop constraint if exists links_lands_check;
alter table public.links add constraint links_lands_check check (lands in ('chat', 'booking')) not valid;
alter table public.links validate constraint links_lands_check;
-- A post's link says where it lands; a form's lands on its form and says nothing.
alter table public.links drop constraint if exists links_lands_a_post;
alter table public.links add constraint links_lands_a_post check ((subject_type = 'post') = (lands is not null)) not valid;
alter table public.links validate constraint links_lands_a_post;
create unique index if not exists links_one_a_post on public.links (tenant_id, subject_id) where subject_type = 'post';

comment on column public.links.lands is
  'Where a post''s link lands (00699): chat (a chat with the business carrying the post''s code, the default call to action) or booking (its booking page, whose opens are counted and never credited). Null for a form''s.';

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
  elsif v_link.subject_type = 'post' then
    -- Where a post's link may land, all the workspace's own: the Instagram account the post went to (by its username),
    -- its oldest WhatsApp number, its booking page.
    v_out := v_out || jsonb_build_object('lands', v_link.lands) || coalesce(
      (select jsonb_build_object(
                'place', p.place,
                'instagram', (select c.config->>'username' from public.tenant_channels c
                               where c.tenant_id = p.tenant_id and c.kind = 'instagram' and c.status = 'active'
                                 and (p.account_id is null or c.external_id = p.account_id)
                               order by c.created_at limit 1),
                'whatsapp', (select c.number_e164 from public.tenant_channels c
                              where c.tenant_id = p.tenant_id and c.kind = 'whatsapp' and c.status = 'active'
                                and c.number_e164 is not null
                              order by c.created_at limit 1),
                'booking', (select nullif(btrim(tc.config->'brain'->>'booking_link'), '') from public.tenant_config tc
                             where tc.tenant_id = p.tenant_id))
         from public.posts p
        where p.tenant_id = v_link.tenant_id and p.id = v_link.subject_id), '{}'::jsonb);
  end if;
  return v_out;
end $$;

revoke all on function public.link_open(text, boolean) from public, anon, authenticated;
grant execute on function public.link_open(text, boolean) to service_role;
comment on function public.link_open(text, boolean) is
  'A link opened by its code (00680, 00699): where it lands ({link_id, tenant_id, code, subject_type, subject_id, stopped, workspace}; for a form its slug and state; for a post where it lands, its place, and the workspace''s own places it may land on: the Instagram account the post went to by username, the oldest WhatsApp number, the booking page), and one more open on its day unless it is stopped or the open is not counted (p_count false: a chat app''s preview). Null for a code nobody holds. The service role''s alone.';

create or replace function public.post_link_make(p_tenant_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post  public.posts%rowtype;
  v_lands text;
  v_link  public.links%rowtype;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'post_link_make: not a member who may act here' using errcode = '42501';
  end if;
  select * into v_post from public.posts p where p.tenant_id = p_tenant_id and p.id = p_post_id;
  if not found then
    raise exception 'post_link_make: no such post in this workspace' using errcode = 'P0002';
  end if;
  select * into v_link from public.links l
   where l.tenant_id = p_tenant_id and l.subject_type = 'post' and l.subject_id = p_post_id;
  if not found then
    -- Its call to action decides where it lands: the booking page where the piece was made to send people there, a
    -- chat with the business everywhere else ("Message us", call 23).
    select case when pc.intent->>'call_to_action' = 'book' then 'booking' else 'chat' end into v_lands
      from public.pieces pc where pc.tenant_id = p_tenant_id and pc.id = v_post.piece_id;
    insert into public.links (tenant_id, subject_type, subject_id, place, lands, created_by)
    values (p_tenant_id, 'post', p_post_id, 'The post''s link', coalesce(v_lands, 'chat'), auth.uid())
    on conflict (tenant_id, subject_id) where subject_type = 'post' do nothing
    returning * into v_link;
    if v_link.id is null then
      select * into v_link from public.links l
       where l.tenant_id = p_tenant_id and l.subject_type = 'post' and l.subject_id = p_post_id;
    end if;
  end if;
  return jsonb_build_object('link_id', v_link.id, 'code', v_link.code, 'lands', v_link.lands,
                            'stopped', v_link.stopped_at is not null,
                            'opens', coalesce((select sum(d.opens) from public.link_days d
                                                where d.tenant_id = p_tenant_id and d.link_id = v_link.id), 0));
end $$;

revoke all on function public.post_link_make(uuid, uuid) from public, anon;
grant execute on function public.post_link_make(uuid, uuid) to authenticated, service_role;
comment on function public.post_link_make(uuid, uuid) is
  'A post''s one link, made on first ask (00699; the content loop PRD''s 9.2, call 23): landing on a chat with the business carrying the post''s code, or on the booking page where the piece was made to send people there. Answers {link_id, code, lands, stopped, opens}. A member who may act (is_acting_member).';

/* ------------------------------------------------------------------------- 5. what a visit answered -- */

alter table public.appointments add column if not exists through_type text;
alter table public.appointments add column if not exists through_id uuid;
alter table public.appointments drop constraint if exists appointments_through_type_check;
alter table public.appointments add constraint appointments_through_type_check
  check (through_type in ('post', 'ad', 'link', 'form')) not valid;
alter table public.appointments validate constraint appointments_through_type_check;
-- What a visit answered is named whole, or not at all.
alter table public.appointments drop constraint if exists appointments_through_whole;
alter table public.appointments add constraint appointments_through_whole
  check ((through_type is null) = (through_id is null)) not valid;
alter table public.appointments validate constraint appointments_through_whole;
create index if not exists appointments_through on public.appointments (tenant_id, through_type, through_id)
  where through_type is not null;

comment on column public.appointments.through_type is
  'What the visit answered (00699; the content loop PRD''s 9.3, Appendix A.7, call 39): post, ad, link or form, stamped when it was asked for or added in a conversation (appointments_through_stamp). Null for a visit that came any other way. "From this post" reads this.';
comment on column public.appointments.through_id is
  'The id of what the visit answered (through_type''s record), stamped with it.';

create or replace function public.appointments_through_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_id   uuid;
  v_at   timestamptz;
  v_made timestamptz := coalesce(NEW.created_at, now());
begin
  if NEW.conversation_id is null or NEW.source not in ('receptionist', 'person') or NEW.through_type is not null then
    return NEW;
  end if;
  -- The latest touch of this conversation in the 72 hours before: a post's (touches), or an ad's (a message that came
  -- from an ad, in Ads' own home).
  select x.subject_type, x.subject_id, x.at into v_type, v_id, v_at
    from (
      select t.subject_type, t.subject_id, t.at
        from public.touches t
       where t.tenant_id = NEW.tenant_id and t.conversation_id = NEW.conversation_id and t.contact_id is not null
         and t.at <= v_made and t.at > v_made - interval '72 hours'
      union all
      select 'ad', e.ad_id, m.created_at
        from public.ad_entries e
        join public.messages m on m.tenant_id = e.tenant_id and m.id = e.message_id
       where e.tenant_id = NEW.tenant_id and m.conversation_id = NEW.conversation_id and e.ad_id is not null
         and m.created_at <= v_made and m.created_at > v_made - interval '72 hours'
    ) x
   order by x.at desc
   limit 1;
  if v_id is null then
    return NEW;
  end if;
  -- Another visit asked for or added in this conversation since that touch: the touch led to that one, not this.
  if exists (select 1 from public.appointments a
              where a.tenant_id = NEW.tenant_id and a.conversation_id = NEW.conversation_id
                and a.created_at > v_at and a.created_at <= v_made) then
    return NEW;
  end if;
  NEW.through_type := v_type;
  NEW.through_id := v_id;
  return NEW;
end $$;

revoke all on function public.appointments_through_stamp() from public, anon, authenticated;
comment on function public.appointments_through_stamp() is
  'What a visit answered, stamped before it is written (00699; Appendix A.7, call 39): for a visit asked for (receptionist) or added by a member (person) in a conversation, the subject of the latest touch of that conversation in the 72 hours before (a post''s touch, or a message that came from an ad), provided no other visit was asked for or added there since that touch. One rule, the same whoever books; AI does not choose it. At the insert only.';

drop trigger if exists appointments_through_stamp on public.appointments;
create trigger appointments_through_stamp
  before insert on public.appointments
  for each row execute function public.appointments_through_stamp();

/* --------------------------------------------------------------------------- 6. the edge's doors -- */

create or replace function public.touches_keep(
  p_tenant_id uuid, p_kind text, p_subject_type text, p_subject_id uuid, p_contact_id uuid, p_place text,
  p_event_id text, p_at timestamptz, p_conversation_id uuid default null, p_message_id uuid default null,
  p_new_person boolean default null, p_evidence jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_new boolean := p_new_person;
begin
  if p_contact_id is null then
    raise exception 'touches_keep: a touch is a known person''s' using errcode = '22004';
  end if;
  -- Unsaid, a touch on a message made the person when they had written nothing before it.
  if v_new is null and p_message_id is not null then
    v_new := not exists (
      select 1 from public.messages m
       where m.tenant_id = p_tenant_id and m.contact_id = p_contact_id and m.id <> p_message_id
         and m.direction = 'inbound'
         and m.created_at < (select x.created_at from public.messages x
                              where x.tenant_id = p_tenant_id and x.id = p_message_id));
  end if;
  insert into public.touches (tenant_id, subject_type, subject_id, kind, contact_id, conversation_id, message_id,
                              new_person, place, provider_event_id, at, evidence)
  values (p_tenant_id, p_subject_type, p_subject_id, p_kind, p_contact_id, p_conversation_id, p_message_id,
          coalesce(v_new, false), p_place, p_event_id, coalesce(p_at, now()), coalesce(p_evidence, '{}'::jsonb))
  on conflict (tenant_id, place, provider_event_id) do nothing
  returning id into v_id;
  if v_id is null then
    select t.id into v_id from public.touches t
     where t.tenant_id = p_tenant_id and t.place = p_place and t.provider_event_id = p_event_id;
    return jsonb_build_object('kept', false, 'touch_id', v_id);
  end if;
  return jsonb_build_object('kept', true, 'touch_id', v_id);
end $$;

revoke all on function public.touches_keep(uuid, text, text, uuid, uuid, text, text, timestamptz, uuid, uuid, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.touches_keep(uuid, text, text, uuid, uuid, text, text, timestamptz, uuid, uuid, boolean, jsonb)
  to service_role;
comment on function public.touches_keep(uuid, text, text, uuid, uuid, text, text, timestamptz, uuid, uuid, boolean, jsonb) is
  'A known person''s touch, kept once by the place''s own id (00699; Appendix A.5): {kept, touch_id}; kept false for one already there. Whether it made the person is said by the caller, or, for a touch on a message, read: they had written nothing before it. The service role''s: the edge''s inbound steps call it for a reply to a story and a coded first message.';

create or replace function public.post_comment_keep(
  p_tenant_id uuid, p_account text, p_from text, p_username text, p_comment_id text, p_media_id text,
  p_parent_id text, p_words text, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post    public.posts%rowtype;
  v_person  jsonb;
  v_contact uuid;
  v_new     boolean;
  v_kept    jsonb;
begin
  if nullif(btrim(coalesce(p_from, '')), '') is null or nullif(btrim(coalesce(p_comment_id, '')), '') is null then
    raise exception 'post_comment_keep: a comment has an author and an id' using errcode = '22004';
  end if;
  -- A comment on a post Chanlytics sent, to the account it went to. One on a post made by hand is not kept here.
  select * into v_post from public.posts p
   where p.tenant_id = p_tenant_id and p.place = 'instagram' and p.external_id = p_media_id
     and (p.account_id is null or p.account_id = p_account)
   order by p.published_at desc nulls last
   limit 1;
  if not found then
    return jsonb_build_object('kept', false, 'why', 'not_ours');
  end if;
  if exists (select 1 from public.touches t
              where t.tenant_id = p_tenant_id and t.place = 'instagram' and t.provider_event_id = p_comment_id) then
    return jsonb_build_object('kept', false, 'why', 'again', 'post_id', v_post.id);
  end if;
  -- The person by their Instagram-scoped id, the one a DM's sender carries: found, or made by this comment.
  v_person := public.resolve_person(p_tenant_id, 'instagram', btrim(p_from), null, null,
                                    nullif(btrim(coalesce(p_username, '')), ''), 'observed', 'inbound',
                                    '{}'::jsonb, now());
  v_contact := (v_person->>'contact_id')::uuid;
  v_new := not coalesce((v_person->>'existed')::boolean, true);
  if v_new then
    perform public.person_set_first_touch(p_tenant_id, v_contact, 'instagram', null, null);
  end if;
  v_kept := public.touches_keep(p_tenant_id, 'comment', 'post', v_post.id, v_contact, 'instagram', btrim(p_comment_id),
                              coalesce(p_at, now()), null, null, v_new,
                              jsonb_strip_nulls(jsonb_build_object(
                                'words', left(nullif(btrim(coalesce(p_words, '')), ''), 2200),
                                'username', nullif(btrim(coalesce(p_username, '')), ''),
                                'thread', nullif(btrim(coalesce(p_parent_id, '')), ''))));
  -- AI's draft of a public answer, in this transaction: a delivery Meta sends again finds the comment kept, and its job.
  if (v_kept->>'kept')::boolean then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'comment_reply', now(),
            jsonb_build_object('touch_id', v_kept->>'touch_id', 'step', 'draft'));
  end if;
  return v_kept || jsonb_build_object('post_id', v_post.id, 'contact_id', v_contact, 'new_person', v_new);
end $$;

revoke all on function public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz)
  to service_role;
comment on function public.post_comment_keep(uuid, text, text, text, text, text, text, text, timestamptz) is
  'A person''s comment on a post Chanlytics sent (00699; the content loop PRD''s 9.2, Appendix A.3 to A.5): the post by the id it keeps and the account it went to, the person by their Instagram-scoped id (resolve_person; made by the comment when new, first arrival instagram), the comment kept once as a touch with its words and thread, and AI''s draft of a public answer asked for (comment_reply, step draft) in the same transaction. {kept, touch_id, post_id, contact_id, new_person}, or {kept: false, why: not_ours | again}. The service role''s.';

create or replace function public.post_own_comment_keep(p_tenant_id uuid, p_comment_id text, p_parent_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_touch uuid;
begin
  if nullif(btrim(coalesce(p_parent_id, '')), '') is null then
    return false;
  end if;
  -- Our own answer, delivered back by Meta, is ours already.
  if exists (select 1 from public.comment_answers a
              where a.tenant_id = p_tenant_id and a.external_id = btrim(p_comment_id)) then
    return false;
  end if;
  select t.id into v_touch from public.touches t
   where t.tenant_id = p_tenant_id and t.place = 'instagram' and t.provider_event_id = btrim(p_parent_id)
     and t.kind = 'comment';
  if v_touch is null then
    return false;
  end if;
  insert into public.comment_answers (tenant_id, touch_id, state, by_hand, external_id, sent_at)
  values (p_tenant_id, v_touch, 'sent', true, btrim(p_comment_id), now())
  on conflict (tenant_id, touch_id) do update
    set state = 'sent', by_hand = true, external_id = excluded.external_id, sent_at = excluded.sent_at,
        updated_at = now()
    where comment_answers.state <> 'sent';
  return true;
end $$;

revoke all on function public.post_own_comment_keep(uuid, text, text) from public, anon, authenticated;
grant execute on function public.post_own_comment_keep(uuid, text, text) to service_role;
comment on function public.post_own_comment_keep(uuid, text, text) is
  'The business''s own comment, under a person''s comment kept here (00699): that comment is answered, by hand in the Instagram app. Our own answer delivered back changes nothing. True when it marked one. The service role''s.';

create or replace function public.post_observations_keep(
  p_tenant_id uuid, p_post_id uuid, p_step text, p_rows jsonb, p_definition_edition integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post  public.posts%rowtype;
  v_count integer;
begin
  select * into v_post from public.posts p where p.tenant_id = p_tenant_id and p.id = p_post_id;
  if not found then
    return 0;
  end if;
  insert into public.post_observations as o (tenant_id, post_id, place, step, metric, availability, value,
                                             period_start, period_end, observed_at, definition_edition, raw)
  select p_tenant_id, p_post_id, v_post.place, p_step, r.metric, r.availability,
         case when r.availability = 'available' then r.value end,
         coalesce(v_post.published_at, v_post.created_at), now(), now(), coalesce(p_definition_edition, 1),
         jsonb_strip_nulls(jsonb_build_object('value', r.value))
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(metric text, availability text, value numeric)
  on conflict (tenant_id, post_id, step, metric) do update
    set availability = excluded.availability, value = excluded.value, period_end = excluded.period_end,
        observed_at = excluded.observed_at, definition_edition = excluded.definition_edition, raw = excluded.raw;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.post_observations_keep(uuid, uuid, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.post_observations_keep(uuid, uuid, text, jsonb, integer) to service_role;
comment on function public.post_observations_keep(uuid, uuid, text, jsonb, integer) is
  'One read of a post''s numbers, every number at once (00699): [{metric, availability, value}], a value kept only where it was there. A read asked again at its step writes over itself. Answers the rows written; 0 for a post that is gone. The service role''s: post_observe''s.';

create or replace function public.post_observations_due(p_limit integer default 200)
returns table (tenant_id uuid, post_id uuid, step text)
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id, p.id, s.step
    from public.posts p
    cross join (values ('1h', interval '1 hour'), ('1d', interval '1 day'), ('3d', interval '3 days'),
                       ('7d', interval '7 days'), ('28d', interval '28 days')) as s(step, after)
   where p.status = 'published' and p.place in ('instagram', 'google') and p.published_at is not null
     and p.published_at > now() - interval '29 days'
     and p.published_at + s.after <= now()
     and not exists (select 1 from public.post_observations o
                      where o.tenant_id = p.tenant_id and o.post_id = p.id and o.step = s.step)
   order by p.published_at + s.after
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.post_observations_due(integer) from public, anon, authenticated;
grant execute on function public.post_observations_due(integer) to service_role;
comment on function public.post_observations_due(integer) is
  'The reads of posts'' numbers that are due and not kept (00699; the content loop PRD''s 9.1): each post up on a place, at each of its steps whose time has come, oldest first. The health sweep asks a post_observe job for each. A post taken down is read no more. The service role''s.';

create index if not exists posts_published_lately on public.posts (published_at) where status = 'published';
create index if not exists touches_to_age on public.touches (at) where emptied_at is null and not new_person;

/* ------------------------------------------------------------------- 7. a public answer's doors -- */

create or replace function public.comment_answer_draft_keep(
  p_tenant_id uuid, p_touch_id uuid, p_draft text, p_cannot_why text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (nullif(btrim(coalesce(p_draft, '')), '') is null) = (nullif(btrim(coalesce(p_cannot_why, '')), '') is null) then
    raise exception 'comment_answer_draft_keep: a draft, or why there is none' using errcode = '22023';
  end if;
  insert into public.comment_answers (tenant_id, touch_id, state, draft, cannot_why)
  values (p_tenant_id, p_touch_id,
          case when nullif(btrim(coalesce(p_draft, '')), '') is null then 'cannot' else 'drafted' end,
          nullif(btrim(coalesce(p_draft, '')), ''), nullif(btrim(coalesce(p_cannot_why, '')), ''))
  on conflict (tenant_id, touch_id) do update
    set state = excluded.state, draft = excluded.draft, cannot_why = excluded.cannot_why, updated_at = now()
    where comment_answers.state in ('drafted', 'cannot');
  return found;
end $$;

revoke all on function public.comment_answer_draft_keep(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.comment_answer_draft_keep(uuid, uuid, text, text) to service_role;
comment on function public.comment_answer_draft_keep(uuid, uuid, text, text) is
  'AI''s draft of a public answer to a comment, or why it could not answer it safely (00699). Never over an answer that was sent or is on its way. True when it wrote. The service role''s: comment_reply''s.';

create or replace function public.comment_answer_send(p_tenant_id uuid, p_touch_id uuid, p_words text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_words text := nullif(btrim(coalesce(p_words, '')), '');
  v_state text;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'comment_answer_send: not a member who may act here' using errcode = '42501';
  end if;
  if v_words is null or char_length(v_words) > 2200 then
    raise exception 'comment_answer_send: an answer of 1 to 2,200 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.touches t
                  where t.tenant_id = p_tenant_id and t.id = p_touch_id and t.kind = 'comment'
                    and t.contact_id is not null) then
    raise exception 'comment_answer_send: no such comment in this workspace' using errcode = 'P0002';
  end if;
  select a.state into v_state from public.comment_answers a where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id;
  if v_state in ('sending', 'sent') then
    return jsonb_build_object('sent', false, 'state', v_state);
  end if;
  insert into public.comment_answers (tenant_id, touch_id, state, words, sent_by)
  values (p_tenant_id, p_touch_id, 'sending', v_words, auth.uid())
  on conflict (tenant_id, touch_id) do update
    set state = 'sending', words = excluded.words, sent_by = excluded.sent_by, said = null, updated_at = now();
  insert into public.jobs (tenant_id, kind, payload, due_at)
  values (p_tenant_id, 'comment_reply',
          jsonb_build_object('touch_id', p_touch_id, 'step', 'send',
                             'attempt', floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text),
          now());
  return jsonb_build_object('sent', true, 'state', 'sending');
end $$;

revoke all on function public.comment_answer_send(uuid, uuid, text) from public, anon;
grant execute on function public.comment_answer_send(uuid, uuid, text) to authenticated, service_role;
comment on function public.comment_answer_send(uuid, uuid, text) is
  'The owner''s words sent as the business''s public answer to a comment (00699; the content loop PRD''s 12.4, call 27): kept as on its way and its job written (comment_reply, step send), in one transaction. An answer on its way or sent is not sent twice. {sent, state}. A member who may act (is_acting_member).';

create or replace function public.comment_answer_settle(
  p_tenant_id uuid, p_touch_id uuid, p_sent boolean, p_external_id text, p_said text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.comment_answers a
     set state = case when p_sent then 'sent' else 'failed' end,
         external_id = case when p_sent then nullif(btrim(coalesce(p_external_id, '')), '') else a.external_id end,
         said = case when p_sent then null else left(nullif(btrim(coalesce(p_said, '')), ''), 300) end,
         sent_at = case when p_sent then now() else a.sent_at end,
         updated_at = now()
   where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id and a.state = 'sending';
  return found;
end $$;

revoke all on function public.comment_answer_settle(uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.comment_answer_settle(uuid, uuid, boolean, text, text) to service_role;
comment on function public.comment_answer_settle(uuid, uuid, boolean, text, text) is
  'What Instagram said of a public answer on its way (00699): sent with its id, or failed with the house''s words for why. Only an answer on its way is settled. True when it wrote. The service role''s: comment_reply''s.';

create or replace function public.comment_answer_leave(p_tenant_id uuid, p_touch_id uuid, p_left boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state text;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'comment_answer_leave: not a member who may act here' using errcode = '42501';
  end if;
  if not exists (select 1 from public.touches t
                  where t.tenant_id = p_tenant_id and t.id = p_touch_id and t.kind = 'comment') then
    raise exception 'comment_answer_leave: no such comment in this workspace' using errcode = 'P0002';
  end if;
  if p_left then
    -- Left as it stands: AI's draft and its reason are kept, for an answer after all.
    insert into public.comment_answers (tenant_id, touch_id, state)
    values (p_tenant_id, p_touch_id, 'left')
    on conflict (tenant_id, touch_id) do update
      set state = 'left', updated_at = now()
      where comment_answers.state in ('drafted', 'cannot', 'failed');
  else
    update public.comment_answers a
       set state = case when a.draft is not null then 'drafted' when a.cannot_why is not null then 'cannot' end,
           updated_at = now()
     where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id and a.state = 'left'
       and (a.draft is not null or a.cannot_why is not null);
    -- Left before AI wrote anything: back to no answer at all.
    delete from public.comment_answers a
     where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id and a.state = 'left';
  end if;
  select a.state into v_state from public.comment_answers a where a.tenant_id = p_tenant_id and a.touch_id = p_touch_id;
  return jsonb_build_object('state', v_state);
end $$;

revoke all on function public.comment_answer_leave(uuid, uuid, boolean) from public, anon;
grant execute on function public.comment_answer_leave(uuid, uuid, boolean) to authenticated, service_role;
comment on function public.comment_answer_leave(uuid, uuid, boolean) is
  'A comment left unanswered by the owner, or answered after all (00699; the content loop PRD''s 12.4): left, it is no point on Today and nothing is posted under it; AI''s draft and its reason are kept, and come back. An answer on its way or up is not left. {state}: where it stands now, null for none. A member who may act (is_acting_member).';

/* ------------------------------------------------------------------------------------ 8. the job kinds -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('post_observe', 2, array['post_id', 'step'], false),
  ('comment_reply', 1, array['touch_id', 'step', 'attempt?'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ------------------------------------------------------------------------- 9. what an answer's draft costs -- */

-- ai_usage.purpose takes comment_reply and comment_rewrite, read from the check as it stands and added to it (00682's
-- way): a purpose another change applied beside this one added is kept.
do $$
declare
  v_purposes text[];
begin
  select array_agg(found.m[1] order by found.at) into v_purposes
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.ai_usage'::regclass and c.conname = 'ai_usage_purpose_check';
  if coalesce(cardinality(v_purposes), 0) = 0 then
    raise exception 'ai_usage_purpose_check: the purposes it holds could not be read';
  end if;
  if not 'comment_reply' = any (v_purposes) then
    v_purposes := array_append(v_purposes, 'comment_reply'::text);
  end if;
  if not 'comment_rewrite' = any (v_purposes) then
    v_purposes := array_append(v_purposes, 'comment_rewrite'::text);
  end if;
  alter table public.ai_usage drop constraint ai_usage_purpose_check;
  execute 'alter table public.ai_usage add constraint ai_usage_purpose_check check (purpose in ('
    || (select string_agg(quote_literal(p.purpose), ', ' order by p.at) from unnest(v_purposes) with ordinality as p(purpose, at))
    || '))';
end $$;
