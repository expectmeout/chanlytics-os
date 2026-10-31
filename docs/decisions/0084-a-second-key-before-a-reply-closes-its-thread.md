# 0084 · A second key before a reply closes its thread

**Status:** Decided by Ruben on 31 October 2026 ("Second key", after `Claude Video/docs/2026-10-31-jev-performance-and-quality.md`
was corrected: the reply reader's answer is more than its intent, so Jev cannot go first there). Built on the lane
`ai/a-closed-question-asks-jev-first`, off until `TYPESAFE_SECOND_KEY` names a workspace. Written against `3f665327f`
(#1990). Builds on 0023, whose shadow it reuses; where they differ, this note is the newer.

## Context

- **A reading closes a thread on one model's word.** The reply reader (Haiku 5.5, `reply_read`) reads a reach-out's reply
  into an intent and four fields (a summary for the notice, a day, who to write to instead, the signer: contracts
  `REPLY_SCHEMA`). Core's `readReply` then closes what the intake opened: a no resolves the "they wrote back" flag and
  archives the thread; a not now and a wrong person resolve the flag (`closeWhatTheIntakeOpened`). A misread no takes an
  interested reply out of Needs you, and nothing checks it.
- **Jev cannot replace the reader.** It answers closed questions and writes no words, and the reader's summary, day,
  refer-to and signer are words. Asked first, it would add a call and remove none.
- **Jev already reads the intent, in shadow.** 0023 puts the reply's intent to Jev beside Haiku and keeps the agreement.
  The 1.14 pilot (31 October): 19 of 19 intents right; 18 of 19 decided at 0.8 or more, all 18 right.

## Decision

1. **A route may make its shadow a second key.** `ModelRoute.secondKey` is the floor: how sure the shadow's read must
   be, agreeing with the primary's label, before an act the purpose holds on it goes. Only beside a shadow
   (`secondKeyFloorOf`). The reply reader's is 0.8; no other purpose has one.
2. **One rule.** `secondKeyLets(purpose, key, label)`: the key off, the act goes as it always did; the key on, the act
   goes only when the shadow read the same label at the floor or over. On and reading nothing (a call that failed, came
   after the grace, or named an option it was not offered), under the floor, or another label: the act is held.
3. **The reply reader's closes wait for it.** With the key on, a no is archived and its flag resolved, and a not now's or
   a wrong person's flag resolved, only when the key agrees. Held, the thread stays in Needs you as an interested reply's
   does, and a person reads it. The reading, its plan and the notice are what they would be without the key: a no's
   opt-out (`suppressFrom`) is kept, since missing an opt-out is the worse mistake, and the notice already says a no can
   be undone on the thread.
4. **Its own switch.** `TYPESAFE_SECOND_KEY`: `1` for every workspace, or a comma-separated list of workspace ids, with
   `TYPESAFE_API_KEY` set. It asks the second model by itself (the shadow's switch need not be on) and keeps the same
   ledger rows. Blank holds nothing: everything is as before. The shadow's switch alone still only compares.
5. **Never an act of its own.** A second key can only keep the primary from acting. It is asked beside the primary, as
   the shadow is, so it adds no wait: the reader's answer is in before or with Jev's, and the grace (1.5 s) bounds it.

## Shape

- **contracts:** `models.ts` `secondKey` on `ModelRoute`, `secondKeyFloorOf`; `shadow.ts` `SecondKey`, `SECOND_KEY_OFF`,
  `secondKeyLets`, `ShadowReads`, `NO_READS`, `replyIntentRead`.
- **edge:** `lib/env.ts` `TYPESAFE_SECOND_KEY`; `lib/shadow.ts` asks when the shadow's or the key's switch is on, says
  which (`secondKey`), and `settle` hands back its reads; `lib/reach-out/reply-read.ts` returns the reader's answer and
  its key.
- **jobs:** `replies.ask` answers `ReplyAsked`.
- **core:** `ReplyReadPorts.ask` answers `{ answer, second }`; `closeWhatTheIntakeOpened` holds on `secondKeyLets`.

## Tests

The rule's table and the registry's floors; the reader's key through the edge's real reader (its own switch, a list, a
failed call, the shadow alone, no key); the verb's closes agreeing at and over the floor, held under it, on another
intent and on nothing read, with the reading and its plan as without the key.

## Risks

- **TypeSafe down while the key is on:** every no stays in Needs you until it is back. That is the safe side, and the
  ledger says so (unreachable rows).
- **A floor never tuned on production:** 0.8 is the pilot's line. The rows the key keeps are the data to move it.

## Next

The cascade for purposes whose answer is closed-set alone (Jev first, the model below the floor) is still to build, and
the receptionist's pre-read; each is its own decision.
