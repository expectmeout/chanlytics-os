-- 00487: a connected mailbox signs what it sends the way its own mail client does (the email canvas, lane B, 27 Oct
-- 2026). A reply sent from Chanlytics left unsigned, ending on "Talk soon,", while the same reply written in Gmail
-- carries the owner's signature. Gmail's own is read with the gmail.readonly the grant already holds
-- (users.settings.sendAs): kept as the HTML Gmail keeps it, and when it was read. `signature` stays the owner's own
-- words, which go in its place; signature_off sends none.

alter table public.mailbox_connections add column if not exists gmail_signature text;
alter table public.mailbox_connections add column if not exists gmail_signature_at timestamptz;
alter table public.mailbox_connections add column if not exists signature_off boolean not null default false;

alter table public.mailbox_connections drop constraint if exists mailbox_connections_gmail_signature_check;
alter table public.mailbox_connections
  add constraint mailbox_connections_gmail_signature_check
  check (gmail_signature is null or char_length(gmail_signature) <= 10000);

comment on column public.mailbox_connections.gmail_signature is
  'The signature its owner keeps in Gmail for this address, as Gmail keeps it (HTML), read at connect and once a day; null where Gmail has none or it was not read. Sent as it is in what the mailbox sends; drawn in the app only as words.';
comment on column public.mailbox_connections.gmail_signature_at is
  'When its Gmail signature was last read; null until it is.';
comment on column public.mailbox_connections.signature_off is
  'Its owner sends no signature: neither Gmail''s nor their own.';
