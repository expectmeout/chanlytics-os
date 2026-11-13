-- 00620 · A post and a story of one piece wait apart, and a piece its owner posted by hand is kept (Campaigns › Content).
--
-- 1. A place took one post of a piece at a time, whatever it was (00611 posts_one_on_its_way), so a story set for Sunday was
--    refused while the post set for Saturday waited ("post it Saturday, its story Sunday": Ruben, 12 Nov 2026). One at a time
--    now holds per place AND kind: Instagram takes one picture post and one story of a piece waiting at once. Google takes a
--    picture alone, so nothing changes there.
-- 2. Nothing posts a video from here yet (decision 0121): it is saved and posted from the phone, and the app never heard that
--    it went up, so it said "Ready to save" for good ("I posted it": Ruben, 12 Nov 2026). The owner now says so, with its link
--    where they have one. It is kept as a post at the place `hand`: reported by a person, never sent by a job.
--
--   posts_one_on_its_way   on (file_id, place, kind), where it was (file_id, place).
--   post_begin             the same name, arguments and answer; `busy` is a post of the same kind on its way at that place,
--                          and a Google press that never answered says so in the words the files sweep uses.
--   posts_place_check      gains `hand`: a post the owner put up themselves, wherever that was.
--   posts_one_by_hand      new: one post by hand a piece, so "I posted it" said twice is one record.
--   post_report            A member's, with the settings permission: this made piece is up, by their own hand, with its link
--                          or none. Said again, it is the same record with the link it now has. Answers {fate: kept, gone,
--                          not_a_post, post_id}.
--   post_pull              the same name, arguments and answer; it also takes back a post kept by hand ("Not posted").
--
-- Nothing reads a seat with auth.uid() but through caller_has_permission. Deploy order: this migration first for "I posted
-- it" (a dashboard before it has no such press); either for the rest. Re-runnable.
set local lock_timeout = '3s';

drop index if exists public.posts_one_on_its_way;
create unique index if not exists posts_one_on_its_way on public.posts (file_id, place, kind)
  where status = any (array['queued', 'preparing', 'publishing', 'checking']);

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
revoke all on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) to authenticated, service_role;
comment on function public.post_begin(uuid, uuid, text, text, text, timestamptz, text) is
  'A member''s press, with the settings permission (00611, 00616, 00620): a made post approved for a place, as a picture or a story, with its words and its time; a picture and a story of one piece wait apart. The placement is written, and for Instagram its first job; for Google later than two minutes on, its post_google job at its time. Answers {fate: begun, busy (the one of its kind on its way), gone, not_a_post, not_yet, post_id}.';

/* ------------------------------------------------------------------------------------- a post kept by hand -- */

alter table public.posts drop constraint if exists posts_place_check;
alter table public.posts add constraint posts_place_check check (place = any (array['instagram', 'google', 'hand']));
create unique index if not exists posts_one_by_hand on public.posts (file_id) where place = 'hand' and status = 'published';

create or replace function public.post_report(p_tenant_id uuid, p_file_id uuid, p_link text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_file  public.files;
  v_link  text := nullif(btrim(p_link), '');
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if v_link is not null and (char_length(v_link) > 500 or v_link !~* '^https://[^[:space:]]+$') then
    raise exception 'A link starts with https:// and is at most 500 characters.' using errcode = '22023';
  end if;
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'post_id', null);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'post_id', null);
  end if;
  -- Said once a piece, which the database holds (posts_one_by_hand): said again, at once or twice together, it is the same
  -- record, with the link it now has.
  insert into public.posts as p (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via,
                                 status, permalink, published_at)
  values (p_tenant_id, p_file_id, 'hand', case when v_file.kind = 'video' then 'reel' else 'picture' end, null, now(),
          v_actor, now(), 'press', 'published', v_link, now())
  on conflict (file_id) where place = 'hand' and status = 'published'
  do update set permalink = coalesce(excluded.permalink, p.permalink), updated_at = now()
  returning p.id into v_id;
  return jsonb_build_object('fate', 'kept', 'post_id', v_id);
end $$;
revoke all on function public.post_report(uuid, uuid, text) from public, anon;
grant execute on function public.post_report(uuid, uuid, text) to authenticated, service_role;
comment on function public.post_report(uuid, uuid, text) is
  'I posted it (00620): a member, with the settings permission, says a made piece is up by their own hand, with its link or none. Kept as a post at the place hand, published as they say so; said again, the same record with the link it now has. Answers {fate: kept, gone, not_a_post, post_id}.';

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
  -- Up to the moment it is sent (the jobs read the row before they act, so a pulled post is never sent), and once it
  -- stopped: let go, it waits for no one. One the owner said they posted by hand is theirs to take back (00620).
  update public.posts p set status = 'pulled', updated_at = now()
   where p.id = p_post_id
     and (p.status = any (array['queued', 'preparing', 'held', 'failed']) or (p.place = 'hand' and p.status = 'published'));
  if found then
    return jsonb_build_object('fate', 'pulled');
  end if;
  return jsonb_build_object('fate', 'late', 'status', v_status);
end $$;
revoke all on function public.post_pull(uuid) from public, anon;
grant execute on function public.post_pull(uuid) to authenticated, service_role;
comment on function public.post_pull(uuid) is
  'Don''t post (00611, 00619, 00620): a post queued or being prepared is pulled before it is sent, one held or failed is let go, and one kept by hand is taken back. Answers {fate: pulled, late, unknown}.';
