-- 00129 · An owner makes the mailbox.
--
-- 00126 made the table and left it writable by the service role alone, which
-- kept the channel off: no workspace could have a mailbox. These are the doors
-- an owner gets one through (docs/plans/2026-09-17-email-channel.md, §6, §10),
-- in the shape every other thing a person does to their own workspace's rows
-- takes here (00054, 00125): a definer function that judges the caller, writes
-- the row, says a refusal in the owner's words, and records that it happened.
--
--   create_mailbox   the address customers write to, once per workspace. The
--                    reply route's token is minted here, from the database's
--                    own randomness, so no caller ever chooses one.
--   rename_mailbox   the name customers see beside the address. The address
--                    itself is not changed by anybody: it is printed on
--                    business cards and sits in customers' address books, and
--                    a second one is a routing decision, not an edit.
--
-- The table's CHECKs stay the authority on what an address may be; the doors
-- turn the two refusals an owner can cause (a shape the table will not hold, an
-- address somebody has) into sentences.

-- 24 characters of RFC 4648's base32 alphabet, lower-cased: 120 random bits.
-- 256 is a multiple of 32, so a byte modulo 32 is unbiased.
create or replace function public.mint_reply_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select string_agg(substr('abcdefghijklmnopqrstuvwxyz234567', 1 + (get_byte(r.b, g.i) % 32), 1), '' order by g.i)
    from (select gen_random_bytes(24) as b) r, generate_series(0, 23) as g(i);
$$;
revoke execute on function public.mint_reply_token() from public, anon, authenticated;

create or replace function public.create_mailbox(p_tenant_id uuid, p_local_part text, p_from_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user  uuid := auth.uid();
  v_local text := lower(btrim(coalesce(p_local_part, '')));
  v_name  text := btrim(coalesce(p_from_name, ''));
  v_row   public.mailboxes;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if not public.is_workspace_owner(p_tenant_id) then
    raise exception 'Only an owner can set up email.' using errcode = '42501';
  end if;
  begin
    insert into mailboxes (tenant_id, local_part, reply_token, from_name)
    values (p_tenant_id, v_local, public.mint_reply_token(), v_name)
    returning * into v_row;
  exception
    when check_violation then
      raise exception 'That cannot be used as an address or a name.' using errcode = '22023';
    when unique_violation then
      if exists (select 1 from mailboxes m where m.tenant_id = p_tenant_id) then
        raise exception 'This workspace already has an email address.' using errcode = '23505';
      end if;
      raise exception 'That address is taken. Try another.' using errcode = '23505';
  end;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox.created', 'system', 'mailbox', v_row.id, jsonb_build_object('by', v_user));
  return jsonb_build_object('id', v_row.id, 'local_part', v_row.local_part, 'from_name', v_row.from_name);
end $$;

revoke execute on function public.create_mailbox(uuid, text, text) from public, anon;
grant execute on function public.create_mailbox(uuid, text, text) to authenticated;
comment on function public.create_mailbox(uuid, text, text) is
  'An owner gives their workspace its email address, once. The reply route''s token is minted here; the event records who, never the address.';

create or replace function public.rename_mailbox(p_mailbox_id uuid, p_from_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_name   text := btrim(coalesce(p_from_name, ''));
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  select m.tenant_id into v_tenant from mailboxes m where m.id = p_mailbox_id;
  if v_tenant is null or not public.is_workspace_owner(v_tenant) then
    raise exception 'Only an owner can change this.' using errcode = '42501';
  end if;
  begin
    update mailboxes set from_name = v_name where id = p_mailbox_id;
  exception when check_violation then
    raise exception 'That cannot be used as a name.' using errcode = '22023';
  end;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'mailbox.renamed', 'system', 'mailbox', p_mailbox_id, jsonb_build_object('by', v_user));
  return jsonb_build_object('id', p_mailbox_id, 'from_name', v_name);
end $$;

revoke execute on function public.rename_mailbox(uuid, text) from public, anon;
grant execute on function public.rename_mailbox(uuid, text) to authenticated;
comment on function public.rename_mailbox(uuid, text) is
  'An owner changes the name customers see beside the workspace''s email address. The address itself is never changed.';
