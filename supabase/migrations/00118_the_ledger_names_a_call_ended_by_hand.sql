-- The ledger names a call ended by hand.
--
-- The Live page can end a call in progress (POST /v2/stop-call at the
-- provider), so the ledger needs a word for it: who cut a customer off, and
-- when, is exactly the question the ledger exists to answer. Passing a call
-- to the business is recorded as take_over, the verb the Inbox already uses
-- for the same intent on a thread.
--
-- Written with `in (...)` because the schema-set generator parses only this
-- form; packages/contracts/src/schema-sets.generated.ts carries the list.

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook', 'reply_review', 'export', 'end_call'
  ));
