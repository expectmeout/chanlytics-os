# 0087 · Ask notices from the facts, and remembers what it offered

**Status:** Decided by Ruben on 2 November 2026 ("Yes, build step 1", then "continue all steps before any checks or
commits"), after the review of Today's Ask found card at main's `ade2a1aa6`. Built on the lane
`ask/morning-leaves-batches-to-your-ok`, with no migration. It amends decisions 0070 and 0071.

## Context

Ask found held what one model turn left each morning, on the first arrival on Today. The turn cost about a dollar a day,
wrote cards in a thread of its member's own, and left no way to tell: a card set aside on Monday could return on Tuesday,
two operators were each offered the same thing, a card stood over what another page had already decided, and a press that
found its subject gone was offered again. The owner saw nothing of what an approved idea went on to earn.

## Decision

1. **What the facts can say needs no model.** A sequence whose replies fell, and one whose last three batches all went
   out, are a pure fold over the sequences and their batches (contracts `askFindingsOf`). Derived on each read and stored
   nowhere, a finding closes itself when its facts move, every member sees the same one, and it is there on arrival.
   Today's rows tag it "Ask noticed", so it is never taken for a model's idea.
2. **Only what takes judgement goes to the morning.** The turn stays, for ideas nothing else would surface.
3. **A morning knows what the mornings offered.** Before its turn it is told what every member's mornings left in the
   last fourteen days and what became of each (contracts `latelySaid`). This rides in the turn's words, apart from the
   question, so the thread reads as it did and the question is still recognised exactly.
4. **Not today lasts a week, for everyone.** Today leaves out a card whose title was set aside or approved on any morning
   within seven days (contracts `settledTitles`). What Ask noticed is rested per member, in `memberships.views`, page
   `ask_found`, since no turn holds it.
5. **A card dies with its subject.** On each read a card about a batch or a held email is checked against the row, and a
   press the door answers 404 or 409 is kept as failed with `moved`, which is not offered again.
6. **Results come back.** A batch row in Your OK says when its first email goes and what its sequence's last batch earned,
   with a Decide for the emails an OK does not send. Ask found says what came of the ideas approved lately, and the next
   morning is told it.
7. **Trust grows by a card.** After three batches in a row that all went out, Ask offers the sequence's mode one step on,
   from "Ask me" to "Hold it so I can stop it", through the mode's own card, its undo and its door.

## What this does not do, and why

- **No stored record of decisions.** The review proposed a table. Deriving gives the same self-closing, shared list with
  nothing to keep in step, no erasure to extend, and no second home for a card's outcome (rule: one derivation per fact).
- **No morning run on a schedule.** A turn runs as the member signed in, on their session; a clock has no session, and
  minting one is a security decision of its own. Findings are ready on arrival, which is what the schedule was for.
- **No single ranked list across Need you and Ask found.** The redesign of 1 November 2026 keeps Ask found out of the
  count of who needs you and away from the coral. Within Ask found what hurts results comes first, then the morning's.

## Shape

- **Contracts:** `ask-memory/findings.ts`, `ask-memory/lately.ts`; `AskMorningDto` gains `findings`, `rested` and `lately`,
  each absent from a server before it; `AskProposalOutcome.moved`; `batchFactsOf` and `batchHeldEmails` for the row.
- **Database:** no migration. `askMorningsSince` reads across members on the service client, a morning's rows being their
  member's under RLS: titles and outcomes only, and they reach only that workspace's members' turns.
- **Dashboard:** `server/ask/companion/findings.ts` beside `morning.ts`; `GET ask/morning` answers the new fields, so no new
  route; `withHeld` counts a batch waiting for an OK; `surfaces/today/need-you` draws them. The `ask_morning` surface was the
  member's alone and heard nothing; it now draws the workspace's records, so it hears `send` and `campaign` on Today, and a
  batch decided elsewhere or a mode changed leaves it at once. What the feed does not tell it is argued in
  `reads-not-heard.json` beside the surfaces that read the same rows.

## Risks

- `GET ask/morning` now reads the running sequences and the recent batches on each read for a member who acts, and is read
  again on Today when a batch or a sequence moves. `sequencesAtAGlance` keeps that read to what the fold needs, rather than
  `sequence_overview`'s counts, lists and searches.
- A title set aside hides only that title: a model that words the same idea afresh is held by what it is told, not by a
  rule. Most titles are built by the server from what they act on.
- The thresholds (three batches, ten emails, under half) are judgement, and no customer has run on them yet.

## Amended 2 November 2026 · Ask found

Today in three zones (the canvas of 2 Nov 2026, approved by Ruben the same day): what Ask noticed and the morning's ideas
are rows of Ask found, Today's third zone (contracts `askFoundOf`), ranked once with the workspace's own rules (Worth a
look's, which went), the calls worth a listen and the leads who tried their receptionist: three drawn, the rest said.
Each row is its tag, its one act and its sentence; the sentence opens its why (a rule's arithmetic and who it names
with Ask why beside it, a campaign's rules, what an Approve changes) beside Not today, which sets any row aside a week
for the member (`views.ask_found`, contracts `restedWith`, at most 25 kept). An idea's Not today is kept on its turn
besides, as point 4 says, so it stays out of every member's Today and tomorrow's morning reads it as set aside; a rule's,
a call's or what Ask noticed rides no turn and rests for the member alone. What Ask noticed takes the card's act: the door
it names (replies that fell: "Look at it"), else Approve (a mode one step on). What came of an idea approved lately stands
under them. The morning writes no Say of its own (the canvas's D9): nothing draws it, so its question asks only how many
cards it made. Ask found stays out of the one count; where Need you draws no pane it leads the page and its first act
takes the coral when nothing before it in the walk holds it (setting up included), which the line above from 1 November,
"away from the coral", no longer says.
