-- 00708 · A made video gets a second version: the same piece, version 2 (the content loop PRD v3.6, pass 4; the canvas's
-- version board, approved as drawn on 23 Nov 2026 with its calls 14 and 15).
--
-- "Tell AI what to change" on a made video makes version 2 of the same piece, not a new video. It is drawn by the
-- machinery that exists, on a row of its own that names the piece it is a version of; when its bytes are kept, the piece
-- gains version n+1 and its shape (the new file, by path and SHA-256); when the video platform says it plays, the piece
-- stands at n+1 and what was approved of version 1 and still waits stops standing, so it asks again. While a version is
-- drawn nothing of the piece goes up (the send waits: call 14); a version that cannot be made leaves version 1 as approved.
-- Version 1 can be approved again for the places it was set for ("Post this one instead": call 15).
--
--   pieces.revises         The piece a drawing is a version of (its root); null for a piece of its own.
--   piece_version_begin    A member's press (settings): piece_begin, then `revises`; one version drawn at a time.
--   piece_version_kept     The service's, when the drawn bytes are kept: version n+1 and its 9x16 shape.
--   piece_version_ready    The service's, when the new file plays: the piece moves to n+1; its waiting approvals void.
--   piece_of_made_file     Re-made from 00681's: a version's file is its root's; an older version's found by its shape.
--   post_approve           Re-made from 00707's: an older version's own file is approved at its own version.
--   piece_posts_replace    A member's press (settings): the piece's posts still waiting let go, then post_approve, in
--                          one transaction; nothing is let go where the approval is refused.
--
-- Erasure (decision 0036): `revises` names a piece, never a person (packages/db erasure registry).
-- Locks: one nullable column, its key and an index on pieces (a brief ACCESS EXCLUSIVE). Three seconds and no more.
-- Re-runnable. Deploy order: either. The old code never names a version; the new code offers one only where this is
-- applied (its door answers that it is missing otherwise).

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------- 1. pieces.revises -- */

alter table public.pieces add column if not exists revises uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pieces_revises_same_workspace') then
    alter table public.pieces add constraint pieces_revises_same_workspace foreign key (tenant_id, revises)
      references public.pieces (tenant_id, id) on delete cascade;
  end if;
end $$;
create index if not exists pieces_revises on public.pieces (tenant_id, revises) where revises is not null;
-- Members read a piece column by column (00613's grants): this one too, for the piece's sheet and Made.
grant select (revises) on public.pieces to authenticated;
comment on column public.pieces.revises is
  'The piece this one is drawn as a new version of (00708): its root, never a version. Null for a piece of its own. Written by piece_version_begin; the drawn file becomes the root''s next version (piece_version_kept, piece_version_ready).';

/* ------------------------------------------------------------------------------------ 2. piece_version_begin -- */

create or replace function public.piece_version_begin(
  p_tenant_id uuid,
  p_piece_id uuid,
  p_plan jsonb,
  p_look jsonb,
  p_key text,
  p_edition integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root   public.pieces;
  v_making uuid;
  v_begun  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select * into v_root from public.pieces p where p.tenant_id = p_tenant_id and p.id = p_piece_id;
  if not found then
    return jsonb_build_object('fate', 'gone', 'piece_id', null);
  end if;
  -- A version of a version is its root's.
  if v_root.revises is not null then
    select * into v_root from public.pieces p where p.tenant_id = p_tenant_id and p.id = v_root.revises;
  end if;
  if v_root.status <> 'made' or v_root.shape = 'picture' or v_root.file_id is null then
    return jsonb_build_object('fate', 'not_made', 'piece_id', null);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|pieces', 42));
  -- One version drawn at a time: another card's version still drawing is the one there is.
  select p.id into v_making from public.pieces p
   where p.tenant_id = p_tenant_id and p.revises = v_root.id and p.status = 'making' and p.card_key <> p_key
   limit 1;
  if found then
    return jsonb_build_object('fate', 'drawing', 'piece_id', v_making, 'revises', v_root.id);
  end if;
  v_begun := public.piece_begin(p_tenant_id, p_plan, p_look, p_key, p_edition);
  if (v_begun ->> 'piece_id') is not null then
    update public.pieces p set revises = v_root.id
     where p.id = (v_begun ->> 'piece_id')::uuid and p.revises is distinct from v_root.id;
  end if;
  return v_begun || jsonb_build_object('revises', v_root.id);
end $$;
revoke all on function public.piece_version_begin(uuid, uuid, jsonb, jsonb, text, integer) from public, anon;
grant execute on function public.piece_version_begin(uuid, uuid, jsonb, jsonb, text, integer) to authenticated, service_role;
comment on function public.piece_version_begin(uuid, uuid, jsonb, jsonb, text, integer) is
  'A member''s press, with the settings permission (00708): a new version of a made video asked for, by its plan and the look as it stands; drawn as piece_begin draws a video, on a row that names its root (`revises`). One version drawn at a time a piece. Answers piece_begin''s {fate: begun, here, busy; piece_id} with `revises`, or {fate: gone, not_made, drawing (another version is drawn now; piece_id: that one)}.';

/* ------------------------------------------------------------------------------------- 3. piece_version_kept -- */

create or replace function public.piece_version_kept(p_piece_id uuid, p_checksum text, p_bytes bigint, p_changed text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new  public.pieces;
  v_root public.pieces;
  v_rev  public.piece_revisions;
  v_n    integer;
begin
  if p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes < 1 then
    raise exception 'A version is kept by its bytes and their SHA-256.' using errcode = '22023';
  end if;
  select * into v_new from public.pieces p where p.id = p_piece_id;
  if not found or v_new.revises is null or v_new.file_id is null then
    return null;
  end if;
  select * into v_root from public.pieces p where p.id = v_new.revises for update;
  if not found then
    return null;
  end if;
  -- Kept once: a second keep of the same file answers the version it is.
  select r.revision into v_n from public.piece_renditions r where r.piece_id = v_root.id and r.file_id = v_new.file_id limit 1;
  if found then
    return v_n;
  end if;
  -- The version it stood at, written where nothing approved it yet, so the next has one before it.
  select * into v_rev from public.piece_revisions r where r.piece_id = v_root.id and r.n = v_root.revision;
  if not found then
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (v_root.tenant_id, v_root.id, v_root.revision, v_root.plan, '{}'::jsonb, array['first'], 'ai', v_root.created_by)
    returning * into v_rev;
  end if;
  select max(r.n) + 1 into v_n from public.piece_revisions r where r.piece_id = v_root.id;
  insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
  values (v_root.tenant_id, v_root.id, v_n, v_new.plan, v_rev.captions,
          array(select c from unnest(coalesce(p_changed, '{}'::text[])) c
                 where c = any (array['caption', 'trim', 'order', 'sound', 'layout'])),
          'owner', v_new.created_by);
  insert into public.piece_renditions (tenant_id, piece_id, revision, shape, file_id, path, checksum, bytes)
  values (v_root.tenant_id, v_root.id, v_n, '9x16', v_new.file_id,
          v_root.tenant_id::text || '/' || v_new.file_id::text || '/video.mp4', p_checksum, p_bytes);
  return v_n;
end $$;
revoke all on function public.piece_version_kept(uuid, text, bigint, text[]) from public, anon, authenticated;
grant execute on function public.piece_version_kept(uuid, text, bigint, text[]) to service_role;
comment on function public.piece_version_kept(uuid, text, bigint, text[]) is
  'When a new version''s drawn bytes are kept (00708; the edge''s piece_make): its root gains version n+1, its plan and what moved (p_changed, the record''s own set), and its standing shape, the new file by path and full SHA-256. The root still stands at n until the file plays (piece_version_ready). Once a file. Answers n+1, or null for a drawing that is no version. The service role''s.';

/* ------------------------------------------------------------------------------------ 4. piece_version_ready -- */

create or replace function public.piece_version_ready(p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new    public.pieces;
  v_root   public.pieces;
  v_n      integer;
  v_voided integer;
begin
  select * into v_new from public.pieces p
   where p.file_id = p_file_id and p.revises is not null order by p.created_at desc limit 1;
  if not found then
    return null;
  end if;
  select r.revision into v_n from public.piece_renditions r
   where r.piece_id = v_new.revises and r.file_id = p_file_id order by r.revision desc limit 1;
  if not found then
    return null;
  end if;
  select * into v_root from public.pieces p where p.id = v_new.revises for update;
  if v_root.revision >= v_n then
    return jsonb_build_object('piece_id', v_root.id, 'revision', v_root.revision, 'voided', 0, 'again', true);
  end if;
  update public.pieces p
     set revision = v_n, file_id = p_file_id, plan = v_new.plan, look = v_new.look, made_at = now(), updated_at = now()
   where p.id = v_root.id;
  -- What was approved of the version before and still waits stops standing: it asks again (call 14).
  update public.approvals a set voided_at = now(), voided_why = 'changed'
   where a.voided_at is null
     and a.id in (select p.approval_id from public.posts p
                   where p.tenant_id = v_root.tenant_id and p.piece_id = v_root.id and p.approval_id is not null
                     and p.status = any (array['queued', 'preparing']));
  get diagnostics v_voided = row_count;
  return jsonb_build_object('piece_id', v_root.id, 'revision', v_n, 'voided', v_voided, 'again', false);
end $$;
revoke all on function public.piece_version_ready(uuid) from public, anon, authenticated;
grant execute on function public.piece_version_ready(uuid) to service_role;
comment on function public.piece_version_ready(uuid) is
  'When a new version''s file plays (00708; the edge, where the video platform''s word is heard): its root stands at that version (revision, file, plan, look), and the approvals of its posts still waiting are voided as changed, so each asks again. Once. Answers {piece_id, revision, voided, again}, or null for a file that is no version. The service role''s.';

/* ------------------------------------------------------------------------------------- 5. piece_of_made_file -- */

create or replace function public.piece_of_made_file(p_tenant_id uuid, p_file_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.files;
  v_id   uuid;
begin
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found then
    return null;
  end if;
  if v_file.kind = 'video' then
    -- A version's file is its root's (00708), the root itself first; an older version's, by the shape it was sent as.
    select coalesce(p.revises, p.id) into v_id from public.pieces p
     where p.tenant_id = p_tenant_id and p.file_id = v_file.id and p.shape <> 'picture'
     order by (p.revises is null) desc, p.created_at desc limit 1;
    if v_id is null then
      select r.piece_id into v_id from public.piece_renditions r
       where r.tenant_id = p_tenant_id and r.file_id = v_file.id order by r.revision desc limit 1;
    end if;
    return v_id;
  end if;
  insert into public.pieces (tenant_id, shape, plan, look, status, edition, file_id, card_key, created_by, made_at)
  values (p_tenant_id, 'picture', coalesce(v_file.made -> 'plan', '{}'::jsonb), '{}'::jsonb, 'made', 1, v_file.id,
          'post:' || v_file.id::text, p_actor, v_file.created_at)
  on conflict (tenant_id, card_key) do nothing;
  select p.id into v_id from public.pieces p where p.tenant_id = p_tenant_id and p.card_key = 'post:' || v_file.id::text;
  return v_id;
end $$;
revoke all on function public.piece_of_made_file(uuid, uuid, uuid) from public, anon, authenticated;
comment on function public.piece_of_made_file(uuid, uuid, uuid) is
  'The piece a made file is (00681, 00708): a video''s own, the newest that became it (a version''s file its root''s; an older version''s by its shape), or a made picture''s, written the first time it is asked for (shape picture). Null for a video no piece of this workspace became. Called by post_approve.';

/* ------------------------------------------------------------------------------------------ 6. post_approve -- */

create or replace function public.post_approve(p_tenant_id uuid, p_file_id uuid, p_approval jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      uuid := auth.uid();
  v_file       public.files;
  v_piece      public.pieces;
  v_rev        public.piece_revisions;
  v_n          integer;
  v_captions   jsonb := '{}'::jsonb;
  v_place      jsonb;
  v_rendition  jsonb;
  v_kept       public.piece_renditions;
  v_busy       uuid;
  v_approval   uuid;
  v_id         uuid;
  v_when       timestamptz;
  v_later      boolean;
  v_posts      jsonb := '[]'::jsonb;
  v_snapshot   jsonb;
  v_places     jsonb := coalesce(p_approval -> 'placements', '[]'::jsonb);
  -- An older version's own file approved again (00708: "Post this one instead"): the version its shape was kept at.
  v_older      integer;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_places) <> 'array' or jsonb_array_length(v_places) not between 1 and 4 then
    raise exception 'An approval names one to four placements.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_approval -> 'snapshot') is distinct from 'object' then
    raise exception 'An approval carries its snapshot.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|posts', 42));
  select * into v_file from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id;
  if not found or v_file.removed_at is not null then
    return jsonb_build_object('fate', 'gone', 'posts', '[]'::jsonb);
  end if;
  if v_file.source <> 'made' then
    return jsonb_build_object('fate', 'not_a_post', 'posts', '[]'::jsonb);
  end if;
  -- Each placement: a place, a kind the file can go as there, words within the place's own limit, a time within 30 days.
  for v_place in select * from jsonb_array_elements(v_places) loop
    if (v_place ->> 'place') is null or (v_place ->> 'place') <> all (array['instagram', 'google', 'facebook']) then
      raise exception 'No such place: %.', v_place ->> 'place' using errcode = '22023';
    end if;
    if (case when v_file.kind = 'video'
             then not (v_place ->> 'place' in ('instagram', 'facebook') and v_place ->> 'kind' = 'reel')
             else (v_place ->> 'kind') is null or (v_place ->> 'kind') <> all (array['picture', 'story'])
                  or (v_place ->> 'place' = 'google' and v_place ->> 'kind' <> 'picture') end) then
      return jsonb_build_object('fate', 'wrong_kind', 'posts', '[]'::jsonb);
    end if;
    if char_length(coalesce(v_place ->> 'caption', '')) > (case when v_place ->> 'place' = 'google' then 1500 else 2200 end) then
      raise exception 'Those words are longer than the place takes.' using errcode = '22023';
    end if;
    v_when := greatest(coalesce((v_place ->> 'at')::timestamptz, now()), now());
    if v_when > now() + interval '30 days' then
      raise exception 'A post goes within thirty days.' using errcode = '22023';
    end if;
    if (v_place ->> 'good_until') is not null and (v_place ->> 'good_until')::timestamptz < v_when then
      return jsonb_build_object('fate', 'late', 'posts', '[]'::jsonb);
    end if;
  end loop;
  -- A Google press that died between its placement and its answer stops holding the next one after ten minutes (00616).
  update public.posts p
     set status = 'failed', updated_at = now(),
         error = jsonb_build_object('code', null, 'subcode', null, 'words',
                                    'Google did not say whether this went up. Look on your profile before posting it again.')
   where p.file_id = p_file_id and p.place = 'google' and p.status = 'publishing'
     and p.updated_at < now() - interval '10 minutes';
  -- One of each kind on its way at a place (00620).
  for v_place in select * from jsonb_array_elements(v_places) loop
    select p.id into v_busy from public.posts p
     where p.file_id = p_file_id and p.place = v_place ->> 'place' and p.kind = v_place ->> 'kind'
       and p.status = any (array['queued', 'preparing', 'publishing', 'checking']);
    if found then
      return jsonb_build_object('fate', 'busy', 'post_id', v_busy, 'posts', '[]'::jsonb);
    end if;
  end loop;

  -- Its own statement: a row it writes is seen only by the next one.
  v_id := public.piece_of_made_file(p_tenant_id, p_file_id, v_actor);
  select * into v_piece from public.pieces p where p.id = v_id;
  if not found then
    return jsonb_build_object('fate', 'not_a_post', 'posts', '[]'::jsonb);
  end if;
  -- A video's file that is no longer its piece's own is an older version's (00708): it is approved at that version.
  if v_file.kind = 'video' and v_piece.file_id is distinct from p_file_id then
    select r.revision into v_older from public.piece_renditions r
     where r.piece_id = v_piece.id and r.file_id = p_file_id order by r.revision desc limit 1;
  end if;
  -- A shape already kept with other bytes is not what the owner saw: nothing is written past here.
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    select * into v_kept from public.piece_renditions r
     where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= coalesce(v_older, v_piece.revision)
     order by r.revision desc limit 1;
    if found and (v_kept.checksum <> v_rendition ->> 'checksum' or v_kept.path <> v_rendition ->> 'path') then
      return jsonb_build_object('fate', 'changed', 'posts', '[]'::jsonb);
    end if;
  end loop;
  if p_approval ? 'intent' then
    update public.pieces p set intent = nullif(p_approval -> 'intent', 'null'::jsonb), updated_at = now()
     where p.id = v_piece.id and p.intent is distinct from nullif(p_approval -> 'intent', 'null'::jsonb);
  end if;

  -- The version it stands at, written the first time; words that differ from it are a new version (no new shapes).
  for v_place in select * from jsonb_array_elements(v_places) loop
    if v_place ->> 'kind' <> 'story' then
      v_captions := v_captions || jsonb_build_object(v_place ->> 'place', coalesce(v_place ->> 'caption', ''));
    end if;
  end loop;
  v_n := coalesce(v_older, v_piece.revision);
  select * into v_rev from public.piece_revisions r where r.piece_id = v_piece.id and r.n = v_n;
  if not found then
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_piece.plan, v_captions, array['first'], 'owner', v_actor)
    returning * into v_rev;
  -- An older version keeps its own words: the placements carry what goes, and a later version is never written over.
  elsif v_older is null and exists (select 1 from jsonb_each_text(v_captions) c
                 where v_rev.captions ? c.key and (v_rev.captions ->> c.key) <> c.value) then
    v_n := v_n + 1;
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_rev.plan, v_rev.captions || v_captions, array['caption'], 'owner', v_actor)
    returning * into v_rev;
    update public.pieces p set revision = v_n, updated_at = now() where p.id = v_piece.id;
  end if;

  -- Its shapes as they are sent: kept the first time (checked above to be the same bytes every time after).
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    if not exists (select 1 from public.piece_renditions r
                    where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= v_n) then
      insert into public.piece_renditions (tenant_id, piece_id, revision, shape, file_id, path, checksum, bytes)
      values (p_tenant_id, v_piece.id, v_n, v_rendition ->> 'shape', p_file_id, v_rendition ->> 'path',
              v_rendition ->> 'checksum', nullif(v_rendition ->> 'bytes', '')::bigint);
    end if;
  end loop;

  -- The snapshot names the version it is of, and its hash is taken here, of its own text, as post_as_approved takes it.
  v_snapshot := jsonb_set(p_approval -> 'snapshot', '{revision}', jsonb_build_object('piece_id', v_piece.id, 'n', v_n));
  insert into public.approvals (tenant_id, subject_type, subject_id, snapshot, snapshot_hash, approved_by, policy_edition)
  values (p_tenant_id, 'piece_revision', v_rev.id, v_snapshot, public.approval_hash(v_snapshot), v_actor,
          coalesce((p_approval ->> 'policy_edition')::integer, 1))
  returning id into v_approval;

  for v_place in select * from jsonb_array_elements(v_places) loop
    v_when := greatest(coalesce((v_place ->> 'at')::timestamptz, now()), now());
    v_later := v_place ->> 'place' = 'google' and v_when > now() + interval '2 minutes';
    insert into public.posts (tenant_id, file_id, place, kind, caption, scheduled_for, approved_by, approved_at, via, status,
                              piece_id, revision, approval_id, capability_edition, good_until)
    values (p_tenant_id, p_file_id, v_place ->> 'place', v_place ->> 'kind',
            case when v_place ->> 'kind' = 'story' then null else nullif(btrim(v_place ->> 'caption'), '') end,
            v_when, v_actor, now(), coalesce(p_approval ->> 'via', 'press'),
            case when v_place ->> 'place' = 'google' and not v_later then 'publishing' else 'queued' end,
            v_piece.id, v_n, v_approval, nullif(v_place ->> 'capability_edition', '')::integer,
            nullif(v_place ->> 'good_until', '')::timestamptz)
    returning id into v_id;
    if v_place ->> 'place' in ('instagram', 'facebook') then
      -- Ten minutes ahead of its time, so the place has made it ready by then (a Page as Instagram, pass 5); as text, as a job's key is made of strings.
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_prepare', greatest(now(), v_when - interval '10 minutes'),
              jsonb_build_object('post_id', v_id, 'attempt', '1'));
    elsif v_later then
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_google', v_when, jsonb_build_object('post_id', v_id, 'attempt', '1'));
    end if;
    v_posts := v_posts || jsonb_build_object('place', v_place ->> 'place', 'kind', v_place ->> 'kind', 'post_id', v_id);
  end loop;
  return jsonb_build_object('fate', 'approved', 'approval_id', v_approval, 'piece_id', v_piece.id, 'revision', v_n,
                            'posts', v_posts);
end $$;
revoke all on function public.post_approve(uuid, uuid, jsonb) from public, anon;
grant execute on function public.post_approve(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.post_approve(uuid, uuid, jsonb) is
  'A member''s press, with the settings permission (00681, 00707 for a Facebook Page, 00708 for an older version; the content loop PRD''s 5.3, 6.2): a made post or video approved for its placements in one transaction. p_approval: {snapshot, intent, renditions [{shape, path, checksum, bytes}], placements [{place, kind, at, caption, good_until, capability_edition}], via, policy_edition}. The piece (a picture''s written the first time), its version (words that differ from it make the next, with no new shapes), its shapes (kept the first time; different bytes at a kept shape are changed; an older version''s own file is approved at its own version, with its own words kept), the approval, each placement with its job. Answers {fate: approved, busy (post_id: the one of its kind on its way), gone, not_a_post, wrong_kind, late (its reason ends before its time), changed; approval_id, piece_id, revision, posts [{place, kind, post_id}]}.';

/* ------------------------------------------------------------------------------------ 7. piece_posts_replace -- */

create or replace function public.piece_posts_replace(p_tenant_id uuid, p_file_id uuid, p_approval jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece  uuid;
  v_answer jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  select coalesce(p.revises, p.id) into v_piece from public.pieces p
   where p.tenant_id = p_tenant_id and p.file_id = p_file_id order by (p.revises is null) desc limit 1;
  if v_piece is null then
    select r.piece_id into v_piece from public.piece_renditions r
     where r.tenant_id = p_tenant_id and r.file_id = p_file_id limit 1;
  end if;
  begin
    -- Its posts still waiting, at any of its versions, are let go as "Don't post" lets one go: the approval below sets
    -- what goes up in their place. Where it is refused, nothing was let go.
    if v_piece is not null then
      update public.posts p set status = 'pulled', updated_at = now()
       where p.tenant_id = p_tenant_id and p.piece_id = v_piece and p.status = any (array['queued', 'preparing', 'held']);
    end if;
    v_answer := public.post_approve(p_tenant_id, p_file_id, p_approval);
    if v_answer ->> 'fate' <> 'approved' then
      raise exception 'not approved' using errcode = 'P0001';
    end if;
  exception when raise_exception then
    return v_answer;
  end;
  return v_answer;
end $$;
revoke all on function public.piece_posts_replace(uuid, uuid, jsonb) from public, anon;
grant execute on function public.piece_posts_replace(uuid, uuid, jsonb) to authenticated, service_role;
comment on function public.piece_posts_replace(uuid, uuid, jsonb) is
  'A member''s press, with the settings permission (00708; the version board: "Approve version 2", "Post this one instead"): the piece''s posts still waiting, at any of its versions, let go, then post_approve of this file, in one transaction; where the approval is refused nothing was let go. Answers post_approve''s answer.';
