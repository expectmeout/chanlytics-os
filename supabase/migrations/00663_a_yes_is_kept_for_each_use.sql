-- 00663 · A yes is kept for each use (the content PRD's step L4, its consent half; the Ads plan's 6.8, joins 1 and 2).
--
-- A photo or a video that shows someone was held to one tick on the file, `files.who_in_it = 'agreed'`: it said nobody
-- who, when, for what, or how to take it back, and a yes for posts read as a yes for everything. New ad could only offer
-- pictures with nobody in them (the Ads plan's G15). A yes is now a record of its own, for one use.
--
--   file_consents          One yes: who said it, for which file, for which use (a post, an ad, a reply, a cold email),
--                          when, where it was said (to AI in a conversation, or a tick given before this), who told
--                          AI, and when it was taken back. Members read it; only the two doors below write it. A
--                          made piece's own yes is kept on it; one said on a photo or clip reaches every piece drawn from
--                          it as the readers judge it (contracts files/yes.ts), never by a copy.
--   files.yes_for          The uses this file has a yes for that stands, and the uses whose every yes on it was taken
--   files.yes_back         back: the records' own standing, restated by the doors in their own transaction, so every
--                          page and AI read it with the file's row and hear it change on the feed.
--   file_yes_record        A member's door (the settings permission, as file_change): a yes said to AI, for one or
--                          more uses. The same person's yes for a use that already stands is not kept twice.
--   file_yes_take_back     The same member's door: the yes for the uses named (every use, when none is) taken back,
--                          on the file and on every piece drawn from it, in one transaction that also holds every
--                          post of them still waiting (the PRD's section 8, step 1) and answers every one already up or
--                          on its way (step 2). A running ad that shows the person is paused in this same act once
--                          the record of ads made here exists (the Ads plan's G16): its seam is marked below, and the
--                          answer's `ads` is empty until then.
--   file_drawn_from        What a made piece was drawn from (its photo, its clips), read from `made` in one place, for
--   files_drawn_from       the doors here and, through the service role, for New ad, which judges a piece by the
--                          people in what it was made from.
--   post_begin             Re-made: a yes for posts taken back on a piece, or on what it was drawn from, and not given
--                          again on the piece, is `taken_back`, and no new post of it goes.
--   file_change            Re-made: who is in it is "no one" or nothing; a yes is the doors above.
--   piece_file_begin       Re-made: a video's own word is "no one" where every file it was drawn from says so; the
--                          owner's yes at the press is a record on each file now (server/content/piece.ts).
--
-- D11: every tick already given is carried over as a yes for posts, never for ads, said "before" (said_in 'before'),
-- by whoever ticked it where the event that kept it names them, at that moment; then the tick leaves the column, and
-- `agreed` leaves its set.
--
-- Locks. Adding two columns to `files` takes its lock for a moment; narrowing its CHECK reads it once under a lock that
-- holds its writers for that read; re-making a trigger on it, the same. This file waits three seconds for each and no
-- more. Run again on a quiet moment if it times out: nothing was applied.
--
-- Deploy order: this file first, then the code. The code before it reads `yes_for` (a column it does not have yet). In
-- the minutes between, the old code's "They agreed" press is refused ("Say no one is in it.") and an old card made with
-- the owner's word fails to save; each works again once the new code is out. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- 1. the record -- */

create table if not exists public.file_consents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  file_id        uuid not null,
  -- What it is a yes for: contracts FILE_YES_USES.
  use            text not null check (use = any (array['post', 'ad', 'reply', 'cold_email'])),
  -- Who said yes, as the owner named them ("Ana", "everyone in it").
  who            text not null check (char_length(who) between 1 and 120 and who = btrim(who)),
  -- Where it was said: to AI, in a conversation (thread_id, while it is kept), or a tick given before this (D11).
  said_in        text not null check (said_in = any (array['ai', 'before'])),
  thread_id      uuid,
  -- The member who told AI; null for a tick whose event named nobody.
  said_by        uuid references auth.users (id) on delete set null,
  said_at        timestamptz not null default now(),
  taken_back_at  timestamptz,
  taken_back_by  uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint file_consents_taken_back_shape check (taken_back_by is null or taken_back_at is not null),
  constraint file_consents_file_id_same_workspace foreign key (tenant_id, file_id)
    references public.files (tenant_id, id) on delete cascade,
  constraint file_consents_thread_id_same_workspace foreign key (tenant_id, thread_id)
    references public.ask_threads (tenant_id, id) on delete set null (thread_id)
);

-- A file's yeses, read with it and restated by its doors.
create index if not exists file_consents_file on public.file_consents (tenant_id, file_id, created_at desc);
-- One standing yes a person, a file and a use: said again, it is the same yes.
create unique index if not exists file_consents_one_standing on public.file_consents (tenant_id, file_id, use, lower(who))
  where taken_back_at is null;
create index if not exists file_consents_thread on public.file_consents (tenant_id, thread_id) where thread_id is not null;
create index if not exists file_consents_said_by on public.file_consents (said_by) where said_by is not null;
create index if not exists file_consents_taken_back_by on public.file_consents (taken_back_by)
  where taken_back_by is not null;

alter table public.file_consents enable row level security;
drop policy if exists file_consents_member_select on public.file_consents;
create policy file_consents_member_select on public.file_consents
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A member reads their workspace's yeses; file_yes_record and file_yes_take_back are how one is written.
revoke all on public.file_consents from anon, authenticated;
grant select on public.file_consents to authenticated;
grant all on public.file_consents to service_role;

comment on table public.file_consents is
  'A yes for one use of a file (00663; the content PRD''s step L4): who said it, for a post, an ad, a reply or a cold email, when, where it was said, and when it was taken back. Members read it; file_yes_record and file_yes_take_back write it. A yes for posts never covers an ad.';
comment on column public.file_consents.who is
  'Who said yes, as the owner named them to AI. A person in a picture is not joined to People, so this leaves with the workspace, as the picture does.';
comment on column public.file_consents.said_in is
  'ai (said to AI, in the conversation thread_id names while it is kept) or before (a tick on the file given before 00663, carried over as a yes for posts: D11).';

/* -------------------------------------------------------------------------------------- 2. the file's standing -- */

alter table public.files add column if not exists yes_for text[] not null default '{}'::text[];
alter table public.files add column if not exists yes_back text[] not null default '{}'::text[];
alter table public.files drop constraint if exists files_yes_for_check;
alter table public.files add constraint files_yes_for_check
  check (yes_for <@ array['post', 'ad', 'reply', 'cold_email']::text[]);
alter table public.files drop constraint if exists files_yes_back_check;
alter table public.files add constraint files_yes_back_check
  check (yes_back <@ array['post', 'ad', 'reply', 'cold_email']::text[] and not (yes_back && yes_for));
grant select (yes_for, yes_back) on public.files to authenticated;
comment on column public.files.yes_for is
  'The uses this file has a yes for that stands (00663, file_consents), as its doors restate them: what every page and AI read with the row.';
comment on column public.files.yes_back is
  'The uses whose every yes on this file was taken back, and none given again (00663, file_consents).';

-- The two columns as their records say, for the files named: the one place they are written.
create or replace function public.file_yes_restate(p_tenant_id uuid, p_ids uuid[])
returns void
language sql
set search_path = public
as $$
  update public.files f
     set yes_for = s.yes_for, yes_back = s.yes_back
    from (
      select x.id,
             coalesce((select array_agg(c.use order by c.use)
                         from (select distinct c.use from public.file_consents c
                                where c.tenant_id = p_tenant_id and c.file_id = x.id and c.taken_back_at is null) c),
                      '{}'::text[]) as yes_for,
             coalesce((select array_agg(c.use order by c.use)
                         from (select c.use from public.file_consents c
                                where c.tenant_id = p_tenant_id and c.file_id = x.id
                                group by c.use
                               having bool_and(c.taken_back_at is not null)) c),
                      '{}'::text[]) as yes_back
        from unnest(p_ids) as x(id)
    ) s
   where f.tenant_id = p_tenant_id and f.id = s.id
     and (f.yes_for is distinct from s.yes_for or f.yes_back is distinct from s.yes_back);
$$;
revoke all on function public.file_yes_restate(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.file_yes_restate(uuid, uuid[]) to service_role;
comment on function public.file_yes_restate(uuid, uuid[]) is
  'files.yes_for and files.yes_back restated from file_consents for the files named (00663): called by the doors that write a yes, in their own transaction.';

-- Feed: a yes given or taken back is a change a page draws (the Library's line, New ad's pictures).
drop trigger if exists workspace_tell_update on public.files;
create trigger workspace_tell_update after update of status, name, shows, who_in_it, look_status, look, removed_at,
                                                     media_status, sound_said, copy_state, copy_why, yes_for, yes_back
  on public.files
  for each row
  when (old.status is distinct from new.status or old.name is distinct from new.name or old.shows is distinct from new.shows
        or old.who_in_it is distinct from new.who_in_it or old.look_status is distinct from new.look_status
        or old.look is distinct from new.look or old.removed_at is distinct from new.removed_at
        or old.media_status is distinct from new.media_status or old.sound_said is distinct from new.sound_said
        or old.copy_state is distinct from new.copy_state or old.copy_why is distinct from new.copy_why
        or old.yes_for is distinct from new.yes_for or old.yes_back is distinct from new.yes_back)
  execute function public.workspace_tell_row_change();

/* ------------------------------------------------------------------------- 3. the ticks already given (D11) -- */

-- Each tick as a yes for posts, never for ads: by whoever ticked it, at that moment, where the event that kept it says
-- so (file_change's file.changed); a post made with the owner's word (file_made) by whoever made it.
insert into public.file_consents (tenant_id, file_id, use, who, said_in, said_by, said_at)
select f.tenant_id, f.id, 'post', 'The people in it', 'before',
       (select u.id from auth.users u where u.id = coalesce(t.by_user, f.created_by)),
       coalesce(t.at, f.updated_at)
  from public.files f
  left join lateral (
    select case when e.data ->> 'by' ~ '^[0-9a-f-]{36}$' then (e.data ->> 'by')::uuid end as by_user, e.created_at as at
      from public.events e
     where e.tenant_id = f.tenant_id and e.kind = 'file.changed'
       and e.data ->> 'file_id' = f.id::text and e.data -> 'said' ->> 'who_in_it' = 'agreed'
     order by e.created_at desc
     limit 1
  ) t on true
 where f.who_in_it = 'agreed'
on conflict do nothing;

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct f.tenant_id from public.files f where f.who_in_it = 'agreed' loop
    perform public.file_yes_restate(
      v_tenant, array(select f.id from public.files f where f.tenant_id = v_tenant and f.who_in_it = 'agreed'));
  end loop;
end $$;

update public.files f set who_in_it = 'not_asked' where f.who_in_it = 'agreed';

alter table public.files drop constraint if exists files_who_in_it_check;
alter table public.files add constraint files_who_in_it_check check (who_in_it = any (array['not_asked', 'no_one']));
comment on column public.files.who_in_it is
  'A person''s word alone: not_asked, or no_one. What the look counted is on look.people, and contracts whoStandsOf reads the two; a yes is file_consents (00663).';

/* ------------------------------------------------------------------------------------------------ 4. the doors -- */

-- What a made piece was drawn from, by id as text: every `file_id` its `made` names (a post's plan names its photo or
-- its video's moment; a video's plan its clips and photos, at any depth). The one place this is read from `made`.
create or replace function public.file_drawn_from(p_made jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(distinct v #>> '{}'), '{}'::text[])
    from jsonb_path_query(coalesce(p_made, '{}'::jsonb), 'lax $.**.file_id') as v
   where jsonb_typeof(v) = 'string';
$$;
revoke all on function public.file_drawn_from(jsonb) from public, anon, authenticated;
grant execute on function public.file_drawn_from(jsonb) to service_role;
comment on function public.file_drawn_from(jsonb) is
  'The ids, as text, of every file a made piece''s `made` names (00663): what it was drawn from. Read by the yes doors, post_begin and files_drawn_from.';

-- The uses a door was handed, each once and in one order; every use where none is (a take-back of everything).
create or replace function public.file_yes_uses(p_uses text[], p_every boolean)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
           when coalesce(cardinality(p_uses), 0) = 0 and p_every then array['ad', 'cold_email', 'post', 'reply']
           else coalesce((select array_agg(u order by u) from (select distinct u from unnest(p_uses) as u) d), '{}'::text[])
         end;
$$;
revoke all on function public.file_yes_uses(text[], boolean) from public, anon, authenticated;
grant execute on function public.file_yes_uses(text[], boolean) to service_role;
comment on function public.file_yes_uses(text[], boolean) is
  'The uses a yes door was handed, each once and sorted; every use where none was handed and p_every (00663).';

create or replace function public.file_yes_record(p_tenant_id uuid, p_file_id uuid, p_uses text[], p_who text,
                                                  p_thread_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_uses   text[] := public.file_yes_uses(p_uses, false);
  v_who    text := btrim(coalesce(p_who, ''));
  v_thread uuid;
  v_ids    uuid[];
  v_new    text[];
  v_file   public.files;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if cardinality(v_uses) = 0 or not (v_uses <@ array['post', 'ad', 'reply', 'cold_email']) then
    raise exception 'A yes is for posts, ads, replies or cold emails.' using errcode = '22023';
  end if;
  if char_length(v_who) not between 1 and 120 then
    raise exception 'Say who said yes, in at most 120 characters.' using errcode = '22023';
  end if;
  -- One at a time, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  if not exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id and f.removed_at is null)
  then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  -- The conversation it was said in, where it is this workspace's.
  select t.id into v_thread from public.ask_threads t where t.tenant_id = p_tenant_id and t.id = p_thread_id;
  with kept as (
    insert into public.file_consents (tenant_id, file_id, use, who, said_in, thread_id, said_by)
    select p_tenant_id, p_file_id, u, v_who, 'ai', v_thread, v_actor from unnest(v_uses) as u
    on conflict (tenant_id, file_id, use, lower(who)) where taken_back_at is null do nothing
    returning id, use
  )
  select coalesce(array_agg(k.id order by k.use), '{}'::uuid[]), coalesce(array_agg(k.use order by k.use), '{}'::text[])
    into v_ids, v_new
    from kept k;
  perform public.file_yes_restate(p_tenant_id, array[p_file_id]);
  -- What was said, and by whom, as every word of a file is kept (file_change's file.changed): a yes, for its uses.
  if cardinality(v_new) > 0 then
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'file.changed', 'setup', 'workspace', p_tenant_id,
            jsonb_build_object('file_id', p_file_id, 'by', v_actor,
                               'said', jsonb_build_object('yes', to_jsonb(v_new), 'who', v_who)));
  end if;
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  return jsonb_build_object('ids', to_jsonb(v_ids), 'kept', to_jsonb(v_new),
                            'again', to_jsonb(array(select u from unnest(v_uses) as u where u <> all (v_new) order by u)),
                            'yes_for', to_jsonb(v_file.yes_for), 'yes_back', to_jsonb(v_file.yes_back));
end $$;
revoke all on function public.file_yes_record(uuid, uuid, text[], text, uuid) from public, anon;
grant execute on function public.file_yes_record(uuid, uuid, text[], text, uuid) to authenticated, service_role;
comment on function public.file_yes_record(uuid, uuid, text[], text, uuid) is
  'A member''s door, with the settings permission (00663): a yes said to AI for a file, for each use named (post, ad, reply, cold_email), by who the owner named, in the conversation named. The same person''s standing yes for a use is not kept twice. Answers {ids, kept, again (uses already standing), yes_for, yes_back}.';

create or replace function public.file_yes_take_back(p_tenant_id uuid, p_file_id uuid, p_uses text[] default null,
                                                     p_held text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_uses  text[] := public.file_yes_uses(p_uses, true);
  v_files uuid[];
  v_back  integer;
  v_held  jsonb := '[]'::jsonb;
  v_live  jsonb := '[]'::jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if not (v_uses <@ array['post', 'ad', 'reply', 'cold_email']) then
    raise exception 'A yes is for posts, ads, replies or cold emails.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  if not exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id and f.removed_at is null)
  then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  -- The file, and every piece drawn from it: a post's photo, a video's clips and photos (files.made names each).
  select array_agg(f.id order by f.id) into v_files
    from public.files f
   where f.tenant_id = p_tenant_id and f.removed_at is null
     and (f.id = p_file_id or (f.source = 'made' and p_file_id::text = any (public.file_drawn_from(f.made))));
  update public.file_consents c
     set taken_back_at = now(), taken_back_by = v_actor
   where c.tenant_id = p_tenant_id and c.file_id = any (v_files) and c.use = any (v_uses) and c.taken_back_at is null;
  get diagnostics v_back = row_count;
  perform public.file_yes_restate(p_tenant_id, v_files);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.changed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_file_id, 'by', v_actor,
                             'said', jsonb_build_object('taken_back', to_jsonb(v_uses))));
  if 'post' = any (v_uses) then
    -- 1. Every post of them still waiting is held, in this same transaction (the PRD's section 8).
    with held as (
      update public.posts p
         set status = 'held', updated_at = now(),
             held_reason = left(coalesce(nullif(btrim(p_held), ''), 'Someone in it took back their yes.'), 300)
       where p.tenant_id = p_tenant_id and p.file_id = any (v_files)
         and p.status = any (array['queued', 'preparing'])
      returning p.id, p.file_id, p.place, p.kind, p.scheduled_for
    )
    select coalesce(jsonb_agg(jsonb_build_object('post_id', h.id, 'file_id', h.file_id, 'place', h.place,
                                                 'kind', h.kind, 'at', h.scheduled_for)
                              order by h.scheduled_for, h.id), '[]'::jsonb)
      into v_held
      from held h;
    -- 2. Every one already up, or past holding on its way, is answered: the owner takes each down where it is.
    select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'file_id', p.file_id, 'place', p.place,
                                                 'kind', p.kind, 'status', p.status, 'permalink', p.permalink,
                                                 'at', coalesce(p.published_at, p.scheduled_for))
                              order by coalesce(p.published_at, p.scheduled_for) desc, p.id), '[]'::jsonb)
      into v_live
      from public.posts p
     where p.tenant_id = p_tenant_id and p.file_id = any (v_files)
       and p.status = any (array['publishing', 'checking', 'published']);
  end if;
  -- G16 (the Ads plan): once the record of ads made here exists, every running ad that shows one of v_files is paused
  -- here, in this same transaction, and answered under `ads`. Until then no ad is made here, so there is none to pause.
  return jsonb_build_object('taken_back', v_back, 'uses', to_jsonb(v_uses), 'files', to_jsonb(v_files),
                            'held', v_held, 'live', v_live, 'ads', '[]'::jsonb);
end $$;
revoke all on function public.file_yes_take_back(uuid, uuid, text[], text) from public, anon;
grant execute on function public.file_yes_take_back(uuid, uuid, text[], text) to authenticated, service_role;
comment on function public.file_yes_take_back(uuid, uuid, text[], text) is
  'A member''s door, with the settings permission (00663; the content PRD''s section 8): the yes for each use named (every use where none is) taken back on a file and on every piece drawn from it, every post of them still waiting held with p_held''s words, in one transaction. Answers {taken_back, uses, files, held, live (posts up or on their way), ads (G16: empty until the record of ads made here exists)}.';

create or replace function public.files_drawn_from(p_tenant_id uuid, p_ids uuid[])
returns table (file_id uuid, from_id uuid)
language sql
stable
set search_path = public
as $$
  select f.id, s.id
    from public.files f
    join public.files s
      on s.tenant_id = p_tenant_id and s.id::text = any (public.file_drawn_from(f.made)) and s.removed_at is null
         and s.id <> f.id
   where f.tenant_id = p_tenant_id and f.id = any (p_ids) and f.source = 'made'
   order by f.id, s.id;
$$;
revoke all on function public.files_drawn_from(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.files_drawn_from(uuid, uuid[]) to service_role;
comment on function public.files_drawn_from(uuid, uuid[]) is
  'The service role''s read (00663): for each made piece named, the files of the workspace it was drawn from that are still here, by file_drawn_from, so New ad judges a piece by the people in what it was made from.';

/* ------------------------------------------------------------------------------- 5. a post, and who is in it -- */

create or replace function public.post_begin(
  p_tenant_id uuid,
  p_file_id uuid,
  p_place text,
  p_kind text,
  p_caption text,
  p_when timestamptz default null,
  p_via text default 'press'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_file  public.files;
  v_busy  uuid;
  v_id    uuid;
  v_when  timestamptz := greatest(coalesce(p_when, now()), now());
  -- A Google post for later than two minutes on waits for its job; one for now is the press's own call (contracts POST_SOON).
  v_later boolean := p_place = 'google' and v_when > now() + interval '2 minutes';
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if p_place is null or p_place <> all (array['instagram', 'google']) then
    raise exception 'No such place: %.', p_place using errcode = '22023';
  end if;
  -- A reel waits for a video's road to Instagram (decision 0121); Google takes a picture alone.
  if p_kind is null or p_kind <> all (array['picture', 'story']) or (p_place = 'google' and p_kind <> 'picture') then
    return jsonb_build_object('fate', 'not_yet', 'post_id', null);
  end if;
  if p_caption is not null and char_length(p_caption) > 2200 then
    raise exception 'A caption is at most 2,200 characters.' using errcode = '22023';
  end if;
  -- contracts POST_AHEAD_DAYS_MAX.
  if v_when > now() + interval '30 days' then
    raise exception 'A post goes within thirty days.' using errcode = '22023';
  end if;
  -- One at a time per file, place and kind, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'post_id', null);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'post_id', null);
  end if;
  -- A yes for posts taken back on it, or on a photo or clip it was drawn from, and not given again on it (00663; the
  -- content PRD's section 8): no new post of it goes.
  if not ('post' = any (v_file.yes_for))
     and ('post' = any (v_file.yes_back)
          or exists (select 1 from public.files s
                      where s.tenant_id = p_tenant_id and 'post' = any (s.yes_back)
                        and s.id::text = any (public.file_drawn_from(v_file.made)))) then
    return jsonb_build_object('fate', 'taken_back', 'post_id', null);
  end if;
  -- A Google press is one call: one that died between its placement and its answer stops holding the next press after ten
  -- minutes, in the words the files sweep says it with (contracts FILE_WORDS.google.unknown). Whether it went up is still
  -- the edge's events' to say.
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words',
                                    'Google did not say whether this went up. Look on your profile before posting it again.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  -- A post and a story wait apart (00620): busy is one of the same kind on its way at that place.
  select p.id into v_busy from public.posts p
   where p.file_id = p_file_id and p.place = p_place and p.kind = p_kind
     and p.status = any (array['queued', 'preparing', 'publishing', 'checking']);
  if found then
    return jsonb_build_object('fate', 'busy', 'post_id', v_busy);
  end if;
  insert into public.posts (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status)
  values (p_tenant_id, p_file_id, p_place, p_kind,
          case when p_kind = 'story' then null else nullif(btrim(p_caption), '') end,
          v_when, v_actor, now(), coalesce(p_via, 'press'),
          -- Google for now is asked by the press itself, in the same moment; for later, and Instagram's send, is a job.
          case when p_place = 'google' and not v_later then 'publishing' else 'queued' end)
  returning id into v_id;
  if p_place = 'instagram' then
    -- Ten minutes ahead of its time, so Instagram has made it ready by then. As text: a job's once-only key is made of strings.
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'post_prepare', greatest(now(), v_when - interval '10 minutes'),
            jsonb_build_object('post_id', v_id, 'attempt', '1'));
  elsif v_later then
    -- Google fetches the picture as it is asked, so the job is due at the post's own time.
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'post_google', v_when, jsonb_build_object('post_id', v_id, 'attempt', '1'));
  end if;
  return jsonb_build_object('fate', 'begun', 'post_id', v_id);
end $$;
comment on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) is
  'A member''s press, with the settings permission (00611, 00616, 00620, 00663): a made post approved for a place, as a picture or a story, with its words and its time; a picture and a story of one piece wait apart. The placement is written, and for Instagram its first job; for Google later than two minutes on, its post_google job at its time. Answers {fate: begun, busy (the one of its kind on its way), gone, not_a_post, not_yet, taken_back (a yes for posts taken back on it or on what it was drawn from), post_id}.';

create or replace function public.file_change(p_tenant_id uuid, p_id uuid, p_name text default null,
                                              p_shows text default null, p_who_in_it text default null,
                                              p_status text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   public.files;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_row from public.files f
   where f.tenant_id = p_tenant_id and f.id = p_id and f.removed_at is null
   for update;
  if not found then
    raise exception 'That file is gone.' using errcode = 'P0002';
  end if;
  if p_status is not null and p_status not in ('filed', 'set_aside') then
    raise exception 'A file is filed or set aside.' using errcode = '22023';
  end if;
  -- not_asked is where a file starts, never something a person says; a yes is file_yes_record's (00663).
  if p_who_in_it is not null and p_who_in_it <> 'no_one' then
    raise exception 'Say no one is in it.' using errcode = '22023';
  end if;
  if p_name is not null and p_name <> v_row.name and public.file_free_name(p_tenant_id, p_name, p_id) <> p_name then
    raise exception 'Another file has that name.' using errcode = '22023';
  end if;
  update public.files f
     set name = coalesce(p_name, f.name),
         owner_named = f.owner_named or p_name is not null,
         shows = coalesce(p_shows, f.shows),
         owner_shelved = f.owner_shelved or p_shows is not null,
         who_in_it = coalesce(p_who_in_it, f.who_in_it),
         status = coalesce(p_status, f.status),
         updated_at = now()
   where f.tenant_id = p_tenant_id and f.id = p_id;
  -- What was said, and by whom: "no one is in it" is a word someone gave, on a day.
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.changed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', p_id, 'by', v_actor, 'said',
                             jsonb_strip_nulls(jsonb_build_object('name', p_name, 'shows', p_shows,
                                                                  'who_in_it', p_who_in_it, 'status', p_status))));
end $$;
comment on function public.file_change(uuid, uuid, text, text, text, text) is
  'What a person says of a file (00551, 00663): its name, its shelf, that no one is in it, filed or set aside. A field left null stays, and the event keeps what was said. A yes is file_yes_record''s.';

-- A video's own word on who is in it, without the old tick: every line but the one that read it is 00638's.
create or replace function public.piece_file_begin(p_piece_id uuid, p_id uuid, p_media_ref text, p_name text, p_bytes bigint, p_fingerprint text, p_seconds numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece  public.pieces;
  v_tenant uuid;
  v_held   text;
  v_begun  timestamptz;
  v_twin   uuid;
  v_status text;
  v_used   numeric;
  v_who    text;
begin
  select p.tenant_id into v_tenant from public.pieces p where p.id = p_piece_id;
  if not found then
    return jsonb_build_object('fate', 'ended', 'file_id', null);
  end if;
  -- One at a time, as every door that names or files takes it (00551); the row is read under it, so two runs never both
  -- begin one video's file.
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text || '|files', 42));
  select * into v_piece from public.pieces p where p.id = p_piece_id for update;
  if not found or v_piece.status <> 'making' then
    return jsonb_build_object('fate', 'ended', 'file_id', null);
  end if;
  -- Asked again (a lost answer, or a second run): the same answer, with the reservation the row holds and when it was begun,
  -- so whoever asks can tell a run still sending it from one that died.
  if v_piece.file_id is not null then
    select f.media_ref, f.created_at into v_held, v_begun from public.files f where f.id = v_piece.file_id;
    return jsonb_build_object('fate', 'kept', 'file_id', v_piece.file_id, 'media_ref', v_held, 'begun_at', v_begun);
  end if;
  -- The same bytes are a file already: this video is that one, and follows it wherever it stands. `twin` says where.
  select f.id, f.media_status into v_twin, v_status from public.files f
   where f.tenant_id = v_piece.tenant_id and f.fingerprint = p_fingerprint and f.removed_at is null;
  if found then
    update public.pieces p
       set file_id = v_twin, machine = null, stage = 'saving', updated_at = now(),
           status = case v_status when 'ready' then 'made' when 'failed' then 'failed' else p.status end,
           failed_why = case when v_status = 'failed' then 'store' else p.failed_why end,
           made_at = case when v_status = 'ready' then now() else p.made_at end
     where p.id = p_piece_id;
    return jsonb_build_object('fate', 'here', 'file_id', v_twin, 'twin', v_status);
  end if;
  -- contracts FILES_MAX.
  if public.files_toward_cap(v_piece.tenant_id) >= 1000 then
    return jsonb_build_object('fate', 'full', 'file_id', null);
  end if;
  -- contracts FILE_VIDEO_MINUTES_MAX: what is kept and what is on its way, together.
  v_used := public.video_seconds_toward_cap(v_piece.tenant_id);
  if v_used + coalesce(p_seconds, 0) > 60 * 60 then
    return jsonb_build_object('fate', 'minutes', 'file_id', null);
  end if;
  -- Who is in it is its files' own word: no one where every one says so, else not asked. A yes is each file's own record
  -- (00663), and a made video is judged by the files it was drawn from, so none is kept on it here. Its files are every
  -- one its plan names: a "Hook first" plan's cuts, and in a plan of blocks a clip's and a photo's, a pair's two pictures
  -- and the picture a quote stands over. Read by each file's id as text, so a plan that names no file (cards of words
  -- alone) reads none, and says not asked.
  select case
           when coalesce(bool_and(f.who_in_it = 'no_one'), false) then 'no_one'
           else 'not_asked'
         end
    into v_who
    from public.files f
   where f.tenant_id = v_piece.tenant_id
     and f.id::text in (
           select c ->> 'file_id'
             from jsonb_array_elements(case when jsonb_typeof(v_piece.plan -> 'cuts') = 'array'
                                            then v_piece.plan -> 'cuts' else '[]'::jsonb end) c
           union
           select x.id
             from jsonb_array_elements(case when jsonb_typeof(v_piece.plan -> 'blocks') = 'array'
                                            then v_piece.plan -> 'blocks' else '[]'::jsonb end) b,
                  lateral (values (b ->> 'file_id'), (b -> 'before' ->> 'file_id'),
                                  (b -> 'after' ->> 'file_id'), (b -> 'over' ->> 'file_id')) x(id)
            where x.id is not null);
  -- Named for its words, as a post is, so the look that follows does not rename it.
  insert into public.files (id, tenant_id, status, source, name, owner_named, mime, bytes, fingerprint, kind, media_ref,
                            media_status, seconds, created_by, made, who_in_it)
  values (p_id, v_piece.tenant_id, 'filed', 'made', public.file_free_name(v_piece.tenant_id, p_name), true, 'video/mp4',
          p_bytes, p_fingerprint, 'video', p_media_ref, 'uploading', p_seconds, v_piece.created_by,
          jsonb_build_object('piece', v_piece.id, 'shape', v_piece.shape, 'plan', v_piece.plan), v_who);
  update public.pieces p set file_id = p_id, stage = 'saving', updated_at = now() where p.id = p_piece_id;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_piece.tenant_id, 'file.added', 'setup', 'workspace', v_piece.tenant_id,
          jsonb_build_object('file_id', p_id, 'source', 'made', 'kind', 'video', 'by', v_piece.created_by));
  return jsonb_build_object('fate', 'kept', 'file_id', p_id);
end $$;
