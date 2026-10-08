-- 00351 · A member opens a conversation.
--
-- A person's one thread (conversations, unique on tenant_id and contact_id) was only ever opened by someone writing or
-- calling in (ingest_inbound, ingest_call), by a campaign reaching them, or by a cold email (reach_out_person). A member
-- who wants to write first had no door: a session may not insert a conversation, so a person added by hand, brought in
-- by a file or made from a lead could not be written to from anywhere. This is that door: the member's own, on their
-- own session. It opens the thread and writes nothing else; the message that follows is the reply route's to queue.

create or replace function public.conversation_open(p_tenant_id uuid, p_contact_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- An owner or an operator, or a partner on a session that showed its second factor: who may commit a change here.
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- This workspace's person, still here: not forgotten, not being forgotten, not folded into another.
  if not exists (
    select 1 from public.contacts c
     where c.id = p_contact_id and c.tenant_id = p_tenant_id
       and c.erased_at is null and c.erasing_since is null and c.merged_into_contact_id is null
  ) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  -- Opened, never touched: last_message_at is the message's to stamp, when one lands.
  insert into public.conversations (tenant_id, contact_id) values (p_tenant_id, p_contact_id)
  on conflict (tenant_id, contact_id) do nothing;
  select id into v_conversation from public.conversations
   where tenant_id = p_tenant_id and contact_id = p_contact_id;
  return v_conversation;
end $$;

revoke execute on function public.conversation_open(uuid, uuid) from public, anon;
grant execute on function public.conversation_open(uuid, uuid) to authenticated, service_role;
comment on function public.conversation_open(uuid, uuid) is
  'A member opens a person''s one thread, as themselves (an owner, an operator, or a partner whose session showed its second factor): the thread''s id, made when they had none and left untouched (no last_message_at: that is the message''s). Refuses a person who is not this workspace''s, or erased, being erased, or merged into another. Writes no message and no event: the reply route queues what follows.';
