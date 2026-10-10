# 0046 · The rest of the frame, in three lanes

**Status:** Decided on 10 October 2026 (Ruben: "review and go with the best suggestions for chanlytics"), as recommended
here. It orders what is left of 0031's six phases; each lane's steps still take a note of their own first, and the first of
each is named. Written against commit `ef0aea36a` (main, 10 October 2026), after #1537. Where
this note and the code disagree, the code wins.

## Context

0031 cut its work into six phases. Read against main on 10 October 2026:

- **Phase 0, fix, instrument, stage:** the fixes and the day's numbers are built (00330 to 00332, 00337). Left are four
  of Ruben's switches: the log drain, an outside pinger on `/api/health`, a second alarm path (the pager is mail through
  Resend alone, `apps/edge/lib/ops/page-operator.ts`, which cannot page when the mail key itself fails), and the staging
  project.
- **Phase 1, the spine:** built (00333 to 00337). 0033 step 3, the three per-kind job indexes, waits on a key that
  covers finished rows; `job_capacity`, `aggregate_version` and `causation_id` are built and written by nothing.
- **Phase 2, one door, one vertical, one channel:** 0034 is whole; the first real subscriber acts (`reach_out_booked`,
  00389); a text is answered after its acknowledgement (00347). Left: 0002's readers (its steps 3, 4, 5 and 8, decided
  10 October 2026 in 0002), the reminder as a due row (0044), receipts as events (0032 step 5, waiting on a reader), and
  the owner's escalation notice (0043).
- **Phases 3, 4 and 5** are mostly unbuilt: the WhatsApp switch built and off, 0023's shadow built and off, 0039's model
  turns built on a branch and not on main; the erasure registry, keyed writes and `capabilityStatus` as their
  scaffolding.

The phases were a sequence. What is left runs better as three lanes cut by what each depends on, so each can move while
another waits on Ruben.

## Decision

**Lane A · Time and waiting** (the rest of Phase 2, then Phase 4's runtime). In order:

1. The owner hears of a hold from its event (0043). Built on 10 October 2026 (00394), but its due row, which moved to 0044.
2. A moment, a pause and a snooze are due rows (0044).
3. 0002's readers: Reports, People and playbooks read the appointments record together, with status-aware drawing
   (0002's answers of 10 October 2026).
4. One record for every wait on a person, begun as one read over the four that exist (an escalation, a run waiting for
   approval, a held send, an Ask card), not a new table. Its note follows 0043.
5. The runtime the reminder proves, generalised to the line's saga and to erasure as a workflow over 0036's registry; a
   journey (0041's J4) on it. A note each.

**Lane B · Proof and publication** (Phase 3, with invariants 8, 11 and 12). In order:

1. Every promise has a number with a target (invariant 12), for the day's numbers that exist: targets beside their
   words, a test that every number names one, and an alarm on the ones the platform answers for. Decided in 0031's entry
   of 10 October 2026; built with it.
2. 0039 (a reply keeps what the receptionist was told: model turns, prompts and configuration versions as records)
   lands on main, renumbered.
3. Configuration is published: a version, a publish gate over recorded turns (the evals, once `ANTHROPIC_EVAL_KEY` and
   `NIGHTLY_EVALS` are set), 0023's shadow as the canary, a rollback that is a publish. One note for invariants 8 and 11.
4. The grounding check every reply makes, as the reach-out's opening already does (`facts_used`, `unbacked`).

**Lane C · Observation** (Phase 5). In order:

1. "What happened to this message" as one query: the request's id on `messages`, `decisions`, `event_deliveries` and
   `provider_events` as it is on `events` and jobs' payloads.
2. One readiness predicate everywhere: the send gates and the back office read `capabilityStatus` (invariant 9, in part
   already), with no new table.
3. Breaker and nonce state in Postgres, when a second instance is shown to disagree with the first.

**Waits, by decision:** 0033 step 3; `aggregate_version` and `causation_id` until a projector; 0019 step 4's replay;
retention as rows in one purge. What has no caller waits rather than grows (0031's review of 9 October).

**Ruben's switches, beside the lanes and blocking none of them:** the second alarm path, the staging project, the eval
key and its nightly, the outside pinger, the log drain, and which workspace answers WhatsApp as jobs first.

## Consequences

- 0031's phases stay its record of why; this note is the order. "How many phases are left" is answered by the lanes:
  three, with Phase 0's four switches beside them.
- A lane's step is built only after its note, as 0031 and 0015 require.
