-- The ledger names an export.
--
-- Erasure has always left a decision row; export -- everyone as a CSV, a
-- thread, a call, and since #425 the whole workspace -- left none, so "who
-- took a copy of the customer list, and when" was the one question about the
-- data the ledger could not answer. A verb for it, and a subject for the two
-- exports that carry everyone: the workspace itself, keyed by the tenant.
--
-- Written with `in (...)` because the schema-set generator parses only this
-- form; packages/contracts/src/schema-sets.generated.ts carries both lists.

alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation', 'contact', 'call', 'channel', 'broadcast', 'playbook', 'review', 'workspace'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook', 'reply_review', 'export'
  ));
