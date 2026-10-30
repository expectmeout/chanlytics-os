# A draft learns from what its owner changed

**Asked by Ruben, 30 October 2026**, once decision 0078 was on production (#1948): "how does the LLM invoking the
drafts remember, so that if a user edits a past draft to send for a type of business it can use its own intelligence
to provide a better draft next time, based on history sent and/or edited saved drafts, rather than tons of rules or
training it?", then "analyze your plan against the codebase and vision to see if you have a better plan", "Write the
spec", and "review for refinements or fixes and then continue to build it end to end until fully complete". Decision
0078's second step: its "Later" list named "learning a line from each edit, or at Start" and "the facts re-ranked by
replies". Written against main's `b56811f28` (#1948), by hand, no sub-agents.

**Status:** built on the lane `sequences/a-draft-learns-from-its-edits`, with no migration; decision 0078's note says it
as its step 2. The review before the build corrected four things in the first version of this spec, said where each
part lands below: the make a page sends goes through `sequence_create_leads` (the `make_sequence` decision), not
`saveChain`; Ask's own cold-email card carries nothing; Leads' "A draft by Ask" carries the pair too; and an edit made
after Start pairs as well, since the words are read as they stand.

## Why

Read on main `b56811f28`:

- **The drafter learns from examples already, and only from finished ones.** `ownerOf`
  (`apps/dashboard/src/server/sequences/draft.ts`) handed the model the business's description, services and tone,
  every live memory line, and the first emails of the two newest started sequences to leads, as the owner left them.
  So an edit did carry into the next draft, once its sequence was started, but as a destination: the model saw what
  the owner sent, never what they changed, and the change is the strongest word on their taste.
- **Ask's draft was kept nowhere.** New holds it in the tab until Keep or Start (`new-page.tsx`, `KeptHere`); the
  make body is the draft as it stands (`new-model.ts` `makeBodyOf`); the chain door writes the words into
  `templates.components`, and a later edit overwrites them (`reach_out_save`; the `words_changed` triggers only reset
  `words_ok_at`); the model ledger (`ai_usage`) keeps tokens and a hash, not words.
- **The examples were unlabelled.** The two newest, first step only, with no word of what each was for or how it did,
  though both are known: each chain names its search (`ReachOutChainDto.search`), and its report counts each step's
  written, wrote back and said no (`chainReportOf`, 00211 `reach_out_chain_report`).
- **What Ask takes from an edit was invisible.** A paste leaves a line in Settings › Memory ("Learned from how you
  write", 00493); an edit left nothing an owner can read, keep or forget.

The loop this closes exists twice in the product. Decision 0063 turns an owner's correction of the receptionist into a
suggestion they keep or dismiss, never applied on its own. Decision 0070 lets Ask keep a memory line by its own card:
kept at once only when the words are the member's own, else waiting for their press, so words a read planted are never
kept unseen. This step gives the cold-email drafter the same shape, with no new store and no new sweep, and Ruben's two
standing words hold it: the model is handed the facts and judges them, and 0078 is finished rather than a new
mechanism opened.

## What is decided

1. **What Ask drafted is kept in the make's decision.** A sequence to leads made from Ask's draft keeps, in its
   `make_sequence` decision (which `sequence_create_leads` writes in the make's own transaction, 00459), the owner's line
   to Ask and each step's email as Ask wrote it: `as_drafted`, never a step's. New sends it with Keep or Start, and
   Leads' "A draft by Ask" (the bulk Add and the lead sheet) with the kept draft it makes, which the owner then edits on
   its page. A sequence by hand keeps none, and neither does Ask's own cold-email card (`reach_out_make`): nothing edits
   a card's words before Approve, so its pair would always say "sent as drafted". No migration.
2. **The drafter is shown labelled history, and judges it itself.** The three newest started first emails to leads,
   each with what it was for (its search's name), how it did (its first email's report: "To 14, 3 wrote back, 1 said
   no"), what Ask drafted and what the owner sent; where the two are the same, "They sent it as Ask drafted it"; where
   no draft was kept, what they sent alone. The words are read as they stand, so an edit made on the sequence's page
   after Start pairs too. No code picks by trade: the labels are data. One rule line says what a pair means: what they
   changed is how they want it, what wrote back is what worked, and no sentence is copied.
3. **Ask notices, the next morning, and asks before it remembers.** On a morning after the member edited a cold email
   since yesterday, and only then, the morning's question asks Ask to read the cold emails the member edited (the sequences read's new action, `edited`): their own makes only, each
   first email that is theirs, changed from Ask's draft or written whole. Where what they changed shows a lasting habit,
   one card may be a line to remember about it ("In cold emails: short, signed Cheers with a first name"), which waits
   for Approve; kept, it is a `learned` line in Settings › Memory, with Forget, read into every turn and every draft. A
   card that waits is titled "Remember this?"; only one kept at once says "Remembered". A morning with nothing edited
   asks as before: no read, no round, no word of cold emails (the refinements after the first build, 30 October).
4. **The `remember` act's gate, said for a read that hands the turn the member's own words.** The `edited` read marks
   what the member sent as theirs on the turn (`ToolContext.theirs`), and nothing else a read returns is ever marked. A
   line may quote the question, as before, or those words: then it must start "In cold emails:", it is learned, and it
   always waits for their press, since what they wrote is evidence of a habit, never their word that it is one. The
   morning's turn keeps nothing of its own question, as before; with no words of theirs read, it is refused as before.
5. **Facts ranked by replies wait for replies.** Choosing the hours fact over the rating by what wrote back is one read
   of `reach_out_report`'s angles, but production holds tens of sends and a handful of replies: nothing to rank by. It
   is worth building at about twenty replies in a workspace, and stays on 0078's list until then.
6. **Three rules hold whatever is learned** (0078): nothing about the business its record does not state, no link in a
   first email, the foot and the way to say no. The length rules stay.

## What changes, part by part

### 1. The ledger (no migration)

`makeLeadSequenceNow` (`apps/dashboard/src/server/sequences/doors.ts`) takes `as_drafted` off the first step it parses
and hands it to the door's decision (`decided(ctx, { name, copied, as_drafted })`), which `sequence_create_leads` merges
into the `make_sequence` payload as it does today. `packages/db`'s `sequenceMakes`
(`repositories/campaigns/sequence-makes.ts`) reads it back: the newest make of each sequence to leads, by id or by who
made it since a moment, under the member's row security (`decisions_member_select`), by `decisions_tenant_subject`. The
pair holds the owner's words with their placeholders (`{{opening}}`, `{{business}}`): no lead's facts, no reply.

### 2. Contracts

1. `sequences/new-draft.ts`: `AsDrafted`; `asDraftedOf(asked, emails)`, the pair's half a page sends, from Ask's answer
   as it came; `asDraftedFrom`, a payload read back; `sentAsDrafted`, the same subject and words, spacing aside.
2. `ask-memory/morning.ts`: `ASK_MORNING_QUESTION` gains one sentence, as the member: read the cold emails I edited
   since yesterday, and where what I changed shows a lasting habit, one card may be a line about it, starting "In cold
   emails:".
3. `ask-proposals/memory.ts`: a memory card whose payload says `learned` commits `source: "learned"`.

### 3. The dashboard's server

1. `sequences/bodies.ts`: `AS_DRAFTED`, each email held to a step's own limits, optional in `NEW_MAKE_BODY` and in
   `LEAD_FIRST_BODY`; `new-make.ts` `leadFirstOf` copies it into the first step.
2. `sequences/draft.ts`: `startedExamples` reads the three newest started chains (`chainsOf`), their makes
   (`sequenceMakes`) and each first email's counts (`chainReportOf`), each read able to fail alone; the pure
   `examplesOf` shapes them; `exampleSaid` says each fenced as data under "First emails to leads the owner started
   before, newest first: what each was for, how it did, what Ask drafted and what they sent". `EXAMPLES_MAX` is 3.
3. `ask/tools/read/sequences.ts`: `readEdited` (the sequences tool's `edited`, `days` 1 by default, 30 at most) over the
   pure `editedOf`; `readColdEmails` moves here beside it from `campaigns.ts`, which keeps under its 800 lines.
4. `ask/tools/context.ts`: `ToolContext.theirs`. `ask/tools/act/remember.ts`: the gate as decided (4).
5. `ask/companion/memory-pane.ts`: `keepMemoryLine` keeps `learned` beside `ask` and `pane`.

### 4. New and Leads

New keeps the draft as Ask last answered it beside the one being edited (`KeptHere.drafted`, kept in the tab), sets it
from each answer, clears it for a draft by hand, and sends it to `makeBodyOf`, which adds `as_drafted` for a draft to
leads Ask wrote. Leads' `draftLeads` (`campaigns/reach-out/surface.ts`) answers `as_drafted` with its steps, and the bulk
Add and the lead sheet send both with the make. Nothing drawn changes.

### 5. Today and Settings › Memory

Nothing new is drawn. A morning card is Today's card as 0070 draws it, with Approve and Undo, and the bell says a card
waits. A kept line is listed under "Learned from how you write", with Forget, as a pasted line is.

## Either deploy order

The dashboard alone changes; the edge is untouched. `as_drafted` is optional in every body, so a page loaded before the
deploy makes a sequence as today, with no pair, and a make without one reads as a sequence by hand.

## What this costs and saves

- A draft: three pairs and their labels, cut at 900 characters a side, on Opus 5.5, once per sequence: about a cent;
  three report reads beside it.
- A morning: one read of a few hundred tokens. No new model call anywhere.
- No migration, no new table, no new sweep, no new page or pane.

## What proves it

- `tooling/scripts/tests/sequences/sequence-draft.test.mjs`: the pair's helpers; the drafter's block, labelled, the pair,
  "sent as drafted", none kept; `examplesOf`; `makeBodyOf` with and without Ask's answer, through `NEW_MAKE_BODY`,
  `leadFirstOf` and `LEAD_FIRST_BODY`.
- `tooling/scripts/tests/campaigns/a-draft-learns-from-its-edits.test.mjs`: the make door's decision holds the pair and
  its first step does not; `sequenceMakes` over the ledger; `editedOf`; `readEdited` marking the member's words alone.
- `tooling/scripts/tests/ask/remembers/what-ask-keeps.test.mjs`: a line quoting their own cold emails, in the morning and
  in any turn, is learned and waits; one without "In cold emails:", one quoting Ask's draft, and a morning that read
  nothing of theirs are refused; the memory card and route keep `learned`.
- The registry's tests and their frozen fixture (`ask-tools-operator.json`), with `sequences.edited` among the actions
  added since the rename (`tooling/evals/rename-ask-tools.mjs`).

## Considered and not taken

- **A column, `sequence_steps.as_drafted`.** Honest and typed, but a migration re-creating a door for one fact the
  ledger already has a row for: the make.
- **Learning at Start, kept at once.** One voice-reader call over the pair at Start, its lines kept with a receipt. The
  paste keeps at once because the owner pressed Use; Start is not that press, and 0070 keeps an inferred line on no
  other.
- **A suggestions state in Memory** (0063's shape: a column, Keep and Dismiss on the pane, a bell kind). Visible and
  honest, and a mechanism of its own; the morning's card is the same wait for the same press with none of it.
- **Code that picks examples by trade**, and **whole sequences as examples**: a label does better than a rule, and a
  follow-up is another kind of email.
- **Ask's own card carrying the pair**: its words are never edited before Approve, so it would only ever say "sent as
  drafted".

## Later, not in this version

- Facts ranked by replies (5), at about twenty replies in a workspace.
- The rest of 0078's list: Gmail's sent mail behind its own consent, a voice per member, a connecting sentence per kind
  of fact.
