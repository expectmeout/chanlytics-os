# 0038 · The receptionist places a call

**Status:** Proposed on 7 October 2026, with "A conversation begins from the Inbox"
(`docs/superpowers/specs/2026-10-07-a-conversation-begins-from-the-inbox-design.md`), which leaves it out on purpose:
in that lane a call is the member's own phone, with a brief. Nothing here is built. Written against commit `b6e2a2722`
(main, 7 October 2026). Where this note and the code disagree, the code wins.

## Context

The receptionist answers the phone and never places a call.

- Nothing in the code calls a provider to start one, and a number is bound for calls coming in alone
  (`packages/channels/src/lines/lines-saga.ts`).
- The product says so to the owner: "It answers your line and never calls a customer"
  (`packages/contracts/src/config/business-tab/abilities.ts`), and two tests hold those words.
- A call is briefed as it starts, by the door the provider knocks on for a call coming in: the business's facts, who is
  calling with their notes and their last turns, the greeting, and the number to hand over to
  (`apps/edge/lib/voice/call-start.ts`, `planCallStart`).
- What is recorded of a call is written by `ingest_call`, which opens the person's thread as it does for a call coming
  in, and every reader of `calls` reads it as one a person made to the business.

Read on 7 October 2026, outside the code:

- Retell places a call with `POST /v2/create-phone-call`: the number it leaves from, the number it rings, an agent in
  place of the number's own, the variables the agent is briefed with, and a key that makes a retry one call.
- A number's agents for calls out are a field of their own (`outbound_agents`), which replaced the single agent field on
  31 March 2026.
- The door that briefs a call coming in is not knocked on for a call going out: the brief is sent with the request.
- Retell's terms ask, of a call an AI voices, for the called person's prior express written consent, the business named
  at the start, and calling hours of 8am to 9pm where they are.
- The FCC's ruling of 8 February 2024 (FCC 24-17) holds an AI-generated voice to be an artificial voice under the TCPA
  (47 USC 227(b), 47 CFR 64.1200): a call to a mobile number needs prior express consent, and prior express written
  consent where it sells.

## Decision

Proposed: the receptionist may place a call to one person when, and only when, a member asks for that call, the
person has said yes to calls from the business in writing and that yes is on record, and the hour is one a call may be
placed in where they are. It never calls by itself: no playbook, no campaign and no sweep places a call.

The promise on the Business page changes with it, in the same change, to what is then true: it answers the line, and
it calls a customer only when a member asks and the customer has agreed to be called.

## Shape

- **A recorded yes to calls.** A third answer beside the two the product keeps (conversation, offers), covering the
  wire `voice`: who gave it, when, in what words, and how it was taken (a form they signed, a message they sent). It
  is never inferred from a yes to messages, from a call they made, or from a deal. Stop, said on any wire, ends it.
- **One predicate.** `mayMessageFor` is asked for a call as it is for a message, with the wire `voice` and the purpose
  of the call; there is no second rule. A call that sells asks the written yes; one about something of theirs asks the
  yes to calls.
- **The hours.** A call is placed between 8am and 9pm by the clock of the number's own place, never the business's,
  and a call asked for outside them is refused in words, never queued for the morning without the member's say.
- **The door.** The call leaves through the one send door (`packages/core/src/deliver.ts`), as every message does: the
  door asks the predicate, then the wire. The wire is a provider adapter in `packages/channels`, which owns the
  request and knows nothing about threads.
- **The brief.** What `planCallStart` builds for a call coming in, built for a call going out: the business's facts,
  the person and their notes, and the plan the member wrote for this call, sent with the request. The plan is said to
  the receptionist as an instruction for this call; a note is a fact for every call after it.
- **The record.** `ingest_call` learns a call's direction, and every reader of a call says who called whom: the
  Inbox's row, the person's timeline, Live, Reports' counts of calls answered, the consent a call coming in implies
  (someone who phoned is answered at their number; someone the business phoned is not), and the booking link a call
  sends.
- **A voicemail.** The receptionist leaves none unless the member wrote one; what it would say to a machine is the
  member's own words, never a model's.

## Steps

Each ships on its own, in either deploy order.

1. The yes to calls: the column and its door, the page where it is recorded, the predicate's wire. Nothing calls yet.
2. A call's direction in the record: `ingest_call`, the readers, their words. Nothing calls yet.
3. The wire's adapter and the door's branch, behind a workspace setting that is off: a call placed by hand from the
   back office to a number of the team's own.
4. The member's act: the Inbox's New conversation offers "Have the receptionist call" where the person has said yes to
   calls and the hour allows, with the plan as the call's brief; the Business page's promise changes here.

## Tests

- The predicate, case by case: no yes, a yes to messages only, a yes to calls, a stop on any wire, the hour.
- The door built: a call with no yes is refused before the wire, and the refusal is recorded as a message's is.
- The record on a replayed stack: a call out opens no consent, counts as a call placed, and is read as one by each
  reader.
- The promise: the words on the Business page and the two tests that hold them change together.

## Risks

- A call is the most intrusive thing the product can do to someone, and a wrong one is a statutory violation counted
  per call. The yes is recorded in the person's own words or it is not a yes.
- The receptionist answering to a plan it cannot carry: a price, a booking it cannot make. Its own rules stand, and it
  hands those to the team.
- A number ported from a mobile to a landline, or the reverse, changes what the law asks: the yes to calls is asked
  for every number, whatever kind it is thought to be.

## Open questions

- Whether a yes to calls is taken by the customer's own message ("Yes, call me") or only by a signed form.
- Whether a workspace outside the United States is offered this at all before its own law is read.
- What the receptionist says when a person answers who is not the person on record.
