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
9. **A change that changed nothing offers no Undo.**

Still to weigh, from the same run: one word with no step named rewrote both messages, and wrote a message the business
holds new, which waits for Meta's review again; and an invitation back that Ask writes on a visit's moment is filed as
about their booking, with a text version, where it reads as an offer.

## Deploy order

Either. The dashboard alone changes; no route, no table, nothing the two apps share.

## Held by

`tests/campaigns/new-ready.test.mjs` (the rules), `tests/campaigns/new-ready-page.test.mjs` (the first screen drawn), `tests/playbooks/campaigns-drafts.test.mjs` (the line still drafts, and a line alone is not work), and `e2e/campaigns/campaigns-loads.spec.ts` (nothing drawn while loading is taken back). Step 2: `tests/sequences/sequence-draft.test.mjs` (what the drafter is told of a draft that stands, how its answer is judged and taken, what changed said) and `tests/playbooks/campaigns-drafts.test.mjs` (the line under a draft, on the page: asked, changed, Undo, a change Ask could not make).
