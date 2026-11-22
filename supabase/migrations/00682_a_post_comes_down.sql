-- 00682 · A post comes down (the content loop PRD v3.2, pass 1b, M3 for posts; sections 5.3, 8 and
-- 8.3).
--
-- A post that was up could be taken off Google by its own press and nowhere else. A take-down is a remediation
-- (00676): a cause, and one action for each thing it reached, pending until the place says, and a post is `taken_down`
-- only once it did. The one cause here is the owner's own press: nobody is asked for a yes, so none is taken back
-- (Ruben, 22 November 2026).
--
--   notifications             Two kinds more on the bell: post_down (a piece gone from every place it was asked down
--                             from) and post_by_hand (a place leaves a post to its owner to delete).
--   remediation_actions       One index: the take-downs not finished, newest first, which Today's line reads.
--   job_kinds                 post_take_down, in the bulk lane: one action asked of its place, or, after the owner said
--                             they deleted it there themselves, the place asked whether it is gone.
--   ads_remediate_files       Re-made: the owner's own take-down pauses the ads that show the piece too.
--   posts_take_down_start     The walk, the service's: one remediation about a file; every post of the files named that
--                             is up, or past holding on its way, gets a take_down action and its job; with p_cancel,
--                             every one still waiting is let go as a cancel action, done at once. A story up for more
--                             than a day is gone already and is not asked about; a post the owner put up by hand is
--                             theirs.
--   post_take_down_begin      A member's door (settings): the piece comes down everywhere, and its ads pause.
--   post_take_down_settle     The job's door: what the place said. done marks the post taken_down; a remediation is
--                             finished once none of its actions is pending. It answers the piece and its place, and,
--                             once every place the piece was asked down from says done, those places, for the bell.
--   post_take_down_by_hand    A member's door (settings): "I deleted it". The action waits again, and the place is asked
--                             whether the post is gone.
--
-- Locks: notifications' kind check is re-made with two kinds added to those it holds (a brief ACCESS EXCLUSIVE, as 00676
-- did, and a read of its rows to hold them to it); one small index on remediation_actions; one row into job_kinds. Three
-- seconds each and no more. Re-runnable. Deploy order: this
-- file first, then the code (the job runner refuses a kind it does not hold, so the kind's row and its handler arrive
-- in one change).

set local lock_timeout = '3s';

/* ------------------------------------------------------------------------------------------ 0. the bell's kinds -- */

-- Two kinds more, added to the kinds the check holds as it stands, in its own order: read from the check itself, never
-- written out again here. A change applied beside this one can have added a kind this file has not seen (00679's
-- booking_lapsed was on production before it merged), and a list written out here would have taken it away, or failed on
-- its rows. Whichever of the two is applied first, both keep their kinds.
do $$
declare
  v_kinds text[];
  v_kind text;
begin
  select array_agg(found.m[1] order by found.at) into v_kinds
    from pg_constraint c
    cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9_]+)''', 'g') with ordinality as found(m, at)
   where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_kind_check';
  if coalesce(cardinality(v_kinds), 0) = 0 then
    raise exception 'notifications_kind_check: the kinds it holds could not be read';
  end if;
  foreach v_kind in array array['post_down', 'post_by_hand'] loop
    if not v_kind = any (v_kinds) then
      v_kinds := v_kinds || v_kind;
    end if;
  end loop;
  alter table public.notifications drop constraint notifications_kind_check;
  execute 'alter table public.notifications add constraint notifications_kind_check check (kind = any (array['
    || (select string_agg(quote_literal(k.kind), ', ' order by k.at) from unnest(v_kinds) with ordinality as k(kind, at))
    || ']))';
end $$;

-- The take-downs not finished, newest first: Today's line reads the few a workspace holds (a place that left a post
-- to its owner, or one that has not answered in a day), never every action it ever kept.
create index if not exists remediation_actions_take_downs_open
  on public.remediation_actions (tenant_id, started_at desc) where act = 'take_down' and outcome <> 'done';

/* ------------------------------------------------------------------------------------------------ 1. the job kind -- */

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('post_take_down', 2, array['action_id', 'attempt'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

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
  'The walk a yes taken back, a person erased or the owner''s own take-down starts on ads (00676, 00682; the Ads plan''s G16, the content loop PRD''s 5.3): every ad made here that shows one of p_files (ads.approved picture) and has not ended is paused for the remediation (ad_pause_all by remediation, which tells the owner on the bell), or, still being set up, its launch cancelled (ad_launch_cancel by remediation). One remediation of p_cause about the file p_subject_id, one action an ad: pending until the platform''s word settles it (ads_settle_remediation), done where nothing is left to tell, needs_person where its account is not connected. Answers [{ad_id, name, act, outcome}]. Called by file_yes_take_back (00676) and post_take_down_begin.';

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
  if p_cause is distinct from 'owner_removed' then
    raise exception 'posts_take_down_start: the owner''s own take-down' using errcode = '22023';
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
  'The walk a take-down starts on posts, the service''s (00682; the content loop PRD''s 5.3 and 8.3): one remediation of p_cause (owner_removed: the one cause that takes a post down) about the file p_subject_id. Every post of p_files that is up, or past holding on its way, and not the owner''s own by hand, gets a take_down action, pending, and its post_take_down job; a story up for more than a day is gone already and is left; a post with a take-down still pending is left to it. With p_cancel, every one still waiting or stopped is let go (pulled) as a cancel action, done at once. Answers {remediation_id (null where nothing was reached), actions [{action_id, post_id, place, kind, act, outcome}]}.';

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
  'A member''s door, with the settings permission (00682; the content loop PRD''s 8.3): a piece comes down everywhere. Each post of it that is up is asked down at its place (a take_down action, pending until the place says, and its job), each one still waiting is let go, and every ad made here that shows it is paused, as remediations of the cause owner_removed, which keep who asked and when. Never an undo: a post taken down is posted again as a new post. Answers {fate: begun, nothing (nothing of it was up, waiting or showing), gone; remediation_id; actions [{action_id, post_id, place, kind, act, outcome}]; ads [{ad_id, name, act, outcome}]}.';

create or replace function public.post_take_down_settle(p_action_id uuid, p_outcome text, p_said text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.remediation_actions;
  v_file uuid;
  v_place text;
  v_places jsonb;
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
  select p.file_id, p.place into v_file, v_place from public.posts p
   where p.tenant_id = v_action.tenant_id and p.id = v_action.target_id;
  -- The piece is down once every place this take-down asked for it says done: those places, for the bell's one line.
  select jsonb_agg(distinct q.place) into v_places
    from public.remediation_actions x
    join public.posts q on q.tenant_id = x.tenant_id and q.id = x.target_id
   where x.remediation_id = v_action.remediation_id and x.target_type = 'post' and x.act = 'take_down'
     and q.file_id = v_file
  having bool_and(x.outcome = 'done');
  return jsonb_build_object('fate', 'kept', 'outcome', p_outcome, 'post_id', v_action.target_id,
                            'tenant_id', v_action.tenant_id, 'file_id', v_file, 'place', v_place, 'down', v_places);
end $$;
revoke all on function public.post_take_down_settle(uuid, text, text) from public, anon, authenticated;
grant execute on function public.post_take_down_settle(uuid, text, text) to service_role;
comment on function public.post_take_down_settle(uuid, text, text) is
  'The take-down job''s door (00682; the content loop PRD''s 8.3): what a place said of one action, kept once. done marks the post taken_down, and only done does; blocked (the place refused), not_possible and needs_person (done by hand there) keep the place''s own words. A remediation is finished once none of its actions is pending. Answers {fate: kept, settled (it was already), unknown; outcome; post_id; tenant_id; file_id and place, the post''s; down, the places the piece came down from once every one this take-down asked says done, else null}.';

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
  'A member''s door, with the settings permission (00682; the content loop PRD''s 8.3): "I deleted it", of a post Chanlytics could not take down itself. Its newest take-down waits again and the place is asked whether the post is gone (a post_take_down job that only reads); the post is taken_down once the place shows it is. Answers {fate: asking, done (already), unknown}.';
