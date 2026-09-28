/**
 * A chain's hand step, run (Reach out Part 5, PR 10; G20): core's runHandStep over fakes for its ports. The step's
 * followers become one item each, worded by contracts' handStepWords, with ids derived from what they are, so a replay
 * meets its own rows; a lead the send door would refuse is not handed, and a bounced one is; a lead already on the run
 * makes nothing again; a paused chain hands nobody. And the words themselves, and a row's hand read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handStepWords, handOf, HAND_WORDS_MAX } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { runHandStep, reachOutRunIdFor, sendIdFor, handStepIdFor } = await importSrc(
  "packages/core/src/campaigns/index.ts",
);

const step = (over = {}) => ({
  id: "p3",
  root_id: "p1",
  tenant_id: "t1",
  name: "Movers in Austin · a call",
  trigger: "after_step",
  state: "running",
  lead_search_id: null,
  include_unconfirmed: false,
  after_playbook_id: "p2",
  after_days: 5,
  gap_minutes: 12,
  domain_ids: [],
  cap_per_run: 25,
  hand: { kind: "call", words: "ask whether the quote suited them" },
  ...over,
});
const follower = (id, over = {}) => ({
  lead_id: id,
  contact_id: `c-${id}`,
  region: "TX",
  hours: [],
  facts: { lead_stage: "nurture", suppressed: false, wrote_back: false, away: false },
  bounced: false,
  ...over,
});
/** Ports over arrays: the followers, the businesses' names, and the door, which remembers what it made. */
function world(followers, { had = new Set() } = {}) {
  const asked = { followers: [], runs: [] };
  const ports = {
    followers: async (s) => (asked.followers.push(s), followers),
    businessNames: async (ids) =>
      new Map(ids.filter((id) => id !== "nameless").map((id) => [id, `Business ${id.toUpperCase()}`])),
    handRun: async (p) => {
      asked.runs.push(p);
      const made = p.items.filter((i) => !had.has(i.lead_id)).length;
      return { made, already: p.items.length - made };
    },
  };
  return { ports, asked };
}

test("each follower becomes one item, worded and with ids derived from what it is", async () => {
  const { ports, asked } = world([follower("a"), follower("b")]);
  const r = await runHandStep(ports, step(), { runFor: "2026-10-05" });
  assert.deepEqual(r, { outcome: "sent", planned: 2 });
  assert.equal(asked.followers[0].after_playbook_id, "p2", "the step's reach is an email step's");
  const [run] = asked.runs;
  const runId = await reachOutRunIdFor("p3", "2026-10-05");
  assert.deepEqual([run.stepId, run.runId, run.day], ["p3", runId, "2026-10-05"]);
  assert.deepEqual(run.items[0], {
    send_id: await sendIdFor(runId, "a"),
    lead_id: "a",
    contact_id: "c-a",
    words: "Call Business A: ask whether the quote suited them",
    source_id: await handStepIdFor("p3", "a"),
  });
  assert.equal(
    run.items[1].source_id,
    await handStepIdFor("p3", "b"),
    "once per step and lead, whichever day's run reaches it",
  );
});

test("a lead the door would refuse is not handed; a bounced email is no reason not to call", async () => {
  const facts = (over) => ({ lead_stage: "nurture", suppressed: false, wrote_back: false, away: false, ...over });
  const { ports, asked } = world([
    follower("wrote", { facts: facts({ wrote_back: true }) }),
    follower("no", { facts: facts({ suppressed: true }) }),
    follower("away", { facts: facts({ away: true }) }),
    follower("talking", { facts: facts({ lead_stage: "converted" }) }),
    follower("bounced", { bounced: true }),
  ]);
  const r = await runHandStep(ports, step(), { runFor: "2026-10-05" });
  assert.deepEqual(r, { outcome: "sent", planned: 1 });
  assert.deepEqual(
    asked.runs[0].items.map((i) => i.lead_id),
    ["bounced"],
  );
});

test("a replay makes nothing again; nobody to hand, or a paused chain, asks the door nothing", async () => {
  const again = world([follower("a")], { had: new Set(["a"]) });
  assert.deepEqual(await runHandStep(again.ports, step(), { runFor: "2026-10-05" }), {
    outcome: "empty",
    reason: "already_ran",
    planned: 0,
  });
  const none = world([]);
  assert.deepEqual(await runHandStep(none.ports, step(), { runFor: "2026-10-05" }), {
    outcome: "empty",
    reason: "nobody",
    planned: 0,
  });
  assert.equal(none.asked.runs.length, 0);
  const paused = world([follower("a")]);
  assert.deepEqual(await runHandStep(paused.ports, step({ state: "paused" }), { runFor: "2026-10-05" }), {
    outcome: "off",
    reason: "paused",
    planned: 0,
  });
  assert.equal(paused.asked.followers.length, 0);
});

test("at most the step's share a day, and a note is worded as a note", async () => {
  const many = Array.from({ length: 5 }, (_, i) => follower(`l${i}`));
  const { ports, asked } = world(many);
  await runHandStep(ports, step({ cap_per_run: 3, hand: { kind: "note", words: "send the price list" } }), {
    runFor: "2026-10-05",
  });
  assert.equal(asked.runs[0].items.length, 3);
  assert.equal(asked.runs[0].items[0].words, "Business L0: send the price list");
});

test("the words, and a row's hand read", () => {
  assert.equal(
    handStepWords("call", "Brightwater & Co.", " ask about the move "),
    "Call Brightwater & Co.: ask about the move",
  );
  assert.equal(handStepWords("note", "", "send the price list"), "This business: send the price list");
  assert.deepEqual(handOf({ kind: "call", words: " ask " }), { kind: "call", words: "ask" });
  for (const bad of [null, "call", { kind: "visit", words: "x" }, { kind: "note", words: "  " }, { kind: "note" }])
    assert.equal(handOf(bad), null);
  assert.equal(HAND_WORDS_MAX, 280, "00228's CHECK holds the same");
});
