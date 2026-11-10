/**
 * Since you looked says what the sequences sent (decision 0120, D8): one bit for them all, and a row for each sequence
 * that sent, the latest first, opening its sequence. A sequence set to send on its own tells nobody as it goes, so this
 * line is where its owner sees that it did (contracts todaySince).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sequenceRoute, todaySince } from "@chanlytics/contracts";

/** New York in November is five hours behind UTC. */
const TZ = "America/New_York";
/** Tuesday 9:05 AM; the member last looked on Monday at 5:00 PM. */
const NOW = Date.parse("2026-11-10T14:05:00Z");
const SEEN = "2026-11-09T22:00:00Z";
const MOVERS = "11111111-1111-4111-8111-111111111111";
const REMINDER = "22222222-2222-4222-8222-222222222222";

const since = (over = {}) =>
  todaySince({ seenAt: SEEN, answered: null, notes: [], covered: [], tz: TZ, nowMs: NOW, ...over });
const sent = (over = {}) => ({
  sequences: [
    { id: REMINDER, name: "Appointment reminder", sent: 4, last_at: "2026-11-09T23:00:00Z", leads: false },
    { id: MOVERS, name: "Movers in Austin", sent: 8, last_at: "2026-11-10T13:30:00Z", leads: true },
  ],
  more: false,
  ...over,
});

test("with nothing sent and nothing else new, there is no line", () => {
  assert.equal(since(), null);
  assert.equal(since({ sent: null }), null);
  assert.equal(since({ sent: { sequences: [], more: false } }), null);
});

test("what the sequences sent is one bit, and a row each, the latest first, opening its sequence", () => {
  const vm = since({ sent: sent() });
  assert.equal(vm.when, "Since 5:00 PM");
  assert.deepEqual(vm.bits, ["12 sent"]);
  assert.deepEqual(vm.rows, [
    {
      key: `sent-${MOVERS}`,
      glyph: "send",
      title: "Movers in Austin sent 8",
      sub: "8 cold emails",
      at: "8:30 AM",
      to: sequenceRoute(MOVERS),
    },
    {
      key: `sent-${REMINDER}`,
      glyph: "send",
      title: "Appointment reminder sent 4",
      sub: "4 messages",
      at: "6:00 PM",
      to: sequenceRoute(REMINDER),
    },
  ]);
});

test("it stands after what the receptionist answered, and before the news", () => {
  const vm = since({
    sent: sent(),
    answered: { count: 3, last: null },
    notes: [{ kind: "booking", at: NOW - 60_000, title: "Booked", message: "Nina booked", id: "n1" }],
  });
  assert.deepEqual(vm.bits, ["3 answered", "12 sent", "1 booked"]);
  assert.deepEqual(
    vm.rows.map((r) => r.key),
    ["answered", `sent-${MOVERS}`, `sent-${REMINDER}`, "booking"],
  );
});

test("a read that names only the newest says at least, and a sequence that sent nothing has no row", () => {
  assert.deepEqual(since({ sent: sent({ more: true }) }).bits, ["12+ sent"]);
  const one = since({
    sent: {
      sequences: [
        { id: MOVERS, name: "Movers in Austin", sent: 1, last_at: "2026-11-10T13:30:00Z", leads: true },
        { id: REMINDER, name: "Appointment reminder", sent: 0, last_at: "2026-11-09T23:00:00Z", leads: false },
      ],
      more: false,
    },
  });
  assert.deepEqual(one.bits, ["1 sent"]);
  assert.deepEqual(
    one.rows.map((r) => [r.title, r.sub]),
    [["Movers in Austin sent 1", "1 cold email"]],
  );
});

test("a server before it sends none, and the line reads as it did", () => {
  const vm = since({ answered: { count: 2, last: null } });
  assert.deepEqual(vm.bits, ["2 answered"]);
});
