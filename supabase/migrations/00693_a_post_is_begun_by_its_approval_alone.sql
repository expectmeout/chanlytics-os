-- 00693 · A post is begun by its approval alone (the content loop PRD, section 16.2: "left for later, on purpose").
--
-- Since 00681 the press that approves a post is post_approve: it keeps the snapshot the owner saw and the post is
-- checked against it right before it is sent. The door before it, post_begin (00611, re-made by 00616, 00620 and
-- 00665), was left in the database for a dashboard one deploy behind. That code is gone: the new press has been live
-- since 22 November 2026, and nothing in the repository calls the old door. While it stood, someone who may approve
-- could still call it by hand and begin a post with no approval and none of the new checks.
--
--   post_begin                Dropped, by its one signature. No function, trigger, policy or view names it.
--
-- Nothing else changes: the posts it began are rows like any other, and Don't post, Change time, the send and its
-- recheck never asked which door began a post. Locks: none on a table. Three seconds and no more. Re-runnable.
-- Deploy order: the code first, which it has been since #2512 (22 November 2026); this file at any time after.

set local lock_timeout = '3s';

drop function if exists public.post_begin(uuid, uuid, text, text, text, timestamptz, text);
