-- A file says where its copies are (the archive plan's B1, 22 November 2026; its PRD is version 1.1).
--
-- A business will choose a few files from its Google Drive without sharing a whole folder, save a file to its Drive on
-- its own press, and have a video step aside and come back from a copy Chanlytics keeps itself. This is the ground
-- under that, and nothing more: one column and three tables, no function, no sign-in on a screen, no page. Nothing
-- reads or writes the tables before the code that comes with the later steps.
--
--   source_connections.door   which door a connected account's key opens. `watch` reads a folder the business chose,
--                             with Google's wide read; every row there is today is one. `save` reaches only the files
--                             the business picked or the app made, with the narrow one. One row a door, so connecting
--                             one never touches the other. The rule that gives a grant back to Google already counts
--                             rows by id, so one door's row holds the grant while the other leaves.
--   archive_folders           the one "Chanlytics" folder in an owner's Drive that a press to save writes into, a
--                             workspace and a Google account: its id and its two folders', and whether it is still
--                             where it was left.
--   file_archives             one copy of a Library file, a file and an origin: a copy the owner saved to their Drive
--                             (`saved`), the owner's own Drive file a pick brought in (`picked`), or Chanlytics' own
--                             copy on its shelf (`shelf`). A video may come back from the last two and never from the
--                             first: Google's Drive API terms do not let an app keep its content in a user's Drive as
--                             its backup, so a saved copy is the owner's, and only a record here.
--   file_archive_parts        one piece of a copy: a photo's or a picked file's own bytes, a post's four pictures, a
--                             video's file. Where it is (a Drive file, or a key on the shelf), its size and its whole
--                             checksum, so a copy is known to be the one that was sent before anything leans on it.
--
-- Each is a workspace's: members read their own workspace's rows (a part's shelf key and checksums aside), and only the
-- service role writes, as source_connections is (00639). The house fence (00279) holds: a row that names another
-- workspace table's row names it with its workspace. A connection removed leaves every copy's row, with the connection
-- cleared and the Google account kept, so the same account connected again finds its files. A Library file purged
-- takes its copies' rows.
--
-- source_connections_one_account, the key of three columns, stays: the code live today writes a connection over its own
-- row by it, and with every row `watch` it still holds. The step that first writes a `save` row drops it.
--
-- Additive. Applied before the code that reads it; the code live today runs on it unchanged. Re-runnable throughout.

set local lock_timeout = '3s';

/* ----------------------------------------------------------------------------------------- 1. a connection's door -- */

alter table public.source_connections add column if not exists door text not null default 'watch';
alter table public.source_connections drop constraint if exists source_connections_door_check;
alter table public.source_connections
  add constraint source_connections_door_check check (door = any (array['save', 'watch']));

-- One row an account and a door in a workspace: a reconnect of a door writes over its own row and no other.
create unique index if not exists source_connections_one_account_a_door
  on public.source_connections (tenant_id, provider, provider_account, door);

comment on column public.source_connections.door is
  'Which door this account''s key opens (00683). watch: a folder the business chose is read, with the provider''s wide read. save: only the files the business picked or the app made are reached, with the narrow one. One row a door for an account in a workspace.';

/* ------------------------------------------------------------------------------- 2. the folder a press saves into -- */

create table if not exists public.archive_folders (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  -- Google's own stable id for the account (its sub), kept beside the connection so the folder is still known when
  -- the connection is gone.
  google_account  text not null check (char_length(google_account) between 1 and 200),
  connection_id   uuid,
  folder_id       text not null check (char_length(folder_id) between 1 and 200),
  made_folder_id  text not null check (char_length(made_folder_id) between 1 and 200),
  added_folder_id text not null check (char_length(added_folder_id) between 1 and 200),
  state           text not null default 'ready' check (state = any (array['ready', 'missing'])),
  seen_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint archive_folders_tenant_id_id unique (tenant_id, id),
  -- Not a cascade: a disconnect clears the connection and leaves the folder known.
  constraint archive_folders_connection_id_same_workspace
    foreign key (tenant_id, connection_id) references public.source_connections (tenant_id, id)
    on delete set null (connection_id)
);

-- One folder a Google account in a workspace.
create unique index if not exists archive_folders_one_account
  on public.archive_folders (tenant_id, google_account);
create index if not exists archive_folders_connection
  on public.archive_folders (tenant_id, connection_id) where connection_id is not null;

drop trigger if exists archive_folders_set_updated_at on public.archive_folders;
create trigger archive_folders_set_updated_at
  before update on public.archive_folders
  for each row execute function extensions.moddatetime('updated_at');

alter table public.archive_folders enable row level security;
drop policy if exists archive_folders_member_select on public.archive_folders;
create policy archive_folders_member_select on public.archive_folders
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- Members read; nothing of a session writes. Every right is taken from a visitor and a member first, so the one given
-- back is all they hold, whatever a database grants by default.
revoke all on public.archive_folders from anon, authenticated;
grant select on public.archive_folders to authenticated;
grant all on public.archive_folders to service_role;

comment on table public.archive_folders is
  'The one "Chanlytics" folder in an owner''s Google Drive that a press to save writes into (the archive PRD 1.1, 00683): a workspace and a Google account, the folder''s id and its two folders'' ("Made by Chanlytics", "Added from your phone"). Known by id, so a rename or a move changes nothing. Its connection is cleared when the account is disconnected, and the row stays.';
comment on column public.archive_folders.state is
  'ready: where it was left. missing: found in Google Drive''s bin or gone. A missing folder is never made again by itself: the owner''s next press to save asks first.';

/* ----------------------------------------------------------------------------------------- 3. a copy of a file -- */

create table if not exists public.file_archives (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  file_id        uuid not null,
  origin         text not null check (origin = any (array['saved', 'picked', 'shelf'])),
  -- Whose Drive the copy is in (Google's sub), kept beside the connection so it outlives a disconnect. The shelf is
  -- Chanlytics' own and names no account.
  google_account text check (char_length(google_account) between 1 and 200),
  connection_id  uuid,
  state          text not null default 'saving'
                   check (state = any (array['saving', 'saved', 'checked', 'failed', 'gone'])),
  why            text check (why = any (array[
                   'drive_full', 'key_lost', 'other_account', 'mismatch', 'in_bin', 'not_found', 'folder_missing',
                   'refused'
                 ])),
  checked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint file_archives_tenant_id_id unique (tenant_id, id),
  constraint file_archives_account_shape check ((origin = 'shelf') = (google_account is null)),
  constraint file_archives_shelf_has_no_connection check (origin <> 'shelf' or connection_id is null),
  -- A copy that failed or is gone says why, and no other copy does.
  constraint file_archives_why_shape check ((why is not null) = (state = any (array['failed', 'gone']))),
  constraint file_archives_checked_shape check (state <> 'checked' or checked_at is not null),
  -- A Library file purged takes its copies' rows; what is in the owner's Drive stays there.
  constraint file_archives_file_id_same_workspace
    foreign key (tenant_id, file_id) references public.files (tenant_id, id) on delete cascade,
  -- Not a cascade: a disconnect clears the connection and leaves the copy known by its account.
  constraint file_archives_connection_id_same_workspace
    foreign key (tenant_id, connection_id) references public.source_connections (tenant_id, id)
    on delete set null (connection_id)
);

-- One shelf copy a file; one saved copy and one picked origin a file and an account.
create unique index if not exists file_archives_one_shelf_copy
  on public.file_archives (tenant_id, file_id) where origin = 'shelf';
create unique index if not exists file_archives_one_copy_an_account
  on public.file_archives (tenant_id, file_id, origin, google_account) where origin <> 'shelf';
create index if not exists file_archives_file on public.file_archives (tenant_id, file_id);
create index if not exists file_archives_connection
  on public.file_archives (tenant_id, connection_id) where connection_id is not null;

drop trigger if exists file_archives_set_updated_at on public.file_archives;
create trigger file_archives_set_updated_at
  before update on public.file_archives
  for each row execute function extensions.moddatetime('updated_at');

alter table public.file_archives enable row level security;
drop policy if exists file_archives_member_select on public.file_archives;
create policy file_archives_member_select on public.file_archives
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.file_archives from anon, authenticated;
grant select on public.file_archives to authenticated;
grant all on public.file_archives to service_role;

comment on table public.file_archives is
  'One copy of a Library file, a file and an origin (the archive PRD 1.1, 00683). saved: a copy the owner saved to their Google Drive on a press; it is theirs and is never read back. picked: the owner''s own Drive file a pick brought in. shelf: Chanlytics'' own copy. A video''s copy at the video platform may be let go only behind a checked shelf copy, a picked origin or a watched folder''s item. Its connection is cleared when the account is disconnected; the Google account stays, so the same account connected again finds it.';
comment on column public.file_archives.state is
  'saving: being sent. saved: every part is in place. checked: every part''s size and checksum are the ones that were sent. failed: a part could not be sent, or did not match twice. gone: checked once, and since found in a bin or missing.';
comment on column public.file_archives.why is
  'Why a copy failed or is gone, and null otherwise: drive_full, key_lost (Google no longer takes the key), other_account (another Google account is connected), mismatch (not the bytes that were sent), in_bin, not_found, folder_missing, refused.';

/* -------------------------------------------------------------------------------------- 4. the pieces of a copy -- */

create table if not exists public.file_archive_parts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  archive_id    uuid not null,
  part          text not null check (part = any (array['original', 'portrait', 'square', 'story', 'wide', 'video'])),
  -- Where the piece is: a file in the owner's Drive, or a key on Chanlytics' shelf. One of the two, never both.
  drive_file_id text check (char_length(drive_file_id) between 1 and 200),
  shelf_key     text check (char_length(shelf_key) between 1 and 500),
  bytes         bigint not null check (bytes >= 0),
  -- The whole file's checksum, as its place reports it: Drive gives an MD5, the shelf is held to a SHA-256.
  md5           text check (md5 ~ '^[0-9a-f]{32}$'),
  sha256        text check (sha256 ~ '^[0-9a-f]{64}$'),
  state         text not null default 'saving'
                  check (state = any (array['saving', 'saved', 'checked', 'failed', 'gone'])),
  checked_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint file_archive_parts_one_a_copy unique (archive_id, part),
  constraint file_archive_parts_one_place check (num_nonnulls(drive_file_id, shelf_key) = 1),
  -- Checked means compared: when, and against at least one whole checksum.
  constraint file_archive_parts_checked_shape
    check (state <> 'checked' or (checked_at is not null and num_nonnulls(md5, sha256) >= 1)),
  constraint file_archive_parts_archive_id_same_workspace
    foreign key (tenant_id, archive_id) references public.file_archives (tenant_id, id) on delete cascade
);

create index if not exists file_archive_parts_archive on public.file_archive_parts (tenant_id, archive_id);

drop trigger if exists file_archive_parts_set_updated_at on public.file_archive_parts;
create trigger file_archive_parts_set_updated_at
  before update on public.file_archive_parts
  for each row execute function extensions.moddatetime('updated_at');

alter table public.file_archive_parts enable row level security;
drop policy if exists file_archive_parts_member_select on public.file_archive_parts;
create policy file_archive_parts_member_select on public.file_archive_parts
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- A member reads what a sheet says of a piece and the owner's own Drive file ("Open in Google Drive"); never where a
-- piece sits on the shelf, nor a checksum.
revoke all on public.file_archive_parts from anon, authenticated;
grant select (id, tenant_id, archive_id, part, drive_file_id, bytes, state, checked_at, created_at, updated_at)
  on public.file_archive_parts to authenticated;
grant all on public.file_archive_parts to service_role;

comment on table public.file_archive_parts is
  'One piece of a copy of a Library file (the archive PRD 1.1, 00683): a photo''s or a picked file''s own bytes (original), a post''s four pictures (portrait, square, story, wide), or a video''s file (video). Where it is, its size and its whole checksum. A copy is checked when every piece is.';
comment on column public.file_archive_parts.shelf_key is
  'The piece''s key on Chanlytics'' own shelf. The service role''s alone: no member reads it.';
