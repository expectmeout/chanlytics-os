# 0003 · Team assignment

**Status:** decided, not built. Written against commit `b729bdf`, and verified
against the code at it, with the working tree as it stood. Where this note and
the code disagree, the code wins.

## Context

### Three roles, and none of them is about a thread

`ROLE_PERMS` (`packages/contracts/src/config.ts:21-34`) has owner, operator and
viewer, and eight permissions: `approve`, `autonomy`, `disconnect`, `billing`,
`team`, `settings`, `export`, `find`. Operators get `approve` and `autonomy`;
viewers get nothing. None of the eight says anything about *which* threads a
member works. That is the gap this note fills, and it is a gap in the product,
not in the permission model: assignment is about people, and the Autonomy
matrix (`POLICY_CLASSES`, `config.ts:38`) is about the machine. Nothing here
touches the second.

### `assignee_user_id` is a side effect, never a verb

The column is written by four ports and read by several surfaces, and there is
no route whose purpose is to set it. In
`apps/dashboard/src/server/core-ports.ts`:

`claim` (`:30`) sets `state: "needs_human"`, `paused_until`, `snooze_until:
null` and `assignee_user_id: userId` — the take-over path; `release` (`:31`),
`snooze` (`:32`) and `archive` (`:34`) each clear it; and the reply path
(`:108`) sets it too, so answering a thread claims it.

`takeOver` (`packages/core/src/conversations/take-over.ts:19-41`) calls
`claim`, then takes the **live control** hold — a separate fact — for at most
`PERSON_CONTROL_MAX_S`, a day (`:15`), then withdraws the receptionist's held
drafts. `handBack` (`hand-back.ts:7-23`) calls `release`, lets the hold go, and
resolves the open escalation.

### 00132 named the defect, and closed most of it

**Correction to the brief.** `00132_a_thread_says_who_is_speaking_now.sql` does
not only *record* that assignment never cleared — it fixes two of the three
cases:

- `clear_control_of_departed_member()` (`:226-239`) clears `assignee_user_id`
  for every thread a removed member held, and their live hold with it, fired by
  `memberships_clear_control` on `after delete on memberships` (`:246-249`).
  Its comment: *"A member removed from a workspace stops being responsible for
  its threads and stops holding any."*
- `expire_stale_pauses()` (`:192-220`) clears `assignee_user_id` alongside the
  pause, for a `needs_human` thread whose `paused_until` has passed **and**
  which has no open escalation (`:204-217`).

What remains open is the case take-over deliberately creates: a claim whose
escalation stays open on purpose (`take-over.ts:18`), so the sweeper's `not
exists (... escalations ... state = 'open')` never matches it. That thread
keeps its assignee until a person hands it back, and nothing in the product
lists it as somebody's.

The migration also states the model this note builds on (`00132:14-25`):
**responsibility** (`assignee_user_id`, which may outlive an exchange), **live
control** (`control_kind` / `control_by` / `control_until`, claimed atomically
by `claim_conversation_control`, `:83-149`, released by
`release_conversation_control`, `:158-181`), and **automation permission**, a
policy answer. Assignment is the first of the three, and only the first.

### There are no assign, release or claim verbs

`apps/dashboard/app/api/v1/conversations/[id]/` holds `archive`, `export`,
`hand-back`, `reply`, `snooze`, `take-over`, `wake` and the row read.
`tooling/scripts/tests/route-policy.json` — **not** under
`apps/dashboard/src/server/`, as the brief has it — pins 148 routes, nine of
them conversation routes: three reads, and six writes that are all
`{"scope":"row","role":"operator"}` on `rate: "thread_state"`, except `reply`
on `rate: "reply"`.

### The Inbox has no per-member queue, but the vocabulary exists

`GET /api/v1/conversations` (`apps/dashboard/app/api/v1/conversations/route.ts`)
takes one query parameter, `ids`, and otherwise reads *"the hundred most recent
conversations of the workspace"* (`:24-25`) ordered by `last_message_at`. There
is no scope, no filter, no assignee predicate.
`apps/dashboard/src/legacy-bridge/inbox-verbs.ts` (543 lines) names `assignee`
nowhere.

What *does* exist is the word for it. `standingOf`
(`packages/contracts/src/standing.ts:45-61`) already answers `needs_you |
yours | theirs | snoozed | quiet` from the state, the pause, the assignee and
`assignee_is_me`, which `apps/dashboard/src/server/dto.ts:152` computes per
request; `packages/contracts/src/viewmodels.ts:655-663` reads it for every
Inbox thread. Today reads it too and filters *away* anything held: its
escalation list keeps only `standing === "needs_you"`
(`packages/contracts/src/today.ts:696-703`), and the "waiting with nothing
back" list only `quiet` or `needs_you` (`:794-802`). Today shows *unheld* work,
by design, and there is nowhere to see your own.

### Notifications are addressed to the workspace

`NotificationsConfigSchema` (`packages/contracts/src/config.ts:543-549`) is
`escalation_emails`, an array of one to ten addresses, plus an optional `from`.
`apps/edge/lib/notify.ts` takes a `NotifyTarget` of
`{ tenantId, notifications, isEnvDefault }` (`:36-44`) and mails all of them;
a workspace it cannot address gets a redacted platform note instead (`:20-23`).
Nothing anywhere maps a member to an address.

The bell is the same: `notifications` (`00057_notifications.sql:14-30`) is a
workspace row every member reads, with per-member `notification_reads`
(`:34-43`) and `notification_marks` (`:45-50`) for what each has seen. So the
*read* state is already per member and the *addressing* is not.

### The deadman sweep does not know about holders

`deadman_candidates` (`supabase/migrations/00018_deadman_watchdog.sql:45-68`)
selects open escalations older than two hours with `deadman_alerted_at is
null`, joined to the conversation and the contact. There is **no assignee
predicate**. `apps/edge/api/cron/deadman.ts:115-129` then mails the workspace's
addresses *"Still waiting: a customer has had no answer for N hours"*, and
stamps the escalation only if the mail was delivered (`:135`, `:156`). So a
thread a teammate took over two hours ago and is still working produces the
same alarm, in the same words, to the same people, as one nobody has touched.

### The ledger

`decisions` (`00004_inbox.sql:28-42`) carries `subject_type`, `subject_id`,
`verb`, `actor_type`, `actor_user_id`, `payload` and `undo_of`. The verb set
was last widened in `00118_the_ledger_names_a_call_ended_by_hand.sql:12-20`
(28 verbs, including `take_over` and `hand_back`); the subject set in
`00114_the_ledger_names_an_export.sql:12-17` (15 subjects, `conversation`
among them). `DECISION_VERBS` and `DECISION_SUBJECTS`
(`packages/contracts/src/enums.ts:389`, `:391-397`) are the hand-kept copies.

## Decision

Three verbs in `packages/core/src/conversations/`, over the existing
`ThreadPorts`, each declared with `route()` like every other conversation verb:

- **assign** — give the thread to a named member. Does **not** pause the
  receptionist and does **not** take live control. Responsibility is not
  control; that distinction is 00132's, and this note keeps it.
- **release** — give it back to the queue. Clears the assignee and nothing
  else.
- **claim** — assign it to yourself. The same verb as assign with the caller as
  the target, kept separate because it is a different permission question: a
  member may always claim, and assigning *somebody else* is a different act.

Each records a `decisions` row, so "who gave me this" has an answer.

**A "mine" scope in the Inbox and on Today.** `GET /api/v1/conversations` gains
`scope: "all" | "mine" | "unassigned"`, defaulting to `all` so no deployed
client changes. `standingOf` needs no change: `yours` and `theirs` are already
the words. Today gains one section, *Yours*, beside the queue — and the queue
itself keeps filtering to `needs_you`, because "nobody has this" is what a
queue is for.

**Per-member notification routing.** A member who holds a thread is the one
told when it needs them; the workspace addresses are the fallback, and the only
route when nobody holds it. The address comes from the account, not a second
copy in config. `escalation_emails` is untouched, so a workspace that never
assigns anything behaves exactly as today.

**The deadman sweep learns the difference.** An assigned thread is not
unattended, but it is not answered either. So `deadman_candidates` returns the
assignee, the sweep tells **that person first** and the workspace only after a
second window, and a thread whose holder has been idle past that window is
reported in different words — *"X took this on N hours ago and the customer has
had no answer"* — because it is a different problem. The stamping rule does not
change: only a delivered warning earns the guard (`deadman.ts:131-136`).

**Membership removal already works** (`00132:226-249`) and needs nothing. The
new verbs must not add a second place that has to remember it: assignment stays
on `conversations.assignee_user_id`, which that trigger already clears.

**Routing rules are a later step, sketched only.** Round robin, by channel, by
language: an `assignment_rules` row per workspace, evaluated once at the moment
a thread first needs a person, writing the same assignee the verbs write and
recording a `decisions` row with `actor_type: "system"`. It changes nothing
about the verbs; it is a writer of them.

## Shape

```ts
// packages/core/src/conversations/assign.ts
export type AssignPorts = Pick<ThreadPorts, "assign" | "record" | "now"> & {
  /** May this user hold a thread here? A viewer may not: they change nothing
   *  (ROLE_PERMS, config.ts:21-34). */
  canHold(tenantId: string, userId: string): Promise<boolean>;
};
export interface AssignResult { assignee_user_id: string; decision_id: string }

/** Give the thread to a member. Responsibility only: no pause, no live control. */
export async function assign(ports: AssignPorts, cmd: {
  conv: Pick<Thread, "id" | "tenant_id">; toUserId: string; byUserId: string;
}): Promise<AssignResult>;

/** Give it back to the queue. Clears the assignee and nothing else. */
export async function release(ports: Pick<ThreadPorts, "unassign" | "record">, cmd: {
  conv: Pick<Thread, "id" | "tenant_id">; userId: string;
}): Promise<{ decision_id: string }>;

/** Assign it to yourself: assign() with the caller as the target. */
export async function claim(ports: AssignPorts, cmd: {
  conv: Pick<Thread, "id" | "tenant_id">; userId: string;
}): Promise<AssignResult>;

// added to ThreadPorts (packages/core/src/conversations/ports.ts:23-54), in its
// house style: named for meaning, answering "true iff a row changed".
  /** assignee_user_id set; state, pause and snooze untouched. */
  assign(conversationId: string, userId: string): Promise<boolean>;
  /** assignee_user_id cleared; nothing else. */
  unassign(conversationId: string): Promise<boolean>;
```

The adapter, in `apps/dashboard/src/server/core-ports.ts` beside its neighbours
at `:30-34` — every UPDATE naming its columns in full, because
`hygiene.test.mjs` holds them to the session role's grants and `00132:78-80`
grants `authenticated` exactly `state, paused_until, snooze_until,
assignee_user_id, last_message_at`:

```ts
  assign: (id, userId) => changed(ctx.supabase.from("conversations")
    .update({ assignee_user_id: userId }).eq("id", id).select("id")),
  unassign: (id) => changed(ctx.supabase.from("conversations")
    .update({ assignee_user_id: null }).eq("id", id).select("id")),
```

The routes, as `route-policy.json` will pin them, and the ledger they write:

```
POST conversations/[id]/assign   {"kind":"write","scope":"row","role":"operator","rate":"thread_state","spend":false}
POST conversations/[id]/release  {"kind":"write","scope":"row","role":"operator","rate":"thread_state","spend":false}
POST conversations/[id]/claim    {"kind":"write","scope":"row","role":"operator","rate":"thread_state","spend":false}
```
```sql
alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in ( ...00118's twenty-eight..., 'assign', 'unassign' ));
```

`claim` records `assign` with the actor as the target; the payload carries
`{ to_user_id, previous_user_id, by: "self" | "other" | "rule" }`, which is what
makes a later routing rule legible in Activity. That later shape, sketched only:

```sql
create table public.assignment_rules (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  kind      text not null check (kind in ('round_robin','by_channel','by_language')),
  -- round_robin: the member ids in order and where the pointer is;
  -- by_channel / by_language: a map from the key to a member id.
  config    jsonb not null default '{}'::jsonb,
  enabled   boolean not null default false
);
```


## Steps

The README rule governs every step: the two apps deploy independently, so each
must be correct whichever goes first.

**1 · The verbs and the ports.** `assign`, `release`, `claim` in
`packages/core/src/conversations/`, the two ports, the adapter, the three
routes, the `route-policy.json` entries and the `decisions` verb migration —
which ships **first and alone**, because a `decisions` row with an unknown verb
is refused by the CHECK. *Both orders:* the edge writes no `assign` row, and an
older dashboard does not call the new routes.

**2 · The "mine" scope.** `GET /api/v1/conversations` gains `scope`, defaulting
to `all`, and a filter in the Inbox that sets it — branching inside the
existing components the way `XReal`/`XSeed` does. *Both orders:* a default that
means "what it does today" keeps an older client safe against a newer server,
and this is one app, so the server half ships first.

**3 · Today gains *Yours*.** One section, built from the same `standingOf`
verdict the queue already computes (`today.ts:696-703`). The queue's own filter
does not change. *Both orders:* a view-model change inside one app.

**4 · The deadman sweep learns the holder.** `deadman_candidates` returns
`assignee_user_id`; the sweep addresses it first and the workspace after a
second window, in its own words. *Both orders:* the function's new output
column is additive, so an older edge ignoring it behaves as today. SQL first.

**5 · Per-member notification routing.** The member's own address, from the
account, with `escalation_emails` as the fallback and as the only route for an
unheld thread. This is the step that sends mail to a new address, so it ships
behind a workspace setting that is off by default.

**6 · Routing rules.** The table, one rule kind (`round_robin`), and one
writer: the moment a thread first needs a person. A `decisions` row per
assignment with `actor_type: "system"`.

## Tests

**Convert.** `tooling/scripts/tests/standing.test.mjs` and the Inbox view-model
suites already pin `standingOf`'s five verdicts; they need no change, and are
why steps 2 and 3 add no new rule. Any test asserting that the conversations
list takes only `ids` becomes a test of the `scope` default instead.

**Keep meaningful.** `tooling/scripts/tests/route-policy.test.mjs` compares
every route's declaration against `route-policy.json`; the three new rows are
the review artifact for "who may assign a thread", and that file's own note
says a change there *"is a change to who may do what, how often, and on which
workspace: review it as one"*.

**New.**
- `assign.test.mjs`: the three verbs over ports in memory, including the two
  things that must hold for each — a viewer is refused before anything is
  written, and a verb that changed no row wrote no decision.
- `assignment.db.test.mjs`: removing a membership clears the assignee (the
  `memberships_clear_control` trigger, `00132:246-249`) — a proof this note
  *depends* on and does not add.
- `deadman-holder.test.mjs`: an assigned thread inside the second window tells
  the holder and not the workspace; past it, both, in the holder's words.

## Risks

- **Two facts that look alike.** `assignee_user_id` (responsibility) and
  `control_by` (who is speaking now) are distinct, and that is the whole point
  of 00132. An assign verb that quietly took control too would undo it in one
  line, so assign never touches `control_*`; take-over goes on doing both.
- **The wire must go on reading control, not the assignee.** It already does:
  `WireFacts.control` is documented as *"Not `assignee_user_id`, which says who
  is responsible and may outlive the exchange — reading that as a live hold is
  how a thread taken over and never handed back refused the receptionist's
  drafts for ever"* (`packages/core/src/deliver.ts:181-190`, reading
  `control_kind, control_until` at `:208`). Assignment writes the assignee on
  threads the receptionist was never paused on, so the day that separation is
  undone, every assigned thread silently loses its veto window.
- **The alarm that cries wolf.** Step 4 doubles the number of deadman mails on
  a workspace where everything is assigned. The second window has to be long
  enough that it never fires on ordinary work.
- **Mail to a new address.** Step 5 sends a customer's words to an address the
  workspace's config never listed. It ships off by default for that reason.
- **Round robin invites a fairness argument** the product cannot win. It is
  step 6, sketched only, on purpose.

## Open questions for the owner

1. **May an operator assign to somebody else, or only claim?** This note says
   both, at `role: "operator"`. The alternative — assign is owner-only, claim
   is everyone's — is defensible and is a one-word change in the route.
2. **Does assigning pause the receptionist?** This note says no: that is what
   take-over is for. But an owner who assigns a thread probably expects the
   machine to stop, and the two readings produce very different products.
3. **Does a thread with an assignee still appear in the shared queue?** Today
   filters `theirs` out (`today.ts:696-703`). If assignment becomes common the
   queue empties, and the work is invisible to everyone but its holder.
4. **What happens to an assignment when the customer writes again?**
   `ingest_inbound` reopens an archived or snoozed thread
   (`00110_a_texted_answer_keeps_its_evidence.sql:226-235`) and touches nothing
   else. Should a new message wake the assignment, or clear it?
5. **Which address is a member's?** The account's, or one they set per
   workspace? The second is a new fact and a new place to keep it current.
