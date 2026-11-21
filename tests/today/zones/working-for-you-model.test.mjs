/**
 * Working for you (21 Nov 2026), the model EXECUTED: AI's own work as Today's read makes it (contracts today/ai.ts: who AI
 * is talking to now, what it did today, since this member last looked), a teammate's conversations said apart from who
 * needs you (today/theirs.ts), why AI held a thing in the card's first sentence (escalations.ts reasonHeld), and the four
 * kinds of quiet (dashboard today/calm/quiet.ts quietOf): nothing missing is ever said as nothing to do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lookedAtOf, TODAY_LOOKED_PAGE, toTodayVM } from "@chanlytics/contracts";
import { NOW, escalation, metrics, msg, thread, waiting } from "../record/_world.mjs";

const { quietOf } = await import("../../../apps/dashboard/src/surfaces/today/calm/quiet.ts");

/** Minutes before NOW, as an instant. */
const ago = (minutes) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const ai = (id, at) => msg(id, "Friday at 2:30 is free.", at, { direction: "outbound", sender: "ai", status: "sent" });

/** Leo wrote two minutes ago and AI answered a minute ago; Mia's last word with AI was at 9:20 AM local (13:20Z). */
const leo = () => thread("cv-l", "Leo Morales", [msg("l1", "Anything Saturday morning?", ago(2)), ai("l2", ago(1))]);
const mia = () => thread("cv-m", "Mia Chen", [msg("m1", "Thanks!", ago(401)), ai("m2", ago(400))]);

/** A visit AI booked at 10:05 AM local (14:05Z), for Friday. */
const booking = (over = {}) => ({
  id: "ap-1",
  starts_at: "2026-09-19T15:00:00Z",
  service: "Color",
  who: "Nina Petrova",
  conversation_id: null,
  timezone: "America/New_York",
  created_at: "2026-09-18T14:05:00Z",
  ...over,
});

const day = (convs, escs, aiRead) => toTodayVM(metrics(), convs, escs, [], NOW, null, { ai: aiRead });

test("AI is talking to whoever it wrote to in the last minutes and who wrote back, never to an old thread", () => {
  const vm = day([leo(), mia()], [], { booked: [], stopped: false, looked_at: null });
  assert.deepEqual(
    vm.ai.talking.map((t) => [t.conversation_id, t.who]),
    [["cv-l", "Leo Morales"]],
  );
  assert.match(vm.ai.talking[0].said, /“Anything Saturday morning\?”/, "their last words, in quotes");
  assert.equal(vm.ai.stopped, false);
});

test("what AI did today, newest first: the visit it booked, a hold it opened today with why, a thread set aside; a hold from yesterday is not today's", () => {
  const aside = thread("cv-p", "Supply Co", [msg("p1", "Bulk pricing on towels", ago(30))], {
    set_aside_at: ago(30),
    set_aside_why: "pitch",
  });
  const yesterday = { ...escalation(), id: "e-old", conversation_id: "cv-y", created_at: "2026-09-17T15:00:00Z" };
  const y = thread("cv-y", "Old Thread", [msg("y1", "Hello?", "2026-09-17T14:59:00Z")], { state: "needs_human" });
  const vm = day([waiting(), aside, y], [escalation(), yesterday], {
    booked: [booking()],
    stopped: false,
    looked_at: null,
  });
  assert.deepEqual(
    vm.ai.did.map((d) => [d.kind, d.who]),
    [
      ["set_aside", "Supply Co"],
      ["held", "Ana Reyes"],
      ["booked", "Nina Petrova"],
    ],
  );
  const held = vm.ai.did.find((d) => d.kind === "held");
  assert.equal(held.why, "AI held it: they asked for a person.", "why, a tap away (W13)");
  assert.equal(vm.ai.did.find((d) => d.kind === "set_aside").what, "A sales pitch");
  assert.equal(vm.ai.did.find((d) => d.kind === "booked").visit.id, "ap-1", "a booking opens its visit");
  assert.equal(vm.ai.since, null, "no earlier look: nothing is said since");
});

test("since this member last looked today: the people AI answered and the visits it booked after that look, and nothing for a look before today", () => {
  const read = (looked) => ({
    booked: [booking(), booking({ id: "ap-0", created_at: "2026-09-18T12:00:00Z" })],
    stopped: false,
    looked_at: looked,
  });
  // Looked at 13:40Z (9:40 AM local): Leo answered since, Mia this morning before; one visit booked since, one before.
  assert.deepEqual(day([leo(), mia()], [], read("2026-09-18T13:40:00Z")).ai.since, { answered: 1, booked: 1 });
  assert.equal(
    day([leo(), mia()], [], read("2026-09-17T20:00:00Z")).ai.since,
    null,
    "yesterday's look: the day's line says the day",
  );
});

test("a server from before says nothing of AI it cannot back: stopped unknown, no bookings, the holds still said", () => {
  const vm = toTodayVM(metrics(), [waiting()], [escalation()], [], NOW);
  assert.equal(vm.ai.stopped, null);
  assert.deepEqual(
    vm.ai.did.map((d) => d.kind),
    ["held"],
  );
});

test("a member's last look is read from their saved views, and only an instant counts", () => {
  assert.equal(lookedAtOf({ [TODAY_LOOKED_PAGE]: { at: "2026-09-18T13:40:00Z" } }), "2026-09-18T13:40:00Z");
  assert.equal(lookedAtOf({ [TODAY_LOOKED_PAGE]: { at: "soon" } }), null);
  assert.equal(lookedAtOf({}), null);
  assert.equal(lookedAtOf(null), null);
});

test("a conversation a teammate has is theirs (W19): said apart, in no count; one you have is not theirs", () => {
  const theirs = { ...waiting(), assignee_user_id: "u-maya", assignee_is_me: false };
  const vm = day([theirs], [escalation()], null);
  assert.deepEqual(
    vm.theirs.map((t) => [t.conversation_id, t.who, t.said]),
    [["cv-a", "Ana Reyes", "“I'd rather talk to a person about a refund.”"]],
  );
  assert.equal(vm.queue.rows.length, 0, "not one of who needs you");
  const mine = { ...waiting(), assignee_user_id: "u-me", assignee_is_me: true };
  assert.deepEqual(day([mine], [escalation()], null).theirs, []);
});

test("the card says why AI did not finish it (W20): what it could not do, in a sentence; a reply that never reached them says its own", () => {
  const row = day([waiting()], [escalation()], null).queue.rows[0];
  assert.equal(row.held_because, "AI held it: they asked for a person.");
  const failed = { ...escalation(), reason: "send_failed" };
  assert.equal(day([waiting()], [failed], null).queue.rows[0].held_because, undefined);
});

test("four kinds of quiet (W18): sure only with every read current, else checking, behind since a time, or unread", () => {
  const at = { lineDown: false, readAt: 1_000 };
  assert.deepEqual(quietOf(["live", "live"], at), { kind: "sure" });
  assert.deepEqual(quietOf(["live", "kept"], at), { kind: "settling" }, "this device's copy, its read still out");
  assert.deepEqual(quietOf(["live", "checking"], at), { kind: "checking" });
  assert.deepEqual(quietOf(["behind", "live"], at), { kind: "behind", at: 1_000 });
  assert.deepEqual(
    quietOf(["failed", "behind"], at),
    { kind: "unread", line: false },
    "a read that never landed says most",
  );
  assert.deepEqual(quietOf(["live"], { lineDown: true, readAt: null }), { kind: "unread", line: true });
});
