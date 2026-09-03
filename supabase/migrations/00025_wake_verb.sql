-- "Wake now" is its own decision, and until now it borrowed hand_back's.
--
-- Waking a snoozed thread was wired to the hand-back verb, which does two
-- things this does not mean: it resolves the open escalation and it gives the
-- conversation back to the receptionist. So an operator pulling a thread
-- forward — the gesture that says "actually, deal with this now" — discarded
-- the very request they were pulling forward, and the thread returned to the
-- queue as "Handled". Snoozing had the same defect and is fixed alongside
-- this; both are pointless if the only way back also erases the reason.
--
-- Waking is therefore its own verb: the snooze ends, the thread returns to the
-- queue exactly as it was, and the ledger records what the operator actually
-- did rather than something adjacent to it.
--
-- packages/contracts/src/enums.ts carries the same list, and
-- tooling/scripts/tests/enums-vs-checks.test.mjs fails if the two drift.
-- Written with `in (...)` because that guard parses only this form.

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member'
  ));
