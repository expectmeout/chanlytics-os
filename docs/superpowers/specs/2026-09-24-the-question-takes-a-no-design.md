# The question takes a no

Ruben, 24 Sep 2026, on the wedding photographers search: the round stopped after the first 16 and asked "Some of the
first 16 are large studio chains and other kinds of places, which I'm leaving out. Is that what you meant?" with
**Yes, keep going**, **Include what I left out** and **Stop here**. "What if the answer is no but I want it to update the
search accordingly?" The notification said to go to People, not Leads.

Approved the same day: design A (a fourth answer, **Change what I asked**, through the finder that already exists),
plus an email and a device alert when a search stops to ask.

## What is true on main (5df49c26), and wrong

1. **Include has never worked.** The runner keeps the question as `{sentence, criterionKey, dropTerm, asked_at}`
   (core `ports.ts` `RoundQuestion`, stored verbatim by `lead_collect_commit`). `server/leads.ts` `toSearchDto` reads
   `criterion_key`, so the page always gets `""`. Production confirms the camelCase keys (24 Sep, read-only). The strip
   then draws the generic "Include what I left out", which lifts nothing, so the plan keeps its version and
   `lead_round_answer` refuses: "the amended plan is version N+1". Each side has a test; nothing holds them together.
2. **"Change what I asked" starts a second search.** From the question's plan card it goes back to the composer; Plan it
   makes a proposal; `leadFinderApprove` checks `proposal` before `set.more.answer`, so the approval creates a new search
   and the first one waits a day and dies.
3. **A pick on the answer's card breaks the answer.** The include card opens at version N+1; any word picked there runs
   `planVersionOf`, which makes it N+2, which the door refuses.
4. **Include keeps dropping the term.** `lead_round_answer` never clears `question`, and `startRound` applies
   `question.dropTerm` on every resume, so Include still drops the term that found the kind just included.
5. **Include never re-judges.** The route's comment says it re-judges what the exclusion left out. Nothing does. And the
   main phase skips every place the workspace already holds (`placeIdsHeld`), so the 9 left out can never come back.
6. **The bell says "Open People".** `serverNotificationRows` prefers the route's verb, and `clients/leads:s-…` matches
   `/^clients/`. The same rule makes a finished search say "Open People" too.
7. **Nothing reaches the owner outside the tab.** The row is written by a SQL trigger, so no email; `ALERT_KINDS` holds
   only derived kinds and the bridge alerts only on derived rows, so no device alert. Today has no noun for the kind.
8. **An unanswered question rings "is done".** The trigger rings `leads_ready` for every ending but `stopped`, so
   `question_unanswered` says "Your search for … is done · Nothing new was counted."
9. **The evidence is behind a tab.** A search view with no class reads counted Qualified members; under an email
   standard nothing is counted at the question, so the table is empty and says "Describe the businesses you want and
   Claude finds them." The bell, the standing line and the rail all land there.

## The design

### The strip

The question keeps its sentence (it is stored per round; old rounds keep theirs). Four answers:

| Answer | Button | What it does |
| --- | --- | --- |
| keep | **Yes, keep going** (primary) | as today |
| include | **Include large studio chains** | opens the plan card with that chip lifted, in answer mode |
| change | **Change what I asked** | opens the finder in answer mode, empty, under the question |
| stop | **Stop here** (quiet) | as today |

Include is drawn only when the plan still holds the key; a button that cannot work is not drawn. The line under the
sentence: "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found."

### Answer mode

The finder already has it (`finderMore.answer`); it becomes whole.

- `finderMore` for an answer carries `{ searchId, answer: true, question, baseVersion, count }`, `baseVersion` being the
  round's `plan_version`. Every fresh Find resets `finderMore` to null, so an abandoned answer never leaks into a new
  search.
- **Compose.** The question is said above the input; the placeholder is "Tell Claude what you meant"; no suggestions.
  Plan it sends one Ask turn that names the search, the question, the plan's sentence and exclusions, and the owner's
  words, and asks for the same search with the answer applied, keeping what they did not change
  (`leadFinderAmendAsk`). The card that comes back is the amended plan.
- **The card.** The count is words, not a picker: the reservation was made for it. The button says **Update the
  search**; the month's clamp (`leadPlanAsk`) does not apply, since nothing new is reserved; the "Find N" title is not
  drawn. **Change what I asked** goes back to compose and stays in answer mode.
- **Approve.** In answer mode the answer route is taken first, whatever proposal the card came from, and the plan is
  sent at `baseVersion + 1` with the original count, however many words were picked. A refusal is said under the button.
  Success closes the finder and says "Carrying on with your change."

### The engine

- `toSearchDto` reads `criterionKey` (and `criterion_key`, which nothing writes, for safety). A test builds the question
  with core's own `afterProbe`, stores it through the route's fake as the runner does, and reads it back through
  `GET lead-searches`.
- `startRound` applies `question.dropTerm` only when the answer was keep.
- **An answer that changed the plan re-judges the first places (PR 2).** On the resume after `include`, before the main
  phase is sized, `rejudgeProbe`:
  1. takes the round's members the judge answered whose `judgment.plan_version` is below the round's (none on a
     retry that already ran);
  2. reads the probe runs' items again from the source's dataset (a read, not a run; a dataset outlives the day a
     question waits), and cleans them as the collect did, suppressions applied;
  3. reuses each place's stored answer when it answers every key the amended plan asks (the kind, every exclusion,
     every criterion): Include is then free and exact. Otherwise the places are judged again under the amended plan,
     in batches of 25, under the deadline;
  4. classifies each with contracts' `classify` through the collect's own `memberOf`, and reads marks for places
     leaving Excluded;
  5. commits through a new door, `lead_round_rejudge`.
- **`lead_round_rejudge(p_round_id, p_plan_version, p_places, p_judgments)`**, service role only, one transaction, the
  round locked first. Refuses `{ok:false, why}` unless the round is running at that plan version. Keeps judgments by
  op_id. For each place, the member of this round and search, skipping a blanked member, one already at this version,
  and one the owner decided (`kept_at` set, or its lead worked past Ready or linked to a person). It writes the class,
  exclusion, fit, reason and judgment (with `plan_version`, shares kept). A place leaving Excluded gets its listing
  columns and email filled where empty; a place entering Excluded loses its email and listing columns, as a left-out
  place never keeps them (PRD §0.4). Counting follows the collect: a newly Qualified member counts while the round's
  reservation has room; a counted member that is no longer Qualified gives its lead back to the reservation. One
  `lead.round` event says how many changed. The check phase then checks the emails of places now waiting on theirs,
  as it does for any member.

### Telling the owner

- **The row.** The trigger stays the one writer (it is transactional, once per round). Title: "Your search for
  {name} is waiting for your answer". Route: `clients/leads:s-<id>:c-excluded`, the left-out pile, since a question is
  only asked about places left out. The `leads_ready` ring skips `question_unanswered` as it skips `stopped`: the
  question's own row and the strip's "Stopped after a day without your answer" say it.
- **The verb.** `clients/leads` routes say "Open Leads". `leads_question` keeps its own verb, "Answer it", over the
  route's.
- **Today.** `AWAY_NOUN` gains `leads_question`: "search is waiting for your answer" / "searches are waiting for your
  answer".
- **Email.** When the runner moves a round to the question it tells the workspace by email, best effort after the
  commit, through `notify.ts`'s addressing (a new `mail` half of `notify`; the row is the trigger's, so nothing is
  recorded twice). Subject: the row's title. Body: the sentence, the line about waiting, and a link to
  `<dashboard>/w/<slug>#/clients/leads:s-<id>:c-excluded`. An unaddressable workspace gets nothing (no redacted
  platform notice: the platform has nothing to do about a question).
- **Device alert.** `ALERT_KINDS` gains `leads_question`, and the bridge alerts on kept rows of those kinds as it does
  on derived ones: new since the tab loaded, unread, the tab not in view, the owner's switch on. The bell's surface
  re-reads on every notifications insert, so this fires in an open tab. Native push is #959's (`PUSH_KINDS`, scheduled
  in `notify`): whichever lands second adds `leads_question` to it and schedules the push from the runner's tell.

### The page

- A search waiting on its answer opens on its left-out pile from the rail, the standing line and the bell.
- Its counted view, when opened, says "Nothing is counted yet. It is waiting for your answer above." with no Find.

## Two PRs

1. **The question can be answered** (migration: the trigger only): items 1–4, 6–9, the strip, answer mode, email,
   device alert, Today, the waiting view.
2. **An answer re-judges the first places** (migration: `lead_round_rejudge`): item 5.

## Testing

- Contracts: the verb rule, `AWAY_NOUN`, `ALERT_KINDS`, the mail words.
- Routes over the fake db: the question's round trip from `afterProbe` to the DTO.
- The stub-React harness (`leads-finder`, `leads-honest`): the four answers, no Include for an unknown key, change opens
  answer mode, a fresh Find clears it, approve in answer mode posts `include` at `baseVersion + 1` with the count even
  after picks and with a proposal present, the count is words, the waiting view's empty state.
- Bridge: a kept `leads_question` row that arrives after load alerts; one present at load does not.
- Edge: the tell mails the tenant's addresses with the link, and sends nothing when unaddressable.
- Runner over the fake world: keep still drops the term, include does not; a pure lift re-classes from stored answers
  with no judge call; a new key judges again; a retry does nothing twice.
- Database, red run first: the trigger's title, route and silence on `question_unanswered`; `lead_round_rejudge`'s
  refusals, counting both ways, the §0.4 blanking, the owner-decided skip, idempotence.

## Not in this

The question's threshold and wording rules (P4) stay. No new source, no new round kind, no change to what an answer
costs: Include and Change what I asked spend only from the round's existing reservation.
