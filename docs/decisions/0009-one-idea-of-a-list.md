# 0009 · One idea of a list

**Status:** decided, not built. Written against commit `966edb3b` (PR #986, 24 September 2026); every file and line
below was read at that commit. Ruben approved the design and its four calls on 24 September. Where this note and the
code disagree, the code wins.

## Context

### The judge is shared; the list is not

Who is on a saved list is decided once. `savedListIds` (`packages/contracts/src/list-rules.ts:207`) is called by the
People surface (`apps/dashboard/src/legacy-bridge/surface-data.ts:871`), a broadcast's send
(`apps/dashboard/src/server/campaign-ports.ts:112`), the playbook runner (`apps/edge/lib/playbooks.ts:201`), the
Playbooks page (`apps/dashboard/src/server/playbooks.ts:346`) and Ask (`apps/dashboard/src/server/ask/tools.ts:1025`,
`proposals.ts:812`). The page and the send cannot disagree about a rule.

A list is still two things. The built-in lists are `PEOPLE_LISTS` (`packages/contracts/src/people.ts:1464`), each a
closure `test(vm)` with gates beside it (`needsCalendar`, `needsConsultFirst`, `needsDeals`, `onProfile`). A saved list
is a row of `segments` (00044) with a `rule` (00155) in the vocabulary of `list-rules.ts`, or members in
`segment_members`. Every consumer branches on the kind. `audienceMembers` (`broadcasts.ts:114`) takes `kind === "list"`
to `PEOPLE_LISTS` and `"saved"` to an id set; Ask's people search checks the id against the built-ins only and refuses
a saved list, "list must be one of …" (`tools.ts:601`); Ask's broadcast proposal lists five built-in ids in its refusal
(`proposals.ts:774`). About a dozen files carry the branch.

### A list's abilities live in five places

The gates and the profile flag are on `PEOPLE_LISTS`. The playbook triggers name four built-ins by hand
(`PLAYBOOK_TRIGGERS`, `playbooks.ts:34`). Today's rows name four more (`todayLeaks`, `today.ts:1882`, `:2045`).
Ask's tool text spells the built-in ids out again (`tools.ts:125`), and the shell parses `seg:`, `list:` and `state:`
itself (`app-shell.jsx:468`). A saved list gets none of it: no Today row, no Ask search, no playbook proposal.

### The built-ins test display state

`personStateFor` (`people.ts:885`) is a chain for a row's pill: needs you, waiting on you, opted out, new, quiet,
active. Three lists read its answer. **Quiet** (`:1555`) is the chain's `last === null || nowMs - last > 30 days`
(`:898`), where `last` is any message or call in either direction (`lastContactOf`, `:913`): someone we never heard
from is quiet, and our own broadcast makes someone who went quiet look recent. **New this week** (`:1496`) is the
chain's "new", which a person who needs you never reaches. **Waiting on you** (`:1482`) takes any assignee as yours
(`const owned = !!r.latest_assignee_user_id || …`, `:887`), because `personStanding` never tells `standingOf` whose
the claim is (`:862`; `standing.ts` reads unknown as mine).

Other lists re-spell a rule that lives elsewhere. **Asked, never booked** is `askedNotBooked` (`:1356`: asked in 30
days, the calendar has never had them) while Reports counts `bookedAfterAsk` (`calendar-people.ts:677`: a visit ahead,
or one since they asked); Today prints both in one line (`today.ts:1887`). The rule vocabulary's `offers_yes`
(`list-rules.ts:118`) is `consent.marketing === "opted_in"`, not `saidYesTo`. The deal lists
(`people.ts:1522-1553`) are not the Pipeline's groups (`pipelineOf`, `pipeline.ts:439`): Consultation booked is any
consultation visit with no deal, the Pipeline's Consultations is one held in the last week or one ahead, and nobody's
Passed deal is on any list.

### Two clocks

A rule counts days as 24-hour blocks back from now (`ago`, `list-rules.ts:92`). The row's visit days are 24-hour
blocks too (`people.ts:1429-1430`), while its words say local days (`visitDay`). Booked this week is the next 168 hours
(`nextVisitDays <= 7`), not the week.

### Can't tell is drawn as nobody

A rule that reads the calendar puts nobody on its list when the calendar is not read (`savedListIds`); the page
draws a 0. A rule this build cannot read is nobody, and its chips are `null` (`surface-data.ts:881`), which the page
draws as a list kept by hand. The rule vocabulary's `last_heard` reads any contact (`list-rules.ts:106`) while the drafting
prompt says "days since they last wrote or called" (`apps/dashboard/src/server/lists.ts:67`).

### A list's life leaves no trace

Creating, renaming, re-ruling and deleting a list write no `decisions` row, so the Activity log never shows them.
`segments` and `segment_members` are not in the realtime publication and People does not refresh on them
(`surface-data.ts:1026`). `DELETE /segments/:id` (`segments/[id]/route.ts:75`) deletes, and `playbooks.list_id` is
`on delete set null` (00155, line 25), so a playbook on the list stops running without a word. Names are unique by
exact case (`unique (tenant_id, name)`, 00044 line 19). An add of more than 500 people fails (`LIST_BATCH_MAX`,
`lists.ts:25`). A broadcast keeps its audience as `{ kind, id, label }` (`create-broadcast.ts:193`), never the rule it
counted.

### Two pools

The dashboard reads everyone through `audiencePool` (`apps/dashboard/src/server/audience.ts:29`). The edge's playbook
runner builds its own rows and visits (`apps/edge/lib/playbooks.ts:141-190`) with its own calendar horizon. The page
counts from at most 50 pages of people (`surface-data.ts:990`); the send counts everyone.

### What production holds

On 24 September: one workspace, three saved lists, none with a rule, six members, no playbook on a list, five
broadcasts. Nothing needs moving but shapes.

## Decision

A list is one thing: **a rule over facts**. A built-in is a rule the product ships; a saved list is a rule the owner
writes, or the people the owner put on it. Every consumer holds a **reference** and asks one resolver.

### The reference

`ListRef` is `{ kind: "builtin", id }` or `{ kind: "saved", id }`, written as the address already writes it:
`seg:<built-in id>` and `list:<saved id>`. `state:<id>` reads as `seg:<id>` (Needs you and Waiting on you are lists).
A broadcast's audience keeps `{ kind: "list" | "saved", id }` on the wire, which is the same reference by another
spelling, so either deploy order works.

### The definition

`ListDef` is the reference, its label, its group (`attention`, `journey`, `reach`, or `saved`), its rule, whether a
person's page names it (`onProfile`), whether it is archived, and its **needs**, derived from the rule and never
written by hand:

| Need     | Comes from                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| calendar | a visit fact (`last_visit`, `next_visit`, `booked`, `asked_not_booked`, `consultation`), or `deal_stage` consultation |
| consult  | `consultation`, or `deal_stage` consultation                                                                          |
| deals    | `deal_stage`                                                                                                          |
| viewer   | `standing` waiting on you, or `assigned` me or a teammate                                                             |

A built-in whose needs this workspace cannot meet is not offered (as today). A consumer declares what it can give: a
playbook has no viewer, so a list that needs one is never offered to a playbook.

### The judge

`membersOf(def, rows, ctx)` answers `{ state: "ok", ids }` or `{ state: "unknown", reason }`, with `reason` one of
`calendar`, `deals`, `consult`, `viewer`, `rule` (a rule this build cannot read) or `list` (a list it reads is gone).
The page says it cannot count the list and why, a send refuses with the reason, and a playbook skips its day and says
so. A list kept by hand is its ids crossed with the rows, so an erased person never counts.

### The clock

One clock, the workspace's zone. A day fact is the difference between two **local dates**. `within N` is 0 to N days,
`more_than N` is more than N, `this_week` is Monday to Sunday of the current week, `never` is no such event, `ever` is
any.

### The rule language, version 2

`{ v: 2, all: Condition[] }`, one to twelve conditions, each a fact or `{ any: Fact[] }` (two to six facts, one level
deep). A version 1 rule (no `v`) reads as version 2. Its facts:

| Field              | Says                                                                                | New in v2                         |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------- |
| `last_visit`       | days since their last visit                                                         | `never`, `ever`                   |
| `next_visit`       | days until their next visit                                                         | `this_week`, `never`, `ever`      |
| `booked`           | a visit ahead                                                                       |                                   |
| `asked_not_booked` | wrote or called in 30 days, and no visit answers it (`bookedAfterAsk`)              | now Reports' rule                 |
| `last_heard`       | days since **they** wrote or called                                                 | now theirs alone; `never`, `ever` |
| `first_contact`    | days since first contact; `within` only on a real date, not an import's floor       | `never`, `ever`                   |
| `channel`          | a wire they use                                                                     |                                   |
| `came_from`        | how they first came                                                                 |                                   |
| `calls`            | how many calls                                                                      |                                   |
| `conversations`    | how many conversations                                                              |                                   |
| `has_chat`         | a written conversation, either way                                                  | new                               |
| `said_yes`         | said yes to offers or to messages (`saidYesTo`); v1 `offers_yes` is this, to offers | new                               |
| `can_receive`      | can be sent offers or messages (`mayReceive`: a yes and a number)                   | new                               |
| `stopped`          | asked to stop, or on the do-not-contact list (`isOptedOutContact`)                  | new                               |
| `standing`         | needs you, or waiting on you                                                        | new                               |
| `assigned`         | who has their thread: me, a teammate, nobody                                        | new                               |
| `deal_stage`       | the Pipeline's group: consultation, proposed, won, lost, ended                      | new                               |
| `consultation`     | their next or last visit is a consultation                                          | new                               |
| `step_due`         | their next step's day has come (`stepIsDue`)                                        | new                               |
| `in_list`          | on another list (a built-in or a saved list whose rule reads no list)               | new                               |

The design named six new facts. Writing every built-in as a rule needed four more, `has_chat`, `said_yes`, `stopped`
and `step_due`, each an existing predicate given a name. The drafting prompt is written from this table, not typed
beside it.

### The built-ins, as rules

| Id                    | Label                | Rule                                       | Changes                                          |
| --------------------- | -------------------- | ------------------------------------------ | ------------------------------------------------ |
| `needs_you`           | Needs you            | standing is needs you                      |                                                  |
| `waiting_on_you`      | Waiting on you       | standing is waiting on you                 | a teammate's thread is theirs (call 1)           |
| `steps_due`           | Steps due            | step due                                   |                                                  |
| `new_week`            | New this week        | first contact within 7                     | whatever the standing (call 1)                   |
| `booked_week`         | Booked this week     | next visit this week                       | Monday to Sunday (call 1)                        |
| `booked`              | Booked               | booked                                     |                                                  |
| `asked_never_booked`  | Asked, never booked  | asked, not booked                          | Reports' rule                                    |
| `lapsed`              | Lapsed               | not booked · last visit more than 44       | local days                                       |
| `consultation_booked` | Consultations        | deal stage is consultation                 | the Pipeline's group; renamed to its label       |
| `proposal_out`        | Proposal out         | deal stage is proposed                     |                                                  |
| `clients`             | Clients              | deal stage is won                          |                                                  |
| `deal_passed`         | Passed               | deal stage is lost                         | new                                              |
| `deal_ended`          | Ended                | deal stage is ended                        |                                                  |
| `quiet`               | Quiet 30+ days       | last heard more than 30                    | never-heard-from out, our sends ignored (call 1) |
| `phoned_only`         | Phoned only          | no written conversation · calls at least 1 |                                                  |
| `opted_in`            | Said yes to messages | said yes to messages                       | `saidYesTo`: a do-not-contact is out             |
| `offers_ok`           | Can receive offers   | can receive offers                         |                                                  |
| `opted_out`           | Opted out            | stopped                                    | a do-not-contact is in                           |

Ids never change: a sent broadcast's audience names them.

Three readings the table implies, said plainly (phase 1 review):

- **Asked, never booked keeps Reports' window.** It is Reports' 30 days, measured as Reports measures its period, so the
  two numbers Today prints side by side count one rule over one window.
- **New reads the first contact the row names.** That is `first_contact_at`, or, with no import behind it, the earliest
  row held (the People column's own rule, `firstContactOf`); an import's floor is never a first contact.
- **Passed and Ended read the deal when the calendar can't be.** A consultation ahead moves someone to Consultations,
  and only a read calendar shows one; unread, they stand where their deal does, as the Pipeline draws them.

A stored rule is read strictly: a part this build does not know, a version it does not read, or a condition that is
both a fact and an "any" group makes the list one it cannot count, never a broader one it can. Only a draft from the
model is cut down to what each field reads first.

**The row's pill follows the lists.** `personStateFor` takes the viewer, so a teammate's thread is not waiting on you,
and its quiet is the Quiet list's rule. Someone never heard from, and not new, is a new state, **Not heard from**,
instead of Quiet or Active.

### A list's life

- **Verbs.** Create, rename, change the rule, add, remove, archive, restore and delete each write a `decisions` row
  (subject `list`), so the Activity log says who did what.
- **Archive, not delete, while something depends on the list** (call 2): a playbook on it, or another list's rule
  that reads it. The list leaves the rail but still resolves; its playbooks pause. A paused playbook on an archived
  list says so and offers to restore the list or pick another. A list nothing depends on is deleted. A scheduled
  broadcast enrolled its people when it was made, so it depends on nothing.

  As built (00169), the owner is told on the spot and in Activity, not by a notification: the page that archived the
  list says which playbooks paused and which lists read it, each pause is a `pause_playbook` decision (`why:
list_archived`), and the `archive_list` decision names them all. Notifications are written only by the edge, and a
  second writer for one event was not worth a bell the person who pressed Delete has already been answered by. The
  database is the floor under the route: `playbooks.list_id` is `on delete no action`, so a list a playbook names is
  never deleted out from under it, while a workspace deleted whole still goes. A restore under a name a live list now
  has is refused in words ("Rename this one to bring it back"). A playbook on an archived list is not resumed, and no
  playbook is put on one.

- **Live.** `segments` and `segment_members` join the realtime publication, and People refreshes on them.
- **Names** are unique among live lists regardless of case.
- **Adds** of more than 500 are sent in parts by the page; the route's limit stays.
- **Sends remember.** A broadcast's audience keeps its rule, the rule's version and when it was counted; a playbook
  run keeps its list reference and rule. As built, both keep `audience.list = { token, rule, counted_at }`: the rule
  carries its own version, and a list kept by hand keeps `rule: null`, its recipients being who was on it. The
  broadcast's ledger row names only the token.

### Playbooks

One trigger runs on any list a playbook may use: a built-in by `list_key` (00168), a saved list by `list_id` (00155),
never both, with its class chosen on the playbook, an offer (`campaign`) or a win-back (`reengage`). As built, that
trigger is `saved_list`, relabelled **On a list**, rather than a new `on_list` beside it: every playbook already on a
list keeps running, and there are not two triggers for one moment. `quiet_30`, `new_week`, `phoned_only` and `lapsed`
stay as they are, the presets they always were: a list, a class and a starter template. A run resolves its list by
reference (`RunContext.listMembers`), and one it can't count here skips its day and says so (`list_uncounted`, or
`no_calendar`). A list about whoever is looking is never offered to a playbook, and refused if named.

00168 also grants the update of `list_id` (and `list_key`): 00121's column grant never named it, so in production a
member could put a playbook on a list and never move it to another.

### One pool

The rows, visits and view models the edge and the dashboard judge lists over are built by one function in contracts
from what each app fetches, with one calendar horizon. Past the page's 50 pages the page shows the server's count from
the same judge (phase 5, when a workspace nears it).

### The four calls, as approved

1. Quiet, New this week, Waiting on you and Booked this week take the meanings above.
2. Archive instead of delete while something uses a list.
3. The rule language version 2 above.
4. An owner may duplicate a built-in into a saved list (its rule becomes theirs to edit).

## Steps

Each ships on its own, in either deploy order.

0. **This note.**
1. **The engine** (contracts, no migration). The facts, the clock, rule version 2, the judge, `ListRef`, `ListDef`,
   the built-ins as rules, the pill with a viewer. `PEOPLE_LISTS` keeps its shape, each `test` now its rule, so the
   surfaces change only where the lists' meanings do. Parity tests pin every built-in against its old closure.
2. **One resolver on the server.** The shared pool; Ask's search, audiences and proposals, the send and the playbooks
   over `ListRef`; `on_list`.
3. **A list's life** (one migration). Archive, the verbs' decisions, realtime, names, the playbook reference with a
   refused delete, sends that remember, adds in parts.
4. **The surfaces.** The rule edited with a live count, rules on the phone, the profile's "why" and its cold load,
   "Save these" keeping a rule, duplicate a built-in, Today's pins (a member's `views.today`), honest missing links,
   export following the list, the standing filter as a list, the phone sheet's empty rows, the copy.
5. **The server's count** past the page's bound, when a workspace nears it.

## Tests

- **Parity.** Every built-in, its old closure against its rule, over the fixture world and two thousand seeded rows.
  Each difference is one the table above names, or the test fails.
- **The engine.** Seeded rows, no new dependency: `never` and `ever` split everyone; a condition added never grows a
  list; unknown exactly when a need is not met; a version 1 rule reads as the same version 2 rule.
- **One consumer test.** Every place that takes a list, run with a built-in and a saved reference.
- **The database.** Archive, the refused delete, the case-blind name, red first.
- **End to end.** A saved list made on People is found on a profile, as an audience, in the playbook picker, in
  Ask's search and pinned on Today.

## Risks

- **Meanings move.** Four lists count differently the day step 1 ships. The counts are small before launch, and the
  parity test names each difference.
- **The pill.** A new state is a new word on every row that had none to say; it is the one a row was missing.
- **One more trigger.** `on_list` joins the `playbooks.trigger` CHECK; the old five stay valid, so a page from before
  the deploy still reads them.

## Open questions

None. The four calls are made.
