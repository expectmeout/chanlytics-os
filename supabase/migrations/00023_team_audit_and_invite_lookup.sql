-- Two things a workspace could not answer: "who changed this person's role?"
-- and "why did my invitation never arrive?".
--
-- 1. THE AUDIT GAP. `decisions` records every conversation verb — who took a
--    thread over, who cancelled a send, who resolved an escalation. It records
--    nothing about the team, which is the one table where "who did this" is
--    hardest to reconstruct afterwards and matters most: promoting someone to
--    owner hands them billing, the ability to remove everyone else, and the
--    receptionist's voice. Both CHECK constraints are widened rather than a
--    second audit table being introduced — one ledger, one shape, one place to
--    look.
--
-- 2. THE STRANDED INVITE. acceptOpenInvites() runs a lookup by email across
--    tenants, and the only index on invitations is
--    (tenant_id, lower(email)) — email is the SECOND column, so it cannot
--    serve that query. It has been a sequential scan, tolerable only because
--    it ran once per account, on first sign-in.
--
--    That changes in this release: the route stops gating acceptance on the
--    caller having zero memberships. It had to stop, because self-serve
--    workspace creation now makes the stranded case ordinary — someone
--    invited before they had an account, who then signs up and creates their
--    own workspace, has a membership by the time the invitation is looked at,
--    and the invitation would never be honoured. Nobody is told. The invite
--    just sits there, and the owner who sent it sees "pending" forever.
--
--    So it now runs on every workspace read, and needs an index that fits.

/* -------------------------------------------------- the team audit trail -- */

-- Written as `check (col in (...))`, not `= any (array[...])`, although the two
-- are identical to Postgres. enums-vs-checks.test.mjs scans the migrations for
-- the LAST `check (col in (...))` and compares it to the contracts enum — three
-- parallel copies of these lists exist and that test is what keeps them in
-- step. The other syntax parses fine and is invisible to it, so the guard would
-- go on comparing the OLD constraint to the NEW enum and fail for the wrong
-- reason. It caught exactly that, which is the test working.
alter table public.decisions drop constraint if exists decisions_subject_type_check;
alter table public.decisions add constraint decisions_subject_type_check
  check (subject_type in (
    'conversation', 'escalation', 'draft', 'lead', 'message', 'agent',
    'membership', 'invitation'
  ));

alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member'
  ));

/* --------------------------------------------- the open-invite lookup ----- */

-- Partial, because an accepted or revoked invitation is never looked up this
-- way — the index stays small no matter how many invitations accumulate.
-- `email` alone is the leading column, which is what the cross-tenant lookup
-- needs and what the existing unique index cannot provide.
--
-- Emails are lowercased by the invite route before they are stored, so a plain
-- column index is correct here; a lower(email) expression index would silently
-- stop matching the `.eq("email", …)` filter the reader uses.
create index if not exists invitations_open_by_email
  on public.invitations (email)
  where accepted_at is null and revoked_at is null;

comment on index public.invitations_open_by_email is
  'Serves acceptOpenInvites'' cross-tenant lookup, which now runs on every workspace read.';
