-- 00573 · A press that showed the words is their OK (the answers canvas, D3).
--
-- A new sequence's first batch waits for an OK of its words, whatever its mode (decision 0064). Pressing a card of Ask's that
-- showed those words whole, and says it starts the offer, is that OK: a second yes for the same words is what Ruben's
-- film showed as boring and what the receipt could not honestly say.
--
--   words_seen   Sets sequence_steps.words_ok_at on a step of this workspace whose words have no OK yet, for a member who may
--                act here. It answers whether it set it. Security definer: a member has no update on the column, and the
--                gate is is_acting_member, the same as the sequence's own row.
--
-- Deploy order: either. A release before this one never calls it; this release, on a database before it, reads the missing
-- function as no OK, and its first batch waits as it did. Re-runnable.

set local lock_timeout = '3s';

create or replace function public.words_seen(p_tenant_id uuid, p_step_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set uuid;
begin
  if not public.is_acting_member(p_tenant_id) then
    raise exception 'not a member who may act here' using errcode = '42501';
  end if;
  update public.sequence_steps
     set words_ok_at = now()
   where id = p_step_id
     and tenant_id = p_tenant_id
     and words_ok_at is null
  returning id into v_set;
  return v_set is not null;
end;
$$;

comment on function public.words_seen(uuid, uuid) is
  'A member pressed a card of Ask''s that showed this step''s words: they are taken as seen (0064, the answers canvas D3).';
revoke all on function public.words_seen(uuid, uuid) from public, anon;
grant execute on function public.words_seen(uuid, uuid) to authenticated, service_role;
