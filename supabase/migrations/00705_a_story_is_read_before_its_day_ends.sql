-- 00705 · A story is read before its day ends (the content loop PRD v3.6, sections 7 and 9.1; the first-post sitting).
--
-- A story is up for a day. Once it has ended Instagram answers for its numbers as for nothing (code 100, subcode 33),
-- and it sends nothing when a story ends. The due list of 00699 read every post at an hour and a day after it went up,
-- so a story's day read came when the story was already gone, and its 3, 7 and 28 day reads could only fail.
--
--   post_observations_due  Re-made from 00699's: a story is read at its hour and at 22 hours, two hours before it
--                          ends (four of the health sweep's half-hour passes are left to ask for it), and nothing of
--                          it is asked once its day is over. Every other post keeps its five steps. The schedule is
--                          contracts' too (content/results/observe.ts), and the two say the same.

set local lock_timeout = '3s';

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
     and (p.kind <> 'story' or (s.story_after is not null and p.published_at + interval '1 day' > now()))
     and p.published_at + case when p.kind = 'story' then s.story_after else s.after end <= now()
     and not exists (select 1 from public.post_observations o
                      where o.tenant_id = p.tenant_id and o.post_id = p.id and o.step = s.step)
   order by p.published_at + case when p.kind = 'story' then s.story_after else s.after end
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.post_observations_due(integer) from public, anon, authenticated;
grant execute on function public.post_observations_due(integer) to service_role;
comment on function public.post_observations_due(integer) is
  'The reads of posts'' numbers that are due and not kept (00699, 00705; the content loop PRD''s 9.1): each post up on a place, at each of its steps whose time has come, oldest first. A story is read at its hour and at 22 hours, and asked nothing once its day is over, since Instagram has no numbers for an ended story. The health sweep asks a post_observe job for each. A post taken down is read no more. The service role''s.';
