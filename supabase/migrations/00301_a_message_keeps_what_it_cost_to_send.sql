-- 00301 · A message keeps what it cost to send.
--
-- The Reports lenses spec, K8. A WhatsApp receipt from Meta says what the message was billed as (its `pricing`: whether it
-- was billable, the pricing model, the category and the type); the edge read the receipt's status and dropped the rest. The
-- operator's cost per message needs it, so message_keep_cost merges it into the outbound row's meta, found by the provider's
-- own id in the named workspace, once: the first receipt that carries it stands, and a call with nothing new to keep touches no
-- row. Meta sends no amount and no currency: the operator prices a category by the recipient's country at read time, so no
-- number is guessed here.
--
-- The webhook is public input, so each key is checked on its own and what fails is dropped, never stored: billable must be a
-- boolean; pricing_model, category and type must be words of letters, digits, _ or - and at most forty characters; no other key
-- is kept. What is left is stored, if it holds a valid category: the category is the one key the operator prices by, so an
-- answer without one (billable alone, say) writes nothing, and cannot take the key, which the first answer would otherwise
-- keep for ever, from a later receipt that carries the whole. Meta's pricing always carries category and billable; type may be
-- absent on older payloads, so only the category is required. Only an outbound message of the named workspace is touched, and
-- nothing of it but meta.pricing: never the status
-- (messages_guard merges meta.status_at on a later receipt and keeps what is kept here), never processed_at, handled or any
-- other key.
--
-- Who may read it. The row's meta reaches a member's browser as it is stored, and the cost is the operator's, not a member's:
-- contracts' memberMetaOf (conversations/thread-dto.ts) drops pricing from every thread a member or Ask reads (the thread's
-- reader, groupMessages). The owner's own workspace export keeps meta as stored: it is their data, and pricing holds Meta's
-- category words and no amount. Either deploy order works: an edge ahead of this migration loses the cost (a line in its log)
-- and carries on; a migration ahead of the edge writes nothing; and no page of an older dashboard reads meta.pricing. Nothing is
-- backfilled: a message from before reads no cost.
--
-- The lock. A function only: nothing is locked. The guard of 00259 is set all the same, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.message_keep_cost(p_tenant_id uuid, p_external_id text, p_pricing jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kept jsonb;
begin
  if jsonb_typeof(p_pricing) is distinct from 'object' then
    return false;
  end if;
  select jsonb_object_agg(e.key, e.value) into v_kept
    from jsonb_each(p_pricing) e
   where (e.key = 'billable' and jsonb_typeof(e.value) = 'boolean')
      or (e.key in ('pricing_model', 'category', 'type')
          and jsonb_typeof(e.value) = 'string'
          and (e.value #>> '{}') ~ '^[A-Za-z0-9_-]{1,40}$');
  if v_kept is null or not (v_kept ? 'category') then
    return false;
  end if;
  update public.messages
     set meta = meta || jsonb_build_object('pricing', v_kept)
   where tenant_id = p_tenant_id and external_id = p_external_id and direction = 'outbound'
     and not (meta ? 'pricing');
  return found;
end $$;
revoke all on function public.message_keep_cost(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.message_keep_cost(uuid, text, jsonb) to service_role;
comment on function public.message_keep_cost(uuid, text, jsonb) is
  'Keeps what a message cost to send on its outbound row (K8): Meta''s pricing, checked key by key (billable a boolean; pricing_model, category and type words of letters, digits, _ and -, at most 40 characters; nothing else kept), merged into meta once, by the provider''s id in this workspace. False, writing nothing, for an answer without a valid category (the key the cost is priced by), an id that is not an outbound message of this workspace, and a message that already has a pricing; never touches the status or any other key. The WhatsApp receipt door''s, best-effort (apps/edge lib whatsapp receipts).';
