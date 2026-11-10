-- 00605 · The texts sweep hands out a job a workspace (decision 0115).
--
-- The texts sweep (00594) read every line's record from Twilio inside one tick, oldest line first, until forty seconds
-- had gone: about a hundred lines, and the newest past that never read. Now its clock finds the workspaces with a line
-- that texts and hands each one a job, and the ledger gives that work its turn, its retries and Health, as the calendar's
-- and Google's clocks do (00569).
--
--   job_kinds   texts_read, in the bulk lane, once per workspace while one waits or runs. A recovered text is knocked on
--               the door again, which keeps it and asks its answer as its own job in the reply lane.
--
-- The clock (sms_sweep_texts) and its door (/api/cron/texts) stay; the door hands out instead of reading.
--
-- Deploy order: this migration first. The new edge hands out a kind the ledger refuses without its row; the old edge
-- never names it. Re-runnable.

set local lock_timeout = '3s';

insert into public.job_kinds (kind, lane, once_parts, once_kept) values
  ('texts_read', 2, array['@tenant'], false)
on conflict (kind) do update
  set lane = excluded.lane, once_parts = excluded.once_parts, once_kept = excluded.once_kept;
