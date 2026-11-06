/**
 * What a trial includes, watched (decision 0090): the lines sweep reads each trial's use every quarter hour; at four
 * fifths the owner is told once, and at all of either the minutes or the replies the trial ends early and the plan
 * starts, told once with why. A plan Stripe would not start is told once too, and the trial runs on. Run over ports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TRIAL_INCLUDES, TRIAL_SPENT_WORDS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { sweepSpentTrials } = await import(at("apps/edge/lib/billing/trial-use.ts"));

const MIN = 60;
function world(uses, started = () => ({ ok: true })) {
  const told = new Map();
  const plansStarted = [];
  return {
    told,
    plansStarted,
    ports: {
      ids: async () => Object.keys(uses),
      useOf: async (id) => {
        if (uses[id] === "unreadable") throw new Error("no read");
        return uses[id];
      },
      startPlan: async (id) => {
        plansStarted.push(id);
        return started(id);
      },
      tell: async (id, onceKey, title, body) => {
        if (!told.has(onceKey)) told.set(onceKey, { id, title, body });
        return true;
      },
      log: { info() {}, error() {} },
    },
  };
}

test("near is told once, spent starts the plan and says why, and a trial with room is left alone", async () => {
  const w = world({
    quiet: { callSeconds: 10 * MIN, replies: 40 },
    near: { callSeconds: TRIAL_INCLUDES.callMinutes * 0.85 * MIN, replies: 0 },
    spent: { callSeconds: 0, replies: TRIAL_INCLUDES.replies },
  });
  const r = await sweepSpentTrials(w.ports);
  assert.deepEqual(r, { looked: 3, near: 1, started: 1, failed: 0, unreadable: 0 });
  assert.deepEqual(w.plansStarted, ["spent"], "only the spent trial's plan starts");
  assert.equal(w.told.get("trial_near:near").title, TRIAL_SPENT_WORDS.nearTitle);
  assert.equal(w.told.get("trial_spent:spent").title, TRIAL_SPENT_WORDS.title);
  assert.match(w.told.get("trial_spent:spent").body, /1,000 of 1,000 replies/);
  assert.equal(w.told.has("trial_near:quiet"), false);
  // The next quarter hour: the near trial is not told again (its once key), the spent one is a plan now and not on
  // the list the database answers.
  await sweepSpentTrials(w.ports);
  assert.equal([...w.told.keys()].filter((k) => k.startsWith("trial_near:near")).length, 1);
});

test("a plan Stripe would not start is told once, and a trial whose use cannot be read is skipped, not judged", async () => {
  const w = world(
    { refused: { callSeconds: TRIAL_INCLUDES.callMinutes * MIN, replies: 0 }, blind: "unreadable" },
    () => ({ ok: false, detail: "card_declined" }),
  );
  const r = await sweepSpentTrials(w.ports);
  assert.deepEqual(r, { looked: 2, near: 0, started: 0, failed: 1, unreadable: 1 });
  assert.equal(w.told.get("trial_spent_failed:refused").title, TRIAL_SPENT_WORDS.failedTitle);
});

test("a tick looks at no more than its share; the rest are the next tick's", async () => {
  const uses = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`t${i}`, { callSeconds: 0, replies: 0 }]));
  const r = await sweepSpentTrials(world(uses).ports, 3);
  assert.equal(r.looked, 3);
});
