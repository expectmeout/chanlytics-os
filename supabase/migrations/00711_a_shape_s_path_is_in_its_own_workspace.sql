-- 00711 · A shape's path is in its own file's folder, in its own workspace (the outside audit of c6cf732bb8, 4.6).
--
-- post_approve and piece_posts_replace are a member's doors (00681, 00708): a member with the settings permission may
-- call them directly, and they keep each shape's path as the call names it. The edge sends the bytes at that path, signed
-- with the service role (instagram/post-ready.ts mediaLinkOf, google/post-later.ts), so a path into another workspace's
-- folder would send that workspace's picture or video from this one's account. The dashboard never names one: every shape
-- it keeps is `<workspace>/<file>/<name>` (contracts postPathOf, fileMadePathOf; posts/make.ts googlePicturePathOf), and
-- so is the one the edge keeps for a new version (00708 piece_version_kept).
--
--   piece_renditions          A check: the path is the row's own workspace, then its own file, then one name. The
--                             doors are not re-made; the check holds every writer of the table, now and later.
--
-- Production held no shape when this was written (24 Nov 2026: 0 rows), so the check is validated as it is added.
--
-- Locks: the check is added to piece_renditions (a brief ACCESS EXCLUSIVE, and a read of its rows to hold them to it).
-- Three seconds and no more. Re-runnable. Deploy order: either. No build has ever written a path this refuses.

set local lock_timeout = '3s';

alter table public.piece_renditions drop constraint if exists piece_renditions_path_in_its_folder;
alter table public.piece_renditions add constraint piece_renditions_path_in_its_folder
  check (path ~ ('^' || tenant_id::text || '/' || file_id::text || '/[^/]+$'));

comment on table public.piece_renditions is
  'One shape of a piece''s version as it is sent (00681; the content loop PRD''s 5.3, 11): its made file, the path of its bytes in the file''s folder and their full SHA-256, read when the row was written. The path is `<tenant_id>/<file_id>/<name>`, its own workspace and file (00711, piece_renditions_path_in_its_folder): the edge signs it with the service role, so a path a member''s call names never reaches another workspace''s bytes. Never changed once written; a version''s shapes are the newest drawn at or before it. Members read; post_approve writes.';
