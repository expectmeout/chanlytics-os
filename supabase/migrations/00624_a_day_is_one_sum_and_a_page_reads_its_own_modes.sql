-- 00624 · The receptionist's day is one sum, and a page of People reads its own people's reply modes.
--
-- llm_tokens_since        The budget a workspace's receptionist answers within (the reply policy's
--                         max_llm_tokens_day) paged every usage.llm_tokens event of the last 24 hours to the edge and
--                         added them there (apps/edge/lib/ai/budget.ts): a round trip per thousand replies, before every
--                         automatic reply. This adds them here, in one statement, as ask_tokens_day (00240, 00368)
--                         does for Ask: input plus output of the workspace's usage.llm_tokens events from p_since on, a
--                         value that is not a number counting nothing. events_tenant_kind_created (tenant_id, kind,
--                         created_at) serves it. Service role only.
--   people_reply_modes    The People page read every reply policy of the workspace beside each page of people (the
--                         dashboard's people.ts), however many people had one of their own. This answers the mode in
--                         force for the people of one page and nobody else: their own reply policy, else the
--                         workspace's, else none. The page is people_page's, with the arguments people_list hands it, so
--                         the two reads go side by side and the page waits no extra round trip. As people_list: a
--                         member's session, row security deciding what it sees.
--
-- Deploy order: this first. Both are new; the edge and the dashboard that call them ship after it is applied, and an
-- app rolled back reads the old way. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.llm_tokens_since(p_tenant uuid, p_since timestamptz)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(
           case when jsonb_typeof(e.data -> 'input_tokens') = 'number' then (e.data ->> 'input_tokens')::numeric else 0 end
         + case when jsonb_typeof(e.data -> 'output_tokens') = 'number' then (e.data ->> 'output_tokens')::numeric else 0 end
         ), 0)::bigint
    from public.events e
   where e.tenant_id = p_tenant
     and e.kind = 'usage.llm_tokens'
     and e.created_at >= p_since
$$;

revoke execute on function public.llm_tokens_since(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.llm_tokens_since(uuid, timestamptz) to service_role;
comment on function public.llm_tokens_since(uuid, timestamptz) is
  'The workspace''s receptionist tokens (input and output of every usage.llm_tokens event; a value that is not a number counts nothing) from p_since on: what the edge''s budget weighs against the reply policy''s max_llm_tokens_day, one statement however busy the day (00624). Service role only.';

create or replace function public.people_reply_modes(
  p_tenant_id uuid,
  p_query text default null,
  p_limit integer default 1000,
  p_offset integer default 0,
  p_after_at timestamptz default null,
  p_after_added timestamptz default null,
  p_after_id uuid default null
)
returns table(id uuid, mode text)
language sql
stable
security invoker
set search_path = public
as $$
  select pg.id,
         coalesce(own.mode,
                  (select ws.mode
                     from policies ws
                    where ws.tenant_id = p_tenant_id and ws.class = 'reply' and ws.subject_type is null
                    order by ws.id
                    limit 1))
    from people_page(p_tenant_id, null, p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id) pg
    left join policies own
      on own.tenant_id = p_tenant_id and own.class = 'reply' and own.subject_type = 'contact' and own.subject_id = pg.id
$$;

revoke execute on function public.people_reply_modes(uuid, text, integer, integer, timestamptz, timestamptz, uuid)
  from public, anon;
grant execute on function public.people_reply_modes(uuid, text, integer, integer, timestamptz, timestamptz, uuid)
  to authenticated, service_role;
comment on function public.people_reply_modes(uuid, text, integer, integer, timestamptz, timestamptz, uuid) is
  'The reply mode in force for each person on one page of People: their own reply policy, else the workspace''s, else null. The page is people_page''s, taken with the arguments people_list takes (p_query, p_limit, p_offset, p_after_at, p_after_added, p_after_id), so a page''s rows and its modes are read side by side (00624). Row security decides what it sees.';
