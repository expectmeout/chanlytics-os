-- A whisper is its own decision, on a call.
--
-- The phone provider offers exactly one control over a hosted agent's live
-- call: a sentence injected into its context that only the agent hears and
-- works into its next answer (update-live-call). The dashboard now offers it
-- from the Live page. It changes what a customer is told, by a person, in the
-- middle of a call — which is the definition of a decision this ledger exists
-- to keep. The words are the operator's own and ride in the payload.
--
-- Subject 'call' is new too: nothing in the ledger had ever pointed at a call.
--
-- packages/contracts/src/enums.ts carries the same lists, and
-- tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.
-- Written with `in (...)` because that guard parses only this form.

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper'
  ));
