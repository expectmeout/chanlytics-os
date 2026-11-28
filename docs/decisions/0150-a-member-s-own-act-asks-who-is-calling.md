# 0150 · A member's own act asks who is calling: the dashboard keeps the service role only where no member may act

**Status:** Decided and built, 25 November 2026, on one branch (lane 2 of the code refinement plan, "least privilege and
one writer", which Ruben asked for on 25 November: one standard, unneeded code removed, nothing of his own part). One
migration, 00717. Written against main at `421be6183a`. Builds on 0111 (the data layer holds the data) and on layer 11's
reading of 9 November 2026.

## Context

At `421be6183a` the dashboard took the service-role client, the key that opens every table with row-level security off,
in 108 places in 65 modules (the `service-role` measure). Each place fenced its workspace by hand. Most were a member's
own read or act that only the service role could reach: a door granted to the service role alone (a form request held,
a thread's hold, a month's count), a column a member could not read (how a piece was made), or a write to a table no
session may write (the events and jobs ledgers, storage). 19 statements still named a table outside `packages/db`, and 5
database answers were dropped unread.

A session client and a member-callable door are both reachable from a browser directly (the anon key and the person's own
token). So neither may do anything the route's checks were standing in front of.

## Decision

1. **A member's read or act goes on the member's session where a policy already lets them**, or through a SQL door that
   asks who is calling, in the house's form (SECURITY DEFINER, `auth.uid()`, `may_read_workspace`, `is_acting_member` or
   `caller_has_permission` with the workspace's own id, refused with 42501). The service role (the edge, a deploy from
   before) and a session of the database itself (a clock, a migration) are let through as before; only an API session
   with no person in it is refused (28000). 00717 makes twelve such doors and grants members `files.made`.
2. **A door that takes what the route worked out or checked first stays the service role's**: `reach_out_save` (the
   chain's checks), `reach_out_reply_said` (the plan the dashboard made), `assemble_broadcast`, `create_message_version`,
   `file_found` and `file_made` (bytes the server proved). `tests/database/privileges.db.test.mjs` names the first four.
3. **The ledgers and storage are one seam each** in `apps/dashboard/src/server/shared/`: `ledgers/events.ts` (no session
   inserts into `events`), `ledgers/jobs.ts` (none writes `jobs`) and `storage.ts` (no policy on `storage.objects` lets a
   session write). A call site names its kind or its bucket and never holds the client. Each event write belongs in the
   door of the change it records (0031, invariant 2), and leaves the seam as that door is written.
4. **Every module that keeps the service role is named with why**, in `tests/repo/data/_data.mjs` (`SERVICE_ROLE_KEPT`),
   held both ways by `tests/repo/data/data.test.mjs`; a module whose reaches share one reason takes the client once, under
   a name that says it. The count stays the `service-role` measure's, which may only fall.
5. **Statements live in `packages/db`.** A person's page, the Inbox's list, the push sender and the steer door read
   through repositories; a failed read is raised (`DbFailure`) or logged where the work goes on (`dbLogAndGoOn`).

## Shape

- 00717: `campaign_month_sent`, `reach_out_month_sent`, `source_files_tally`, `reach_out_drafts_waiting` (a member names
  their workspace; every workspace at once stays the service role's), `reach_out_again_count`,
  `lead_addresses_suppressed`, `mailbox_capacity` and `mailbox_connection_counts` read for a member of the workspace;
  `form_entry_hold`, `form_entry_let_through`, `conversation_set_aside` and `claim_conversation_control` (a person's own
  hold alone) act for a member who acts. Each keeps its body; the six written in SQL are written in plpgsql to ask first.
- The measures at the branch's head: service-role reaches 108 in 65 modules → 40 in 35; table names outside
  `packages/db` 19 → 0; dropped database answers 5 → 0; personal columns with no erasure strategy 3 → 2 (`plan_slots.words`
  follows its workspace, as the slot's other words do).

## Steps

Either deploy order works for the two apps. The migration goes on first (the coordinator applies it before the merge):
a dashboard still calling with the service role passes as the service role, and the new one needs the doors to take a
member.

## Tests

`tests/repo/data/data.test.mjs` (the kept list); the doors proved on PGlite as an owner, an operator, a viewer, a stranger,
nobody, a session with no person, a session of the database itself and the service role
(`dev-tools/db-without-docker/example-doors-least-privilege.mjs`, 91 checks, red on main);
`tests/database/privileges.db.test.mjs` on the engine; the readers', the posts' and the leads' tests read what the member's
session reads.

## Risks

A member may now call these twelve doors from a browser. Each asks the same role its routes ask, and answers only about
the caller's own workspace; none takes a value the route worked out.

## Open questions

- `messages.body` and `messages.template_vars` stay counted with no strategy, on Ruben's word of 6 October 2026 (a
  message is immutable by trigger, 00326, until an exception is costed): his call.
- What is left in `SERVICE_ROLE_KEPT` under "a write a member's role allows but no door takes yet" (a held booking notice
  dismissed, the slots a week's approval left out, the stop, a morning's line, a post's move) falls as each change gets
  its door with its event, the work of lane 9 ("every change leaves one event").
- 27 November 2026, 00724: `ledgers/events.ts` left with its last callers' doors (the workspace's name, zone and word
  for a booking through `workspace_own_fields_write`, a first search's milestone in the search doors), and the two reads
  a member's session was refused got theirs (`ask_mornings_seen`, `workspace_model_standing`): 35 reaches in 32 modules
  to 32 in 29. What is kept is what no member may do from a browser; the settings as stored stay the server's, since
  the calendar feed's link they hold opens the owner's calendar. The same day, a post's placement found for its
  take-down from Google moved to the member's session (posts_member_select): 31 in 29. What is left is argued in
  `SERVICE_ROLE_KEPT`: a broadcast's holds past the month's allowance stay a second write after the run, whose update
  the run's triggers read (a run every person of which left is ended, an enrolment moves), and a member's reply keeps its
  send job the server's, its destination and words the route's.

## Amended 28 November 2026: every door is called as the wrong person (00733)

The decision's first point was held by reading each door's text (`tests/database/privileges.db.test.mjs`: a door asks
who is calling, and a door that names a workspace asks about that workspace). Since 28 November every function a
signed-in person may execute is also called (`tests/database/doors/`): as nobody signed in, a session with no person in
it, another workspace's owner, a viewer, an operator, a partner with and without the second step, and the owner, each in
its own savepoint on rows seeded for it, the list read from the database's own grants. What a call is held to is said in
`tests/database/doors/_walk.mjs`; `tests/database/doors/every-door-is-walked.test.mjs` fails, with no database, a door
that takes an id the walk has no row for.

The first run found five doors that answered otherwise than this decision says, and 00733 re-makes each from its newest
body with the one check added: `set_marketing_consent`, `set_person_email` and `lead_allowance` took a signed-in role
that names no person as they take the service role, `lead_search_widens` answered it, and `member_view_set` kept a
partner's saved view on a password alone where `member_push_off_set` asks for the second step. No sign-in issues a
token for the session role without a person, so no browser could make the first four calls.
