-- 00716 · A story's day is asked of one rule (the content status review of 24 Nov 2026, C3: the database's half
-- of the story-day rule the code took in #2571).
--
-- A story is up for a day, and Instagram says nothing when it ends: its record says "published" for good, so every
-- reader has to know the day itself. The code says it once (contracts content/placements/story-day.ts, storyRanItsDay).
-- The database said it twice, each its own way: the due list of posts' numbers (00705) counted "a day" from the time a
-- story went up; the take-down's walk (00682) counted 24 hours, held a story as still up at the last moment of its
-- day, and with no time it went up counted from the row's last change.
--
--   post_story_ended          New, the one rule: whether a story has run its day at a moment (now, unless one is
--                             given). Never true of a picture or a reel. A story has ended from the last moment of its
--                             day on: 24 hours after it went up; where no time it went up is kept, 24 hours after the
--                             time it was set for, so a story is never up for good for want of a date. What
--                             storyRanItsDay answers, edge for edge; a database test holds the two to the same cases.
--                             The service role's: its two readers are the service's own, and no session asks it.
--   post_observations_due     Re-made from 00705's with one line changed: whether a story's day is over is asked of
--                             the rule. Its 22-hour read stays where it is, which is when a story is read, not when it
--                             ends. The rule is asked once for each story of the last 29 days (the planner asks it as
--                             it reads posts): a local engine holding 60,000 posts listed them in the time it took before.
--   posts_take_down_start     Re-made from 00682's with one line changed, the same question asked of the same rule.
--
-- What moves, and nothing else does:
--   - The take-down's walk leaves a story AT the last moment of its day, where it still asked the place at that one
--     moment. The due list already asked nothing from that moment on.
--   - With no time it went up, the walk counts from the time the story was set for, where it counted from the row's
--     last change. The due list still asks nothing of a post with no time it went up: each read's time is counted from
--     it. (Every door that publishes a post writes that time, so no row made by the app is without it.)
--   - The day is 24 hours in both, whatever the session's time zone: a timestamp plus '1 day', as the due list wrote
--     it, is 23 or 25 hours across a clock change in a session that is not in UTC.
--
-- Locks: none on a table: one function made and two re-made in place, their arguments, answers and grants as they were.
-- Re-runnable. Deploy order: either, and no code names the new function.

set local lock_timeout = '3s';

create or replace function public.post_story_ended(
  p_kind text,
  p_published_at timestamp with time zone,
  p_scheduled_for timestamp with time zone,
  p_at timestamp with time zone default now()
)
returns boolean
language sql
stable
set search_path = public
as $$
  -- From the last moment of its day on, a story has ended. The day is 24 hours, never '1 day': a day added to a
  -- timestamp follows the session's clock changes, and contracts' day is 24 hours wherever it is asked.
  select coalesce(
           p_kind = 'story' and p_at >= coalesce(p_published_at, p_scheduled_for) + interval '24 hours',
           false)
$$;

revoke all on function public.post_story_ended(text, timestamp with time zone, timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.post_story_ended(text, timestamp with time zone, timestamp with time zone, timestamp with time zone) to service_role;
comment on function public.post_story_ended(text, timestamp with time zone, timestamp with time zone, timestamp with time zone) is
  'Whether a story has run its day at p_at, now unless given (00716; the content status review''s C3): the one rule the database keeps for it, and what contracts'' storyRanItsDay answers. Never true of a picture or a reel. A story has ended from the last moment of its day on: 24 hours after it went up (p_published_at); where no time it went up is kept, 24 hours after the time it was set for (p_scheduled_for). The due list of posts'' numbers (post_observations_due) and the take-down''s walk (posts_take_down_start) ask it. The service role''s.';

create or replace function public.post_observations_due(p_limit integer default 200)
returns table (tenant_id uuid, post_id uuid, step text)
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id, p.id, s.step
    from public.posts p
    cross join (values ('1h', interval '1 hour', interval '1 hour'),
                       ('1d', interval '1 day', interval '22 hours'),
                       ('3d', interval '3 days', null),
                       ('7d', interval '7 days', null),
                       ('28d', interval '28 days', null)) as s(step, after, story_after)
   where p.status = 'published' and p.place in ('instagram', 'google') and p.published_at is not null
     and p.published_at > now() - interval '29 days'
     and (p.kind <> 'story'
          or (s.story_after is not null and not public.post_story_ended(p.kind, p.published_at, p.scheduled_for)))
     and p.published_at + case when p.kind = 'story' then s.story_after else s.after end <= now()
     and not exists (select 1 from public.post_observations o
                      where o.tenant_id = p.tenant_id and o.post_id = p.id and o.step = s.step)
   order by p.published_at + case when p.kind = 'story' then s.story_after else s.after end
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.post_observations_due(integer) from public, anon, authenticated;
grant execute on function public.post_observations_due(integer) to service_role;
comment on function public.post_observations_due(integer) is
  'The reads of posts'' numbers that are due and not kept (00699, 00705, 00716; the content loop PRD''s 9.1): each post up on a place, at each of its steps whose time has come, oldest first. A story is read at its hour and at 22 hours, and asked nothing once its day is over (post_story_ended), since Instagram has no numbers for an ended story. The health sweep asks a post_observe job for each. A post taken down is read no more. The service role''s.';

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
            -- A story lasts a day: one that has run it is gone already, and nothing is asked of the place.
            or (p.status = 'published' and not public.post_story_ended(p.kind, p.published_at, p.scheduled_for))
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
  'The walk a take-down starts on posts, the service''s (00682, 00716; the content loop PRD''s 5.3 and 8.3): one remediation of p_cause (owner_removed: the one cause that takes a post down) about the file p_subject_id. Every post of p_files that is up, or past holding on its way, and not the owner''s own by hand, gets a take_down action, pending, and its post_take_down job; a story that has run its day (post_story_ended) is gone already and is left; a post with a take-down still pending is left to it. With p_cancel, every one still waiting or stopped is let go (pulled) as a cancel action, done at once. Answers {remediation_id (null where nothing was reached), actions [{action_id, post_id, place, kind, act, outcome}]}.';
