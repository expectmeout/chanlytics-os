# A conversation begins from the Inbox

**Status:** built on 8 October 2026 and committed that day on Ruben's word, on main's `5152b0aa6`; migration 00351
goes to production before the dashboard deploys. What the build's own look and its one review changed is §0.3, and
what a second pass over the whole loop closed is §0.4. Where the text below says staged, or names an earlier commit,
it speaks of the worktree as it stood before the commit. The history of the design follows as it was written: it was the fourth pass. Ruben read the first pass and said he
liked the plan and its thinking, and asked for a deeper pass before the implementation plan; the second pass replaced
the first, and the third is the second corrected by applying the whole design to this worktree, checking it, running
it, measuring its bundle, and taking it out again (§0.1), and by applying and checking it once more after main moved
to `b2271d3a4`, where the branch now stands; the fourth read the proven code whole against the codebase and against
what a system that sends a first message owes, changed four things (§0.2), and proved the lane again there. Written against `origin/main` at `b6e2a2722` from ten read-only passes over the code (the Inbox and the page heads,
the send path, voice, Ask, the decisions and registries, then: the receptionist after a member writes, the tests and
ratchets, the kit's sheets and the head, the draft door's internals, and outside sources), the author's own reads, a
read of production's counts, and a trial of the riskiest edit applied, checked and reverted. Every claim carries its
`path:line`. Where this note and the code disagree, the code wins. Local only, uncommitted, by his rule of 7 October.
The implementation plan is `docs/superpowers/plans/2026-10-07-a-conversation-begins-from-the-inbox.md`.

## 0. What the second pass changed

| First pass said | Second pass found | So now |
| --- | --- | --- |
| Open the person's thread, then put the words in the thread's own composer | No thread in production is empty (0 of 33), and an opened, abandoned thread would be a new kind of row in every list | The sheet sends. A thread is opened only as its first message is queued |
| A first message is the reply verb "told the truth" | A member's send marked as a start is held as a campaign's by the door, under the pause the reply itself just took (`packages/core/src/deliver.ts:201-209, 470-504`) | A new payload word, `starts`: judged as a start, held as the person's own words, and ignored by an edge deployed before it |
| Ask drafts the words | WhatsApp carries no words of the member's outside 24 hours. In the live workspace 0 threads have the window open, 13 have it closed, 1 person has an email, none can be texted | Each wire says what it carries. Outside the window the sheet offers the approved messages; Ask's words go by text, by email, and inside the window |
| "The receptionist understands the plan" was left to a call's note | After a member writes, the receptionist is silent for a day and nobody is told when the person answers (`packages/core/src/inbound/reply-gates.ts:159-163`) | The member says who answers. By default the thread goes back to the receptionist at once, with the plan kept as a note it reads as a fact |
| A purpose for the draft is a migration | A gateway purpose maps to the model purpose `lead_json`; only a model purpose is in the CHECK (`apps/edge/lib/ask-gateway.ts:190-192`) | No migration for the draft |
| The reply verb grows | `queueReply` is 152 lines against a limit of 150, and four tests pin lines of the file by text | The template's shaping moves out first (152 to 96 lines, proven), and every pinned line stays |
| An event and a decision verb for opening | Neither is needed: the ledger's `reply` row says it was a start, and the words follow the row | One migration, one function, nothing else in the database |

### 0.1 What applying it changed (the third pass)

The whole design was built in this worktree, typechecked, linted, tested, run as the real app at a desk's width and a
phone's, and its bundle compared with main's own. It was then removed; the plan holds the code that passed.

| The second pass said | Applying it found | So now |
| --- | --- | --- |
| The sheet shares the Pipeline's pick, moved to `surfaces/people/pick/` | Loaded on demand, a sheet that imports anything of People's pages makes the bundler repack a chunk the whole route shares: People and Templates each downloaded twelve kilobytes more | The Pipeline's pick is untouched. The sheet has its own, drawn with the kit, and asks the server who matches, so it finds people the tab has not read |
| A desk draws the record kit's sheet, and what is written is kept by `useUnsavedWork` | The record kit's `work.tsx` in that chunk cost Sent fourteen kilobytes the same way | The frame is the kit's own `Sheet` at every width, its foot holding still. What is written is kept through the Inbox's own door to the tab's memory, and closing over it asks once |
| Each of the three tabs loads the sheet on demand | Each tab then carried the loader | The frame holds one host, beside its head, as the deal sheet is the frame's. A tab carries its button and a small store: about 0.6 kB each |
| A person with no thread gets a door to `inbox/new:<person>` | With the frame holding the sheet, no page need be left | "Start a conversation" opens the sheet on them where the member stands. `inbox/new` and `inbox/new:<person>` still open it, for a link |
| An approved message is shown as it is filed | It read "Hi {{1}}, …" | The reach read carries what fills its slots (their first name, the business's name and link, read as the send reads them), and the sheet shows the message as the person will read it |
| The sheet's "Ask about them" opens Ask on the person | Ask's palette opens under a modal sheet, where it cannot be reached | Not built. The draft is Ask's part here |
| `replyWireOf`, a comment in `toInboxThreadVM`, six-parameter helpers, helpers named `W`, `json`, `kept` | Each a red measure: a dead export, a function that may only shrink, the four-parameter limit, the copies measure | Each fixed in the plan's code, and the rules for it are the plan's ground rules |

### 0.2 What reading it again changed (the fourth pass)

The proven code was read whole, file by file, against the predicates it leans on and against what a system that sends
a first message owes: a key that answers a retry and nothing else, consent that does not outlive its reason, no row
left behind by a refusal, and the plan reaching the receptionist for certain. Four things changed, each built, tested
and proved again on `b2271d3a4`.

| The third pass had | Reading it found | So now |
| --- | --- | --- |
| The sheet made the send's key from the words (`begin:<person>:<hash of wire, subject, words>`), as the thread's reply box makes its own | The reply route keeps its key itself, per member, for thirty seconds; this route leaves it to `route()`, which keeps a key a day for the whole workspace. The same approved message sent to the same person again that day, by anyone, was answered with the first receipt and nothing was sent | The send is keyed once for each press of Send by the client's own rule for a write sent once (`api.ts` `once`): a retry after a timeout is the same request, answered with the first receipt whole, and the same words sent again later are a new intent. The Inbox's own key hash stays in its verbs; nothing is moved out of them |
| The thread was opened, then the reply verb shaped and queued the message | Between the two the verb still refuses: words over the wire's length, a template no longer approved or a promotion without the yes to offers, a first email with no subject. Each left an opened thread with nothing in it, the row the second pass said must never exist, listed last in Conversations with no messages | Each is asked before the thread is opened (core `begin.ts` `fitsWire`), with the verb's own sentences, exported from `reply.ts` so they are said once. The verb asks again after; a refusal there is a claim that failed, and the next attempt opens the same thread |
| The plan reached the receptionist by a second request from the browser, after the send | The sheet could close between the two, and the verb that promised "it will know your plan" did not keep it. The note landed after the thread was handed back | The note rides with the send; the verb keeps it through the notes door (`person_note_add`, by `packages/db` `addPersonNote`) once the message is queued and before the thread is handed back; the receipt says `note_kept`, and the sheet says when it was not |
| Someone who ever phoned was heard on a phone's wire for good: an approved message or a text went to them without a recorded yes, however old the call | Ruben's decision of 10 September answers the person on the line. A call two years old is not being answered, and the product has a door for a caller's yes (the spoken script, which covers WhatsApp and a text) | A call is heard for a month (People's own "quiet" line, `QUIET_AFTER_DAYS`): inside it a text or an approved message answers the call; after it a message starts there, and asks the yes a start asks. Where they wrote is not bounded, as the reply route never bounded it |

Read and left as they are, with why: the hand-back's `paused_until: null` is the type's, not a fact written; the reach route is readable by a viewer because it says nothing the person's page does not; the member's own first message meets no quiet hours, as a reply does not; the reply route's `idempotent: "own"` is not copied, since a receipt the verb replays would say nothing of the thread or the note. Three things read as right and worth a lane of their own, not this one (§4.8): a yes recorded from the sheet for someone met in person; the note kept for anyone with a number, since the voice receptionist reads notes by number even where the text receptionist does not answer; and a message sent later, at a time the member names.

### 0.3 What building it changed (the look at the running app, and the one review)

The proven change was applied, every gate run, the page looked at in the running app at a desk's width and a phone's in
both themes, and the staged change read once by an independent reviewer. Each finding was checked against the code
before it was fixed, and each fix has its test.

| What was built | What was found | So now |
| --- | --- | --- |
| The Inbox's shortcuts stand down for a key pressed in a dialog, asked as `aria-modal` | The kit's `Sheet` says `role="dialog"` and no `aria-modal`. In the running app, J pressed on a button of the open sheet walked the list behind it: A would have approved the draft there, and Ctrl with Enter sent the reply box | One statement, `ixInDialog` (`surfaces/inbox/keys.ts`): `aria-modal`, a dialog, an alert dialog, an open menu or list. The page's keys, N and the reply box all ask it. By mutation, the two guard tests fail under the old rule |
| A first email to someone the business has dealt with asked nothing (it is about something of theirs) | Someone who pressed Unsubscribe on the business's email got it. The product's own words for that state are "No offers or first emails go to them by email" | `mayMessageFor` takes `begins`; a start by email to them is held as `unsubscribed`, in that sentence, by the rule and by the door alike. A reply to them, and a message about their visit, still go |
| A first text carried the line that says how to stop when the message was a start, and its length was measured after the helper that adds the line | That helper cuts at 1,600 characters, so a long first text lost the line and was never refused; and someone who phoned (no start) and had never been texted got no line | The line is owed by the first text of ours to reach them (`textReached`, the receptionist's own rule), start or not; a text with no room left for it is refused in words |
| The send was answered once by the route's key alone | The route lets a key go when its request fails, and a request can fail after the message is queued (the ledger's row, a request that died): a retry then sent twice | The verb is handed the same key and keeps its receipt under it before the job exists, for as long as a key is kept (`replayMs`); the intent is the words written, whichever way the line fell (`leavesAs`) |
| A thread only the business wrote on is answered on the wire its words went by, in the view and in the reply route | That let the thread's own box send an email or a text nobody had judged, on any thread nothing has come to: a campaign recipient's, a cold lead's. And such a thread already took an approved message as a "reply", asked nothing a start is asked | The reply route hands a thread nothing has come to (`last_inbound_at` is null: only the two inbound doors stamp it) to `beginConversation`, with the thread it holds. It is judged as the start it is. **This changes the existing reply route, in the safe direction** |
| Ask's answer was written into the sheet when it arrived | An answer still on its way when the member picked someone else landed in the next person's words, note and brief. A note written for a call (told the team's own notes) could be kept for a message | Each asking has its turn; picking someone else, going back, or changing between a message and a call ends it. Cancel, Change and closing wait while a send is on its way |
| The beginning re-stated two of the verb's template refusals before opening a thread | The verb has three more (a slot the Inbox does not fill, no facts, no link), each of which left an empty thread | The beginning calls the verb's own `shapeTemplate`, and re-states none |
| A draft was refused a price when the member had named none | Any price the member named unlocked every other amount; and a rewrite of a message the member had priced by hand was refused | A price is held to its figure (`priceFigures`); what the member hands back to be rewritten counts as theirs |
| A message was drafted from the person's whole timeline | That holds the team's own record of them (why a thread was handed over, a decision, a change of consent, a deal's end) | A message is told what was said and done with them; the rest reaches a call's brief alone |
| The default note was the plan in a sentence | A long plan made a note longer than the send accepts, refused in the server's words | Cut after a whole word, within the limit |
| The tab keeps one half-written conversation | Opening the sheet on someone else dropped it unasked | Only what this sheet kept is let go |
| An email whose address differs from the one they last wrote from is refused until the member agrees | The sheet had no way to agree | Pressing Send again agrees to that address, by value; any other refusal reads how they can be reached again |
| Their page reads the wire a reply goes by from what they wrote | For a thread only the business wrote on it said WhatsApp | It reads the wire our own words last went by, as the Inbox does |
| The call's view | Two filled buttons at once | One: the call, until something is written of how it went; then keeping it |

Read and not changed, with why: D7 (someone who phoned within the month may be written to without a recorded yes). The
reviewer asked for it to be stricter. The thread's own box already offers an approved message to a caller with no chat, with
no limit of time (`thread/composer.tsx` `noChatComposer`), so the month is already narrower than the product is today,
and it stays his to move.

### 0.4 What walking the whole loop closed (before any commit)

Ruben asked for one more pass before anything is committed: the built lane walked end to end as a member uses it,
against how the rest of the product already behaves. Ten things were unfinished or unlike the house. Each is built and
tested, and each was looked at in the running app at a desk's width and a phone's.

| What was built | What the house already does | So now |
| --- | --- | --- |
| The toast said "On its way to Robin" | A reply's toast says "sends in 15 s unless you undo" and holds the Undo for exactly as long as the send can be stopped. The message was not on its way: it was waiting fifteen seconds | The same sentence and the same Undo (`sayQueued`). Undone, the note that said "the team wrote to them" is removed with the message (the receipt carries `note_id`), what was written is put back in the tab, and the toast offers "Open it again" |
| Closing over words asked in a row of the sheet's own, its Yes a filled red button | Every sheet asks the one question through the kit's `Confirm` with `discard`, redesigned on 7 October: the question over an equal pair, the Yes in red words on no ground, since nothing kept is destroyed | The kit's `Confirm`, with the house's words for it |
| No key sent | Ctrl or Cmd with Enter sends in the thread's reply box and saves a record's sheet | It sends from the words and the subject, and keeps the note of a call |
| The pick took a press on a row | A search is a pick in two keys | Enter takes the first found, once what is shown answers what was typed. "Add someone new" starts from what was typed: a number where it reads as one, else a name |
| A first text had its line added on the way out | "The operator should know what lands on their customer's phone before they click" (the thread's box, of an approved message) | The reach read carries the line (`first_text_line`), the sheet shows it under the words, and the field leaves it its room, so no text is refused for want of it |
| Which approved messages are not offered, and why, was a paragraph under the choice | "An explanation one tap away, never in the way" | "Why not the others?", which says it on a press |
| Where no wire can go, the door said "Open their page" | The page is where a yes is recorded, with the script to ask in and the evidence | It says "Record their yes on their page" where a yes is what is missing. What was written stays in the tab, and "Start a conversation" there opens the sheet on it again |
| An email whose address differs from the one they last wrote from was sent on a second press of Send | The thread's box names the address in the act: "Send to ..." | The act says "Send to <address>" once the server has asked |
| A refusal stood beside the two acts | On a phone it left Cancel on one row and Send on the next | The acts stand together, and a sentence with no room beside them takes the row over them |
| The receipt said whether the note was kept and the thread handed back | Nothing told whoever reads the logs | Two log lines, `new_conversation_note_unkept` and `new_conversation_not_handed_back` |

Looked at and left, with why. **Recording a yes inside the sheet:** the page's control asks how they said it, shows the
workspace's own words to ask in, and keeps the evidence; a lighter copy in the sheet would be a second way to record
the most consequential fact the product keeps. **A late-hour notice:** no rule of the house holds a reply or a
campaign to hours, and one sheet should not be the first place such a rule appears. **Faces in the pick:** a new kit
import into the sheet's on-demand chunk is not added unmeasured (§0.1). **A viewer who opens `inbox/new`:** the sheet
opens, Send says why their role may not, and the server refuses; a guard at the door would have to know the role
before the page has it.

Measured before the push, on Ruben's word for one local build: main (`5152b0aa6`) and the branch were built on one
machine and compared as CI compares them (main's JS equalled CI's own record to the byte). The kit's `Confirm` in the
sheet's chunk moved no page: each page grew what it grew on 7 October, none by more than 1,735 bytes gzipped, and the
route by 2,765 where it was 2,527 (the difference is what §0.3 and this section added to the route). The budget is
raised by that growth, with its row under "Rises" in `docs/debt.md`.

## 1. The ask

On the Inbox page, where People shows "Add a person", Leads "Find leads" and the Pipeline "New proposal", one coral act
lets a member start a message or a call to one person. Before anything goes out, a step with Ask in it takes the
member's plan (a follow-up, something to tell them, a first hello), asks what it still needs to know, and writes the
words or the call's brief from everything the product knows about that person, the way the phone receptionist is
briefed at the top of an inbound call. Every system already in place is used before a new one is made.

## 2. What exists today

### 2.1 The head and its act

- A page says its standing with `useStanding({ title, sentence, act, back })`
  (`apps/dashboard/src/surfaces/kit/head/standing.ts:15-28`); the frame portals the act into `#pg-act`, at the right of
  the row of views (`kit/head/frame-head.tsx:148-151`; `legacy/pages/app-shell.jsx:577-589`). There is one look, Glass
  (`packages/contracts/src/shell/chrome.ts:67,70`), so the head always exists.
- People passes "Add a person" (`surfaces/people/page/screen.tsx:244-261`), the Pipeline "New proposal"
  (`people/pipeline/standing.tsx:21-41`, shown to every role and gated), Leads "Find leads"
  (`leads/scope/controls.tsx:35-56`). The Inbox says a title and a sentence and no act
  (`surfaces/inbox/pages/inbox-head.tsx:47-52`); Conversations and Live say nothing and are named from their crumbs
  (`app-shell.jsx:729-736`).
- On a phone (at or under 900px) the act beside a strip that is not People's is a 44px coral circle, and every `span`
  directly inside it is clipped to one pixel (`legacy/styles/components.css:2419-2439`). `ActWords` draws its mark inside
  such a span, so it would leave an empty circle: the mark must be the button's own child. No page uses that rule yet.
- "N drafts about to send · Hold all" is fixed at the right end of that row on a desk (`components.css:2111-2117`;
  `legacy/styles/inbox.css:1790`), drawn by the page (`surfaces/inbox/pages/inbox-page.tsx:293-348`).

### 2.2 The one place a member writes to a person

- The thread's composer picks one of five boxes (`surfaces/inbox/thread/composer.tsx:631-654`): asked to stop; address
  stopped; a caller with no chat (a `tel:` "Call back" and the approved messages); WhatsApp's window closed (the
  approved messages); otherwise a line of words and Send.
- Send goes `inboxReply.sendReply` (`pages/inbox-acts.tsx:181-199`) to `POST conversations/[id]/reply`, with a key made
  of the thread and a hash of the words (`surfaces/inbox/verbs.ts:143-221`).
- Every "call" in the product is the member's own phone (`composer.tsx:434`, `thread/header.tsx:485`,
  `thread/status.tsx:188`, `people/person/hero.tsx:88`, `leads/page/acts.tsx:35`).

### 2.3 The send door and the reply verb

- Everything a customer receives leaves through `deliver()` (`packages/core/src/deliver.ts:605-758`). A route queues a
  row and an `outbound_send` job; the edge's tick runs `sendQueued` (`packages/core/src/messages/send.ts:38-113`).
- The door asks, in order (`deliver.ts:417-473`): erased; a text that is a promotion or a line not active; an address
  suppressed or changed; consent, by `mayMessageFor(person, purpose, { proactive, channel, about })`
  (`packages/contracts/src/consent/consent.ts:175-232`); then, unless the send's kind is `reply`, the workspace's pause
  and the thread's hold.
- `replyToConversation` (`packages/core/src/conversations/reply.ts:290-375`) refuses an opt-out, takes the wire the
  person last wrote on (`apps/dashboard/src/server/verbs.ts:182-199`, WhatsApp when they never wrote), asks the window,
  claims the thread, takes a hold, withdraws the receptionist's drafts, queues the row and schedules the job fifteen
  seconds on (the undo).
- The job's payload already has `proactive` ("only `true` makes a send proactive",
  `packages/core/src/messages/ports.ts:70-76`), and `sendQueued` says every such message is about `theirs` and names no
  kind (`send.ts:85-90`).

### 2.4 A person who never wrote

- A thread is one row per person (`supabase/schema.sql:23398`). Its writers are the two ingest doors, `reach_out_person`
  (cold email) and `threadOf`, an upsert for a campaign's recipients (`packages/db/src/repositories/ingest.ts:426-460`).
  A member's session has no INSERT policy on it (`schema.sql:28458-28474`).
- Every send a page offers asks `mayReach`, which needs a thread
  (`packages/contracts/src/people/person-reach.ts:164-176`). A person added by hand, imported, or made from an
  email-only lead cannot be written to from anywhere. In production 6 people have no thread.

### 2.5 Consent, said once

- Answering someone who wrote needs only that they have not said stop. Starting a conversation on WhatsApp or by text
  needs their recorded yes covering that wire (`consent.ts:229-230`; `consent/consent-channels.ts:37-80`). By email, a
  message about something of theirs needs only an address; an email of the business's own choosing to someone it has no
  history with is an offer (`consent.ts isOfferByEmail`), which owes the campaigns domain and a one-click unsubscribe
  (`packages/core/src/deliver-email.ts`).
- "History" is one fact the database already keeps: they wrote, they called, or they have a deal
  (`has_relationship`, `schema.sql:4027-4047`; `consent.ts relationshipOnRecord`).
- Someone who phoned is answered at the number they called from without a recorded yes: Ruben's decision of
  10 September 2026, for the booking link sent during a call (`apps/edge/lib/voice/call-booking-link.ts:297-309`).

### 2.6 Drafting, and the door for it

- The house pattern for words a model writes is a dedicated route over `askForJson`
  (`apps/dashboard/src/server/model-json.ts:45`): `POST leads/[id]/draft` (`server/leads/lead-draft.ts:88-134`),
  `segments/draft`, `templates/draft`. It runs Sonnet 5 with a JSON schema, counts in Ask's one daily budget, and
  answers 503 off production (`server/ask/gateway.ts:126-134`): there is no sample path.
- The refusals are code's, not a card's warning, where it matters: a rewritten draft that names a price is refused
  (`apps/edge/lib/receptionist/steer.ts:67`), and so is a drafted reply to a lead
  (`apps/edge/lib/reach-out/reply-draft.ts:112-132`). Decision 0017: "a draft is text, never a message row".
- Ask itself is at its cap of twenty tools for an owner (`tooling/scripts/tests/ask/ask-registry.test.mjs:259`), its
  acts make no second model call, and it does not read the business's tone or booking link
  (`server/ask/prompt.ts:195`).

### 2.7 Voice

- The receptionist is briefed per call through four variables, filled by `planCallStart`
  (`apps/edge/lib/voice/call-start.ts:117-266`): the business's facts, who is calling (their notes and the last twelve
  turns), the greeting and the hand-off number.
- Nothing places a call: no `create-phone-call`, numbers are bound for inbound alone
  (`packages/channels/src/lines/lines-saga.ts:142`), and the Business page says "It answers your line and never calls a
  customer" (`packages/contracts/src/config/business-tab/abilities.ts:307-313`), which two tests hold.

## 3. What the second pass found

**F1. WhatsApp carries none of the member's own words outside 24 hours.** Meta delivers only a message it approved
ahead of time, and a first message to a number that never wrote is one of those and needs the person's opt-in
(Meta's policy, read 7 October 2026). The reply verb already enforces the window (`reply.ts:312, 408-423`). Production,
7 October: the live workspace has 26 threads, 0 with the window open and 13 with it closed; 8 approved messages, 1 of
them a utility message and 7 promotions, which Meta does not deliver to United States numbers at present; 1 person with
an email address; no texting line; 28 of 29 people with a number. So, for that workspace today, a new conversation is
an approved message, or a call.

**F2. After a member writes, nobody is told when the person answers.** A reply claims the thread and pauses the
receptionist for the workspace's pause, a day by default (`reply.ts:471-490`;
`packages/contracts/src/config/policy.ts:354-357`). A message that arrives under that pause is set aside: no answer, no
draft, no escalation, no bell, no email (`reply-gates.ts:159-163`), and it is never looked at again
(`apps/edge/lib/receptionist/unfinished.ts` reads only what was not handled). The row shows as new and nothing else
says so. Once the pause runs out the receptionist answers again, so what happens depends on how fast the person replies.

**F3. A note is how the receptionist learns a plan.** Notes that are kept and not for the team alone are read before
every answer, by text and by voice: the twelve newest, 1,200 characters in all, each with its day, under "use as facts,
never read aloud or quoted" (`packages/db/src/repositories/thread.ts:399-407, 480-506`). They are found by the
person's number, so someone with no number has none. A note has no end date: it is read until it is removed.

**F4. The member's own message is, to the model, something it said.** History gives every message of ours the
assistant's role (`thread.ts:132`), so the receptionist continues a conversation the member began as its own. The plan
is not in the history; the note carries it.

**F5. The reply verb has no room.** `queueReply` is recorded at 152 lines against 150
(`tooling/scripts/tests/baselines/complexity.json:402`). Tests pin lines of `reply.ts` and `send.ts` by text
(`sms/sms.test.mjs:413-422`, `routes/doors-and-rows.test.mjs:70-90`, `conversations/veto-window.test.mjs:96, 165-169`,
`routes/workspace-scoping.test.mjs:359`).

**F6. A thread is opened by a door, not by the service role.** The dashboard's service client says of itself "Tenant
DATA writes never happen here" (`apps/dashboard/src/server/service-db.ts:7-13`). The house's door for a member's write
that RLS cannot carry is a `security definer` function that checks `is_acting_member` (`create_person`, 00342). It is a
sixteenth writer of `conversations`, which the writers measure counts
(`tooling/scripts/tests/baselines/writers.json`): a rise, argued.

**F7. A first text owes the way to stop it.** Twilio's messaging policy (13 April 2026) asks it of the first message to
a recipient. The receptionist's first reply by text already carries it (`packages/channels/src/lines/sms.ts:267-275`);
a member's reply does not, and need not.

**F8. A thread with only our words reads as WhatsApp.** The Inbox's view model and the reply route both fall back to
WhatsApp when nothing came from the person's side (`packages/contracts/src/conversations/inbox-thread.ts:207`;
`server/verbs.ts:198`), while the row beside them already says the wire our own words went by
(`conversations/thread-channel.ts:90-96`). An email reply needs an email of theirs to answer (`reply.ts:243-245`).

**F9. Folders are full.** Twenty modules is the limit, and these stand at twenty: contracts' `conversations` and
`people`, db's `repositories`, the dashboard's `server` root, and the tests' `conversations`, `conversations/inbox`,
`messages`, `routes`, `shell` and `database`. The lane's code takes one name, `new-conversation`, as a folder in
contracts, the server, the Inbox's surface and the tests. CI picks test folders by a changed path's parts
(`tooling/scripts/checks/changed-tests.mjs:48-57`), so that name selects the lane's tests whenever any of it changes.

**F10. CI does not run what a new route breaks.** A change under `surfaces/inbox` or `app/api/v1` selects no test
folder. The folders that hold a new route's registries (`routes`, `shell`, `deals`, `leads`, `ai`, `sms`) are run by
hand before a push, one folder a command.

**F11. Outside.** Retell places a call with `POST /v2/create-phone-call` (`from_number`, `to_number`,
`override_agent_id`, `retell_llm_dynamic_variables`, `idempotency_key`); a number's `outbound_agents` replaced the
single field on 31 March 2026; the inbound webhook is not called for an outbound call; its terms ask for prior express
written consent for an AI-voiced call, the business named first, and 8am to 9pm. The FCC's ruling of 8 February 2024
makes an AI voice an artificial voice under the TCPA. Meta charges for service messages and in-window utility messages
from 1 October 2026. Sources are in the appendix.

## 4. The design

### 4.1 The act

- One button, "New conversation", on the Inbox's three tabs (Needs you, Conversations, Live), so the row of views is
  the same width on each. The Inbox says it beside its standing; Conversations and Live say `useStanding({ act })` and
  keep their crumb's name.
- Drawn as the kit's `Button variant="primary" size="sm"` holding the plus as its own child and the words in a span
  beside it, so a phone draws the 44px circle with the plus in it, and a reader still hears the name.
- Shown to every role and gated for one that may not write, as "New proposal" is: `gate("approve", "start a
  conversation")`.
- `N` opens it, and the shortcuts sheet says so.
- What it opens is loaded on demand, as a pointer or focus reaches the button, as Reports' period is
  (`surfaces/reports/period-picker.tsx:44-54`): the Inbox's first load does not grow by a sheet.
- "Hold all" stands at the act's left on a desk, by a layout rule that names the act's measured width (173px). Under
  1010px with the sidebar open the row has no room for the views, the strip and the act, and the strip stands over the
  last tab for the seconds it is drawn.
- The button is each tab's; what it opens is the frame's (§0.1): one host beside the frame's head loads the sheet on
  demand, answers `N` on the Inbox's three tabs, and draws the toast that outlives the sheet.

### 4.2 The sheet

The kit's `Sheet` at every width: a pane beside the page on a desk, from the bottom edge on a phone, its foot holding
still with the act. What is written is kept in the tab (the Inbox's own door to the tab's memory, as the thread's
reply box keeps a draft), and closing over it asks once. It imports nothing of the record kit and nothing of People's
pages (§0.1).

**Step 1, who.** The sheet's own pick, drawn with the kit: with nothing typed, who the tab already holds (or the
server's first page); with words, who the server says matches (People's own search); and "Add someone new", by name
and number, through People's own door. "Change" on step 2 comes back here.

**Step 2, the plan and the words.** One screen, top to bottom:

1. Who it is for, with a link to their thread where they have one.
2. Message or Call (the kit's `Segmented`). A person on the do-not-contact list is offered no call, as their page
   offers none; a person with no wire is offered no message, with the reason.
3. "What is it about?", one field: the plan. Under it, "Write it" with Ask's mark.
4. What Ask needs to know first, as fields, when the plan is too thin to write from (at most two).
5. For a message: the wire, said with what it carries ("WhatsApp · an approved message only, until they write",
   "Email · your own words"), chosen where more than one can go; a subject, for an email; then the words, which the
   member may write or change, or the approved message to send, shown as the person will read it (their first name,
   the business's name and its link filled as the send fills them). Shorter and Warmer rewrite a draft.
6. "When they answer", on a phone's wire where the receptionist answers this person: the receptionist, knowing the
   plan (the note it will read is shown, and can be changed or left out), or the member.
7. Send. The message is queued with its fifteen seconds, the thread opens, and the note is kept.

For a call: the brief (what we know, how to open, what to say, what to leave out, what to ask for), "Call from your
phone" and "Copy the number", and after it "How did it go?", one line kept as a note, with whether the receptionist
should know it.

The sheet works with no model: the words are the member's to write, and Ask is one press that fills them. Off
production, and with the day's budget spent, it says so and stays usable.

### 4.3 Which wire carries what

One rule, `writeWaysOf` in contracts, read by the sheet, by the route before anything is queued, and agreeing with what
the door asks at the wire:

- A wire is **held** when: they asked to stop; they have no number (WhatsApp, a text) or no address, or the address
  stopped; the workspace cannot send on it now (the reason is the workspace's own, `reach-for.ts CHANNEL_WORDS`).
- A message **starts** on a wire when they are not heard on it: they last wrote elsewhere or nowhere, and, on a
  phone's wire, have not called within the month (People's own "quiet" line: a call is answered for that long, as the
  booking link sent during one is; after it the product's door for a caller's yes, the spoken script, is the way).
- A start by WhatsApp or by text is held without their recorded yes covering that wire. A start by email is held when
  the business has no history with them (that email is an offer, and goes from Campaigns), and when they pressed
  Unsubscribe on the business's email (§0.3).
- WhatsApp **carries** the member's words while its window is open, and otherwise only an approved message. A text and
  an email carry words.
- The sheet opens on the wire they last wrote on when a message can go there, else the first that can.

| Who | WhatsApp | Text | Email |
| --- | --- | --- | --- |
| Wrote on WhatsApp today | words | needs their yes by text | words |
| Wrote on WhatsApp last month | an approved message | needs their yes by text | words |
| Phoned within the month, never wrote | an approved message | words | words |
| Phoned a month and more ago, never wrote | needs their yes | needs their yes | words |
| Has a deal, never wrote or called | needs their yes | needs their yes | words |
| Added by hand, said yes in person | an approved message | needs their yes by text | goes from Campaigns |
| Added by hand, no yes | needs their yes | needs their yes | goes from Campaigns |

Where no wire can go, the sheet says why and offers the call, and a link to their page to record a yes.

### 4.4 Who answers, and the plan as a note

- **The receptionist** (the default where it answers this person): the message is queued as the member's own, and the
  thread is handed back at once by the existing verb (`packages/core/src/conversations/hand-back.ts`). What the person
  writes back is answered under the workspace's own rules, with the plan read as a fact; what it should not decide it
  hands over, and that tells the team as it always has.
- **The member**: the thread is theirs, as after any reply. The sheet says what that means in the product's own words:
  the receptionist stays quiet until it is handed back.
- Where the receptionist is set to ask first or never for this person, and for an email, there is no choice to make:
  the thread is handed back, and their answer comes to the team in Needs you with its alert.
- The plan rides with the send, and the verb keeps it through the existing notes door (`person_note_add`, not for the
  team alone), dated in its own words, once the message is queued and before the thread is handed back, so the
  receptionist never answers without it; the receipt says whether it was kept, and the sheet says so when it was not.
  Ask writes it; the member may change it or leave it out. It reaches the receptionist by text and by voice (F3).

### 4.5 Ask

- `POST people/[id]/draft`, in the leads draft's shape: a model call through `askForJson` with a new gateway purpose,
  `person_draft`; sixty an hour a person; Ask's daily budget; nothing written.
- It reads, under the member's own session: the person as their page knows them (`server/readers/person.ts` and
  `toPersonVM`: their facts, their last exchange, their visits and deal, their timeline, their notes), and the
  business (its name, tone, languages, services by name, booking link).
- It is told the wire, so the words fit it, and it answers one of: questions (at most two), or the words (and a
  subject), or a call's brief; and always the note for the receptionist.
- Customer words and notes are fenced as data (`packages/contracts/src/ai/fence.ts`). Notes for the team alone reach
  a call's brief, which is the member's, and never a message.
- Written in the owner's voice, never the receptionist's. A price or an offer of money that the member's own words did
  not give is refused by code, and nothing of it is kept (`contracts/config/policy.ts violatesNoPrices, namesMoney`).
- Ask's palette is unchanged: no new tool, no new card. "Ask about them" from the sheet is not built: the palette
  opens under a modal sheet, where it cannot be reached (§0.1).

### 4.6 The send

- `POST people/[id]/message` takes the wire, the words or the approved message, a subject, who answers, and the plan as
  the note. It is sent once for each press of Send, under the client's own key (`api.ts` `once`): `route()` answers a retry
  with the first receipt whole, and the same words sent again later go.
- Core's `beginConversation` reads People's own row for the person, asks `writeWaysOf`, and refuses in words before a
  thread is opened or a row written. It then asks what the reply verb would refuse after the thread exists (the words
  and their length on the wire, with a first text's line on; an approved message's standing and its purpose against the yes
  to offers; a first email's subject), with the verb's own sentences, so a refusal opens no thread. It opens their thread
  through the one door, hands the message to `replyToConversation` with the wire it judged, keeps the note, and then,
  for the receptionist, hands the thread to `handBack`.
- The job's payload says `starts` where the message is one. `sendQueued` then asks the door for a start's consent and
  names the send a `reply`, so the pause the member's own message took does not hold it. An edge that does not know the
  word sends the message as the reply it was before: either deploy order works.
- A first text is given the line that says how to stop, as the receptionist's first reply by text is.
- A first email names its subject and threads under nothing (`packages/channels/src/email/request.ts:200-205` already
  builds one). A second email before they answer is filed under the first's subject.
- A thread with only our words is answered on the wire they went by, in the view model and in the reply route alike,
  and what is written there is a start: the reply route hands it to `beginConversation` (§0.3).
- The ledger's row is the reply's, and says it was a start; the activity log words it "Began a conversation".

### 4.7 Doors in

- `inbox/new` and `inbox/new:<person>` open the sheet, as `campaigns/new` opens Campaigns' composer.
- A person with no thread gains the door their page lacked: "Start a conversation", which opens the sheet on them
  where the member stands (the frame holds it).

### 4.8 Not in this lane, and why

| Left out | Why | What it would take |
| --- | --- | --- |
| The receptionist placing the call | It changes a promise the product makes and needs a consent that does not exist (F11) | Decision 0038, written in this lane as a proposal: a recorded yes to calls, the wire, the record |
| The member's words inside an approved message | The Inbox refuses a template that needs words (`reply.ts:433-439`); Meta judges such templates one by one | A slot the sheet fills, and a template written for it |
| Telling a member when someone answers a thread they hold | It is every reply's gap, not this lane's (F2), and touches who is told what | A lane of its own: a bell row and a push, once a hold |
| A note that ends | Decision 0007's shape | A day a note stops being read |
| Texting someone who only ever wrote on WhatsApp, without their yes | The rule above holds it | His word, if he wants it looser |
| A yes recorded from the sheet, for someone met in person | Their page has the door, and the words it asks for | One press in the sheet where no wire can carry a message, with those words |
| The note offered for anyone with a number | The voice receptionist reads notes by number even where the text receptionist does not answer | One condition in `whoAnswers`, and the words for it |
| A message sent later, at a time the member names | The job takes a due time already; the sheet has no control for it and the row no words while it waits | The control, the words, and a test of the due time |

## 5. Server, by file

**New**

| File | What |
| --- | --- |
| `supabase/migrations/00351_a_member_opens_a_conversation.sql` | `conversation_open(p_tenant_id, p_contact_id)`: a member's door to a person's one thread |
| `packages/contracts/src/new-conversation/write-ways.ts` | The rule (§4.3) |
| `packages/contracts/src/new-conversation/new-conversation-words.ts` | Every word the sheet says |
| `packages/contracts/src/new-conversation/person-draft.ts`, `person-draft-schema.ts` | The draft's JSON shape, and what the routes parse |
| `packages/core/src/conversations/begin.ts` | `beginConversation` |
| `apps/dashboard/src/server/new-conversation/{ports.ts, person-draft.ts}` | The verb's world; the draft |
| `apps/dashboard/app/api/v1/people/[id]/{reach,draft,message}/route.ts` | Three routes |
| `apps/dashboard/src/surfaces/inbox/new-conversation/*` | The act, the store, the frame's host, the sheet and its own pick |
| `apps/dashboard/src/surfaces/inbox/keys.ts` | One small move: the key guard |
| `tooling/scripts/tests/new-conversation/*` | The lane's tests |
| `docs/decisions/0038-the-receptionist-places-a-call.md` | Proposed |

**Changed**

| File | What |
| --- | --- |
| `packages/core/src/conversations/reply.ts` | The template's shaping moves out; a first email; `starts` |
| `packages/core/src/messages/{send.ts, ports.ts}` | `starts` |
| `packages/contracts/src/conversations/{thread-channel.ts, inbox-thread.ts}` | A thread with only our words |
| `packages/contracts/src/workspace/activity.ts`, `shell/chrome.ts` | The log's words; the key |
| `packages/db/src/repositories/{thread.ts, email.ts, people.ts}` | The door's call; the last subject; the note |
| `apps/dashboard/src/server/{verbs.ts, ports/core-ports.ts, connections/email.ts, readers/person.ts, model-json.ts, ask/gateway.ts, rate-limit.ts}` | The reply's wire; the email ports; the reach reader; the purpose; the buckets |
| `apps/edge/lib/ask-gateway.ts` | The purpose |
| `apps/dashboard/src/surfaces/inbox/{inbox-route.tsx, conversations-route.tsx, pages/inbox-head.tsx, pages/inbox-page.tsx, pages/inbox-state.tsx}`, `surfaces/live/route.tsx` | The act; the address; the move |
| `apps/dashboard/src/surfaces/people/person/hero.tsx` | The door |
| `apps/dashboard/src/legacy/styles/{inbox.css, components.css}`, `legacy/Chanlytics.html` | Layout; the strip; their versions |
| `apps/dashboard/src/legacy-bridge/{refresh-map.ts, LegacyApp.tsx}` | What a send makes stale; the frame's host |
| `eslint.config.mjs` | Three folders held to the function limits |

## 6. Rules the lane meets

- One predicate per rule: `writeWaysOf` asks `mayMessageFor`, `isOfferByEmail`, `relationshipOnRecord`,
  `replyWindow` and `isOptedOutContact`, and restates none of them.
- One send door, and verbs over ports: `beginConversation` takes its world through ports and calls two verbs that exist.
- Every route declares its policy; the wire is snake_case; a new route says person (`people/[id]`), as the glossary
  asks of a new segment.
- RLS is the floor and the role is the door: the thread is opened on the member's own session, by a function that asks
  `is_acting_member`, which also gates a partner's seat.
- Nothing states a fact the database cannot support: the sheet draws the server's answer and People's own rows.
- What is measured may only fall: the functions measure falls by one (banked); the writers measure and the bundle rise,
  each with its row under Rises in `docs/debt.md`.
- Either deploy order works (§4.6). The migration is applied before the dashboard that calls it; until it is, the
  route says the thread could not be opened, and nothing else changes.

## 7. Proof

- The rule, case by case (`tests/new-conversation/write-ways.test.mjs`), over the table in §4.3 and each hold.
- The verbs over fakes: a start is refused before a thread is opened, and so is what the reply verb would refuse; a
  first text has its line; a first email its subject; the note is kept before the thread is handed back; the
  receptionist's thread is handed back; the payload says `starts`.
- The door on a replayed stack: one row a person, the same id twice, another workspace's member and a viewer refused,
  an erased person refused; the privileges and second-factor catalogues pass.
- The door at the wire, built: a start with no yes is refused, and a start under the member's own pause goes.
- The routes over the fake database and a fake model: who may, what is refused before the model, what the model is
  told, what is fenced, a price refused.
- The page on the stub React: the act on three routes, the pick, each wire's box, who answers, the call.
- In the browser, nightly: a person with no thread is sent an approved message and their thread opens; a phone draws
  the circle.
- In the running app from this worktree, before any push: both themes, 1440 and 390.

## 8. Decisions

Taken by default, as recommended, since he approved the plan; each is his to change.

| # | Decision | Taken |
| --- | --- | --- |
| D1 | The receptionist places no call in this lane | Yes; decision 0038 is written as a proposal |
| D2 | The act's name | "New conversation" |
| D3 | A start by WhatsApp or by text needs their recorded yes | Yes |
| D4 | Where the act stands | All three Inbox tabs; a circle on a phone |
| D5 | A brief is kept in the tab only | Yes |

New in this pass, and his to answer; the plan builds each as recommended and marks where it would change.

| # | Question | Recommended |
| --- | --- | --- |
| D6 | When they answer, who has the thread by default? | The receptionist, with the plan as a note, wherever it answers that person |
| D7 | May someone who phoned and never wrote be texted, or sent an approved message, without a recorded yes? | For a month after the call: they are answered at the number they called from, as the call's booking link is. After it, a message starts and asks their yes (the fourth pass; the third pass had no bound) |
| D8 | May a member write by email to someone who last wrote on WhatsApp? | Yes: it is about their own thread, and email needs only their address |
| D9 | A first email to someone with no history at all | Not from here: it is an offer, and goes from Campaigns |

## 9. Risks

- **The live workspace gains little by message today** (F1). The call's brief and the note are what it uses first. The
  approved-message path is the one to make good, and the words-inside-a-template follow-up is where it grows.
- **A stale plan** is read until its note is removed. The note is dated in its words; the member's page removes it.
- **The receptionist answering a plan it may not carry**: a price, a confirmed booking. Its own rules stand, and it
  hands those over, which tells the team.
- **A start judged twice**: once by the rule before queueing, once by the door fifteen seconds on. They ask the same
  predicate with the same facts; a yes withdrawn in between is refused at the wire, and the row says why.
- **Cost**: from 1 October 2026 Meta charges for in-window words and utility messages. Nothing here meters them.

## Appendix A. Production, 7 October 2026 (counts only)

| Workspace | People | With a number | With an email | Said yes | Yes covers a text | No thread | Threads | Window open | Window closed | Approved | Texting line |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| the live salon | 29 | 28 | 1 | 7 | 2 | 3 | 26 | 0 | 13 | 8 (1 utility) | none |
| chanlytics | 5 | 5 | 0 | 0 | 0 | 0 | 5 | 1 | 0 | 0 | active |
| the nightly's | 3 | 3 | 0 | 3 | 0 | 2 | 1 | 1 | 0 | 5 (3 utility) | none |

No thread anywhere has never been touched.

## Appendix B. Outside sources, read 7 October 2026

- Retell: `docs.retellai.com/api-references/create-phone-call`, `/api-references/update-phone-number`,
  `/features/inbound-call-webhook`, `/build/handle-voicemail`, `/deploy/twilio`; the notice of 31 March 2026 on a
  number's agent fields; its terms of service of 1 June 2026.
- FCC 24-17 (8 February 2024), 47 CFR 64.1200, 47 USC 227(b)(3).
- Twilio's messaging policy (13 April 2026): the first message to a recipient says how to stop.
- CTIA Messaging Principles and Best Practices (May 2023): conversational, informational, promotional.
- Meta: the Business Messaging Policy (23 September 2026); template categories; pricing from 1 October 2026; marketing
  templates not delivered to United States numbers.
- FTC's CAN-SPAM compliance guide: a transactional or relationship message, and a commercial one.
