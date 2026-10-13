# 0052 · A person found as a lead keeps the business and earns a name

**Status:** Decided on 12 October 2026 (Ruben, on canvas A v3.1 of the person page and its ten calls: "all approved as
you best suggest"), built on 12 October 2026 in the lane `person/the-record` (not yet merged; see Built, below). Written against commit `132ab95eb` (main, 11 October 2026) with the
`wiring/records-not-pages` lane's tree applied (decisions 0047 and 0048, migrations 00408 to 00410), which this lands
after. Where this note and the code disagree, the code wins.

## Context

A lead the finder found becomes a person at the first cold email: `reach_out_person`
(`supabase/migrations/00344_the_other_writers_match_through_the_door_and_a_doubt_is_a_row.sql:934`) makes them through
`resolve_person` with the lead's address as the identity and `display_name` set to the business's name, and writes
`leads.contact_id`. From then on the person is the business, for good:

- Nothing reads who answered. The reading of a reply (`packages/core/src/messages/reply-read.ts:303`,
  `REPLY_SCHEMA` in `packages/contracts/src/reach-out/reach-out-replies.ts:118`) returns an intent, a summary, a day
  and a referral, and never the name the writer signed with, though the signature is in the text it reads.
- Someone else at the business who answers our email from their own address is a stranger: `resolve_person` makes them
  a person with no tie to the lead, since `person_link_lead` (00346) links a lead only by the lead's own number or
  address. `reach_out_reply_of` (00237) already knows the reply cites our Message-ID; nothing uses that to link them.
- The person page draws the business as the person (`apps/dashboard/src/surfaces/people/person/hero.tsx:325`), with
  the lead as one "Open the lead" door in About (`sections.tsx:113`). People, the Inbox, Leads and Campaigns say the
  business where a person's name belongs, and a greeting says "Hi Bloom".
- A person's name has no source. A typed name, a WhatsApp profile name, an import, a calendar title and the business's
  name are one `display_name`, so no door can tell which may replace which.

## Decision

1. **The lead is the business record.** A person carries the business they work at as `contacts.lead_id` (one lead,
   the newest; many leads still name one person through `leads.contact_id`). No businesses table.
2. **Who links to a lead:** the first cold email and an Interested call (the lead's own person); a reply that cites our
   email (its `In-Reply-To` or `References` carries our Message-ID), whatever address it came from; a person who writes
   or calls from the lead's own number or address; a member, by hand. Nothing is ever inferred from an email domain.
   Linking never lifts the customer-domain hold: a chain still running holds its next send for the owner.
3. **A name has a source**, `contacts.name_source`: typed, import, calendar, signature, wire, lead. The engine replaces
   only a strictly lower rank (lead < wire < signature); a booking or an import replaces a `lead` name; nothing
   replaces a typed name.
4. **A signed reply offers its signer's name, one press, wherever it is read.** The reading returns its signer; the
   name must appear verbatim in the writer's own lines and pass the human-name gate. The offer is a notice in the person
   head, the Inbox thread header, the Leads peek's In People row and the bell row; one press renames everywhere, and
   Undo puts the business's name back and settles it, so that sign-off is not offered again.
5. **Automatic naming** when two independent signals agree (the signer and the From phrase, or the signer and the
   address's local part), never for a role mailbox, an assistant-like title, a no, a STOP, an automatic reply or a
   reply signed by two people. It ships switched off, and is switched on once the signer evals pass on the live key.
6. **Greetings wait for a look.** `firstNameOf` gives no first name for a `lead` name, nor for a name the engine set
   until a member has opened the person since.
7. **One human, two doors: Combine.** A person named for the business who never wrote and the human who answered from
   another address at the same lead may be combined, an owner's press; merge (0028) lifts its two-addresses refusal for
   exactly that pair, and the person is the one kept, with their own name and address, whichever page it is pressed
   from. The business's address stays the lead's. One who answered without giving a name keeps none: the business's
   name is the record's, never theirs (00420, 13 Oct 2026; until then the page offered Combine only to a named person).
8. **Erasure has a person leg.** Erasing one of several people at a lead removes their address, number and notes from
   the lead and bans no place; the last person out blanks and bans as today. Erasing the lead first keeps its people and
   strips a name that is the lead's placeholder.
9. **The calendar matches a booking by the business's name** ("matched by their business", a guess as a name is),
   only where exactly one person People holds works at that business.
10. **The lock on the yes** (a lead's yes is never a member's) covers every person linked to a lead; "Not at this
    business" lifts it.
11. **Honest toasts.** Undo only where an inverse door exists; otherwise the true correction ("Missed instead",
    "Propose again") or nothing; confirm first for stop, no, merge and delete. This amends
    `apps/dashboard/src/legacy/CLAUDE.md`'s rule that every write offers Undo.
12. **The seen mark is written on every open**, so "new since you last looked" covers what the team did too.
13. **Tabs are addresses**, `people/<id>[/history|visits|deals|campaigns]`, written with replace.

## Shape

- **Storage** (one migration): `contacts.lead_id` (foreign key, null), `contacts.lead_settled_at`, `contacts.name_source`
  (check of the six words, null for a person made before it), `contacts.name_settled_at`; `reach_out_replies.signer_name`,
  `signer_title`. A trigger on `leads` (insert, and update of `contact_id`) sets the person's `lead_id` when it is null,
  or when the lead is newer and `lead_settled_at` is null; it never writes `leads`. Backfill from `leads.contact_id`.
- **Doors**, definer, called by the dashboard's routes: `person_name_adopt`, `person_name_undo`,
  `person_name_decline`, `person_join_lead`, `person_leave_lead`; the reply's apply links its writer when the reply cites
  our email. Events `contact.named {source, was, via, message_id | call_id}`, `contact.business_linked`,
  `contact.business_unlinked`, ids only (0036).
- **Reads:** `people_list` gains the lead's id and name, the name source and when it was settled, and matches the
  lead's name in its search; the person's read carries the business (its listing, stage, verdict, reach-out, people
  here) through `toLeadPeekVM`'s contracts output.
- **Contracts:** `leadFaceOf` (the head's tile or face, name and line for each lead state), `personNoticesOf` (the
  notices: name, address, consent candidate, step from a call, consultation with no proposal, draft waiting, collision,
  combine), `personNextOf` (Up next, at most four rows), `personRouteOf`, `signerOf` with the human-name gate, and
  `firstNameOf`.
- **Page:** the person page of canvas A v3.1: a sticky identity rail (the head, Reach them, Where they came from, Works at,
  Messages and receptionist, Lists), four figures, the tabs, and Overview (Up next, their last words, Notes with the
  composer, Deals, Coming up); on a phone the same order with a 52 px foot dock. The business sheet is the kit's Sheet
  holding a BusinessRecord part.
- **Surfaces:** the business trails a person's name, dim, on People, the Inbox list, Conversations, Today, the Calendar
  panel and Live; Leads' Stage reads "Talking · Priya Nair ›" and its peek lists In People; the Inbox header carries the
  notice and a "Works at" chip; the bell row's body ends "Signed Priya Nair · Use this name".

## Steps

Each step ships in either deploy order: a reader treats an absent column as "none", and a door no app calls yet waits.

1. **Storage and doors**: the migration, its doors and events, `people_list`, and the packages' repositories.
2. **The signer**: `REPLY_SCHEMA` and its parse, `signerOf`, the apply's columns and the reply's link; the signer evals.
3. **Contracts**: the view models above, the person's read and the lead's business on it.
4. **The page**: the rail, figures, tabs as addresses, Overview, the business sheet, the phone dock, notices, toasts.
5. **The surfaces**: People, Leads, the Inbox, the bell, Campaigns' greetings, Ask, the receptionist's line.
6. **The edges**: Combine, the erasure legs, the calendar's business match, the lock for linked people.
7. **Automatic naming**, behind its switch, off.

## Built (12 October 2026)

In the lane, on a throwaway stack with every migration replayed: the migration (00413, and 00414, the index that finds a
business's people, built CONCURRENTLY alone in its file), its doors
and the copies it changes (`resolve_person`, `set_person_name`, the reply's `reach_out_reply_of` and `_apply`,
`people_page`, `people_list` with the offered signer, `merge_people` for Combine, both consent doors for the lock,
`lead_set_stage` with who the call reached, `leads_erase_on_contact` and `lead_blank` with `lead_person_leg`, and Got it:
`person_notes.for_seen_at` and `person_note_seen`); the signer through the reading and its gate, with ten signer
fixtures and their eval (`tooling/scripts/evals/reply-signers.mjs`, dry passes; the live run waits for the key); the
page (rail, figures, tabs as addresses, Overview with Up next and their last words, the business sheet, the phone
dock, the notices and honest toasts); People's rows and search, the Inbox list, header and Conversations with the
business trailing the name, the Inbox header's notice and Works at chip, Leads' In People, the call sheet's "Who did you
speak with?", the bell's line, the calendar's business match, the Activity sentences.

A reply from another address at the business links its writer and moves nothing else: its no, its step and the leads
it closes stay the lead's own person's, as before this note, and its signer is the writer's alone, so a colleague's
signature is never offered as the name of the person they answered for (a first build moved the no to the writer and
left the person we wrote to unanswered; the reply suite now holds both).

Then, in the lane `person/business-everywhere` (12 October 2026): the business trails the name on Today's queue (each
row names its person, `person_id`), the Calendar's appointment and Live's row and head, all from one reading of People's
rows (`apps/dashboard/src/surfaces/people/business-trail.ts`); Leads' row says who at a business is in People (contracts `leadPeopleOf`:
its face is the one with a name of their own most recently in touch, never the stand-in while someone there has a name),
its Talking stage is the door to that face ("Talking ›" beside the name, "Talking · Priya Nair ›" in the Stage column),
the line under the name reads "2 people · Priya Nair, Leah Brooks", the name card says who is in People, and a won deal
with anyone there makes it a client; the Inbox's Works at is a door beside the head on a desk that opens the business
sheet over the thread (loaded on the press), and words in the head on a phone; Ask's `leads.lead` returns the lead's
people, and Ask asks about a stand-in as "this person"; and a person a lead names, or who works at one, has a disabled
Yes with the doors' sentence as its caption.

Then the deferred list (12 October 2026, built beside the business-everywhere lane, not yet merged), each a step of its
own:

- **The composer's day chips**: For and the day are the kit's toggle group (Anyone · Me · a teammate; Tomorrow · Friday
  or next week · Pick a day), a press on the day chosen takes it away, the button names the result ("Add step for
  Tomorrow", contracts `composerDays`, `stepDayName`), and the draft is kept in the tab (`useUnsavedWork`).
- **History's "new since you last looked"**: contracts `newSinceOf` over the reader's own mark as the visit began (their
  words and calls after what the mark had seen, everything else after it was last written; nothing on a first open, nor
  what the visit itself brought), a dot on each row and on the History tab (the kit's sub-tab `fresh`), the mark
  written after a dwell.
- **Record navigation**: "‹ 4 of 24 ›" beside the frame's People on a desk, the first rows of More on a phone, from the
  People view the person was opened from (`surfaces/people/walk.ts`), each step a replaced address on the tab the
  person was on, and the people either side read before they are asked for.
- **The sticky rail and strip**: the identity rail holds still beside the work column, held to the scroller's height
  and scrolling inside itself; the tab strip sticks under the top bar and wears the control layer's glass only once
  stuck; on a phone a swipe across the work column walks the tabs (data-bits `touchSwipe`, a page that stays).
- **The Call popover's outcome sheet** (canvas A M4, P2; Your call A3): on a desk Call opens a popover, the dial and then
  "How did the call go?"; on a phone Call dials and the sheet rises when the app comes back; "Log a call you already
  made" in More. Spoke · Call back later · Left a voicemail · No answer · Wrong number, and Interested and Not interested
  where the business is an open lead; Call back's days (Call back later starts on Tomorrow); what was said; "The
  receptionist should know", off; Save names what it saves. One door, `person_call_logged` (00417): a note, the team's
  unless the receptionist should know, a step with a day (beside the note where the receptionist reads it), and the
  outcome through `lead_set_stage` where the lead is open and has its own person (a lead nobody stands for is never
  moved: its Interested would make a second person), never Spoke, Wrong number only where the person has no number of
  their own, and a lead already Talking kept so by a call that went nowhere; the door writes no lead itself. Call rang
  `tel:+` alone before this (a stripped number kept only the plus): the number is now contracts' (`personCallOf`).
- **The motion grammar's wash**: a value someone else changed while the page is open (the figures, the state, the name,
  Up next, their last words, History's newest row) takes the kit's wash (`kit/motion/wash.tsx`: a fill that fades over
  1.6 s, nothing moves) and is said once, politely; nothing on the first paint, on a move to another person, or just
  after the reader's own press.
- **The lead's other addresses**: `people_list` carries the lead's address and the ones the finder read off its site
  (`lead_emails`, 00418) on the lead's own person alone, and the calendar takes a booking from one of them as theirs,
  "matched by their business" (contracts `personLikeOf`, `matchPerson`, `visitsIn`).
- **The receptionist's line for a stand-in**: the person's lines say a name that is the business's as the business they
  are at, never theirs, and to ask who is speaking if it helps (`describeLead`, `LeadContext.standIn`). Two cases on
  trial in the nightly evals (`stand_in_not_named_en`, `stand_in_says_their_name_en`, with a case's `who`): owed a live
  run on the eval key before the line is relied on.

## Tests

The doors on the throwaway stack, as a suite of their own
(`tooling/scripts/tests/people/doors/a-person-found-as-a-lead-keeps-the-business-and-earns-a-name.db.test.mjs`: adopt,
undo, decline, a colleague's signature, join, leave, the trigger's one way, Got it, who the call reached) and in the
reply's (`tooling/scripts/tests/reach-out-replies/reply-read.db.test.mjs`: the writer linked only on a cited Message-ID,
the no kept on the lead's person, the signer kept and offered); `signerOf` over the gate's cases (role words, the business's own name, a
member's name, a quoted line, two signers); `leadFaceOf` over the seven lead states; `personNextOf`'s ladder and cap;
`personNoticesOf`'s one home per notice; `firstNameOf` for each name source; the page's tests updated for its new shape.

## Risks

- A wrong name on a customer's record is worse than the business's name: the press is the default, Undo settles, and
  automatic naming waits for evals.
- `resolve_person` and `merge_people` are replaced whole; the copy is taken from the latest definition by script.
- The wiring lane changes the same page and surfaces: this lands after it and is merged with main before review.

## Open questions

None; the ten calls of canvas A v3.1 are this note's Decision.
