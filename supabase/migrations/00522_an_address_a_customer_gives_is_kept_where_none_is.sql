-- 00522 · An address a customer gives is kept where none is on file (the inbound review, C11).
--
-- A customer who writes their email address in a message has it kept on their row (core's ingest, contracts
-- addressInMessage), never over one already there. The edge read the row, then called set_person_email, which
-- overwrites: two messages whose reads both landed before either write could each write, and the read was a table the
-- edge named itself. This door does both under the row's lock, in one call.
--
--   note_person_email(tenant, contact, address)   'kept' when the address is now theirs, 'had_one' when an address was
--                                                  on file already (nothing written), 'taken' when another person here
--                                                  holds it (nothing written: the owner merges them), 'not_found' for
--                                                  no such person in the workspace, or one erased. An address that is
--                                                  not one raises, as set_person_email does.
--
-- set_person_email writes the address and its event, as the edge's call with no session (00171). Service role only.
-- Re-runnable.

set local lock_timeout = '3s';

create or replace function public.note_person_email(p_tenant_id uuid, p_contact_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select c.email into v_email
    from contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id and c.erased_at is null
     for no key update;
  if not found then
    return 'not_found';
  end if;
  if v_email is not null then
    return 'had_one';
  end if;
  begin
    perform public.set_person_email(p_contact_id, p_email);
  exception when unique_violation then
    return 'taken';
  end;
  return 'kept';
end $$;

revoke all on function public.note_person_email(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.note_person_email(uuid, uuid, text) to service_role;

comment on function public.note_person_email(uuid, uuid, text) is
  'An address a customer wrote in their own message, kept on their row only where none is on file, under the row''s lock (00522): kept, had_one, taken (another person here holds it; the owner merges them) or not_found. Writes through set_person_email, as the edge with no session. Service role only.';
