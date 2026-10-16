-- 00452: the five old names go (decision 0060, S6). 00440 left a view under each while the code moved onto the sequence
-- tables; 00451 moved the last functions that read them, and nothing else does: no page, door, job or sweep (they read
-- sequence_* since 00440's TypeScript, and the clock and the claims since 00441's sequence_* doors). Ten functions those
-- doors replaced go first, since nothing calls them: the leads' clock's old readers (reach_out_claim_from,
-- _claim_drafts, _held_stale, _stale_sends, _queued_outcomes, _closed_sends, _unchecked; 00441 sequence_claim_from and
-- its kin), the moments' old due reader (playbooks_due; sequence_steps_due), and the retired cold lane's two
-- (reach_out_claim, reach_out_due_domains). Then the views, with no cascade: anything that still named one would stop
-- this migration rather than be dropped with it. Re-runnable.

set local lock_timeout = '3s';

drop function if exists public.reach_out_claim_from(uuid, integer, timestamptz, integer);
drop function if exists public.reach_out_claim_drafts(timestamptz, integer, uuid);
drop function if exists public.reach_out_held_stale(timestamptz, integer, uuid);
drop function if exists public.reach_out_stale_sends(timestamptz, integer, uuid);
drop function if exists public.reach_out_queued_outcomes(integer, uuid);
drop function if exists public.reach_out_closed_sends(timestamptz, integer, uuid);
drop function if exists public.reach_out_unchecked(integer, integer, integer, uuid);
drop function if exists public.playbooks_due(text, timestamptz, integer, integer, uuid);
drop function if exists public.reach_out_claim(uuid, integer, timestamptz, integer);
drop function if exists public.reach_out_due_domains(timestamptz, integer, uuid, uuid[], uuid[]);

drop view if exists public.reach_out_replies;
drop view if exists public.reach_out_sends;
drop view if exists public.broadcast_recipients;
drop view if exists public.broadcasts;
drop view if exists public.playbooks;
