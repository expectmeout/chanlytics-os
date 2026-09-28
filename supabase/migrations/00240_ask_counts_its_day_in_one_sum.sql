-- 00240 · Ask counts its day in one sum.
--
-- Ask Rewired, Phase 6, PR 6.1 (docs/superpowers/plans/2026-09-28-ask-rewired-6-gateway.md, D1). The edge's model
-- gateway refuses a workspace's Ask round once its last 24 hours of Ask tokens reach the day's budget (contracts
-- ASK_TOKENS_DAY). It read every usage.ask_tokens event of the day a thousand rows at a time and summed them in
-- JavaScript. The same number is now one statement over the index 00002 made for it (events_tenant_kind_created):
-- input plus output tokens, as the gateway always counted them, a value that is not a number counting nothing.
--
-- The service role alone may call it; the gateway is its one caller, and a member's session never reads another
-- member's usage. Re-runnable.

create or replace function public.ask_tokens_day(p_tenant uuid)
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
     and e.kind = 'usage.ask_tokens'
     and e.created_at >= now() - interval '24 hours'
$$;

revoke execute on function public.ask_tokens_day(uuid) from public, anon, authenticated;
grant execute on function public.ask_tokens_day(uuid) to service_role;
comment on function public.ask_tokens_day(uuid) is
  'The workspace''s Ask tokens (input plus output of every usage.ask_tokens event) in the last 24 hours: what the edge''s model gateway weighs against the day''s budget (00240). Service role only.';
