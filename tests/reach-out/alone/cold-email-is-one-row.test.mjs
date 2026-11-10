/**
 * Cold email is one row of what waits on its owner (decision 0120, D8). Two or more of its runs that wait, for an OK or
 * with emails the check holds for a look, are one row that says what waits in them all and opens the held one first; a
 * customer campaign's runs waiting for an OK fold among themselves, so "N runs wait for your OK" says nothing of leads.
 * One cold email run alone stays its own row, and the emails handed to their owner stay To send's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WAIT_ROW_WORDS, waitRowsOf } from "../../../apps/dashboard/src/surfaces/waits/rows.ts";

const MOVERS = "11111111-1111-4111-8111-111111111111";
const VETS = "22222222-2222-4222-8222-222222222222";

/** A run as the list reads it: a cold email's names its sequence in its audience, a customer campaign's does not. */
const run = (id, state, over = {}) => ({
  id,
  state,
  scheduled_for: `2026-11-10T15:${id.slice(-2)}:00Z`,
  recipient_count: 10,
  audience: { label: "Win-back" },
  ...over,
});
const cold = (id, state, root, over = {}) =>
  run(id, state, { audience: { kind: "reach_out", root_id: root }, ...over });

test("two cold email runs that wait are one row: what is held, what an OK would send, and from how many sequences", () => {
  const rows = waitRowsOf([
    cold("r-01", "pending_approval", MOVERS, { recipient_count: 12 }),
    cold("r-02", "sending", MOVERS, { held: 2, recipient_count: 9 }),
    cold("r-03", "pending_approval", VETS, { recipient_count: 8, held: 1 }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["cold_email"],
  );
  const [row] = rows;
  // The going run's two and the waiting batch's one are held; an OK would send 12, and 8 less the one it holds.
  assert.deepEqual([row.held, row.asks, row.from], [3, 19, 2]);
  assert.deepEqual(
    row.runs.map((r) => r.id),
    ["r-02", "r-01", "r-03"],
    "the one holding emails for a look opens first, then those waiting for an OK in the order they wait",
  );
  assert.equal(WAIT_ROW_WORDS.cold.meta(row.from), "2 sequences");
  assert.equal(
    WAIT_ROW_WORDS.cold.sentence(row),
    "3 held for a look. 19 emails wait for your OK. Each one you answer opens the next.",
  );
  assert.deepEqual(WAIT_ROW_WORDS.cold.status(row), ["Held for a look"]);
});

test("with nothing to OK it says the rest go as planned, and with nothing held it says only what waits", () => {
  const held = waitRowsOf([
    cold("r-01", "sending", MOVERS, { held: 1 }),
    cold("r-02", "sending", VETS, { held: 1 }),
  ])[0];
  assert.equal(WAIT_ROW_WORDS.cold.sentence(held), "2 held for a look. The rest go as planned.");
  const asks = waitRowsOf([
    cold("r-01", "pending_approval", MOVERS, { recipient_count: 1 }),
    cold("r-02", "pending_approval", MOVERS, { recipient_count: 0 }),
  ])[0];
  assert.equal(asks.kind, "cold_email");
  assert.equal(WAIT_ROW_WORDS.cold.sentence(asks), "1 email waits for your OK. Each one you answer opens the next.");
  assert.equal(WAIT_ROW_WORDS.cold.meta(asks.from), "1 sequence");
  assert.notDeepEqual(WAIT_ROW_WORDS.cold.status(asks), ["Held for a look"]);
});

test("the runs waiting for an OK say nothing of leads: a campaign's fold among themselves, at the place of their first", () => {
  const rows = waitRowsOf([
    run("c-01", "pending_approval"),
    cold("r-02", "pending_approval", MOVERS),
    run("c-03", "pending_approval"),
    cold("r-04", "pending_approval", VETS),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.runs.map((x) => x.id)]),
    [
      ["approvals", ["c-01", "c-03"]],
      ["cold_email", ["r-02", "r-04"]],
    ],
  );
});

test("one cold email run alone is its own row, beside a campaign's own", () => {
  const rows = waitRowsOf([cold("r-01", "pending_approval", MOVERS), run("c-02", "pending_approval")]);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.run.id]),
    [
      ["run", "r-01"],
      ["run", "c-02"],
    ],
  );
});

test("emails handed to their owner stay To send's: the cold email row is what waits for a look or an OK", () => {
  const rows = waitRowsOf([
    cold("r-01", "sending", MOVERS, { drafted: 2 }),
    cold("r-02", "sending", VETS, { drafted: 1 }),
    cold("r-03", "pending_approval", MOVERS),
    cold("r-04", "sending", VETS, { held: 1 }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["to_send", "cold_email"],
  );
  assert.deepEqual(
    rows[1].runs.map((r) => r.id),
    ["r-04", "r-03"],
  );
  // A lone run handing its emails over is neither folded into To send nor into cold email's row: it is sent by hand.
  const lone = waitRowsOf([
    cold("r-01", "sending", MOVERS, { drafted: 2 }),
    cold("r-03", "pending_approval", MOVERS),
    cold("r-04", "sending", VETS, { held: 1 }),
  ]);
  assert.deepEqual(
    lone.map((r) => r.kind),
    ["run", "cold_email"],
  );
});

test("the brief says the row once, as waiting for you", () => {
  const [row] = waitRowsOf([cold("r-01", "sending", MOVERS, { held: 1 }), cold("r-02", "sending", VETS, { held: 2 })]);
  assert.deepEqual(WAIT_ROW_WORDS.cold.brief(row), {
    label: "Cold email",
    waits: "waiting for you",
    sentence: "3 held for a look. The rest go as planned.",
  });
});
