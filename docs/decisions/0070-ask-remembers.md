# 0070 · Ask remembers

**Status:** Decided by Ruben on 21 October 2026 ("Build the whole of option 2 in one lane: memory, recall, journal, and
the morning turn on Today with the lead ideas inside it"), and built on the lane `ask/remembers` from main's
`b53a1b0ef`, not yet merged: its migration's working name is 00470, numbered at push. The analysis, checked against the
code and the API's own guidance: https://claude.ai/artifact/1cz1AjLDCE4sNBMQCWADNo. The lead ideas' part is option B of
https://claude.ai/artifact/QR4t5xUSHRGGmrr1mKgHyU. Where this note and the code disagree, the code wins.

## Context

Ask answered each question from the page and the thread it was asked in, and forgot the rest. A fact a member told it
in one thread was gone in the next (each thread rebuilt its own history, `server/ask/memory.ts` threadForTurn); what
was done on the site reached it only through an owner's deferred Activity read of thirty lines; and nothing ran unless
a member asked (decision 0062's D7, "a card on Today and a line in the bell", was left unbuilt). The lead finder's
ideas were written by a model boxed into one card (Maps) and five known places, with a prompt written for a local shop.

## Decision

1. **A memory Ask keeps itself.** `remember`, an act of Ask's, keeps one lasting fact the member tells it, in the
   member's own words: its `quote` must be words of this question, so nothing a customer wrote, a page shows or a read
   returned becomes one, and a turn Ask asks itself keeps nothing. The card arrives kept, with Undo (the API's memory
   tool's principle: the model keeps its own memory; no file tree), when the question bears the line out (its numbers
   and most of its longer words are the member's); a line in other words waits on its card for their press, as every
   other card does, so words a read planted are never kept unseen. At most forty live lines a workspace, every one in
   every turn; never a password, a key or a card's number (contracts `memoryTextProblem`). Members change and forget
   lines on Settings › Memory (the settings permission; the keeper forgets their own).
2. **A journal the note sweep writes.** Each day of a workspace something happened in, an hour after its midnight by its
   own clock, Sonnet 5.5 at low effort writes the day in a few sentences from both ledgers as Settings › Activity folds
   them, money left out, under its own ledger purpose (`ask_journal`). Owners read it (the Activity log is theirs);
   members' questions to Ask are their own, and the journal never reads them.
3. **Both ride into every turn's cached shape**, at the end of its second block (`companion/remembered.ts`), each line
   fenced as data; a change makes the next turn cold, as a setting changed does. Recall (`recall`, a core read) finds
   what was said before by its words: the member's own past turns, the memory and the journal (`search_ask`, 00219's
   index, no model).
4. **Ask speaks first, once a day, on Today.** When a member who acts arrives, Today asks for the morning: the day is
   claimed once a member a day (`ask_mornings`), one turn runs as the member after the response, in a thread of their
   own titled with the day, and Ask for you shows its Say and up to three cards, approved there through the card's own
   verb walk. The bell says so in one line (`ask_cards`, addressed to the member, no phone). The morning question names
   the lead finder's ideas, so the ideas reach the member as Ask's cards; past mornings leave the thread rail after a day.
5. **The ideas open up (option B).** The ideas writer stays the workspace's one store, upgraded: the model reads the
   business's services, notes and website and what the team told Ask, decides who buys, and writes four ideas across
   both finder cards and anywhere in the US, to a mix (one builds on what worked, two new groups, one wider), at medium
   effort; each is planned by Ask's own planners. New ideas is its own act (`again`): what was shown is passed on, so
   each press is four new ideas.

## Shape

- **Database (00470):** `ask_mornings` + `ask_morning_write`; `ask_memory_lines` + `ask_memory_write` (keep, change,
  forget); `ask_journal_days` + `ask_journal_open_days` + `ask_journal_write` (due, keep); `ask_message_words` and
  `search_ask`; `lead_suggestions_write`'s fifth act `again`; `notifications.kind` gains `ask_cards`, `ai_usage.purpose`
  gains `ask_journal`; `scrub_ask_for_contact` takes a person's lines and days too; `trigger_notes_sweep` asks when a
  journal day is due, once the journal has begun (the database cannot read ASK_JOURNAL; the first day is kept on a run
  the notes ask for themselves). One door a table.
- **Dashboard:** routes `GET/POST ask/memory`, `PATCH/DELETE ask/memory/[id]`, `GET/POST ask/morning` (maxDuration 150),
  `POST lead-suggestions {again}`; `server/ask/companion/` (remembered, morning, memory-pane); the tools `remember` and
  `recall` in the core; Today's Ask for you (`surfaces/today/pages/ask-for-you.tsx`, surface `ask_morning`); Settings ›
  Memory (`surfaces/settings/memory/`, surface `ask_memory`).
- **Edge:** the note sweep's last step, `writeJournal` (lib/notes.ts), one day at a time while the run has twenty
  seconds left of its fifty-five; askJson takes an effort.
- **Contracts:** `ask-memory/` (memory, journal, morning), the memory cards' specs (`ask-proposals/memory.ts`), the
  activity rows both ledgers become (`workspace/activity-rows.ts`, shared by Activity and the journal), the ideas'
  question (`leads/lead-ideas-ask.ts`).

## Switches, and how to undo

- `ASK_MORNINGS=on` (the dashboard) runs the mornings; unset, Today offers none and nothing is spent.
- `ASK_JOURNAL=on` (the edge) writes the journal; unset, nothing is written or spent.
- Memory and recall have no switch: they cost nothing until a member tells Ask something. To take the memory out of
  the prompt, `shapeOf` in `server/ask/loop.ts` stops appending `rememberedBlock`; to stop Ask keeping lines, `remember`
  leaves `ACT_DEFS` and `CORE_TOOLS`.
- The ideas: `effort: "medium"` back to unset is the old effort; `LEAD_IDEAS_SYSTEM` is one module
  (`leads/lead-ideas-ask.ts`).

## Steps

One lane, one pull request, both deploy orders: the migration goes to production before the merge (runbook step 4),
since every turn reads the memory and Today reads the mornings. Then the switches, on Ruben's word.

## Tests

The route policies, the tool registry's frozen words, the prompt's pinned rules, the ideas' question and reader, the
shared activity rows, the journal's lines and check, the morning's claim, the Memory pane, Ask for you, the bell's kind
in every table it must be named in, and the database suites on a stack built from this lane's migrations.

## Risks

- The memory rides into every member's turns: a line kept wrongly says something wrong everywhere until it is
  forgotten. The quote rule, the secret rule and the pane are the guards.
- A morning spends an Opus turn per acting member per day (about $0.02 to $0.08 each at the cached prices); the switch
  is off until Ruben turns it on.
- The journal's day is written from rows that carry names a customer gave; it is fenced, owner-only, and scrubbed with
  the person.

## Open questions

- A Today card when the member's day has nothing for Ask: today it says so in one line; it could draw nothing.
- Whether the journal should keep a purge clock (none now: a row is one active day of a workspace, at most 1,200
  characters).
