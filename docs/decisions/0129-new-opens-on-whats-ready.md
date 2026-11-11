# 0129 · New opens on what's ready

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan it", on the canvas's N1 to N12, then "Yes, start stage 1"), and built the same day as its first stage. No migration. Written against main at `1e27bb9d7a`.

## Context

New (decision 0065) opened on an empty box, a list of at most four starts, and, in a workspace with nothing happening yet, two rows that led to other pages. A start was offered only once someone was already waiting in it, so a new business saw nothing to start, though a reminder is worth setting up before the first booking. Since 0065 the app learned to run ten moments (decision 0119 added three), to take a line by voice, and to count who every moment reaches. New used none of it.

The canvas _New: start from what's ready_ (11 November 2026) drew the page again in four stages. This note is the first: the first screen. The draft is untouched.

## Decision

1. **New opens on what is ready.** Up to four starts (`NEW_READY_MAX`), the first standing open. Who is waiting leads, most people first: a moment someone is in, a search's ready leads, the largest list nothing sends to. Then one offer to everyone who said yes, who are waiting for nothing, so it never stands over someone who is. Then the moments nobody is in yet. Which, and in what order, is one pure rule (contracts `readyStartsOf`) over what Campaigns already counts. Opening the page asks Ask nothing.
2. **A moment is offered before anyone waits in it.** Every moment a new sequence may start on here is a start, unless a sequence already stands on it, it is read off a calendar that is not connected (`momentNeedsCalendar`), or it is a proposal's where no deal was ever recorded. One of the workspace's own lists that nothing sends to is a start too.
3. **The open start shows the message it would send where that is known:** the first of the moment's starters the workspace holds, drawn as a person reads it. Where none is held it says Ask writes it, and the words come with the draft.
4. **The line is one row, typed or said.** The house's one recogniser, held by the kit's mic (`kit/talk/held-mic.tsx`, which Today's sheet now shares). The field and the arrow keep their ids, and the arrow is always drawn: faint until the line says eight letters.
5. **One step away is always drawn** under what is ready.
6. **The journey takes the place of "Runs already".** A dot a moment, and a map: each moment with the sequence on it, or the press that drafts one, or what it needs (`newJourneyOf`).
7. **What changed while away is said once** (`newSinceWords`): what went from nothing to something. A line typed and left is kept in the tab and offered back there, never put in the field by itself, and let go as it is drafted. It is kept as the page's place, not as a draft: a line alone is still not work, and the tab closes over it without asking.
8. **A viewer reads what is happening:** the starts someone waits in, each as the fact it is drawn from, with nothing to press; the journey and its map, with no draft to press.

## What it does not do

- **The draft is unchanged.** It arrives whole; a real person in its words and a change by saying are the next stage.
- **No pace on the open card,** and no "set up the basics" in one press: both read what New does not read yet.
- **No count of cancellations nobody filled** on a freed time's start: only Ask reads it today.
- **Nothing walks back to New** from People or Leads; their own doors into New stand as they were.
- **Order is by who is waiting,** never yet by what earned a booking.

## Deploy order

Either. The dashboard alone changes; no route, no table, nothing the two apps share.

## Held by

`tests/campaigns/new-ready.test.mjs` (the rules), `tests/campaigns/new-ready-page.test.mjs` (the first screen drawn), `tests/playbooks/campaigns-drafts.test.mjs` (the line still drafts, and a line alone is not work), and `e2e/campaigns/campaigns-loads.spec.ts` (nothing drawn while loading is taken back).
