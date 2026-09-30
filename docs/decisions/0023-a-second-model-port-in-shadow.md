# 0023 · A second model port, in shadow

**Status:** proposed on 29 September 2026 (Ruben: build it, off by default; the switch is his, after a week of
agreement data and after the data-processing question below is answered). Built in shadow with this note
(the road-to-ten AI lane, step 12, migration `00278`): it is off unless `TYPESAFE_SHADOW` (`1` for every workspace, or a
comma-separated list of workspace ids for a pilot on those alone) and `TYPESAFE_API_KEY` are set on the edge, and it
changes nothing a customer receives whether or not it is on. Written against `df7849323`
(main, 29 September 2026); where this note and the code disagree, the code wins. Numbered 0023 as the next free number
at that commit; the controller renumbers at landing if another note took it.

## Context

- **A different kind of model.** TypeSafe's Jev is a "System One" model: it makes calibrated decisions, not text. It is
  handed a state and typed questions and answers each with a probability: a `noul` (yes or no, answered 0 to 1), a
  `choice` (one of a set, answered with every option's probability and its confidence) or a `score` (a place on an
  ordered rubric). `POST https://api.typesafe.ai/v1/systemone`, a bearer key, a body of `{ state, model, questions }`;
  the answer carries the versioned model that answered and its input tokens; output tokens are free. Errors are 401, 422,
  429 and 529. A request is bounded at 64,000 tokens, 32,000 of them for the state and the longest question. Text only,
  English-best. It costs $0.042 a million input tokens.
- **The platform's answers to closed questions are the model's and nobody else's.** The receptionist's intent (and the
  class that intent falls under), the reply reader's seven intents and the lead judge's pass, fail or unknown are each
  one Claude call whose answer code then acts on. Nothing checks them against a second opinion, and the scorecard's AI
  categories ask for one before any switch of model is argued (29 September: categories 37 and 38).
- **A pilot on the reply fixtures, 29 September 2026, 17:40 UTC (Ruben, `jev-1.13.0`).** The 19 Reach out replies in
  `tooling/scripts/fixtures/replies/replies.json`, each read for intent against the fixture's `expect.intent`:
  **19 of 19 right.** At a confidence of 0.8 or more, 17 of the 19 were decided and **all 17 were right**; the two
  under the line are the deliberately ambiguous pair ("Travelling this week, back on the 12th": away 0.66 against
  not_now 0.33; "Not right now, thanks": not_now 0.80 against no 0.20). The injection fixture was resisted (other 0.82).
  The weaker read is person against automatic: **17 of 19**, both misses terse opt-outs ("Remove", person 0.33; "Please
  mark me as unsubscribed…", 0.48), both still read as intent `no`. About 900 input tokens a reply. This is the baseline
  the week of shadow data is compared with.
- **What the codebase already had.** One model port for Claude (`packages/channels/src/models/anthropic.ts` over
  `providerFetch`), a registry by purpose (`packages/contracts/src/ai/models.ts`) and a ledger in dollars (`ai_usage`,
  `00276`); so a second port is a second adapter, a column on the ledger and a comparison, not a second way to ask.

## Decision

1. **A second port, TypeSafe's System One, asked in shadow.** A purpose whose answer is a closed set may name a shadow
   port in the registry (`MODEL_ROUTES[purpose].shadow`). Three do: the receptionist, the reply reader and the lead
   judge. The switch is `TYPESAFE_SHADOW` with `TYPESAFE_API_KEY` set: `1` asks for every workspace, a list of workspace
   ids asks for those alone (a pilot on Ruben's own first); with either missing, or the workspace not listed, the second
   model is asked nothing, not even a read of the database or the building of a call.
2. **It runs beside the primary, never instead, and its answer is never used.** The calls begin with the primary's; the
   primary's caller waits for the shadow no longer than `SHADOW_GRACE_MS` (a second and a half) once its own answer is
   in, and a shadow that has not answered by then is left behind: the calls that did answer are kept, and each that did
   not is one row that says so. The write of its rows waits no longer than `SHADOW_WRITE_MS`. A failure of any part of it
   (the building of a call, the call, the read of its answer, the write of the row) is logged and ends there. A test holds each: nothing is sent while
   it is off, a failing or slow or unwritable shadow leaves the primary's answer exactly as it was, and the key is not in
   a row, a log line or an error.
3. **What is asked, of what.** Never the business's prompt, its facts or a person's name: the customer's own words (for a
   photo, its caption, and nothing when it has none), one reply as the reader is shown it, or one lead's listing facts
   with its addresses as domains alone. The judge's questions also carry the search's own words (its name, its area and
   its criteria), which are the workspace's configuration and no person's.
   - the receptionist's turn: **which class the message falls under** (a choice over booking, faq, money and none: the
     money charter's), **whether it carries an instruction to the assistant** (a noul: the fence's) and **whether the
     customer asked to stop** (a noul: consent's);
   - the reply reader: **the reply's intent** (a choice over the seven `REPLY_INTENTS`, each with the reader's own
     definition as its criterion);
   - the lead judge: **each criterion of the rubric for each place** (a choice over pass, fail and unknown), a call a place.
4. **One derivation per fact.** Each question's instructions and criteria are built from the text its primary is given:
   the reader's seven definitions are `REPLY_INTENT_RULES`, from which `replySystemPrompt` and the shadow's criteria are
   both built; the classes' covers are `POLICY_COVERS`, from which the prompt's Booking, FAQ and Money lines and the
   shadow's criteria are both built; the fence's phrase, consent's and the judge's answers likewise. No rule is written a
   second time, and the primary's prompts are byte for byte what they were.
5. **The person-or-automatic read is not shadowed.** The intake's claim from the mail's header stays authoritative; the
   pilot's 17 of 19 there, with misses on terse opt-outs, is why a second reader is not put beside it.
6. **Each question answered is one row of the usage ledger** (`ai_usage`, `00278`): the primary's purpose, the port
   (`typesafe`), that it was a shadow, the question, the primary's label, the shadow's label, its confidence, whether that
   cleared 0.8 (`confident`), whether the two agree (`agrees`, null when either gave none), and, on the first row of a
   call, its input tokens and dollars (so the rows sum to what was spent). A call that got no answer is one row that says
   so. Rows carry labels and numbers, never text. They are the platform's: a member reads their workspace's calls
   and not these, a workspace's meter and its failure alarm leave them out, and a retention of 400 days applies.
7. **One read answers the week.** `ai_shadow_agreement(p_days)`, for the service role, returns per purpose, question and
   port the answers compared, how many agree, the agreement, and the same among the answers at or over 0.8, with the failed
   calls, the input tokens and the dollars. That, against the baseline in Context, is what is read before any switch.
8. **Turning it on is Ruben's call, and it is not made by this note.** What waits on it: a week of agreement data on the
   reply fixtures' kind of traffic, and the data-processing question below.

## Shape

- Contracts: `ai/system-one.ts` (the request, the answers, the pinned model `jev-1.13.0`, the price), `ai/shadow.ts` (the
  read of an answer as a label, the row it becomes, the calls each purpose makes), `ai/models.ts` (`shadow` on a route,
  the ports), the question in the module that owns its rule (`reach-out-replies.ts`, `policy-classes.ts`, `fence.ts`,
  `consent.ts`, `lead-judge.ts`).
- Channels: `models/typesafe.ts`, one adapter over `providerFetch` (provider `typesafe`), a bound on every call, one try,
  and its outcomes: `ok`, `rejected` (a 401, a 422, any refusal), `throttled` (a 429) and `unavailable` (a 529, a 5xx, a
  timeout, an answer that is not the shape asked for).
- Edge: `lib/shadow.ts` (the run and its settling), the receptionist's `generateReply`, the reply reader's `ask` and the
  lead judge's wires each start one beside the primary and settle it after; `TYPESAFE_API_KEY` and `TYPESAFE_SHADOW` in
  `lib/env.ts` and `.env.example`, the second listed in `contracts/ai/flags.ts` with a sunset.
- Database: `00278`.

## Steps

1. **Built with this note:** the port, the questions, the ledger's columns, the week's read, and the tests below.
2. **Ruben, after the data-processing question:** set the two variables on the edge for a week.
3. **Ruben, after a week:** read `select * from ai_shadow_agreement(7)` against the baseline; decide whether the second
   model does anything more than watch (a second opinion that holds a reply, a cheaper reader). That is a note of its
   own, not this one's step.

## Tests

`tooling/scripts/tests/ai/system-one.test.mjs` (the shapes, the adapter and its outcomes, the questions each derived from
their rule), `shadow.test.mjs` (nothing sent while off; a row per question with its comparison; the primary unchanged
under a refusal, a throttle, an overload, an unreadable answer, a dropped connection, a slow shadow and an unwritable
ledger; the key nowhere; the reader and the judge), `ai-usage.db.test.mjs` (the shadow columns, who reads them, what the
meter and the alarm leave out, and the week's read on a real Postgres). No test reaches the network.

## Risks

- **Customer text leaves for a third party.** With the switch on, what a customer wrote to the receptionist, a lead's
  reply to a reach-out and a lead's listing facts are sent to TypeSafe. Its zero data retention is available on the
  enterprise plan only, by its documentation, so on any other plan the words may be kept. The privacy page names the
  processors a customer's words reach; it does not name TypeSafe. This is why the switch is not turned on by the build.
- **English-best, and customers write in Spanish.** The pilot was English replies. The week's data will say how the
  Spanish traffic reads; a disagreement rate that differs by language is a finding, not a fault.
- **Two questions compare different measures.** The stop question has no primary reader on this path (the keyword door
  holds a stop before the model is asked), so the primary's label is always "false" and its agreement is the shadow's
  yes rate, not a match: the rows where it says yes are the stops the keywords let through.
- **The fence's question compares two different measures.** There is no primary reader of "does this text carry an
  instruction to the assistant"; the primary's answer is the fence's own verdict (it neutralised markup in the text). A
  low agreement there is expected and is not a fault of the second model: its yes rate on real customer messages, and
  the cases where it says yes and the fence did nothing, are what that question is for.
- **A retry writes again.** The judge retries a refused batch, and the shadow runs with each attempt, so a batch that
  was retried is in the ledger twice. The counts are of answers, not of places.
- **A call's cost is on its first question.** Tokens and dollars are exact in total and per purpose, not per question.
- **A slow shadow costs the primary's caller up to a second and a half**, when it is slower than the primary itself. The
  receptionist's turn has twenty seconds; the judge's batch and the reader's read have their own margins.
- **Rows.** A judge's batch is a call a place, up to 25 rows of the ledger a criterion each; at the finder's volume that
  is hundreds of rows a day, kept 400 days.

## Open questions (Ruben's)

- Is TypeSafe an acceptable processor for customer text, on which plan, and does the privacy page name it first?
- The two variables on the edge, and when.
- After the week: what, if anything, the second model is allowed to do beyond watching.
