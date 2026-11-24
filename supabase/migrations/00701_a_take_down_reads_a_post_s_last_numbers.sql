-- 00701 · A take-down reads a post's last numbers first (the content loop PRD v3.6, sections 8.3 and 9.1).
--
-- A post's numbers end with the post. Once it is deleted, or a story has run its day, Meta answers for them as for
-- nothing at all (code 100, subcode 33), and sends nothing by itself: what was not read before can never be read
-- (the first-post sitting, 23 November 2026). So a take-down reads them just before it asks the place, and before a
-- step it leaves to the owner, who deletes the post by hand next.
--
--   post_observations         One step more, `last`: the reading a take-down took, beside the clock's an hour, a day,
--                             3, 7 and 28 days. Kept by post_observations_keep as every read is, written over by a
--                             take-down asked again. The piece shows a post's newest reading, so after a take-down it
--                             shows this one.
--
-- post_observations_due is not touched: it names the clock's steps itself, and never asks for `last`.
--
-- Locks: the step check is re-made on post_observations (a brief ACCESS EXCLUSIVE, and a read of its rows to hold them
-- to it: nine a read). Three seconds and no more. Re-runnable. Deploy order: this file first, then the code: the edge
-- before it never writes `last`; the edge after it writes `last`, which only this check lets in.

set local lock_timeout = '3s';

alter table public.post_observations drop constraint if exists post_observations_step_check;
alter table public.post_observations add constraint post_observations_step_check
  check (step = any (array['1h', '1d', '3d', '7d', '28d', 'last']));

comment on table public.post_observations is
  'A post''s numbers as its place gave them (00699; the content loop PRD''s 5.3 and 9.1): one row per number per read, at an hour, a day, 3, 7 and 28 days after it went up, and at `last`, read by a take-down just before it asks the place (00701; 8.3), since a post''s numbers end with it. Each is a running total since it went up; a day''s change is two reads apart. availability says why a number is missing (unsupported, delayed, failed, or withheld: a story too few saw), and a missing number is never zero. Written by post_observations_keep alone; members read.';
