-- 00483 · A sender the owner sorted stays sorted, and what the mailbox left is listed.
--
-- A connected mailbox takes in the mail people write and leaves the rest where it is (decision 0073, R13 and R19;
-- channels classifyReceived and filedAsBulk). Two things were missing (the mailbox review of 27 October 2026):
--
--   * The owner had no way to say "that sender is not a person". A robot that marks itself as nothing (an account's
--     notices, an invoice) became a person in People, was deleted one at a time, and came back with its next email.
--   * What the mailbox left was a number. A person Gmail filed with the receipts could not be seen, or brought in.
--
--   mailbox_senders         what the workspace said of a sender: an address (a@b.example), or every address at a
--                           domain (b.example), is automated (its mail stays in the mailbox) or a person (its mail comes
--                           in whatever it looks like). Members read their workspace's; mailbox_sender_sort writes it.
--   mailbox_left            what a connected mailbox left where it was, one row a sender: the name it gave, why (the
--                           latest), how many, and when first and last. Members read their workspace's (a reader leaves
--                           out a sender since said to be a person); the edge's sync and import write it through
--                           mailbox_left_note, its one writer.
--   mailbox_sender_sort     a member who may change the workspace's settings says it of an address or a domain, or
--                           takes it back (a null verdict). Its line on the ledger, mailbox_connection.sender_sorted,
--                           says which kind and what verdict, never the address.
--   mailbox_left_note       the service role's: one more email left from a sender, its name and why the newest.
--   mailbox_senders_on_erase
--                           a person erased takes their address off mailbox_left, and a "person" said of it with it.
--                           What was said of a robot stays: an automated sender is nobody (decision 0036).
--
-- Deploy order: this migration first; an edge without the code that reads and writes these leaves mail as before.
-- Re-runnable.

set local lock_timeout = '3s';

create table if not exists public.mailbox_senders (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- An address, or a domain (what follows an address's @), lower-cased.
  sender    text not null check (sender = lower(btrim(sender)) and char_length(sender) between 3 and 254
                                 and sender !~ '[[:space:]<>]'),
  verdict   text not null check (verdict in ('automated', 'person')),
  set_by    uuid references auth.users (id) on delete set null,
  set_at    timestamptz not null default now(),
  primary key (tenant_id, sender)
);
comment on table public.mailbox_senders is
  'What the workspace said of a sender of mail to its connected mailbox (00483): an address, or every address at a domain, is automated (its mail stays in the mailbox) or a person (its mail comes in whatever it looks like). Members read; mailbox_sender_sort writes.';

alter table public.mailbox_senders enable row level security;
drop policy if exists mailbox_senders_member_select on public.mailbox_senders;
create policy mailbox_senders_member_select on public.mailbox_senders for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.mailbox_senders from anon, authenticated;
grant select on public.mailbox_senders to authenticated;
grant select, insert, update, delete on public.mailbox_senders to service_role;

create table if not exists public.mailbox_left (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  address   text not null check (address = lower(btrim(address)) and char_length(address) between 3 and 254),
  name      text check (name is null or char_length(name) <= 200),
  -- Why it was left: what it claimed to be (channels classifyReceived), the tab Gmail filed it under (filedAsBulk), a
  -- notice from Gmail's Updates from a stranger that answers nobody, or what the workspace said of its sender.
  why       text not null check (why in ('automated', 'auto_reply', 'report', 'booking_notice',
                                         'forwarding_confirmation', 'gmail_tab', 'updates', 'said')),
  count     integer not null default 1 check (count >= 1),
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  primary key (tenant_id, address)
);
comment on table public.mailbox_left is
  'What a connected mailbox left where it was, one row a sender (00483): the name it gave, why (the latest), how many, first and last. Members read; the edge writes through mailbox_left_note.';

alter table public.mailbox_left enable row level security;
drop policy if exists mailbox_left_member_select on public.mailbox_left;
create policy mailbox_left_member_select on public.mailbox_left for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.mailbox_left from anon, authenticated;
grant select on public.mailbox_left to authenticated;
grant select, insert, update, delete on public.mailbox_left to service_role;

create index if not exists mailbox_left_newest on public.mailbox_left (tenant_id, last_at desc);

create or replace function public.mailbox_sender_sort(p_tenant_id uuid, p_sender text, p_verdict text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_sender text := lower(btrim(coalesce(p_sender, '')));
  v_kind   text;
begin
  -- The caller is auth.uid(), read here, never a parameter (00021's rule).
  if v_actor is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not coalesce(public.caller_has_permission(p_tenant_id, 'settings'), false) then
    raise exception 'Not yours to change.' using errcode = '42501';
  end if;
  -- An address is one @ with something either side; a domain has a dot and no @.
  if char_length(v_sender) not between 3 and 254 or v_sender ~ '[[:space:]<>]'
     or not (v_sender ~ '^[^@]+@[^@]+\.[^@]+$' or v_sender ~ '^[^@]+\.[^@]+$') then
    raise exception 'A sender is an address or a domain.' using errcode = '22023';
  end if;
  if p_verdict is not null and p_verdict not in ('automated', 'person') then
    raise exception 'A sender is automated or a person.' using errcode = '22023';
  end if;
  v_kind := case when position('@' in v_sender) > 0 then 'address' else 'domain' end;
  if p_verdict is null then
    delete from public.mailbox_senders where tenant_id = p_tenant_id and sender = v_sender;
  else
    insert into public.mailbox_senders (tenant_id, sender, verdict, set_by, set_at)
    values (p_tenant_id, v_sender, p_verdict, v_actor, now())
    on conflict (tenant_id, sender)
      do update set verdict = excluded.verdict, set_by = excluded.set_by, set_at = excluded.set_at;
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'mailbox_connection.sender_sorted', 'setup', 'workspace', p_tenant_id,
          jsonb_build_object('kind', v_kind, 'verdict', p_verdict, 'by', v_actor));
  return jsonb_build_object('sender', v_sender, 'kind', v_kind, 'verdict', p_verdict);
end $$;
revoke all on function public.mailbox_sender_sort(uuid, text, text) from public, anon;
grant execute on function public.mailbox_sender_sort(uuid, text, text) to authenticated;
comment on function public.mailbox_sender_sort(uuid, text, text) is
  'What the workspace says of a sender of mail to its connected mailbox (00483): an address or a domain is automated or a person, or taken back (null). A member who may change the settings. Its line, mailbox_connection.sender_sorted, names the kind and the verdict, never the address. Answers sender, kind, verdict.';

create or replace function public.mailbox_left_note(
  p_tenant_id uuid,
  p_address   text,
  p_name      text,
  p_why       text,
  p_at        timestamptz
) returns void
language sql
set search_path = public
as $$
  insert into public.mailbox_left (tenant_id, address, name, why, count, first_at, last_at)
  values (p_tenant_id, lower(btrim(p_address)), nullif(left(btrim(coalesce(p_name, '')), 200), ''), p_why, 1,
          coalesce(p_at, now()), coalesce(p_at, now()))
  on conflict (tenant_id, address) do update
    set count    = mailbox_left.count + 1,
        name     = coalesce(excluded.name, mailbox_left.name),
        why      = excluded.why,
        first_at = least(mailbox_left.first_at, excluded.first_at),
        last_at  = greatest(mailbox_left.last_at, excluded.last_at);
$$;
revoke all on function public.mailbox_left_note(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mailbox_left_note(uuid, text, text, text, timestamptz) to service_role;
comment on function public.mailbox_left_note(uuid, text, text, text, timestamptz) is
  'One more email a connected mailbox left where it was, from one sender (00483): counted, its name and why the newest, its first and last moments kept. The service role''s (the edge''s sync and import).';

create or replace function public.mailbox_senders_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.erased_at is null and new.erased_at is not null and old.email is not null then
    delete from public.mailbox_left where tenant_id = new.tenant_id and address = lower(old.email);
    delete from public.mailbox_senders
     where tenant_id = new.tenant_id and sender = lower(old.email) and verdict = 'person';
  end if;
  return null;
end $$;
revoke all on function public.mailbox_senders_on_erase() from public, anon, authenticated;
grant execute on function public.mailbox_senders_on_erase() to service_role;

drop trigger if exists contacts_erase_takes_mailbox_senders on public.contacts;
create trigger contacts_erase_takes_mailbox_senders
  after update of erased_at on public.contacts
  for each row execute function public.mailbox_senders_on_erase();
