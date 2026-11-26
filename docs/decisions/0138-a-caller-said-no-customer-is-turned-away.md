# 0138 · A caller said not a customer is turned away, and what was kept off the list is counted

**Status:** Decided by Ruben, 17 November 2026 ("Continue all left out that is not dependent on me end to end in one pr
nothing missed or left out and merge main", on the five things [0136](0136-a-call-that-asks-for-nothing-holds-nobody.md)
left unbuilt). Built in one pull request: the six rules under Decision. One of the five is not built, and why is under
"What is not built": it is the one that needs Ruben.
Written against main at `5629b2d`. It amends 0136 (what a member's word does, and what says a call asks nobody) and
the order a message is taken through ([0031](0031-records-events-reactions-and-doors.md), `docs/inbound-gates.md`: one gate
more).

## Context

0136 left five things out, each with its reason. Read again on the same day:

**A marked caller refused before the receptionist answers.** 0136 could not open the provider's documentation. It
says (its inbound webhook's page, read 17 November 2026): the webhook's answer may carry `call_inbound: { reject: true }`;
only the boolean `true` counts; a refusal outranks the agent and every override; it is best sent alone, since a
variable or metadata the provider cannot take costs the refusal; the provider then ends the call before any agent or
voice is set up and **keeps no call**. What the caller hears is not said there.

**Texts.** 0136 answered them as before, because silence toward someone wrongly marked is worse than an answer to a
pitch. That weighed a guess. The word here is the owner's own, said of one person, with Reply anyway on their thread:
an owner who has said a seller is no customer and then watches the receptionist answer that seller's texts has been
told one thing and shown another.

**The carrier's verification of the number.** The provider's inbound webhook hands over the `X-` headers of the call
and P-Asserted-Identity (`custom_sip_headers`, which the door already reads for "keep my number"). A carrier that
checked the caller's signature says so in one of them: Twilio's `X-Twilio-VerStat`, or a `verstat` parameter on the
asserted number. Whether either reaches this door on production's lines is not known: nothing logged them.

**A figure on Reports.** 0136 wanted it counted in SQL, which is a migration. The ledger (`events`) takes a row from
TypeScript, members may read it (`events_member_select`), and the Receptionist lens's reader already makes reads of its
own beside the series.

**A caller's kind in the call's own analysis.** Unchanged: see "What is not built".

## Decision

1. **A caller a member said is not a customer is turned away before the receptionist answers.** The call-start plan
   reads the word with the caller's memory, off the thread's own row (db `readLeadContext`, contracts
   `saidNotACustomer`: no extra read), and the door answers the provider's refusal and nothing beside it
   (`apps/edge/lib/voice/inbound-call.ts`). No thread is held and no forwarding test is proven for a call nobody
   takes. Anyone else is answered; so is that caller wherever their memory could not be read or the plan ran past its
   budget, since a call is never refused on a read that did not answer. 0136's rule at the call webhook stands behind
   it for such a call.
2. **What they write is kept and not answered.** A new gate, after the STOP and before every branch that can speak or
   hold (core `inbound/gates.ts`, `not_a_customer` in `INBOUND_GATES`): the message is on their thread, nothing is said
   back, nobody is asked, and the message is stamped so no sweep takes it for one nobody finished. A START, or a YES
   OFFERS on WhatsApp, goes on to its confirmation (core `yesOwedConfirmation`, the one rule both gates ask): the yes is
   theirs to give, and its confirmation is owed. The word is read off the row the thread's live hold is read from
   (db `readLiveHold`), so it costs no read. A message reopens the thread it is kept on (`ingest_inbound`'s rule, for
   every thread), so the one answer to whose move a thread is (contracts `threadMoveOf`) files such a thread away
   whatever its state: left to who had the last word, it would stand in Needs you as unanswered, the list the
   member's word took it off.
3. **One predicate reads the word** (contracts `saidNotACustomer`, in `conversations/standing.ts`): the caller's
   standing, the Inbox's dock, the two words' verb, the call turned away and the message not answered. It was written
   out three times.
4. **The words say what the word does.** The menu's line, its toast and the thread's dock said the caller's calls "stop
   asking for you". They now say AI stops answering their calls and messages, which is what an owner has to know before
   saying it of a supplier.
5. **What the carrier said of the number is read, said and carried, and acts on one case.** contracts
   `voice/number-check.ts` reads the two headers into `passed`, `failed`, `unsigned`, or null for anything else. The
   inbound door says it on every call's line (`number_check`) and hands it on in the call's metadata where it said
   anything; the call webhook reads it back. A call with nothing said, from someone the business does not talk with,
   whose number **failed** its check, asks nobody for a call back (`unverified_silent`, beside `toll_free_silent` in
   `callBackNotOwed`). A number that passed, one never signed, one the business talks with, a caller who spoke and a
   caller who could not be read are held as before. If the headers never arrive, nothing changes.
6. **Every call kept off the list is on the ledger, and Reports counts them.** The event `call.screened`, with why
   (contracts `voice/screened.ts`): `refused` from the inbound door, the four of `callBackNotOwed` from the call webhook
   (its plan's `screened` step, which also writes the log line it always wrote), `selling` from the `reply_draft` job
   when a call back is set aside. Hidden from the Activity log by name, as the other counted kinds are. The Receptionist
   lens's reader counts them between the window's two midnights in the workspace's zone, a call once however often its
   row was written (db `countScreenedCalls`), and the lens says one sentence under "How calls ended": how many were
   kept off the list, by whose word (the workspace's, a reading's, silence or the carrier's). None is said too; a
   count that could not be read draws no line. Ask's report tool says the same sentence.
   A call turned away is no call the provider kept, so no other figure counts it. With any call kept off the list, a
   card that has no call to draw says "No call connected in this period", never "Nobody phoned": the two sentences
   that started 0136 could not both be true, and these two could not either.

## What is not built

- **A caller's kind in the call's own analysis** (a field the provider fills, for every call). Two roads, and
  neither is taken here:
  - On the agent, as the other analysis fields are. It reaches a live agent only through `voice-converge.mjs`, run by
    hand with the edge's secret, and the voice watch pages `voice_drift` each morning until it has. That is Ruben's.
  - Per call, in the inbound webhook's answer (`agent_override.agent.post_call_analysis_data`, which the provider's
    page lists). The same page says an override the provider cannot honour may cost the call, and nothing here can
    place a call to prove the shape: a mistake would turn away every caller on every line. Not sent blind.

  What it would add is narrow. A call back read as someone selling is already set aside by our own read (0136, rule
  4), and a call that needed nobody asks nobody whatever its caller sold. Left uncounted is the sales call the
  receptionist ended itself (0136, rule 7) that asked for no call back: Reports' sentence says what was kept off the
  list, and does not claim to count every seller who rang.

## Deploy order

Either. The edge alone turns a call away, leaves a message unanswered and writes the ledger's rows; the dashboard
alone counts and says them. A dashboard from before draws no sentence; an edge from before writes no row, and the
sentence says none were kept off the list, which is true of what the ledger holds. A call that arrived on an edge from
before carries no `number_check` in its metadata, and the webhook decides nothing on it.

## Tests

- `tests/voice/retell-inbound-door.test.mjs`: the refusal, alone, with its row and no hold; only a member's word turns
  a call away; the carrier's check on the line and in the metadata.
- `tests/voice/provider/a-call-that-asks-for-nothing-holds-nobody.test.mjs`: the two headers read; the rule and the
  plan for a number that failed its check; the `screened` step; the real door writing the row.
- `tests/inbound/the-gates-run-in-their-order.test.mjs`: the gate in its place, before the carriers' hold and before a
  pin drop or a voice note would hold; a START still confirmed. `tests/conversations/state/thread-move.test.mjs`: the
  thread stays off Needs you when they write.
- `tests/conversations/reply/reply-draft-verbs.test.mjs`: a selling call set aside is kept on the ledger; an email is not.
- `tests/reports/receptionist/screened-calls.test.mjs`: the count. `receptionist-report.test.mjs`: the sentence, the
  window, and "No call connected". `receptionist-page.test.mjs`: where it is drawn. `tests/ask/readers.test.mjs`,
  `ask-turn.test.mjs`: the route carries it and Ask says it.

## Risks

- **Someone marked wrongly hears nothing.** Their call is refused and their texts go unanswered until a member presses
  Reply anyway. The word is one person's, said by a member, with its Undo in the toast and Reply anyway on the thread's
  dock from then on; the menu, the toast and the dock each say what it does. The texts are still on the thread.
- **What a refused caller hears is not documented.** A busy tone or a failed call, by the provider's choice.
- **A carrier's failed check that is the carrier's own fault.** It keeps only a silent stranger's call off the list:
  the cost is a row, and the call is still on Conversations and in their thread.
- **The ledger's rows are best effort**, as every event is. A row that could not be written is logged
  (`emit_event_failed`) and the count is one short; the call is turned away, or left off the list, all the same.

## Open questions

- Whether a number that failed its check should say so on the call's page, once a week of `number_check` on
  production's lines shows what arrives.
- Whether a thread a member said is not a customer's should be archived again in the database when they write. It
  is reopened there and filed away on every page; Reports' count of unanswered messages, which SQL makes, still counts
  what they wrote.
