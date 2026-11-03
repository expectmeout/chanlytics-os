-- 00508 · A tab catches up on what it missed.
--
-- Decision 0019, step 4, as the page-open PRD of 3 November 2026 builds it (P1, lane L5). Realtime has no backfill: a
-- notice told while a tab was loading, before it joined its workspace's topic, or while its feed was down, never reached
-- it. The tab read again on its first join only what tells of a customer's message or a call, and on a rejoin everything
-- it hears; anything else waited for its next notice or the 15-minute heal.
--
-- Every notice is kept a while in realtime.messages, the topic's own table, which Realtime drops a day's partition at a
-- time. So a tab asks for the notices of its workspace's topic since a moment (its load's start, or the moment its feed
-- went quiet), and reads what those name, as if it had heard them live.
--
-- Security invoker: the read is the caller's, under the one policy that admits a member to their workspace's topic
-- (workspace_changes_member_read, 00265), which asks the topic Realtime would ask for (realtime.topic(), set here for this
-- transaction) and reads memberships under their own policies, so a partner's seat without its second factor reads
-- nothing, as it would hear nothing. At most 200 notices; the 201st says there were more, and the tab reads everything.
-- A notice is no row: a table, an event, the statuses a statement left and its clock.

create or replace function public.workspace_notices_since(p_tenant_id uuid, p_since timestamptz)
returns table (event text, payload jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_topic text := 'workspace:' || p_tenant_id::text || ':changes';
begin
  perform set_config('realtime.topic', v_topic, true);
  return query
    select m.event, m.payload
      from realtime.messages m
     where m.topic = v_topic
       and m.extension = 'broadcast'
       -- The row's own clock (the sending transaction's start) for the partitions; the notice's own (its commit, 00507)
       -- for the moment asked. A transaction an hour long is longer than any the product runs.
       and m.inserted_at >= (p_since at time zone 'utc') - interval '1 hour'
       and coalesce((m.payload ->> 'at')::timestamptz, m.inserted_at at time zone 'utc') >= p_since
     order by m.inserted_at, m.id
     limit 201;
end $$;

comment on function public.workspace_notices_since(uuid, timestamptz) is
  'Decision 0019 step 4 (00508): the notices told on a workspace''s topic since a moment, read by a member as Realtime would admit them (workspace_changes_member_read), at most 201 (the 201st says there were more). A tab catches up on its load and on a rejoin. Never a row.';

revoke execute on function public.workspace_notices_since(uuid, timestamptz) from public, anon;
grant execute on function public.workspace_notices_since(uuid, timestamptz) to authenticated;
