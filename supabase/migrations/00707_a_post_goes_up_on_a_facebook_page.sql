-- 00707 · A post goes up on a Facebook Page (the content loop PRD v3.6, pass 5, Facebook as a place).
--
-- A Page is a place, reached through the Meta link (call 10), and goes the way Instagram does: a picture as a post or a
-- story, a made video as a reel, made ready at the Page ten minutes ahead of its time, sent at it, and read back after.
-- Only a workspace with `features.places.facebook` on, whose Meta link keeps a Page it may post to, is offered it; the
-- edge and the dashboard read that, not this file.
--
--   posts_place_check         gains `facebook`.
--   post_approve              Re-made from 00681's: `facebook` is a place, taking what Instagram takes, its first job
--                             post_prepare ten minutes ahead, as Instagram's.
--   post_moved                Re-made from 00681's: a post up on a Page and not yet read back is asked for again two
--                             minutes on (post_reconcile), as on Instagram.
--   post_by_hand_bell_settle  Re-made from 00698's: the bell's "Delete it in Facebook" line closes as Instagram's does.
--
-- Nothing else changes in any door. Locks: the posts table's check is swapped (a brief ACCESS EXCLUSIVE, and one scan of
-- posts to validate it). Three seconds and no more. Re-runnable. Deploy order: either. The old code never names
-- `facebook`; the new code offers it only where the switch is on, which nothing turns on before this is applied.

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------- 1. posts_place_check -- */

alter table public.posts drop constraint if exists posts_place_check;
alter table public.posts add constraint posts_place_check
  check (place = any (array['instagram', 'google', 'facebook', 'hand']));

/* ------------------------------------------------------------------------------------------- 2. post_approve -- */

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
  -- A shape already kept with other bytes is not what the owner saw: nothing is written past here.
  for v_rendition in select * from jsonb_array_elements(coalesce(p_approval -> 'renditions', '[]'::jsonb)) loop
    select * into v_kept from public.piece_renditions r
     where r.piece_id = v_piece.id and r.shape = v_rendition ->> 'shape' and r.revision <= v_piece.revision
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
  v_n := v_piece.revision;
  select * into v_rev from public.piece_revisions r where r.piece_id = v_piece.id and r.n = v_n;
  if not found then
    insert into public.piece_revisions (tenant_id, piece_id, n, plan, captions, changed, made_by, created_by)
    values (p_tenant_id, v_piece.id, v_n, v_piece.plan, v_captions, array['first'], 'owner', v_actor)
    returning * into v_rev;
  elsif exists (select 1 from jsonb_each_text(v_captions) c
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
  'A member''s press, with the settings permission (00681, 00707 for a Facebook Page; the content loop PRD''s 5.3, 6.2): a made post or video approved for its placements in one transaction. p_approval: {snapshot, intent, renditions [{shape, path, checksum, bytes}], placements [{place, kind, at, caption, good_until, capability_edition}], via, policy_edition}. The piece (a picture''s written the first time), its version (words that differ from it make the next, with no new shapes), its shapes (kept the first time; different bytes at a kept shape are changed), the approval, each placement with its job. Answers {fate: approved, busy (post_id: the one of its kind on its way), gone, not_a_post, wrong_kind, late (its reason ends before its time), changed; approval_id, piece_id, revision, posts [{place, kind, post_id}]}.';

/* -------------------------------------------------------------------------------------------- 3. post_moved -- */

create or replace function public.post_moved(p_post_id uuid, p_from text[], p_to text, p_patch jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  -- Let go because its day passed before it could be sent: it says so, as a hold does.
  v_late boolean := p_to = 'pulled' and v_patch ->> 'held_why' = 'late';
  v_moved boolean;
begin
  update public.posts p
     set status = p_to,
         held_reason = case when p_to = 'held' or v_late
                            then left(coalesce(v_patch ->> 'held_reason', 'Held.'), 300) end,
         held_why = case when p_to = 'held' or v_late then v_patch ->> 'held_why' end,
         permalink = coalesce(v_patch ->> 'permalink', p.permalink),
         published_at = case when p_to = 'published'
                             then coalesce((v_patch ->> 'published_at')::timestamptz, p.published_at, now())
                             else p.published_at end,
         external_id = coalesce(v_patch ->> 'external_id', p.external_id),
         account_id = coalesce(v_patch ->> 'account_id', p.account_id),
         verified_at = coalesce((v_patch ->> 'verified_at')::timestamptz, p.verified_at),
         error = case when v_patch ? 'error' then v_patch -> 'error' else p.error end,
         updated_at = now()
   where p.id = p_post_id and p.status = any (p_from);
  v_moved := found;
  -- Up on Instagram and not yet read back from the account: it is asked for by its own id two minutes on, written here
  -- with the fact, so a run that dies after the move never leaves a post that is never seen. Its key is its own
  -- ('seen'), apart from a send's two attempts.
  if v_moved and p_to = 'published' then
    insert into public.jobs (tenant_id, kind, due_at, payload)
    select p.tenant_id, 'post_reconcile', now() + interval '2 minutes',
           jsonb_build_object('post_id', p.id, 'attempt', 'seen', 'seen', 'ask')
      from public.posts p
     where p.id = p_post_id and p.place in ('instagram', 'facebook') and p.verified_at is null
       and p.external_id is not null
    on conflict do nothing;
  end if;
  return v_moved;
end $$;
revoke all on function public.post_moved(uuid, text[], text, jsonb) from public, anon, authenticated;
grant execute on function public.post_moved(uuid, text[], text, jsonb) to service_role;
comment on function public.post_moved(uuid, text[], text, jsonb) is
  'A placement moved from where it stood (p_from) to where it goes (00611, 00681), with its held reason and why (held_why), link, time, post id, the place''s account, when the place was seen holding it, or refusal from p_patch; let go late (pulled, held_why late) it keeps its words too. A post that moves to published on Instagram or a Facebook Page (00707) unseen (no verified_at) has its post_reconcile job written with it, two minutes on, which asks the account for it by its own id. Nothing when it stood anywhere else, so two runs never both move it. Answers whether it moved. The service role''s.';

/* ---------------------------------------------------------------------------- 4. post_by_hand_bell_settle -- */

create or replace function public.post_by_hand_bell_settle(p_tenant_id uuid, p_file_id uuid, p_place text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_closed integer := 0;
begin
  -- Still the owner's to delete at this place: a post of the piece that is up there, whose newest take-down a place
  -- left to them.
  if exists (
    select 1 from public.posts q
     where q.tenant_id = p_tenant_id and q.file_id = p_file_id and q.place = p_place and q.status = 'published'
       and (select r.outcome from public.remediation_actions r
             where r.tenant_id = p_tenant_id and r.target_type = 'post' and r.target_id = q.id and r.act = 'take_down'
             order by r.started_at desc, r.id desc
             limit 1) = any (array['blocked', 'not_possible', 'needs_person'])
  ) then
    return 0;
  end if;
  -- The line as apps/edge post-told.ts writes it, about the file: its words are contracts TAKE_DOWN_BELL.byHand, which
  -- a test holds to this literal; a place the bell has no name for closes nothing.
  update public.notifications n set closed_at = now()
   where n.tenant_id = p_tenant_id and n.kind = 'post_by_hand'
     and n.subject_type = 'file' and n.subject_id = p_file_id::text
     and n.closed_at is null
     and n.title like 'Delete it in '
                      || case p_place when 'instagram' then 'Instagram' when 'google' then 'Google' when 'facebook' then 'Facebook' end
                      || ' · %';
  get diagnostics v_closed = row_count;
  return v_closed;
end $$;
revoke all on function public.post_by_hand_bell_settle(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_by_hand_bell_settle(uuid, uuid, text) to service_role;
comment on function public.post_by_hand_bell_settle(uuid, uuid, text) is
  'The bell''s "Delete it in <place>" line for a piece at a place, ended once nothing of the piece there is left to its owner (00698, a Facebook Page since 00707; the content loop PRD''s 8.3): no post of it up there has a newest take-down a place left to them. Asked by post_take_down_keep and by a done of post_take_down_settle; nobody''s to call from outside. Answers how many lines it closed.';
