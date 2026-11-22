-- 00692 (working number) · A post comes down (the content loop PRD v3.2, pass 1b, M3 for posts; sections 5.3, 8 and
-- 8.3; call 13).
--
-- A post that was up could be taken off Google by its own press and nowhere else; a yes taken back held what waited
-- and answered what was up, for the owner to take down by hand. A take-down is a remediation (00676): a cause, and one
-- action for each thing it reached, pending until the place says, and a post is `taken_down` only once it did.
--
--   job_kinds                 post_take_down, in the bulk lane: one action asked of its place, or, after the owner said
--                             they deleted it there themselves, the place asked whether it is gone.
--   file_yes_uses             Re-made: every use includes the website (00691).
--   ads_remediate_files       Re-made: the owner's own take-down pauses the ads that show the piece too.
--   posts_take_down_start     The walk, the service's: one remediation about a file; every post of the files named that
--                             is up, or past holding on its way, gets a take_down action and its job; with p_cancel,
--                             every one still waiting is let go as a cancel action, done at once. A story up for more
--                             than a day is gone already and is not asked about; a post the owner put up by hand is
--                             theirs.
--   post_take_down_begin      A member's door (settings): the piece comes down everywhere, and its ads pause.
--   post_take_down_settle     The job's door: what the place said. done marks the post taken_down; a remediation is
--                             finished once none of its actions is pending.
--   post_take_down_by_hand    A member's door (settings): "I deleted it". The action waits again, and the place is asked
--                             whether the post is gone.
--   yes_taken_back_walk       What a yes taken back starts, once, for both doors: posts still waiting held (rights),
--                             posts up asked down, ads paused.
--   file_yes_take_back        Re-made over the walk: a post up is asked down, where it was only answered.
--   subject_yes_take_back     A member's door (settings): one person's own yes taken back, and the same walk.
--
-- Locks: no table is changed; one row into job_kinds. Three seconds each and no more. Re-runnable. Deploy order: this
-- file first, then the code (the job runner refuses a kind it does not hold, so the kind's row and its handler arrive
-- in one change).

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------------ 1. the job kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('post_take_down', 2, array['action_id', 'attempt'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

/* ---------------------------------------------------------------------------------- 2. every use, the website too -- */

create or replace function public.file_yes_uses(p_uses text[], p_every boolean)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
           when coalesce(cardinality(p_uses), 0) = 0 and p_every
             then array['ad', 'cold_email', 'post', 'reply', 'website']
           else coalesce((select array_agg(u order by u) from (select distinct u from unnest(p_uses) as u) d), '{}'::text[])
         end;
$$;
revoke all on function public.file_yes_uses(text[], boolean) from public, anon, authenticated;
grant execute on function public.file_yes_uses(text[], boolean) to service_role;
comment on function public.file_yes_uses(text[], boolean) is
  'The uses a door was handed, each once and in order; with none named and p_every, every use a yes can be for (00665, 00691: the website too).';

/* ------------------------------------------------------------------------------- 3. the ads that show a piece -- */

create or replace function public.ads_remediate_files(p_tenant_id uuid, p_actor uuid, p_cause text,
                                                      p_subject_id text, p_files uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rem     uuid;
  v_ad      public.ads;
  v_kept    jsonb;
  v_act     text;
  v_outcome text;
  v_pause   jsonb := '[]'::jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_one     jsonb;
begin
  if p_cause not in ('yes_taken_back', 'person_erased', 'owner_removed') then
    raise exception 'ads_remediate_files: a yes taken back, a person erased or a take-down' using errcode = '22023';
  end if;
  -- Every ad made here that shows one of the files and has not ended: running or paused, or still being set up.
  for v_ad in
    select * from public.ads a
     where a.tenant_id = p_tenant_id and a.origin = 'chanlytics' and a.status in ('sending', 'made')
       and a.intent in ('on', 'paused')
       and a.approved ->> 'picture' = any (array(select f::text from unnest(p_files) f))
     order by a.id
  loop
    if v_rem is null then
      insert into public.remediations (tenant_id, cause, subject_type, subject_id, actor_user_id)
      values (p_tenant_id, p_cause, 'file', p_subject_id, p_actor)
      returning id into v_rem;
    end if;
    if v_ad.status = 'sending' then
      -- Still being set up: its launch is cancelled, stops at its next step, and removes what it made.
      v_act := 'cancel';
      v_kept := public.ad_launch_cancel(p_tenant_id, p_actor, v_ad.id, 'remediation');
      v_outcome := case when v_kept ->> 'outcome' in ('asked', 'same') then 'pending' else 'not_possible' end;
    else
      v_act := 'pause';
      v_pause := public.ad_pause_all(p_tenant_id, p_actor,
                                     jsonb_build_array(jsonb_build_object('ad_id', v_ad.id, 'version', v_ad.version)),
                                     'remediation') -> 'ads';
      v_kept := coalesce(v_pause -> 0, '{}'::jsonb);
      v_outcome := case
        -- Paused now: pending until Meta's word says so (a pause Meta was never told the undoing of stands at once).
        when v_kept ->> 'outcome' = 'asked' then
          case when coalesce((v_kept ->> 'tell')::boolean, false) then 'pending' else 'done' end
        -- Paused already: done where Meta was told, else pending with that pause.
        when v_kept ->> 'outcome' = 'same' then
          case when coalesce((v_kept ->> 'pending')::boolean, false) then 'pending' else 'done' end
        -- Its account is not connected: Chanlytics can no longer pause it, and the owner pauses it in Meta.
        when v_kept ->> 'outcome' = 'not_connected' then 'needs_person'
        else 'not_possible'
      end;
    end if;
    insert into public.remediation_actions (tenant_id, remediation_id, target_type, target_id, act, outcome,
                                            finished_at)
    values (p_tenant_id, v_rem, 'ad', v_ad.id, v_act, v_outcome,
            case when v_outcome <> 'pending' then now() end);
    v_one := jsonb_build_object('ad_id', v_ad.id, 'name', v_ad.name, 'act', v_act, 'outcome', v_outcome);
    v_out := v_out || jsonb_build_array(v_one);
  end loop;
  if v_rem is not null
     and not exists (select 1 from public.remediation_actions r where r.remediation_id = v_rem and r.outcome = 'pending')
  then
    update public.remediations m set finished_at = now() where m.id = v_rem;
  end if;
  return v_out;
end $$;

revoke all on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) to service_role;
comment on function public.ads_remediate_files(uuid, uuid, text, text, uuid[]) is
  'The walk a yes taken back, a person erased or the owner''s own take-down starts on ads (00676, 00692; the Ads plan''s G16, the content loop PRD''s 5.3): every ad made here that shows one of p_files (ads.approved picture) and has not ended is paused for the remediation (ad_pause_all by remediation, which tells the owner on the bell), or, still being set up, its launch cancelled (ad_launch_cancel by remediation). One remediation of p_cause about the file p_subject_id, one action an ad: pending until the platform''s word settles it (ads_settle_remediation), done where nothing is left to tell, needs_person where its account is not connected. Answers [{ad_id, name, act, outcome}]. Called by yes_taken_back_walk and post_take_down_begin.';

/* ------------------------------------------------------------------------------------------------ 4. the walk -- */

create or replace function public.posts_take_down_start(p_tenant_id uuid, p_actor uuid, p_cause text,
                                                        p_subject_id text, p_files uuid[], p_cancel boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rem    uuid;
  v_post   public.posts;
  v_action uuid;
  v_out    jsonb := '[]'::jsonb;
begin
  if p_cause not in ('yes_taken_back', 'person_erased', 'owner_removed') then
    raise exception 'posts_take_down_start: a yes taken back, a person erased or a take-down' using errcode = '22023';
  end if;
  for v_post in
    select * from public.posts p
     where p.tenant_id = p_tenant_id and p.file_id = any (p_files) and p.place <> 'hand'
       and (   p.status = any (array['publishing', 'checking'])
            -- A story lasts a day: one up for longer is gone already, and nothing is asked of the place.
            or (p.status = 'published'
                and not (p.kind = 'story' and coalesce(p.published_at, p.updated_at) < now() - interval '24 hours'))
            or (p_cancel and p.status = any (array['queued', 'preparing', 'held', 'failed'])))
       -- One take-down at a time for a post: an action still waiting on its place is the one.
       and not exists (select 1 from public.remediation_actions r
                        where r.tenant_id = p_tenant_id and r.target_type = 'post' and r.target_id = p.id
                          and r.act = 'take_down' and r.outcome = 'pending')
     order by p.created_at, p.id
     for update
  loop
    if v_rem is null then
      insert into public.remediations (tenant_id, cause, subject_type, subject_id, actor_user_id)
      values (p_tenant_id, p_cause, 'file', p_subject_id, p_actor)
      returning id into v_rem;
    end if;
    if v_post.status = any (array['queued', 'preparing', 'held', 'failed']) then
      -- Still waiting, or stopped: let go here and now. The jobs read the row before they act, so it is never sent.
      update public.posts p set status = 'pulled', held_reason = null, held_why = null, updated_at = now()
       where p.id = v_post.id;
      insert into public.remediation_actions (tenant_id, remediation_id, target_type, target_id, act, outcome,
                                              finished_at)
      values (p_tenant_id, v_rem, 'scheduled_post', v_post.id, 'cancel', 'done', now())
      returning id into v_action;
      v_out := v_out || jsonb_build_object('action_id', v_action, 'post_id', v_post.id, 'place', v_post.place,
                                           'kind', v_post.kind, 'act', 'cancel', 'outcome', 'done');
    else
      insert into public.remediation_actions (tenant_id, remediation_id, target_type, target_id, act, outcome)
      values (p_tenant_id, v_rem, 'post', v_post.id, 'take_down', 'pending')
      returning id into v_action;
      insert into public.jobs (tenant_id, kind, due_at, payload)
      values (p_tenant_id, 'post_take_down', now(), jsonb_build_object('action_id', v_action, 'attempt', '1'));
      v_out := v_out || jsonb_build_object('action_id', v_action, 'post_id', v_post.id, 'place', v_post.place,
                                           'kind', v_post.kind, 'act', 'take_down', 'outcome', 'pending');
    end if;
  end loop;
  if v_rem is not null
     and not exists (select 1 from public.remediation_actions r where r.remediation_id = v_rem and r.outcome = 'pending')
  then
    update public.remediations m set finished_at = now() where m.id = v_rem;
  end if;
  return jsonb_build_object('remediation_id', v_rem, 'actions', v_out);
end $$;
revoke all on function public.posts_take_down_start(uuid, uuid, text, text, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.posts_take_down_start(uuid, uuid, text, text, uuid[], boolean) to service_role;
comment on function public.posts_take_down_start(uuid, uuid, text, text, uuid[], boolean) is
  'The walk a take-down starts on posts, the service''s (00692; the content loop PRD''s 5.3 and 8.3): one remediation of p_cause about the file p_subject_id. Every post of p_files that is up, or past holding on its way, and not the owner''s own by hand, gets a take_down action, pending, and its post_take_down job; a story up for more than a day is gone already and is left; a post with a take-down still pending is left to it. With p_cancel, every one still waiting or stopped is let go (pulled) as a cancel action, done at once. Answers {remediation_id (null where nothing was reached), actions [{action_id, post_id, place, kind, act, outcome}]}.';

create or replace function public.post_take_down_begin(p_tenant_id uuid, p_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_posts jsonb;
  v_ads   jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  if not exists (select 1 from public.files f where f.tenant_id = p_tenant_id and f.id = p_file_id) then
    return jsonb_build_object('fate', 'gone', 'actions', '[]'::jsonb, 'ads', '[]'::jsonb);
  end if;
  v_posts := public.posts_take_down_start(p_tenant_id, v_actor, 'owner_removed', p_file_id::text, array[p_file_id], true);
  -- The ads that show it stop spending in the same transaction (the canvas's confirm says so before the press).
  v_ads := public.ads_remediate_files(p_tenant_id, v_actor, 'owner_removed', p_file_id::text, array[p_file_id]);
  if jsonb_array_length(v_posts -> 'actions') = 0 and jsonb_array_length(v_ads) = 0 then
    return jsonb_build_object('fate', 'nothing', 'actions', '[]'::jsonb, 'ads', '[]'::jsonb);
  end if;
  return jsonb_build_object('fate', 'begun', 'remediation_id', v_posts -> 'remediation_id',
                            'actions', v_posts -> 'actions', 'ads', v_ads);
end $$;
revoke all on function public.post_take_down_begin(uuid, uuid) from public, anon;
grant execute on function public.post_take_down_begin(uuid, uuid) to authenticated, service_role;
comment on function public.post_take_down_begin(uuid, uuid) is
  'A member''s door, with the settings permission (00692; the content loop PRD''s 8.3): a piece comes down everywhere. Each post of it that is up is asked down at its place (a take_down action, pending until the place says, and its job), each one still waiting is let go, and every ad made here that shows it is paused, as remediations of the cause owner_removed, which keep who asked and when. Never an undo: a post taken down is posted again as a new post. Answers {fate: begun, nothing (nothing of it was up, waiting or showing), gone; remediation_id; actions [{action_id, post_id, place, kind, act, outcome}]; ads [{ad_id, name, act, outcome}]}.';

create or replace function public.post_take_down_settle(p_action_id uuid, p_outcome text, p_said text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.remediation_actions;
begin
  if p_outcome not in ('done', 'blocked', 'not_possible', 'needs_person') then
    raise exception 'post_take_down_settle: an outcome a place can give' using errcode = '22023';
  end if;
  select * into v_action from public.remediation_actions r
   where r.id = p_action_id and r.target_type = 'post' and r.act = 'take_down'
     for update;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  -- Settled once: a second answer for an action already settled changes nothing (a job run twice).
  if v_action.outcome <> 'pending' then
    return jsonb_build_object('fate', 'settled', 'outcome', v_action.outcome);
  end if;
  update public.remediation_actions r
     set outcome = p_outcome, said = nullif(left(btrim(coalesce(p_said, '')), 300), ''), finished_at = now()
   where r.id = v_action.id;
  if p_outcome = 'done' then
    update public.posts p set status = 'taken_down', held_reason = null, held_why = null, updated_at = now()
     where p.tenant_id = v_action.tenant_id and p.id = v_action.target_id
       and p.status = any (array['published', 'publishing', 'checking']);
  end if;
  update public.remediations m set finished_at = now()
   where m.id = v_action.remediation_id and m.finished_at is null
     and not exists (select 1 from public.remediation_actions x
                      where x.remediation_id = m.id and x.outcome = 'pending');
  return jsonb_build_object('fate', 'kept', 'outcome', p_outcome, 'post_id', v_action.target_id,
                            'tenant_id', v_action.tenant_id);
end $$;
revoke all on function public.post_take_down_settle(uuid, text, text) from public, anon, authenticated;
grant execute on function public.post_take_down_settle(uuid, text, text) to service_role;
comment on function public.post_take_down_settle(uuid, text, text) is
  'The take-down job''s door (00692; the content loop PRD''s 8.3): what a place said of one action, kept once. done marks the post taken_down, and only done does; blocked (the place refused), not_possible and needs_person (done by hand there) keep the place''s own words. A remediation is finished once none of its actions is pending. Answers {fate: kept, settled (it was already), unknown; outcome; post_id; tenant_id}.';

create or replace function public.post_take_down_by_hand(p_tenant_id uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.remediation_actions;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- The newest take-down of this post that Chanlytics could not finish itself.
  select * into v_action from public.remediation_actions r
   where r.tenant_id = p_tenant_id and r.target_type = 'post' and r.target_id = p_post_id and r.act = 'take_down'
   order by r.started_at desc, r.id desc
   limit 1
     for update;
  if not found then
    return jsonb_build_object('fate', 'unknown');
  end if;
  if v_action.outcome = 'done' then
    return jsonb_build_object('fate', 'done');
  end if;
  if v_action.outcome = 'pending' then
    return jsonb_build_object('fate', 'asking');
  end if;
  -- It waits again: the place is asked whether the post is gone, and the answer settles it.
  update public.remediation_actions r set outcome = 'pending', finished_at = null where r.id = v_action.id;
  update public.remediations m set finished_at = null where m.id = v_action.remediation_id;
  insert into public.jobs (tenant_id, kind, due_at, payload)
  values (p_tenant_id, 'post_take_down', now(),
          jsonb_build_object('action_id', v_action.id, 'attempt', 'hand-' || floor(extract(epoch from now()))::bigint::text,
                             'by_hand', 'yes'));
  return jsonb_build_object('fate', 'asking');
end $$;
revoke all on function public.post_take_down_by_hand(uuid, uuid) from public, anon;
grant execute on function public.post_take_down_by_hand(uuid, uuid) to authenticated, service_role;
comment on function public.post_take_down_by_hand(uuid, uuid) is
  'A member''s door, with the settings permission (00692; the content loop PRD''s 8.3): "I deleted it", of a post Chanlytics could not take down itself. Its newest take-down waits again and the place is asked whether the post is gone (a post_take_down job that only reads); the post is taken_down once the place shows it is. Answers {fate: asking, done (already), unknown}.';

/* ------------------------------------------------------------------------------------ 5. a yes taken back -- */

create or replace function public.yes_taken_back_walk(p_tenant_id uuid, p_actor uuid, p_file_id uuid, p_files uuid[],
                                                      p_uses text[], p_held text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_held  jsonb := '[]'::jsonb;
  v_live  jsonb := '[]'::jsonb;
  v_down  jsonb := jsonb_build_object('remediation_id', null, 'actions', '[]'::jsonb);
  v_ads   jsonb := '[]'::jsonb;
begin
  if 'post' = any (p_uses) then
    -- 1. Every post of them still waiting is held, in this same transaction (the PRD's section 8).
    with held as (
      update public.posts p
         set status = 'held', held_why = 'rights', updated_at = now(),
             held_reason = left(coalesce(nullif(btrim(p_held), ''), 'Someone in it took back their yes.'), 300)
       where p.tenant_id = p_tenant_id and p.file_id = any (p_files)
         and p.status = any (array['queued', 'preparing'])
      returning p.id, p.file_id, p.place, p.kind, p.scheduled_for
    )
    select coalesce(jsonb_agg(jsonb_build_object('post_id', h.id, 'file_id', h.file_id, 'place', h.place,
                                                 'kind', h.kind, 'at', h.scheduled_for)
                              order by h.scheduled_for, h.id), '[]'::jsonb)
      into v_held
      from held h;
    -- 2. Every one already up, or past holding on its way: what it is, for the answer, then asked down at its place.
    select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'file_id', p.file_id, 'place', p.place,
                                                 'kind', p.kind, 'status', p.status, 'permalink', p.permalink,
                                                 'at', coalesce(p.published_at, p.scheduled_for))
                              order by coalesce(p.published_at, p.scheduled_for) desc, p.id), '[]'::jsonb)
      into v_live
      from public.posts p
     where p.tenant_id = p_tenant_id and p.file_id = any (p_files)
       and p.status = any (array['publishing', 'checking', 'published']);
    v_down := public.posts_take_down_start(p_tenant_id, p_actor, 'yes_taken_back', p_file_id::text, p_files, false);
  end if;
  -- 3. G16 (the Ads plan): every ad made here that shows one of them is paused, in this same transaction, or cancelled
  -- while it is set up, as a remediation, and the owner is told (00676). It runs again only with another picture.
  if 'ad' = any (p_uses) then
    v_ads := public.ads_remediate_files(p_tenant_id, p_actor, 'yes_taken_back', p_file_id::text, p_files);
  end if;
  return jsonb_build_object('held', v_held, 'live', v_live, 'down', v_down -> 'actions', 'ads', v_ads);
end $$;
revoke all on function public.yes_taken_back_walk(uuid, uuid, uuid, uuid[], text[], text) from public, anon, authenticated;
grant execute on function public.yes_taken_back_walk(uuid, uuid, uuid, uuid[], text[], text) to service_role;
comment on function public.yes_taken_back_walk(uuid, uuid, uuid, uuid[], text[], text) is
  'What a yes taken back starts, the service''s, once for both doors (00692; the content loop PRD''s section 8): for posts, every post of p_files still waiting held (rights, with p_held''s words) and every one up asked down at its place (posts_take_down_start); for ads, every ad made here that shows one of them paused or cancelled (ads_remediate_files). Answers {held, live (posts up or on their way), down (the take-down actions), ads}.';

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
  v_walk  jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if not (v_uses <@ array['post', 'ad', 'reply', 'cold_email', 'website']) then
    raise exception 'A yes is for posts, ads, replies, cold emails or the website.' using errcode = '22023';
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
  v_walk := public.yes_taken_back_walk(p_tenant_id, v_actor, p_file_id, v_files, v_uses, p_held);
  return jsonb_build_object('taken_back', v_back, 'uses', to_jsonb(v_uses), 'files', to_jsonb(v_files)) || v_walk;
end $$;
revoke all on function public.file_yes_take_back(uuid, uuid, text[], text) from public, anon;
grant execute on function public.file_yes_take_back(uuid, uuid, text[], text) to authenticated, service_role;
comment on function public.file_yes_take_back(uuid, uuid, text[], text) is
  'A member''s door, with the settings permission (00665, 00676, 00692; the content PRD''s section 8): the yes for each use named (every use where none is) taken back on a file and on every piece drawn from it, then what that starts (yes_taken_back_walk): every post of them still waiting held with p_held''s words, every one up asked down at its place, and, for ads, every ad made here that shows one of them paused or cancelled as a remediation (the Ads plan''s G16), in one transaction. Answers {taken_back, uses, files, held, live (posts up or on their way), down (their take-down actions), ads ([{ad_id, name, act, outcome}])}.';

create or replace function public.subject_yes_take_back(p_tenant_id uuid, p_subject_id uuid, p_uses text[] default null,
                                                        p_held text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_uses    text[] := public.file_yes_uses(p_uses, true);
  v_subject public.file_subjects;
  v_files   uuid[];
  v_back    integer;
  v_walk    jsonb;
begin
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  if not (v_uses <@ array['post', 'ad', 'reply', 'cold_email', 'website']) then
    raise exception 'A yes is for posts, ads, replies, cold emails or the website.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || '|files', 42));
  select * into v_subject from public.file_subjects s where s.tenant_id = p_tenant_id and s.id = p_subject_id;
  if not found then
    return jsonb_build_object('fate', 'gone', 'taken_back', 0);
  end if;
  update public.file_consents c
     set taken_back_at = now(), taken_back_by = v_actor
   where c.tenant_id = p_tenant_id and c.subject_id = v_subject.id and c.use = any (v_uses) and c.taken_back_at is null;
  get diagnostics v_back = row_count;
  if v_back = 0 then
    return jsonb_build_object('fate', 'none', 'taken_back', 0);
  end if;
  -- The file they are in, and every piece drawn from it.
  select array_agg(f.id order by f.id) into v_files
    from public.files f
   where f.tenant_id = p_tenant_id and f.removed_at is null
     and (f.id = v_subject.file_id
          or (f.source = 'made' and v_subject.file_id::text = any (public.file_drawn_from(f.made))));
  v_files := coalesce(v_files, array[v_subject.file_id]);
  perform public.file_yes_restate(p_tenant_id, v_files);
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'file.changed', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('file_id', v_subject.file_id, 'by', v_actor,
                             'said', jsonb_build_object('taken_back', to_jsonb(v_uses))));
  v_walk := public.yes_taken_back_walk(p_tenant_id, v_actor, v_subject.file_id, v_files, v_uses, p_held);
  return jsonb_build_object('fate', 'taken_back', 'taken_back', v_back, 'uses', to_jsonb(v_uses),
                            'files', to_jsonb(v_files)) || v_walk;
end $$;
revoke all on function public.subject_yes_take_back(uuid, uuid, text[], text) from public, anon;
grant execute on function public.subject_yes_take_back(uuid, uuid, text[], text) to authenticated, service_role;
comment on function public.subject_yes_take_back(uuid, uuid, text[], text) is
  'A member''s door, with the settings permission (00692; call 13): one person''s own yes for each use named (every use where none is) taken back, the file they are in and every piece drawn from it restated, then what that starts (yes_taken_back_walk): posts still waiting held, posts up asked down, ads paused. Answers {fate: taken_back, none (no yes of theirs stood), gone; taken_back; uses; files; held; live; down; ads}.';
