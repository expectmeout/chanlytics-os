-- 00287 · A message says what it became.
--
-- The Reports lenses spec, K1. What the receptionist made of a customer's message, and what they were after, were known
-- to the verb for a moment and kept nowhere. message_stamp_handled merges `handled` and `intent` into an inbound row's
-- meta, beside processed_at and never over it, the first answer standing. It is a door apart from mark_processed (00003):
-- the deadman sweep reads processed_at, so the two are written together and fail alone. Either deploy order works (an edge
-- ahead of this logs pg_handled_failed and carries on). No backfill: an older message reads unknown.

create or replace function public.message_stamp_handled(
  p_tenant_id  uuid,
  p_message_id uuid,
  p_handled    text,
  p_intent     text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
     set meta = meta || jsonb_strip_nulls(jsonb_build_object('handled', left(p_handled, 20), 'intent', left(p_intent, 20)))
   where id = p_message_id
     and tenant_id = p_tenant_id
     and direction = 'inbound'
     and not (meta ? 'handled');
$$;

revoke all on function public.message_stamp_handled(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.message_stamp_handled(uuid, uuid, text, text) to service_role;

comment on function public.message_stamp_handled(uuid, uuid, text, text) is
  'What a customer''s message became (K1): meta.handled (ai, held, handoff or blocked: contracts HANDLED_OUTCOMES) and meta.intent where the model read it, merged beside processed_at, the first answer standing, inbound rows of the workspace named only. The edge calls it best-effort beside mark_processed.';
