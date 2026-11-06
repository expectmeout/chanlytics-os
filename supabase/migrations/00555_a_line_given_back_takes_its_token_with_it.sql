-- 00555 · A line given back takes its token with it.
--
-- A release forgets the row and closes the subaccount, and until now it left the subaccount's token in Vault under
-- line-creds-<line id>, with nothing pointing at it. put_line_credentials (00066) was the only door to that secret that
-- wrote: this is the one that takes it away, service role only, as drop_google_credentials and drop_mailbox_credentials
-- are. Not there is as done: false, and nothing changes. The row is left as it is, since the release deletes it next and
-- a read of a secret that is gone answers null.
--
-- Additive: nothing calls it before the code that comes with it. Re-runnable.

create or replace function public.drop_line_credentials(p_line_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'line-creds-' || p_line_id::text;
  v_id   uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then return false; end if;
  delete from vault.secrets where id = v_id;
  return true;
end $$;

comment on function public.drop_line_credentials(uuid) is
  'Service-role only: deletes a line''s provider secrets from Vault. Called when the line is given back, before its row goes.';

revoke all on function public.drop_line_credentials(uuid) from public, anon, authenticated;
grant execute on function public.drop_line_credentials(uuid) to service_role;
