# A cold email in the owner's voice

**Asked by Ruben, 30 October 2026:** after #1946 put every planned cold email in front of him, he read the two
waiting batches, rated the drafted words a 6, and asked for the logic before any drafting to be smarter: "the formula
should also take into account the user's preferences, like past sent cold emails: different users may want a type of
cold email totally different from any formula we think of", then "the smartest logic for users that feels smart and
sophisticatedly simple to use". A first version of this spec (a voice stored on the workspace, its own learner and
pane) was reviewed against the product and the backend the same day; he took the review's v2 ("Continue as you
suggest, then implement end to end in one PR and merge to main, no sub agents"). Written against main's `cf96ac20c`
(#1946).

**Status:** decided by Ruben on 30 October 2026 (v2), built on `sequences/the-owners-voice` (decision 0078).

## Why

Read on production on 30 Oct, in the workspace's two sequences to leads:

- **The opening and the words are written apart, so the first line has no point.** The check writes one line per
  business from its listing record (`apps/edge/lib/reach-out/check-one.ts` over contracts `openingSystemPrompt`), told
  only to show the owner looked. Since #1941 it may not guess, so it lists facts, and the words that follow, the same
  for every business, start over. Four of Brooklyn's openings were held again on 30 Oct for guessing after a rewrite:
  the model keeps reaching for a bridge it is not allowed.
- **The drafter is told nothing about the business it writes for, or how its owner writes.** `draftSequence`
  (`apps/dashboard/src/server/sequences/draft.ts`) hands the model the business's name, its goal line, its moments,
  lists, searches and messages. Not what the business does (`business_records.about`, which the check's writer
  reads), not its services or its tone (`profile.tone`, which the receptionist is composed with), not what a member
  told Ask (0070's memory), not one email the owner wrote. So Auto Shop's words said "we built Chanlytics to answer
  missed calls" from Ask's own guess, in Ask's own voice.

A formula of ours cannot be the rule: a cold email is the owner's voice to a stranger, and owners write nothing alike.
What we hold is the small set of rules that protect the owner; everything else is theirs, learned from how they already
write, and never asked for in a form.

## What is decided

1. **The owner's voice is Ask's memory, not a second store.** A line about how they write is a memory line (0070): "In
   cold emails: under 50 words, no greeting, signed Cheers, Ruben." It rides into every Ask turn, the drafter reads it,
   Settings › Memory lists it with where it came from, and Forget works as it does for every line. A line learned
   (from an email the owner pasted) says so: the memory line's source gains `learned`.
2. **The drafter reads what the business already says about itself:** its description, its services' names, its tone,
   every live memory line, and the first emails of the workspace's last two started sequences to leads, as the owner
   left them. Those are the owner's final words, so what they changed in Ask's draft carries into the next one with no
   diff stored. It writes in that voice, says what the business offers as the business says it, and may say who the
   email goes to as the owner's own act ("I'm writing to a few auto shops in {{city}}"), never as a fact about them.
3. **One optional paste.** A draft to leads with no learned voice says under its steps: "Paste an email you've sent,
   and Ask writes the way you do." Pasting reads it once (one model call, about a cent), keeps up to three lines on how
   they write, and drafts again. A draft written with learned lines says them instead: "Written the way you write: …
   · Memory".
4. **The opening is a fact, written by code where the listing holds one.** Open 24 hours, the weekday closing time
   with Saturday's and Sunday's, or the rating with its reviews: one sentence from the listing's own fields
   (`leadFactOf`). The reader still reads it once, so a business in another language is held as today and a sentence
   the reader cannot back goes the writer's way; the writer and its rewrite are not asked. On production on 30 Oct, 36
   of 70 leads had hours in the three shapes code reads ("Open 24 hours", "Closed", "8:30 AM to 5 PM") and 65 a
   rating with 20 reviews or more.
5. **The preview shows that opening.** Preview as a real lead draws the fact's sentence for a lead whose row holds one,
   read in the browser with no call; for one without, the line still to be written, as today.
6. **Three rules hold whatever the voice says:** nothing about the business its record does not state (the reader
   reads every opening, code and model alike); no link in a first email; the foot and the way to say no. The length
   rules stay (80 words for a first email, 50 for a later one).

## What changes, part by part

### 1. The database (migration 00493, `a_memory_line_may_be_learned`)

1. `ask_memory_lines.source` takes `learned` beside `ask` and `pane` (its check constraint re-made).
2. `ask_memory_write` re-created as 00470 wrote it, its keep accepting `learned`; its comment says what each source is.
   Grants as they were.

### 2. Contracts

1. `reach-out/reach-out-facts.ts`: `leadFactOf({ business_name, city, hours, rating, reviews })` answers a
   `WrittenOpening` (its sentence, its angle, its `facts_used`) or null. In order: every day "Open 24 hours" ("… is open
   24 hours, seven days a week."); every day one closing time ("… is open until 8 PM every day."); Monday to Friday one
   closing time, with Saturday's and Sunday's said as the listing has them ("… is open until 5 PM on weekdays and until
   1 PM on Saturdays."); then a rating of 4.0 or more with 20 reviews or more ("… has a 4.8 rating across 66
   reviews."). A day missing, a shape it cannot read, or weekdays that differ: no hours fact. The name is the one the
   business is called by (`leadCalledByOf`), as every email says it.
2. `ask-memory`: `ASK_MEMORY_WORDS.sources.learned` ("Learned from how you write").
3. `sequences/sequence-voice.ts`: the paste's body schema (40 to 4000 characters), its answer, `VOICE_WORDS`, and the
   voice line (`voiceLineOf`). `NewDraftDto.voice`: the learned lines a draft to leads was written with.

### 3. The dashboard's server

1. `sequences/draft.ts`: `DraftKnown` gains `about`, `services`, `tone`, `memory` and `examples`, read with the rest;
   the user content says them fenced as data; a RULES line says how to use them. The draft answers `voice`.
2. `sequences/voice.ts` and `POST /api/v1/sequences/voice` (approve, as Start is): the paste read by one model call
   (purpose `sequence_draft`) into up to three lines, each kept through `ask_memory_write` as `learned`; answers the
   lines kept, and whether memory was full.
3. Ask's `propose_sequence` cold email: its description says to write in the owner's voice, from what Ask remembers.

### 4. The edge

`check-one.ts`: `checkInputOf` adds the record's fact; `checkOne` reads it once before the writer, and keeps it where
the verdict passes, holds it where the hold is the language's, and asks the writer as today where the reader cannot
back it. The preview door (`preview.ts`) builds its input the same way, so it costs one call where it cost two or four.

### 5. The pages

1. New's draft to leads: the voice line under its steps, or the paste (a field and Use), gated as Start is; Use keeps
   the lines and drafts again.
2. Preview as a real lead: the fact's sentence where the lead's row holds one.
3. Settings › Memory: a learned line says so.

## Either deploy order

The migration goes first. Then either app: an edge before the dashboard writes fact openings that the old pages show
as any opening; a dashboard before the edge drafts with the voice and shows the fact in its preview; nothing an old
client sends is refused.

## What this costs and saves

- An opening with a fact: one reader call where today's costs a writer and a reader, and a rewrite of both when held.
- A paste: one call, about a cent. A draft: a little longer for the examples and the memory lines.

## Later, not in this version

- Learning a line from each edit, or at Start, beside the started emails the drafter already reads.
- Gmail's sent mail as evidence, behind its own consent.
- A voice per member, where two people send in different voices.
- A connecting sentence per kind of fact, approved once, so the opening and the words join without a seam.
- The facts re-ranked per workspace by the replies each kind gets (Reports' "Replies by angle" counts them already).
