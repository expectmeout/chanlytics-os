-- 00367 · Ask counts the cache it writes.
--
-- ask_tokens_day (00240) summed input plus output of the day's usage.ask_tokens events. The API's input_tokens leaves
-- out what a request writes to the cache, which the edge's gateway records beside it as cache_creation_input_tokens
-- (ask-gateway.ts teeUsage), so a write was never counted: a warm (purpose ask_warm) writes a turn's head, some thirty
-- thousand tokens, and counted under a hundred, and every round's write of the page and the thread went uncounted too.
-- A write is input the model was sent, billed above uncached input; it now counts. A cache read still does not.
--
-- The function is copied from its one migration (00240) with that term alone added; only the body and the comment
-- change, so `create or replace` takes it, and the grants are restated. Either deploy order works: the edge on main
-- already writes cache_creation_input_tokens on every event, and a row without it counts nothing for it.

set local lock_timeout = '3s';

create or replace function public.ask_tokens_day(p_tenant uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(
           case when jsonb_typeof(e.data -> 'input_tokens') = 'number' then (e.data ->> 'input_tokens')::numeric else 0 end
         + case when jsonb_typeof(e.data -> 'cache_creation_input_tokens') = 'number'
                then (e.data ->> 'cache_creation_input_tokens')::numeric else 0 end
         + case when jsonb_typeof(e.data -> 'output_tokens') = 'number' then (e.data ->> 'output_tokens')::numeric else 0 end
         ), 0)::bigint
    from public.events e
   where e.tenant_id = p_tenant
     and e.kind = 'usage.ask_tokens'
     and e.created_at >= now() - interval '24 hours'
$$;

revoke execute on function public.ask_tokens_day(uuid) from public, anon, authenticated;
grant execute on function public.ask_tokens_day(uuid) to service_role;
comment on function public.ask_tokens_day(uuid) is
  'The workspace''s Ask tokens (input, cache writes and output of every usage.ask_tokens event; a cache read is not counted) in the last 24 hours: what the edge''s model gateway weighs against the day''s budget (00240, 00367). Service role only.';
