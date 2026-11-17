-- A business's footage has its sources (the footage sources plan's P0, 17 November 2026).
--
-- A business already keeps its photos and videos somewhere (Google Drive first; Dropbox and OneDrive later). It will
-- connect that place once, and new photos and videos will then reach its Library by themselves. This is the ground under
-- that, and nothing more: three tables, no sign-in, no sync, no page. Nothing reads or writes them before the code that
-- comes with the later phases.
--
--   source_connections   one provider account a workspace connected: the provider (google, for Google Drive), the
--                        account's stable id there (Google's sub, as google_connections.google_sub and
--                        mailbox_connections.provider_account hold it, so the rule that gives a grant back to Google
--                        finds every connection of one Google account with one read), its email, the scopes granted,
--                        the member who connected it, and its health. Its tokens are never on the row:
--                        credentials_ref names the Vault secret.
--   media_sources        one watched folder: its connection, the folder's id and name, the shared drive's id where
--                        there is one, whether subfolders count, its state, its own change cursor, when it is next
--                        read and at what gap, its push channel (id, a hash of its token, when it ends), when it was
--                        last reconciled, and its last error. Many a workspace in the schema; how many a workspace may
--                        have is an entitlement, not a constraint.
--   source_items         one provider item seen in a source, folders included (they are the tree's index): the
--                        provider's id, kind, parent, name, when it was modified, its checksum, size and length, who
--                        added it where the provider says, when it was first seen, its state and why, the Library file
--                        it became, and when it was found gone. One row per source and provider id, so a read written
--                        twice is one row.
--
-- Each is a workspace's: members read their own workspace's rows, and only the service role writes (the connect, the
-- reads and the clocks to come), as mailbox_connections is (00423). The house fence (00279) holds between them: a source
-- names its connection with its workspace, an item its source and its Library file the same way. A connection removed
-- takes its sources and their items; a Library file purged leaves its item, without the file.
--
-- Additive. Deploy order: either. Re-runnable throughout.

set local lock_timeout = '3s';

/* ---------------------------------------------------------------------------------------------- 1. the connection -- */

create table if not exists public.source_connections (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  -- One value a provider. Google Drive is the first; a later provider widens this set (written as a set of one, so the
  -- schema's closed sets hold it from the start).
  provider         text not null check (provider = any (array['google'])),
  -- The provider's own stable id for the account (Google's sub): a reconnect finds its row by it, and so does the rule
  -- that gives a grant back to Google only when no other connection holds the same account.
  provider_account text check (char_length(provider_account) between 1 and 200),
  email            text check (char_length(email) between 6 and 254 and email = lower(btrim(email))),
  scopes           text[] not null default '{}',
  health           text not null default 'ok' check (health in ('ok', 'needs_reconnect', 'blocked_by_admin')),
  credentials_ref  text,
  connected_by     uuid,
  connected_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- An organisation that blocks the app gives no grant, so there is no account to name: every other row names its own.
  constraint source_connections_known_unless_blocked
    check (health = 'blocked_by_admin' or (provider_account is not null and email is not null)),
  -- The house fence (00279): a row that names one of this table's rows names it with its workspace.
  constraint source_connections_tenant_id_id unique (tenant_id, id)
);

-- One row an account in a workspace: a reconnect writes over it.
create unique index if not exists source_connections_one_account
  on public.source_connections (tenant_id, provider, provider_account);
-- Every connection of one provider account, in any workspace: what a grant given back to Google asks first.
create index if not exists source_connections_account on public.source_connections (provider, provider_account);

drop trigger if exists source_connections_set_updated_at on public.source_connections;
create trigger source_connections_set_updated_at
  before update on public.source_connections
  for each row execute function extensions.moddatetime('updated_at');

alter table public.source_connections enable row level security;
drop policy if exists source_connections_member_select on public.source_connections;
create policy source_connections_member_select on public.source_connections
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- Members read; nothing of a session writes: every write is the edge's, as the service role. Every right is taken
-- from a visitor and a member first, so the one given back is all they hold, whatever a database grants by default.
revoke all on public.source_connections from anon, authenticated;
grant select on public.source_connections to authenticated;
grant all on public.source_connections to service_role;

comment on table public.source_connections is
  'A provider account a business connected so its footage can be read where it already lives (the footage sources plan, 00639): the provider (google, for Google Drive), the account''s stable id there (Google''s sub, as google_connections.google_sub and mailbox_connections.provider_account hold it, so one read finds every connection of one Google account), its email, the scopes it granted, the member who connected it, and its health. Its tokens are never on the row: credentials_ref names the Vault secret. Members read; the service role writes.';
comment on column public.source_connections.health is
  'ok: its grant reads. needs_reconnect: the provider refused the grant (revoked or expired); its sources pause and nothing in the Library changes. blocked_by_admin: the account''s organisation does not let the app read it, so no grant was given and the account''s id and email may be unknown.';

/* -------------------------------------------------------------------------------------------- 2. a watched folder -- */

create table if not exists public.media_sources (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  connection_id      uuid not null,
  folder_id          text not null check (char_length(folder_id) between 1 and 200),
  folder_name        text not null check (char_length(folder_name) between 1 and 500),
  -- The shared drive the folder sits in, where it sits in one: its changes are read there.
  drive_id           text check (char_length(drive_id) between 1 and 200),
  include_subfolders boolean not null default true,
  state              text not null default 'setting_up'
                       check (state in ('setting_up', 'watching', 'paused', 'frozen', 'stopped')),
  -- Its own place in its provider's changes: one cursor a source, kept while it is paused or frozen.
  change_cursor      text check (change_cursor is null or char_length(change_cursor) <= 4000),
  next_read_at       timestamptz,
  read_gap_seconds   integer check (read_gap_seconds > 0),
  -- The provider's push channel: its id, the sha256 of its token (never the token), and when it ends.
  channel_id         text check (char_length(channel_id) between 1 and 200),
  channel_token_hash text check (channel_token_hash ~ '^[0-9a-f]{64}$'),
  channel_expires_at timestamptz,
  reconciled_at      timestamptz,
  -- What went wrong last, in the owner's words (never a provider's text), and when; cleared by the next success.
  last_error         text check (last_error is null or char_length(last_error) <= 300),
  last_error_at      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint media_sources_channel_is_whole
    check ((channel_id is null) = (channel_token_hash is null) and (channel_id is null) = (channel_expires_at is null)),
  constraint media_sources_tenant_id_id unique (tenant_id, id),
  constraint media_sources_connection_id_same_workspace
    foreign key (tenant_id, connection_id) references public.source_connections (tenant_id, id) on delete cascade
);

-- A folder is watched once by a connection: choosing it again finds its row, with what it already knows.
create unique index if not exists media_sources_one_a_folder on public.media_sources (connection_id, folder_id);

drop trigger if exists media_sources_set_updated_at on public.media_sources;
create trigger media_sources_set_updated_at
  before update on public.media_sources
  for each row execute function extensions.moddatetime('updated_at');

alter table public.media_sources enable row level security;
drop policy if exists media_sources_member_select on public.media_sources;
create policy media_sources_member_select on public.media_sources
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.media_sources from anon, authenticated;
grant select on public.media_sources to authenticated;
grant all on public.media_sources to service_role;

comment on table public.media_sources is
  'One folder a business has Chanlytics watch (the footage sources plan, 00639): the connection that reads it, the folder''s id and name at its provider, the shared drive''s id where it sits in one, whether its subfolders count, its state, its own change cursor, when it is next read and at what gap, its push channel (the channel''s id, a hash of its token, when it ends), when it was last reconciled, and what went wrong last. Many a workspace in the schema; how many a workspace may have is an entitlement. Members read; the service role writes.';
comment on column public.media_sources.state is
  'setting_up: chosen, its first walk not done. watching: read as its provider signals and on the floor clock. paused: nothing is read until someone resumes it (the member who connected it left, or its connection needs a reconnect). frozen: the folder itself cannot be read, and nothing is reconciled until it can. stopped: no longer watched; what came in stays.';
comment on column public.media_sources.channel_token_hash is
  'The sha256, in hex, of the token the provider sends back with each signal: the token itself is never kept.';

/* ------------------------------------------------------------------------------------------- 3. what a source holds -- */

create table if not exists public.source_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  source_id     uuid not null,
  provider_id   text not null check (char_length(provider_id) between 1 and 200),
  kind          text not null check (kind in ('folder', 'image', 'video', 'other')),
  -- The provider's id of the folder it sits in: the tree is read by it.
  parent_id     text check (char_length(parent_id) between 1 and 200),
  name          text not null check (char_length(name) between 1 and 1000),
  modified_at   timestamptz,
  checksum      text check (checksum is null or char_length(checksum) <= 200),
  bytes         bigint check (bytes >= 0),
  seconds       numeric check (seconds >= 0),
  -- Who added it, where the provider names them (in a shared drive, whoever changed it last): a person's name.
  added_by      text check (added_by is null or char_length(added_by) <= 200),
  state         text not null default 'listed'
                  check (state in ('listed', 'waiting', 'taking', 'in', 'too_big', 'not_media', 'let_go', 'failed',
                                   'outside', 'gone', 'no_access')),
  why           text check (why is null or char_length(why) <= 300),
  file_id       uuid,
  first_seen_at timestamptz not null default now(),
  gone_at       timestamptz,
  updated_at    timestamptz not null default now(),
  constraint source_items_source_id_same_workspace
    foreign key (tenant_id, source_id) references public.media_sources (tenant_id, id) on delete cascade,
  constraint source_items_file_id_same_workspace
    foreign key (tenant_id, file_id) references public.files (tenant_id, id) on delete set null (file_id)
);

-- A read written twice is one row: every write is an upsert on the source and the provider's id.
create unique index if not exists source_items_once on public.source_items (source_id, provider_id);
-- The tree: what sits in a folder.
create index if not exists source_items_parent on public.source_items (source_id, parent_id);
-- A workspace's items by source and state: a source's counts, and the workspace's own leaving.
create index if not exists source_items_tenant on public.source_items (tenant_id, source_id, state);
-- The item a Library file came from: asked when a file is removed or purged.
create index if not exists source_items_file on public.source_items (tenant_id, file_id) where file_id is not null;

drop trigger if exists source_items_set_updated_at on public.source_items;
create trigger source_items_set_updated_at
  before update on public.source_items
  for each row execute function extensions.moddatetime('updated_at');

alter table public.source_items enable row level security;
drop policy if exists source_items_member_select on public.source_items;
create policy source_items_member_select on public.source_items
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.source_items from anon, authenticated;
grant select on public.source_items to authenticated;
grant all on public.source_items to service_role;

comment on table public.source_items is
  'One item a provider holds under a watched folder, folders included, since they are the tree''s index (the footage sources plan, 00639): the provider''s id for it, its kind, its parent''s id, its name, when it was last modified, its checksum and size, its length in seconds where the provider says, who added it where the provider names them, when it was first seen, its state and why, the Library file it became, and when it was found gone. One row per source and provider id. Members read; the service role writes.';
comment on column public.source_items.kind is
  'folder: part of the tree. image, video: what the Library takes. other: seen and passed over (a document, a shortcut, a RAW photo).';
comment on column public.source_items.state is
  'listed: seen, not asked for. waiting: to be taken in. taking: on its way. in: a Library file (file_id). too_big: over a cap, never taken (why says which). not_media: not a photo or a video. let_go: its owner removed it from the Library, so the next read does not bring it back. failed: its taking failed for good. outside: moved out of the watched tree. gone: trashed or deleted at its provider (gone_at). no_access: the provider no longer lets it be read, which is never read as gone.';
