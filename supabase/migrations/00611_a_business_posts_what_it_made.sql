-- 00611 · A business posts what it made (decision 0121; the Meta link, M2).
--
-- A post Chanlytics made goes where the owner sends it, and the app keeps one record of each place it goes: the placement. It
-- names the exact file approved, who approved it and when, the words that go with it, and where it stands, so Instagram can
-- take a post Google already has, and a post that did not go says why. Publishing works like a payment: a timeout proves
-- nothing and a blind second try could post twice, so every send is a row of its own, kept as it was sent and answered, and an
-- answer that never came is settled by asking Instagram what it has before anything is sent again.
--
--   posts                    One row per place a post goes (Instagram or Google): the file, its kind there (a picture, a
--                            story; a reel later), its caption, when, who approved it, and where it stands. A new version of a
--                            post is a new file, so the row names exactly what was approved. One at a time per file and place.
--   publish_attempts         One row per send: the request as sent (never a token), the answer as it came, the outcome. Never
--                            changed once finished; the placement's container and post ids are copies of the newest one's.
--   post_begin               A member's, with the settings permission: the press, which is the approval. Writes the placement
--                            and, for Instagram, its first job. Answers {fate: begun, busy, gone, not_a_post, not_yet}.
--   post_pull                A member's, with the settings permission: Don't post, up to the moment the post is sent.
--   post_attempt_open        The service role's: one send's row opened, with what is sent.
--   post_attempt_close       The service role's: the answer and the outcome on it, and its ids copied to the placement.
--   post_moved               The service role's: the placement moved from where it stood to where it goes, or not at all.
--   post_unanswered          The service role's: a send with no answer is Checking, with the reconcile that settles it.
--   post_again               The service role's: a first attempt that never landed queued for the second, with its job.
--   job_kinds                post_prepare, post_publish and post_reconcile, in the bulk lane: a post never holds a reply.
--
-- Nothing reads a seat with auth.uid() but through caller_has_permission. Deploy order: this migration first. Re-runnable.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------------- 1. the posts -- */

create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  -- The exact version approved: a new version of a post is a new file.
  file_id        uuid not null references public.files (id) on delete cascade,
  place          text not null,
  kind           text not null,
  -- What goes with it, as the owner left it. A story shows none.
  caption        text,
  -- When it goes: the press's now, or a time the owner chose.
  scheduled_for  timestamptz not null default now(),
  approved_by    uuid references auth.users (id) on delete set null,
  approved_at    timestamptz not null default now(),
  via            text not null default 'press',
  status         text not null,
  -- The recheck's words, when it stopped the post before it was sent.
  held_reason    text,
  -- How many sends were begun; two at most.
  attempts       integer not null default 0,
  -- The newest send's: the platform's container, and its id for the post once it is up (Instagram's media id; Google's name).
  container_id   text,
  external_id    text,
  permalink      text,
  published_at   timestamptz,
  -- The newest send's refusal: { code, subcode, words }.
  error          jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.posts drop constraint if exists posts_place_check;
alter table public.posts add constraint posts_place_check check (place = any (array['instagram', 'google']));
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind = any (array['picture', 'story', 'reel']));
alter table public.posts drop constraint if exists posts_via_check;
alter table public.posts add constraint posts_via_check check (via = any (array['press', 'card']));
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status = any (array['queued', 'preparing', 'publishing', 'checking', 'published', 'held', 'failed', 'pulled',
                             'taken_down']));
-- contracts POST_CAPTION_MAX (Instagram's 2,200; Google's 1,500 is held by its route).
alter table public.posts drop constraint if exists posts_caption_shape;
alter table public.posts add constraint posts_caption_shape check (caption is null or char_length(caption) <= 2200);
alter table public.posts drop constraint if exists posts_attempts_shape;
alter table public.posts add constraint posts_attempts_shape check (attempts between 0 and 2);
alter table public.posts drop constraint if exists posts_held_shape;
alter table public.posts add constraint posts_held_shape
  check ((status = 'held') = (held_reason is not null) and (held_reason is null or char_length(held_reason) <= 300));

create index if not exists posts_tenant_file on public.posts (tenant_id, file_id, created_at desc);
create index if not exists posts_tenant_newest on public.posts (tenant_id, created_at desc);
-- A person's account removed lets go of what they approved (on delete set null): found by its own index.
create index if not exists posts_approved_by on public.posts (approved_by) where approved_by is not null;
-- One at a time per file and place: a second press while the first is on its way is the first.
create unique index if not exists posts_one_on_its_way on public.posts (file_id, place)
  where status = any (array['queued', 'preparing', 'publishing', 'checking']);
create unique index if not exists posts_external on public.posts (place, external_id) where external_id is not null;

comment on table public.posts is
  'One row per place a post goes (00611, decision 0121): the exact file approved, who approved it and when, its words there, when it goes and where it stands. Written only through its doors.';
comment on column public.posts.status is
  'queued (approved, its job waiting), preparing (Instagram is making it ready), publishing (being sent now), checking (sent with no answer: Instagram is asked what it has), published, held (the recheck stopped it, held_reason says why), failed (error says why), pulled (the owner said not to), taken_down.';
comment on column public.posts.container_id is
  'The newest send''s container at the platform (publish_attempts holds each). Service role only.';

alter table public.posts enable row level security;
drop policy if exists posts_member_select on public.posts;
create policy posts_member_select on public.posts for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- No member writes the table: every change is a door.
revoke all on public.posts from anon, authenticated;
grant select (id, tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status, held_reason,
              attempts, external_id, permalink, published_at, error, created_at, updated_at)
  on public.posts to authenticated;
grant select, insert, update, delete on public.posts to service_role;

-- Not told to a workspace's pages: no list draws a post's state, and the one sheet that does reads it again while it moves.

/* ----------------------------------------------------------------------------------------------- 2. the attempts -- */

create table if not exists public.publish_attempts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  post_id       uuid not null references public.posts (id) on delete cascade,
  attempt_no    integer not null,
  step          text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- The fields sent to the platform, the picture's host alone, never a token.
  request       jsonb not null,
  -- The platform's body, cut to 4 KB.
  answer        jsonb,
  http_status   integer,
  outcome       text,
  container_id  text,
  external_id   text,
  error         jsonb,
  unique (post_id, attempt_no, step)
);

alter table public.publish_attempts drop constraint if exists publish_attempts_no_check;
alter table public.publish_attempts add constraint publish_attempts_no_check check (attempt_no between 1 and 2);
alter table public.publish_attempts drop constraint if exists publish_attempts_step_check;
alter table public.publish_attempts add constraint publish_attempts_step_check
  check (step = any (array['container', 'publish', 'reconcile']));
alter table public.publish_attempts drop constraint if exists publish_attempts_outcome_check;
alter table public.publish_attempts add constraint publish_attempts_outcome_check
  check (outcome is null or outcome = any (array['ok', 'refused', 'no_answer', 'failed']));
alter table public.publish_attempts drop constraint if exists publish_attempts_finished_shape;
alter table public.publish_attempts add constraint publish_attempts_finished_shape
  check ((finished_at is null) = (outcome is null));

create index if not exists publish_attempts_post on public.publish_attempts (tenant_id, post_id, started_at);

comment on table public.publish_attempts is
  'One row per send of a post (00611, decision 0121): the request as sent (never a token), the answer as it came, the outcome. Never changed once finished.';

alter table public.publish_attempts enable row level security;
drop policy if exists publish_attempts_member_select on public.publish_attempts;
create policy publish_attempts_member_select on public.publish_attempts for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A member reads that a send happened and how it ended; what was sent and what came back stay the server's.
revoke all on public.publish_attempts from anon, authenticated;
grant select (id, tenant_id, post_id, attempt_no, step, started_at, finished_at, http_status, outcome, error)
  on public.publish_attempts to authenticated;
grant select, insert, update, delete on public.publish_attempts to service_role;

/* ------------------------------------------------------------------------------------------------ 3. the job kinds -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('post_prepare', 2, array['post_id', 'attempt'], false),
  ('post_publish', 2, array['post_id', 'attempt'], false),
  ('post_reconcile', 2, array['post_id', 'attempt'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ---------------------------------------------------------------------------------------------------- 4. the doors -- */

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
  -- One at a time per file and place, as every door that names or files takes it (00551).
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'post_id', null);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'post_id', null);
  end if;
  -- A Google press is one call: one that died between its placement and its answer stops holding the next press after ten
  -- minutes. Whether it went up is still the edge's events' to say.
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words', 'Google did not say whether this went up.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  select p.id into v_busy from public.posts p
   where p.file_id = p_file_id and p.place = p_place
     and p.status = any (array['queued', 'preparing', 'publishing', 'checking']);
  if found then
    return jsonb_build_object('fate', 'busy', 'post_id', v_busy);
  end if;
  insert into public.posts (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status)
  values (p_tenant_id, p_file_id, p_place, p_kind,
          case when p_kind = 'story' then null else nullif(btrim(p_caption), '') end,
          v_when, v_actor, now(), coalesce(p_via, 'press'),
          -- Google is asked by the press itself, in the same moment; Instagram's send is a job.
          case when p_place = 'google' then 'publishing' else 'queued' end)
  returning id into v_id;
  if p_place = 'instagram' then
    -- Ten minutes ahead of its time, so Instagram has made it ready by then. As text: a job's once-only key is made of strings.
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'post_prepare', greatest(now(), v_when - interval '10 minutes'),
            jsonb_build_object('post_id', v_id, 'attempt', '1'));
  end if;
  return jsonb_build_object('fate', 'begun', 'post_id', v_id);
end $$;
revoke all on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) to authenticated, service_role;
comment on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) is
  'A member''s press, with the settings permission (00611, decision 0121): a made post approved for a place, as a picture or a story, with its words and its time. The placement is written, and for Instagram its first job. Answers {fate: begun, busy (the one on its way), gone, not_a_post, not_yet, post_id}.';

create or replace function public.post_pull(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select p.tenant_id, p.status into v_tenant, v_status from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  if not coalesce(public.caller_has_permission(v_tenant, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- Up to the moment it is sent; the jobs read the row before they act, so a pulled post is never sent.
  update public.posts p set status = 'pulled', updated_at = now()
   where p.id = p_post_id and p.status = any (array['queued', 'preparing']);
  if found then
    return jsonb_build_object('fate', 'pulled');
  end if;
  return jsonb_build_object('fate', 'late', 'status', v_status);
end $$;
revoke all on function public.post_pull(uuid) from public, anon;
grant execute on function public.post_pull(uuid) to authenticated, service_role;
comment on function public.post_pull(uuid) is
  'A member''s Don''t post, with the settings permission (00611): a post not yet being sent is pulled, and its jobs find it so and send nothing. Answers {fate: pulled, late (with where it stands), unknown}.';

create or replace function public.post_attempt_open(p_post_id uuid, p_attempt_no integer, p_step text, p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_row    public.publish_attempts;
begin
  select p.tenant_id into v_tenant from public.posts p where p.id = p_post_id;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  insert into public.publish_attempts (tenant_id, post_id, attempt_no, step, request)
  values (v_tenant, p_post_id, p_attempt_no, p_step, coalesce(p_request, '{}'::jsonb))
  on conflict (post_id, attempt_no, step) do nothing;
  select * into v_row from public.publish_attempts a
   where a.post_id = p_post_id and a.attempt_no = p_attempt_no and a.step = p_step;
  update public.posts p set attempts = greatest(p.attempts, p_attempt_no), updated_at = now()
   where p.id = p_post_id and p.attempts < p_attempt_no;
  -- Opened again by a run that took up where one died: the row as it stands, which may already be finished.
  return jsonb_build_object('fate', 'open', 'id', v_row.id, 'finished', v_row.finished_at is not null,
                            'outcome', v_row.outcome, 'container_id', v_row.container_id,
                            'external_id', v_row.external_id);
end $$;
revoke all on function public.post_attempt_open(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.post_attempt_open(uuid, integer, text, jsonb) to service_role;
comment on function public.post_attempt_open(uuid, integer, text, jsonb) is
  'One send of a post opened (00611), with the request as sent and never a token. Asked again for the same post, attempt and step, it answers the row as it stands. The service role''s.';

create or replace function public.post_attempt_close(
  p_attempt_id uuid,
  p_outcome text,
  p_http_status integer default null,
  p_answer jsonb default null,
  p_container_id text default null,
  p_external_id text default null,
  p_error jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post uuid;
begin
  -- Never changed once finished: a second close of the same send is the first.
  update public.publish_attempts a
     set finished_at = now(), outcome = p_outcome, http_status = p_http_status,
         answer = case when p_answer is null then null
                       when octet_length(p_answer::text) > 4096
                         then jsonb_build_object('cut', left(p_answer::text, 4000))
                       else p_answer end,
         container_id = p_container_id, external_id = p_external_id, error = p_error
   where a.id = p_attempt_id and a.finished_at is null
  returning a.post_id into v_post;
  if not found then
    return false;
  end if;
  update public.posts p
     set container_id = coalesce(p_container_id, p.container_id),
         external_id = coalesce(p_external_id, p.external_id),
         error = case when p_outcome = 'ok' then p.error else coalesce(p_error, p.error) end,
         updated_at = now()
   where p.id = v_post;
  return true;
end $$;
revoke all on function public.post_attempt_close(uuid, text, integer, jsonb, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.post_attempt_close(uuid, text, integer, jsonb, text, text, jsonb) to service_role;
comment on function public.post_attempt_close(uuid, text, integer, jsonb, text, text, jsonb) is
  'A send''s answer and outcome kept (00611), the answer cut to 4 KB, and its container and post ids copied to the placement. A finished send is never changed: answers false. The service role''s.';

create or replace function public.post_moved(p_post_id uuid, p_from text[], p_to text, p_patch jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  update public.posts p
     set status = p_to,
         held_reason = case when p_to = 'held' then left(coalesce(v_patch ->> 'held_reason', 'Held.'), 300) end,
         permalink = coalesce(v_patch ->> 'permalink', p.permalink),
         published_at = case when p_to = 'published' then coalesce((v_patch ->> 'published_at')::timestamptz, now())
                             else p.published_at end,
         external_id = coalesce(v_patch ->> 'external_id', p.external_id),
         error = case when v_patch ? 'error' then v_patch -> 'error' else p.error end,
         updated_at = now()
   where p.id = p_post_id and p.status = any (p_from);
  return found;
end $$;
revoke all on function public.post_moved(uuid, text[], text, jsonb) from public, anon, authenticated;
grant execute on function public.post_moved(uuid, text[], text, jsonb) to service_role;
comment on function public.post_moved(uuid, text[], text, jsonb) is
  'A placement moved from where it stood (p_from) to where it goes (00611), with its held reason, link, time, post id or refusal from p_patch; nothing when it stood anywhere else, so two runs never both move it. Answers whether it moved. The service role''s.';

create or replace function public.post_unanswered(p_post_id uuid, p_attempt text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  -- Sent with no answer: Checking, and the reconcile that asks Instagram what it has, in one transaction, so a post is
  -- never left Checking with nothing to settle it.
  update public.posts p set status = 'checking', updated_at = now()
   where p.id = p_post_id and p.status = 'publishing'
  returning p.tenant_id into v_tenant;
  if not found then
    return false;
  end if;
  begin
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (v_tenant, 'post_reconcile', now() + interval '2 minutes',
            jsonb_build_object('post_id', p_post_id, 'attempt', p_attempt));
  exception when unique_violation then
    -- One is on the ledger already: it asks.
    null;
  end;
  return true;
end $$;
revoke all on function public.post_unanswered(uuid, text) from public, anon, authenticated;
grant execute on function public.post_unanswered(uuid, text) to service_role;
comment on function public.post_unanswered(uuid, text) is
  'A post sent with no answer (00611): Checking, and its reconcile two minutes on, together. Answers whether it was being sent. The service role''s.';

create or replace function public.post_again(p_post_id uuid, p_from text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  -- Its first send never landed: the second and last attempt, from a fresh container, with its job, in one transaction.
  update public.posts p set status = 'queued', container_id = null, updated_at = now()
   where p.id = p_post_id and p.status = p_from and p.attempts < 2
  returning p.tenant_id into v_tenant;
  if not found then
    return false;
  end if;
  begin
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (v_tenant, 'post_prepare', now(), jsonb_build_object('post_id', p_post_id, 'attempt', '2'));
  exception when unique_violation then
    null;
  end;
  return true;
end $$;
revoke all on function public.post_again(uuid, text) from public, anon, authenticated;
grant execute on function public.post_again(uuid, text) to service_role;
comment on function public.post_again(uuid, text) is
  'A post''s first attempt never landed (00611): queued again for its second and last, with its job, together. Answers whether it moved. The service role''s.';
