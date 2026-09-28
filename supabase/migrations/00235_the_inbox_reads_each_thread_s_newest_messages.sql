-- 00235 · The Inbox reads each thread's newest messages.
--
-- GET conversations (apps/dashboard/src/server/readers/conversations.ts) answers the Inbox, Today and Conversations,
-- and the Inbox and Conversations read it again on every new message. It read the messages of the hundred newest
-- threads in pages of a thousand, PostgREST's max_rows, by OFFSET: each page read every message those threads ever had
-- and sorted them all again, up to four times, so the read grew with the threads' whole history; and one thread with a
-- long history could fill all four thousand and leave the others none ("No messages yet"). newest_messages answers in
-- one call: each thread's newest p_each (at most a hundred, the page GET conversations/:id reads) through the thread's
-- own index, messages_conversation_created (00002), and of those the newest p_most (at most four thousand), newest
-- first with the id breaking ties, in the reader's columns (MESSAGE_COLUMNS). The answer is one JSON list, which
-- max_rows does not cut.
--
-- The planner judges each thread by the average one (conversation_id's statistics), and the average thread is short;
-- the threads the Inbox reads are the newest, and the busiest. It took each of them whole in a bitmap scan and sorted
-- it, reading every message the limit was meant to skip. With bitmap scans off for this function alone it walks each
-- thread's index newest first and stops at the limit. The function runs as its caller (security invoker), so
-- messages_member_select decides what it answers, as it decides every other read of messages, and it reads only the
-- workspace it names. Past a hundred threads, a hundred of each or four thousand in all it refuses (22023) rather
-- than answer less than was asked; a null argument answers null (strict). Forward-only; re-runnable: the function is
-- replaced whole.

create or replace function public.newest_messages(p_tenant_id uuid, p_threads uuid[], p_each integer, p_most integer)
returns json
language plpgsql
stable
strict
security invoker
set search_path = ''
set enable_bitmapscan = off
as $$
begin
  if cardinality(p_threads) > 100 or p_each not between 1 and 100 or p_most not between 1 and 4000 then
    raise exception using
      errcode = '22023',
      message = 'newest_messages reads at most a hundred threads, a hundred messages of each and four thousand in all';
  end if;
  -- Each thread newest first through its own index, to the limit; then the newest of those, the id breaking ties.
  return (
    select coalesce(json_agg(r order by r.created_at desc, r.id desc), '[]'::json)
      from (select m.*
              from (select distinct t.id from unnest(p_threads) as t(id)) t
              cross join lateral (
                select x.id, x.conversation_id, x.direction, x.sender, x.type, x.body, x.media, x.meta, x.status,
                       x.created_at, x.channel_ts, x.channel
                  from public.messages x
                 where x.conversation_id = t.id
                   and x.tenant_id = p_tenant_id
                 order by x.created_at desc, x.id desc
                 limit p_each
              ) m
             order by m.created_at desc, m.id desc
             limit p_most) r
  );
end
$$;

comment on function public.newest_messages(uuid, uuid[], integer, integer) is
  'The newest p_each messages of each of these threads in the workspace p_tenant_id, and of those the newest p_most, newest first (created_at, then id), as one JSON list in the Inbox reader''s columns: id, conversation_id, direction, sender, type, body, media, meta, status, created_at, channel_ts, channel. Under the caller''s row security. At most 100 threads, 100 of each and 4000 in all, else 22023; a null argument answers null (00235).';

revoke execute on function public.newest_messages(uuid, uuid[], integer, integer) from public, anon;
grant execute on function public.newest_messages(uuid, uuid[], integer, integer) to authenticated, service_role;
