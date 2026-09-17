-- 00126 · A workspace has a mailbox.
--
-- 00125 let a person have an address. This is the other end: the address a
-- workspace is written to and writes from, and the few facts the email channel
-- needs the database to hold to SEND (docs/plans/2026-09-17-email-channel.md, E2).
-- What intake needs -- its job kind and its two escalation reasons -- arrives
-- with the door and the handler that use them, in its own migration.
-- Nothing here sends or receives; without a mailbox row a workspace has no
-- email at all, which is how the channel stays off until it is switched on.
--
--   mailboxes            one per workspace, hosted on the platform's mail
--                        domain: the local part customers write to, and the
--                        opaque token replies route back on.
--   contacts             a suppression, apart from delivery: a hard bounce, a
--                        complaint or the provider's own list stops sends to
--                        THAT address, and a corrected address starts clean.
--   messages             a lookup from an email's own Message-ID to its row,
--                        for finding a reply's parent. Not unique: the sender
--                        writes that header, and the provider's id is the key.

create table public.mailboxes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  -- bestmovers -> bestmovers@<the platform's mail domain>. The domain is the
  -- deployment's (EMAIL_DOMAIN), so a row carries only what is the workspace's.
  local_part       text not null
                     check (local_part ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')
                     -- "r" is the reply route (r+<token>@); the rest are addresses
                     -- a mail system or a person expects to mean something else.
                     check (local_part not in ('r', 'postmaster', 'abuse', 'mailer-daemon', 'noreply', 'no-reply',
                                               'admin', 'administrator', 'support', 'security', 'billing', 'hello', 'hi')),
  -- The opaque part of r+<token>@: 24 base32 characters, 120 random bits. It
  -- routes a reply to this workspace. It authenticates nobody and names no thread.
  reply_token      text not null check (reply_token ~ '^[a-z2-7]{24}$'),
  -- A rotation keeps the old token routing until it is revoked, so reply chains
  -- already in customers' inboxes keep working; a compromise clears it at once.
  reply_token_prev text check (reply_token_prev is null or reply_token_prev ~ '^[a-z2-7]{24}$'),
  from_name        text not null check (char_length(btrim(from_name)) between 1 and 80),
  -- How much the receptionist may do with an email by itself. It tightens the
  -- workspace's own policy and never loosens it (contracts effectiveReplyMode).
  reply_mode       text not null default 'draft' check (reply_mode in ('draft', 'veto', 'auto')),
  last_received_at timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One mailbox per workspace. A second is a routing decision, not an insert.
create unique index mailboxes_tenant_uq on public.mailboxes (tenant_id);
-- An address is one workspace's for good: never reassigned, so mail meant for
-- one business can never reach another.
create unique index mailboxes_local_part_uq on public.mailboxes (local_part);
create unique index mailboxes_reply_token_uq on public.mailboxes (reply_token);
create unique index mailboxes_reply_token_prev_uq on public.mailboxes (reply_token_prev) where reply_token_prev is not null;

create trigger mailboxes_set_updated_at
  before update on public.mailboxes
  for each row execute function extensions.moddatetime('updated_at');

alter table public.mailboxes enable row level security;
create policy mailboxes_member_select on public.mailboxes
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
comment on table public.mailboxes is
  'A workspace''s email address on the platform''s mail domain, its reply route, and how much the receptionist may do with an email. Members read; the service role writes.';

alter publication supabase_realtime add table public.mailboxes;

-- A suppression is a fact about an address, apart from whether a message was
-- delivered: a delivered email can draw a complaint a day later, and the row
-- that was delivered stays delivered.
alter table public.contacts
  add column if not exists email_suppressed_at timestamptz,
  add column if not exists email_suppressed_reason text;

alter table public.contacts drop constraint if exists contacts_email_suppressed_check;
-- Both or neither, said with IS NULL on each side: `reason in (...)` is NULL
-- for a NULL reason, and a CHECK that evaluates to NULL passes.
alter table public.contacts add constraint contacts_email_suppressed_check
  check (
    (email_suppressed_at is null) = (email_suppressed_reason is null)
    and (email_suppressed_reason is null or email_suppressed_reason in ('hard_bounce', 'complaint', 'provider'))
  );

comment on column public.contacts.email_suppressed_at is
  'When this address stopped being sent to: a permanent bounce, a complaint, or the provider''s own suppression. The wire refuses it from then on (deliver: email_suppressed).';

-- A corrected address is a different address: it starts clean.
create or replace function public.contact_email_change_clears_suppression()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    new.email_suppressed_at := null;
    new.email_suppressed_reason := null;
  end if;
  return new;
end $$;

drop trigger if exists contacts_email_change_clears_suppression on public.contacts;
create trigger contacts_email_change_clears_suppression
  before update of email on public.contacts
  for each row execute function public.contact_email_change_clears_suppression();

-- An erased row holds no address (00125), so it holds nothing about one.
-- Said in the function that erases the address rather than left to the
-- trigger above: that one fires when an UPDATE names `email`, and an erasure
-- names `erased_at`; 00125's trigger changes the address inside its own BEFORE
-- trigger, where no other trigger is told. One function owns what an erasure
-- does to the address, so nothing depends on the order two triggers run in.
create or replace function public.contact_email_on_erase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    new.email := null;
    new.email_suppressed_at := null;
    new.email_suppressed_reason := null;
  end if;
  return new;
end $$;

create index messages_email_message_id_idx
  on public.messages (tenant_id, (meta->'email'->>'message_id'))
  where channel = 'email';
