-- 00609 · One first email a lead a round (decision 0120, D6; 00608).
--
-- sequence_sends_one_first (00427) held one first email a lead for good. A business that never answered may now be tried
-- again once, a round of its own (sequence_sends.round), so the rule is one first email a lead a round: this builds it,
-- and 00610 drops the old one. Built CONCURRENTLY, and alone in its file, as 00427 was: sequence_sends takes a write for
-- every lead of every run and every receipt, and is never locked for an index; an index made concurrently cannot share a
-- transaction, and the migration runner sends a file of several statements as one. Re-runnable; an index left invalid by
-- a build that was interrupted is dropped by hand and the file run again (docs/runbook.md).
--
-- Deploy order: after 00608, whose column it reads.

create unique index concurrently if not exists sequence_sends_one_first_a_round on public.sequence_sends (tenant_id, lead_id, round) where lead_id is not null and step_id = sequence_id and not (state = 'skipped' and reason in ('run_canceled', 'owner_took_back', 'moved'));
