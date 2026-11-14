# 0129 · New opens on what's ready

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan it", on the canvas's N1 to N12, then "Yes, start stage 1"), and built the same day as its first stage. No migration. Written against main at `1e27bb9d7a`.

## Context

New (decision 0065) opened on an empty box, a list of at most four starts, and, in a workspace with nothing happening yet, two rows that led to other pages. A start was offered only once someone was already waiting in it, so a new business saw nothing to start, though a reminder is worth setting up before the first booking. Since 0065 the app learned to run ten moments (decision 0119 added three), to take a line by voice, and to count who every moment reaches. New used none of it.

The canvas _New: start from what's ready_ (11 November 2026) drew the page again in four stages. This note is the first: the first screen. The draft is untouched.

## Decision

1. **New opens on what is ready.** Up to four starts (`NEW_READY_MAX`), the first standing open. Who is waiting leads, most people first: a moment someone is in, a search's ready leads, the largest list nothing sends to. Then one offer to everyone who said yes, who are waiting for nothing, so it never stands over someone who is. Then the moments nobody is in yet. Which, and in what order, is one pure rule (`readyStartsOf` in the page's own `sequences/new/ready-rules.ts`) over what Campaigns already counts. Opening the page asks Ask nothing.
2. **A moment is offered before anyone waits in it.** Every moment a new sequence may start on here (the house's one rule, `momentOffered`, which knows the calendar) is a start, unless a sequence already stands on it, it is a proposal's where no deal was ever recorded, or it is a win-back nobody is in where nobody can hear an offer yet. The largest of the workspace's own lists that nothing sends to is a start too. The journey still draws a moment a calendar would offer, as waiting on one.
3. **The open start shows the message it would send where that is known:** the first of the moment's starters the workspace holds, drawn as a person reads it. Where none is held it says Ask writes it, and the words come with the draft.
4. **The line is one row, typed or said.** The house's one recogniser, held by the kit's mic (`kit/talk/held-mic.tsx`, which Today's sheet now shares). The field and the arrow keep their ids, and the arrow is always drawn: faint until the line says eight letters.
5. **One step away is always drawn** under what is ready.
6. **The journey takes the place of "Runs already".** A dot a moment, and a map: each moment with the sequence on it, or the press that drafts one, or what it needs (`newJourneyOf`).
7. **What changed while away is said once** (`newSinceWords`): what went from nothing to something. A line typed and left is kept in the tab and offered back there, never put in the field by itself, and let go as it is drafted. It is kept as the page's place, not as a draft: a line alone is still not work, and the tab closes over it without asking.
8. **A viewer reads what is happening:** the starts someone waits in, each as the fact it is drawn from, with nothing to press; the journey and its map, with no draft to press.

## What it does not do

- **The draft is unchanged** by the first stage. It arrives whole; a change by saying is step 2, below.
- **No pace on the open card,** and no "set up the basics" in one press: both read what New does not read yet.
- **No count of cancellations nobody filled** on a freed time's start: only Ask reads it today.
- **Nothing walks back to New** from People or Leads; their own doors into New stand as they were.
- **Order is by who is waiting,** never yet by what earned a booking.

## Step 2: a draft is changed by saying it

Proposed on 11 November 2026, after the first stage shipped, in answer to Ruben's ask that the later stages be weighed
again ("not over coding more and more rigid functionalities … I should just be able to one line type or audio"), and
built the same day. The rule it follows: **a screen shows, the line changes.** A button that changes one thing one way
(Warmer, Shorter, Say it again) is a guess at what an owner wants; a line takes what they want in their own words.

1. **The draft keeps a line under it** (`sq-nw-change`): the first screen's own line (`line.tsx`), typed or said with
   the held mic. Enter says it, as Today's line does; the first screen's line now does too, where Enter wrote a new line.
2. **What is said changes the draft that stands.** The page tells Ask the draft as it is, edits by hand included, each
   step in the shape Ask answers one in (`standsOf`, `NewDraftAsk.stands`); POST sequences/draft takes it beside the
   line, tells the drafter the draft as data with the one rule a change adds (only what was asked changes:
   `drafts/sequence-change.ts`), and judges the answer as it judges any draft. A change may be one word; a first line
   still says enough.
3. **Ask's answer is that draft, changed** (`changedFrom`): a step that says what it said is the step it was, never a
   second writing of it; what the owner set by hand that Ask never names stays (how each batch is decided, whether new
   leads join, a one-off's channels); who it was for stays where the answer names no one the request lists; a number its
   email already said is its owner's to keep.
4. **What changed is said on top, with Undo** (`changesOf`): the line said, "Ask changed step 2", and the changed step
   wears an edge on the rail. Undo puts back the draft that stood. A change by hand after it is the owner's, and the Undo
   goes. A change Ask could not make is a toast over the draft, which stays, and the line keeps its words.
5. **While Ask changes it the draft stands whole,** dimmed and unpressed, with Stop on top: the page keeps its length
   and the owner their place at the line.
6. **Warmer, Shorter and Say it again leave New.** The words sheet is for typing words; "Or say it" on a draft built by
   hand is the line itself.

A renamed draft's first step goes on carrying the sequence's name, by hand or by the line: left under the old name, its
box said that name where it says its message, and the make sent it (`setName`).

What step 2 does not do: it does not stage the draft's arrival, page through real people in its words, or send a test
from a draft, which the canvas drew as its second stage; and Warmer and Shorter still stand in the Messages editor, a new
conversation, a lead's email and Ask's cards. What New cannot draft at all is not yet handed to Ask.

The step's tests run a stand-in model: they prove what it is told and how its answer is taken, never what it writes.
That was read from real drafts the day it went live.

**What the first real run found** (11 November 2026, live, on the demo workspace; nothing kept or started). A step
added, a wait and an hour changed, a signature, and one word ("warmer") each changed what was asked and left the rest;
a discount and a channel that does not exist were left out and said. One ask failed: "make the second message shorter"
came back with the second message gone. The model had shortened the WhatsApp words past a value the email still named;
the message door refuses a message whose versions name different values, and the judge left the step out. So:

7. **A step a change rewrote in words that cannot be kept stays as it stood,** and the draft's card says so
   (`stepStays`), where the answer holds the same steps as the draft that stands. A change never loses a step its
   owner did not ask to lose.
8. **The drafter is told every version of a message names the same values.** First drafts lost steps to the same
   refusal.
9. **A change that changed nothing is said in passing** ("Ask changed nothing"), with nothing to undo; what Ask left
   out is the draft's card's to say.
10. **A step that cannot be kept says why,** in a clause its owner can act on (`NEW_WORDS.cannot.why`, or the message
    door's own words): "Step 2 was left out: its email or text names a value its WhatsApp words don't."
11. **Ask is asked once more** where the judge cannot keep a step's words, told which step and why, and the better of
    its two answers is kept. A second call that fails leaves the first standing; it is never asked a third time.
12. **A change that names no step leaves a message the business holds as it is,** and says so. Only where the owner
    names the step is its message written new: one word ("warmer") no longer sends an approved message back to Meta's
    review.
13. **Undo steps back through every change the line made,** newest first, each shown with what it changed.
14. **A name signing a message stands on a line of its own,** last.

15. **After a visit, only the first step Ask writes is about the visit; a later one is an offer.** Ruben's call, 12
    November 2026 ("Yes, an offer"). An invitation back weeks after a visit was filed as about their booking: it went by
    text, and to people who had never said yes to offers. Now a later step on a visit's moment is marketing whatever Ask
    says: only a yes to offers hears it, never by text, and WhatsApp reviews it as marketing. Ask is told the same rule.
    A message the business already holds keeps the kind it was approved as.

**What a review of the code found** (12 November 2026, after the live runs: six holes, five proven by running the real
judge over a stand-in model). The live runs had tried one kind of draft, a sequence to people with nothing typed into
it; and the page's test answered the draft's door with a canned draft, so nothing an owner typed ever went through the
judge. The holes shared a cause: on a change, the judge judged again what Ask had not touched.

16. **What Ask left word for word as it stood is taken as it stands,** never judged again
    (`campaigns/sequences/draft-stands.ts`): a discount the owner typed into their own message, which the rule that Ask
    types no price had emptied on any change; an email to leads they wrote themselves, which any change had emptied
    where it broke a cold email's rule. In a step Ask did change, words the owner typed into the message that stands
    there are still theirs.
17. **A lead's email whose rewrite does not hold stays as it stood,** said with why, and Ask is asked once more, as a
    person's message is. It came back empty, with nothing said. On a first draft its step is still kept with its words
    left to write, and the draft now says why.
18. **A step added after the draft's own moves none of them:** the step that stood at a place is still what a refused
    rewrite there falls back to. An answer with fewer steps took one away, and nothing falls back.
19. **A second answer is kept only where it mends:** more steps kept, or as many with fewer refused and none taken
    away. One that only left the refused step out had won, and the step was gone with nothing said.
20. **A change is asked of the draft as it stands,** never under the choices of the door New was opened by: a draft
    switched to leads since was refused on every change.
21. **Discard stops Ask at work,** whose answer had drawn the discarded draft again; and the name is held while Ask
    works, where one typed then was written over.

A change is now tried on every kind of draft before it is called done: a sequence to people, a message sent once with a
value typed into it, and a sequence to leads.

Items 7 to 14 were run again live on the demo workspace on 12 November 2026, the day they shipped: no step was lost in
four asks that had lost one before, a change that named no step left an approved message as it was and said so, a
signature stood on its own line, Undo stepped back through four changes, and a change took about five seconds.

**What pressing the live page found** (13 November 2026, the run that tried items 16 to 21 with the real Ask: all six
held). Five things on the page itself, the first there since 20 October and found only because a pointer pressed it:
every test of the draft pressed its controls through their props, on a page with no stylesheet.

22. **A step is pressed where it is touched.** A step's box is one press laid over the whole of it (`place.css`), and
    the step's own controls sat under that press: a pointer on Take away opened the step and took nothing away, one in
    a value's field opened the message picker, and Edit the words opened the picker too. The controls stand over the
    press (`new.css`). A message's words, which stood over it by the bubble's own layout and opened nothing, are the
    box's press again. A browser spec presses each with a pointer.
23. **A draft discarded lets the line's words go.** A change still out when the draft went had left them in the next
    draft's line.
24. **"By Ask" is said only of words still as Ask wrote them** (`change.ts` `placesByAsk`, read against what Ask last
    drafted): an email the owner rewrote, a message whose words they edited, and a step they added and wrote said it
    too, since it was said of any step in a draft Ask had drafted.
25. **A line that changed nothing and says why stands on top, over the card that says why,** with Undo, which puts the
    card away. It was said in passing and the card stood under the change before it, reading as that change's. One
    that changed nothing and says nothing new is still said in passing.
26. **What Ask said it left out goes with the steps it was said of:** a step swapped, rewritten, added or taken away by
    hand lets the card go. It stayed up over a message since swapped, and Undo brought it back. A wait, a value typed,
    who, when and the name leave it.

### What the same day's second run found (13 November 2026, the five above pressed on the live app)

27. **Words that run long never lose the draft.** One draft in six came back "unreadable" (502): Ask's answer was read
    whole and refused by its shape, where what it left out (`cannot`) was held to 300 characters it was never told of.
    The route's line carried no cause, which a cut-off or broken answer keeps, and the notes drawn that run were 213,
    271 and 274 characters: a line that leaves out two things quotes both, and a clause more loses everything. Ask is
    told its room now (300), and a note past it is kept: whole to twice that, then in the whole sentences that fit
    (`left-out.ts`), in a draft and in an email's rewrite, which held the same 300. A draft's name and a written
    message's title, refused the same way past 120 and 80, are cut after a whole word at 80. An answer still out of
    shape is refused as it was, and its refusal keeps which fields broke it as its cause, never what they held, so the
    route's line says which.
28. **A customer offer carries the discount its owner asked for, and never one Ask made up** (Ruben, 13 November
    2026, asked after the same run: one draft in five wrote “20% off … valid until Sunday” into a customer's message
    where the other four left it out, by a rule written for cold email that every draft was told and nothing held for a
    customer). A message to people may name a price, a discount or a date only as the owner gave it, in their line or
    in what stands of the draft they are changing (`numbers.ts` ownerPriceWords): Ask is told so, the rule for leads
    says leads, and the judge holds it. A message Ask writes that names one the owner never gave is refused with why
    (`unsaidPrice`, then asked once more), and a value Ask types with one is left blank, as before. A cold email still
    names none, whoever gave it. This reverses the rule of 12 November that a first draft's typed price was always Ask's.
29. **A change never says the owner's own change is left out** (Ruben, 13 November 2026, after the live run of item
    28: “A one-off offer to everyone who visited in the last 90 days: 20% off any service this week”, then “Make it
    30% off everything”, then “Make it warmer”, whose note said “Left out: “20% off any service this week””). A change
    was told the owner's first line and the draft as it stands, and nothing of what the draft already said it left
    out, so a part the owner had changed since read as one Ask could not do. The page now sends that note with the
    draft (`stands.cannot`, optional, so a page opened before it still changes a draft), Ask is told it as data, and
    the rule for a change says to say again what is still left out and never the owner's own change since.
30. **No part of Ask's answer that runs long loses the draft, and what a change did is read out** (Ruben, 13 November
    2026: "continue fixing gaps", the gaps left after item 27). Item 27 let a note, a name and a title run long; the
    answer's other parts still refused the whole draft by a length the model is never held to (who said in words past
    60 characters, a when past 40, a typed value past 300, a call's words past 600, an email past 2,000, more than eight
    steps). The answer's shape now holds its types and closed sets alone, and each part is held where it is used: a key
    that names nothing is none, a time it cannot read is none, a typed value and a call's words are cut to what they
    hold, each message's words are the message door's to judge (a step that does not hold says why, as any does), a
    lead's subject past what a subject holds is left to write with its email, a condition is said once, and steps past
    the most a draft holds are said (`NEW_WORDS.cannot.stepsPast`). An answer cut off at its ceiling says it ran long
    and to ask for less, never to try again, and the log says it was cut (no draft has come near the ceiling: the
    longest of 125 answers in the 30 days to 13 November used 698 of its 2,000 tokens). The line on top is one status
    while Ask works and after, so what a change did is read out as it lands, and the note of what a draft leaves out is
    read out too. A step's press on the rail draws one keyboard ring, the box's: every button's ring drew a second
    round its title, under the box's, on every sequence's steps (seen live on the demo, 13 November).
31. **A whole draft fits what Ask may write, and a first draft that fails says why** (Ruben, 13 November 2026: "Yes,
    fix both", after the live run of item 30). "The day after every visit: nine messages, one a week, each a different
    tip" came back cut off: six steps Ask writes, each in three versions, ran past the 2,000 tokens the edge held every
    small draft to, where the drafter asked for 2,400. A sequence's draft now has a ceiling of its own,
    `SEQUENCE_DRAFT_MAX_TOKENS` (4,000), the one number the edge's gateway holds it to and the drafter asks for; the
    other small drafts keep 2,000, and an answer spends what it writes, never the ceiling. A first draft Ask could not
    write says why in the server's words (an answer that ran long, a day's budget spent, a paused workspace), as a
    change's toast already did, where it said "try again in a moment" whatever the reason.

32. **A draft promises only the steps it holds** (Ruben, 13 November 2026: "Yes, fix it", after the live run of item
    31). Asked for nine weekly tips, Ask wrote past the six steps a sequence to people holds; the draft kept six, and
    the sixth ended "Three more to go", a promise of tips that never come. Ask is now told the most is the most however
    many the owner asks for: it writes only the steps that fit, whole on their own, none counting toward, numbering
    itself among or promising a message past the last, and says in its note that the rest are left out. The cut of any
    step past the most stays, and still says so.

## Deploy order

Either. The dashboard alone changes; no route, no table, nothing the two apps share.

Item 31 changes both apps, in either order: the edge writes the lesser of its ceiling and what the dashboard asks for, so an edge first holds the old ask to 2,400, and a dashboard first is held to the old edge's 2,000, as before.

## Held by

`tests/campaigns/new-ready.test.mjs` (the rules), `tests/campaigns/new-ready-page.test.mjs` (the first screen drawn), `tests/playbooks/campaigns-drafts.test.mjs` (the line still drafts, and a line alone is not work), and `e2e/campaigns/campaigns-loads.spec.ts` (nothing drawn while loading is taken back). Step 2: `tests/campaigns/draft-changed-by-saying.test.mjs` (what the drafter is told of a draft that stands, how its answer is judged and taken, what changed said, a step that stays, the second ask, why a step cannot be kept) and `tests/playbooks/campaigns-drafts.test.mjs` (the line under a draft, on the page: asked, changed, Undo, a change Ask could not make, a line that says why, a draft discarded, a message its owner rewrote). A step pressed with a pointer: `e2e/campaigns/sequences.spec.ts`. The second run's (27): `tests/sequences/sequence-draft.test.mjs` (a note, a name and a title that run long, in a draft and in a rewrite, and the fields an answer out of shape names). Item 28: `tests/sequences/sequence-draft.test.mjs` (a customer offer keeps the owner's figure and refuses another) and `tests/campaigns/draft-changed-by-saying.test.mjs` (a change that names a new figure gives it). Item 29: `tests/campaigns/draft-changed-by-saying.test.mjs` (a change is told what the draft leaves out as it stands, and the door takes a change without it). Item 30: `tests/sequences/sequence-draft.test.mjs` (every part of an answer that runs long, and one cut off at its ceiling) and `tests/playbooks/campaigns-drafts.test.mjs` (what a change did, read out). Item 31: `tests/leads/engine/lead-gateway.test.mjs` (a sequence's draft's own ceiling), `tests/sequences/sequence-draft.test.mjs` (what the drafter asks for) and `tests/playbooks/campaigns-drafts.test.mjs` (a first draft that failed, in the server's words). Item 32: `tests/sequences/sequence-draft.test.mjs` (what Ask is told when the owner asks for more steps than fit).
