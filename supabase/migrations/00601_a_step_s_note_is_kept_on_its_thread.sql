-- 00601 · A step's note is kept on its thread (decision 0120, D7).
--
-- A reply read as "not now" leaves a step to write again on the day they named, and one read as "wrong person" a step to
-- write to whom they named. The reply's own job now writes the note each step arrives with, on its day (contracts
-- readingPlan's `ahead`, core readReply's stage "ahead"), and keeps it on the person's thread as a draft of its own kind,
-- `step`: the step it was written for and whom it is to ride in its words, and its edition (contracts STEP_NOTE_RULES) is
-- its own, so a page that knows only replies and briefs reads none of it as the thread's reply. It is text: nothing
-- sends it but a person, from the step. Nothing else in the table changes.
--
-- Deploy order: either. Before this, the job's keep is refused by the check, and the step stands as it always did.
-- Re-runnable.

set local lock_timeout = '3s';

alter table public.conversation_drafts drop constraint if exists conversation_drafts_kind_check;
alter table public.conversation_drafts add constraint conversation_drafts_kind_check
  check (kind = any (array['reply'::text, 'brief'::text, 'step'::text]));
