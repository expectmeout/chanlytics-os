-- 00715 · A post removed at its place is noticed within a day (the content status review of 24 November 2026, piece 4).
--
-- A post removed at its place itself (deleted in the Instagram app, or taken off by the place) was noticed only when a
-- read of its numbers failed: an hour, a day, 3, 7 and 28 days after it went up, on Instagram alone (00699). One deleted
-- on day 8 read as up until day 28, one deleted after that for good, and one removed on Google never, since Google gives
-- a post no numbers. This is the clock for a daily read of what each place itself holds; the read is the edge's
-- (apps/edge/lib/content/posts-read.ts), and the move and the bell are the ones a failed read of numbers already makes.
--
--   job_kinds        posts_read: one workspace's places asked which of its posts they still hold. One a workspace while
--                    one waits or runs, in the bulk lane, so a customer's reply still goes first.
--   posts_read_due   the clock's question: the workspaces with a picture or a reel up at a place, that went up within a
--                    year, for which no posts_read was written in the last 23 hours. The health sweep hands each one
--                    job (jobs_hand_out), so a place is asked once a day. It asks each workspace's posts by the
--                    workspace (posts_tenant_newest) and its jobs by the workspace and the kind
--                    (jobs_tenant_kind_state): a millisecond over 300 workspaces of 30 posts, and no new index.
--
-- Nothing is kept of a read but its job's row: the ledger keeps a finished job a week (purge_jobs), far longer than the
-- day this asks about. A job that failed is not counted, so the clock's next turn hands that workspace another.
--
-- Locks. None to speak of: a job kind's row, and a function. No table is altered.
--
-- Deploy order: this file first. An edge ahead of it logs posts_reads_hand_out_failed each half hour (the function is
-- not there) and hands out nothing; an edge behind it never asks. Re-runnable.

set local lock_timeout = '3s';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('posts_read', 2, array['@tenant'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;

create or replace function public.posts_read_due(p_limit integer default 200)
returns table (tenant_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.tenants t
   where exists (select 1 from public.posts p
                  where p.tenant_id = t.id and p.status = 'published' and p.external_id is not null
                    and p.kind <> 'story' and p.place in ('instagram', 'google', 'facebook')
                    and p.published_at > now() - interval '365 days')
     and not exists (select 1 from public.jobs j
                      where j.tenant_id = t.id and j.kind = 'posts_read' and j.state <> 'failed'
                        and j.created_at > now() - interval '23 hours')
   order by t.id
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.posts_read_due(integer) from public, anon, authenticated;
grant execute on function public.posts_read_due(integer) to service_role;
comment on function public.posts_read_due(integer) is
  'The workspaces due their daily read of what their places hold (the content status review of 24 November 2026, piece 4): each with a picture or a reel up at Instagram, Google or a Facebook Page, with the place''s own id for it, that went up within a year, and no posts_read job written in the last 23 hours, a failed one aside. A story is never counted: no place lists one, and it ends by itself in a day. The health sweep hands each a posts_read job (jobs_hand_out), which asks each place for its own list of posts and takes down here what the place no longer holds. The service role''s.';
