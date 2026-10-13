-- 00424 · A lead has one first email.
--
-- No lead is written to twice by a workspace (reach_out_why_not's "written", 00423): its audience leaves out a lead any
-- reach-out has a send for. That rule is read when a run is planned, and two reach-outs planned in the same minute (a
-- list's lead added to a second list's reach-out while the first one's run is being made) could each read it before the
-- other wrote. This index makes the second planner's send the one refused: one first-step send per lead, a send of a
-- run its owner skipped (run_canceled) or one taken back before it left (owner_took_back) aside, as the audience lets
-- those leads back in. reach_out_plan_run inserts with a bare on conflict do nothing (00423), so the refused send is
-- left out of its run, never the run's failure.
--
-- Built CONCURRENTLY, and alone in its file, as 00355 and 00414 are: reach_out_sends takes a write for every lead of
-- every run and every receipt, and is never locked for an index; an index made concurrently cannot share a transaction,
-- and the migration runner sends a file of several statements as one (database/migrations.test.mjs). Re-runnable; an
-- index left invalid by a build that was interrupted, or refused by a lead that already has two (none should: the
-- audience has refused a written lead since 00184), is dropped by hand and the file run again (docs/runbook.md).

create unique index concurrently if not exists reach_out_sends_one_first on public.reach_out_sends (tenant_id, lead_id) where playbook_id = root_id and not (state = 'skipped' and reason in ('run_canceled', 'owner_took_back'));
