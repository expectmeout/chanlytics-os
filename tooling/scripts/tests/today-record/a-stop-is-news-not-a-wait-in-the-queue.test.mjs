/**
 * A STOP is news, not a wait (decision 0048; NS-6 of the wiring plan, task 1.8). A customer's typed STOP used to open an
 * `opt_out` hold, and that hold counted like any other: the Inbox's Needs you, Today's queue, People's "waiting on you", the
 * badge and the bell's derived row, with a mail that is always sent and a push, until a member pressed Resolve on something
 * nothing could be sent for. The receptionist opens none now (inbound-executed.test.mjs), and the holds opened before it
 * stopped are still open: they are not written over, the readers ignore a reason that waits on nobody (contracts
 * waitsOnAPerson), through the one rule (standingOf) and the lists that count (the queue, the badge's count).
 *
 * Run on the contracts' own rules: standingOf, the thread's standing, People's, the badge's count and Today's queue.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCALATION_REASONS,
  HOLD_ACT_WORDS,
  holdActOf,
  holdWaits,
  personStanding,
  standingOf,
  threadStanding,
  threadsWaitingOnYou,
  toTodayVM,
  waitsOnAPerson,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { personRow } from "../consent/_person-row.mjs";
import { NOW, escalation, metrics, msg, thread, waiting } from "./_world.mjs";

const { standingOfThread } = await importSrc("packages/contracts/src/conversations/standing.ts");
const { snoozedAsk } = await importSrc("packages/contracts/src/people/person-receptionist.ts");

/** Dulce texted STOP twenty minutes ago: her thread is open, she has stopped, and a hold for it was opened as it used to be. */
const stopped = () =>
  thread("cv-s", "Dulce Amaro", [msg("s1", "STOP", "2026-09-18T19:40:00Z")], {}, { consent: "opted_out", dnc: true });
const stopHold = (over = {}) => ({
  id: "e-s",
  conversation_id: "cv-s",
  reason: "opt_out",
  details: "Customer asked to stop receiving messages.",
  state: "open",
  created_at: "2026-09-18T19:40:00Z",
  ...over,
});

test("only a hold with something to be done waits on a person: a STOP waits on nobody, every other reason does, and a reason nobody knows does", () => {
  for (const reason of ESCALATION_REASONS) {
    assert.equal(waitsOnAPerson(reason), reason !== "opt_out", reason);
  }
  assert.equal(waitsOnAPerson("from_a_newer_deploy"), true, "unknown is a person needed, not a wait to be dropped");
  assert.equal(waitsOnAPerson(null), true);
  assert.equal(waitsOnAPerson(undefined), true);
  // The act is the reason's: nothing may be sent for a STOP, a call is returned for a call-back, a reply is written otherwise.
  assert.deepEqual(
    [holdActOf("opt_out"), holdActOf("callback"), holdActOf("human_token")],
    ["hand_back", "call_back", "reply"],
  );
  assert.equal(HOLD_ACT_WORDS.hand_back.take, null, "and a hand-back offers no reply to write");

  // An open hold as a rule is handed it: none open waits on nobody; one open of no known reason waits.
  assert.deepEqual(
    [false, null, undefined, true, {}, { reason: null }, { reason: "opt_out" }, { reason: "rate_cap" }].map((h) =>
      holdWaits(h),
    ),
    [false, false, false, true, true, true, false, true],
  );
});

test("the one standing: an open STOP hold flags nothing, whatever else is open; any other open hold still needs you", () => {
  const open = { state: "open", open_escalation: true };
  assert.equal(standingOf({ ...open, escalation_reason: "opt_out" }, NOW.getTime()).standing, "quiet");
  assert.equal(standingOf({ ...open, escalation_reason: "human_token" }, NOW.getTime()).standing, "needs_you");
  assert.equal(
    standingOf(open, NOW.getTime()).standing,
    "needs_you",
    "a caller that cannot say what the hold is for reads it as one that waits",
  );
  // Nothing else is dropped: a thread the receptionist itself flagged, and a pause, still flag with a STOP hold open.
  assert.equal(
    standingOf({ state: "needs_human", open_escalation: true, escalation_reason: "opt_out" }, NOW.getTime()).standing,
    "needs_you",
  );
  const paused = "2026-09-19T20:00:00Z";
  assert.equal(
    standingOf(
      { state: "open", paused_until: paused, open_escalation: true, escalation_reason: "opt_out" },
      NOW.getTime(),
    ).standing,
    "yours",
    "a pause with no hold that waits is the one a person's own reply leaves behind",
  );
  // The thread's: handed the hold itself, or only that there is one.
  const dto = { state: "open", paused_until: null, assignee_user_id: null, assignee_is_me: false };
  assert.equal(standingOfThread(dto, { reason: "opt_out" }, NOW.getTime()).standing, "quiet");
  assert.equal(standingOfThread(dto, { reason: "deadman" }, NOW.getTime()).standing, "needs_you");
  assert.equal(standingOfThread(dto, true, NOW.getTime()).standing, "needs_you");
  assert.equal(standingOfThread(dto, false, NOW.getTime()).standing, "quiet");
  assert.equal(standingOfThread(dto, null, NOW.getTime()).standing, "quiet");
});

test("the Inbox's thread, People's person and the badge's count do not hold a STOP as a wait; they do hold the same thread asking for a person", () => {
  const dto = stopped();
  const hold = stopHold();
  assert.deepEqual(
    (({ needsYou, state }) => ({ needsYou, state }))(threadStanding(dto, hold, NOW)),
    { needsYou: false, state: "done" },
    "not in Needs you",
  );
  assert.equal(threadStanding(dto, { ...hold, reason: "human_token" }, NOW).needsYou, true, "control");

  const person = (reason) => ({
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    needs_human: false,
    open_escalation_reason: reason,
  });
  assert.equal(personStanding(person("opt_out"), NOW.getTime()).standing, "quiet", "People does not flag them");
  assert.equal(personStanding(person("human_token"), NOW.getTime()).standing, "needs_you", "control");

  // The count the badge, the tab and the headline read.
  assert.equal(threadsWaitingOnYou([dto], [hold], NOW), 0);
  assert.equal(threadsWaitingOnYou([dto], [{ ...hold, reason: "human_token" }], NOW), 1, "control");
  assert.equal(
    threadsWaitingOnYou([], [hold], NOW),
    0,
    "a STOP hold on a thread the page did not load was counted as waiting (unknown is not handled); it waits on nobody",
  );
  assert.equal(threadsWaitingOnYou([], [{ ...hold, reason: "callback" }], NOW), 1, "a hold of another reason still is");
});

test("Today's queue holds no row, no count and no name for a STOP, and still holds the person who asked for one", () => {
  const stop = toTodayVM(metrics(), [stopped()], [stopHold()], [], NOW);
  assert.deepEqual(stop.queue.rows, [], "no row for a STOP");
  assert.equal(stop.needsYou?.holds ?? 0, 0, "and the one count holds nobody for it");
  assert.deepEqual(
    stop.queue.parts.filter((p) => /need you/.test(p)),
    [],
    "and the head does not count them",
  );

  // Beside a person who is waiting, only that person is a row.
  const both = toTodayVM(metrics(), [waiting(), stopped()], [escalation(), stopHold()], [], NOW);
  assert.deepEqual(
    both.queue.rows.map((r) => [r.id, r.who, r.cta.label]),
    [["q-e-a", "Ana Reyes", "Open and reply"]],
  );
  assert.equal(both.needsYou?.holds, 1, "the one count holds the one person");

  // Control: the same thread, held for a person, is a row (the hold's reason is the only thing that differs).
  const asked = toTodayVM(metrics(), [stopped()], [stopHold({ reason: "human_token" })], [], NOW);
  assert.deepEqual(
    asked.queue.rows.map((r) => r.who),
    ["Dulce Amaro"],
  );
});

test("People does not read a STOP hold opened before decision 0048 as a wait: the person is silent, not escalated and not in Needs you; the same hold for another reason still is", () => {
  const held = (reason) =>
    personRow({
      consent: "opted_out",
      dnc: true,
      open_escalation_reason: reason,
      open_escalation_since: "2026-09-20T13:00:00.000Z",
      latest_conversation_id: "cv-s",
      latest_state: "open",
    });
  const stop = held("opt_out");
  assert.equal(stop.state, "opted_out", "not in People's Needs you: they asked to stop");
  assert.equal(stop.receptionist.tone, "silent", "the person is silent, as any person who asked to stop is");
  assert.match(stop.receptionist.label, /^Silent, /);
  // Control: the same open hold for another reason is what it always was.
  const asked = held("human_token");
  assert.equal(asked.state, "needs_you");
  assert.equal(asked.receptionist.tone, "escalated");
  assert.equal(asked.receptionist.label, "Escalated, asked for a person");
  // A snoozed thread does not still ask for a STOP.
  assert.equal(snoozedAsk({ open_escalation_reason: "opt_out", needs_human: false }), null);
  assert.equal(
    snoozedAsk({ open_escalation_reason: "deadman", needs_human: false }),
    "Nobody picked this up — flagged after silence",
  );
});
