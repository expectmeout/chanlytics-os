/**
 * The Sequences page's verbs (decision 0060, contracts ask-proposals/sequences.ts), executed through the one table every
 * sheet and card commits by (verbSpec): each makes the call its door takes, says its receipt from the door's answer, and
 * keeps an undo that is the door's own way back, or none where nothing comes back (a step taken away, a draft let go).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { verbSpec } from "@chanlytics/contracts";

const TAB = { settings: null };
const SEQ = "11111111-1111-4111-8111-111111111111";
const STEP = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const card = (kind, payload) => ({
  kind,
  card: { id: "", kind, payload, step: null, summary: "" },
  spec: verbSpec(kind),
});
const commit = (kind, payload) => {
  const c = card(kind, payload);
  return c.spec.commit(c.card, TAB);
};

test("a step after the last is added, a step changed, and each undo is the door's way back", () => {
  const s = verbSpec("sequence_step");
  assert.deepEqual(
    commit("sequence_step", { sequence_id: SEQ, template_id: MSG, after_days: 3, only_if: ["no_reply"] }),
    {
      route: "POST sequences/[id]/steps",
      params: { id: SEQ },
      body: { after_days: 3, only_if: ["no_reply"], template_id: MSG },
    },
  );
  assert.deepEqual(commit("sequence_step", { sequence_id: SEQ, step_id: STEP, after_days: 5 }), {
    route: "PUT sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
    body: { after_days: 5 },
  });
  assert.deepEqual(commit("sequence_step", { sequence_id: SEQ }), { refused: "Say which message the step sends." });
  const added = card("sequence_step", { sequence_id: SEQ, template_id: MSG, after_days: 3 }).card;
  assert.equal(s.receipt(added, { place: 2 }), "Step 2 added");
  const kept = s.undo.record(added, { id: STEP, decision_id: "d1" }, TAB);
  assert.deepEqual(s.undo.call(kept, TAB), {
    route: "DELETE sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
  });
  const changed = card("sequence_step", { sequence_id: SEQ, step_id: STEP, after_days: 5 }).card;
  const back = s.undo.record(changed, { id: STEP, was: { after_days: 3, only_if: [] }, decision_id: "d2" }, TAB);
  assert.deepEqual(s.undo.call(back, TAB).body, { after_days: 3, only_if: [] });
});

test("a step taken away and people taken out say what the door did, and keep no undo", () => {
  assert.deepEqual(commit("sequence_step_remove", { sequence_id: SEQ, step_id: STEP }), {
    route: "DELETE sequences/[id]/steps/[step]",
    params: { id: SEQ, step: STEP },
  });
  assert.equal(verbSpec("sequence_step_remove").receipt(null, { removed: 2 }), "2 steps taken away");
  assert.equal(verbSpec("sequence_step_remove").undo, undefined);
  assert.deepEqual(commit("sequence_leave", { sequence_id: SEQ, enrollment_ids: ["e1", 7, "e2"] }), {
    route: "POST sequences/[id]/leave",
    params: { id: SEQ },
    body: { enrollment_ids: ["e1", "e2"] },
  });
  assert.equal(verbSpec("sequence_leave").receipt(null, { left: 0 }), "Nobody was still in it");
});

test("a step's new words say whether they wait for WhatsApp, and the undo gives back the words it had", () => {
  const s = verbSpec("sequence_words");
  const c = card("sequence_words", {
    sequence_id: SEQ,
    step_id: STEP,
    template_id: MSG,
    params: [{ kind: "first_name" }],
  });
  assert.deepEqual(s.commit(c.card, TAB).body, { template_id: MSG, params: [{ kind: "first_name" }] });
  assert.match(s.receipt(c.card, { waits: true }), /wait for WhatsApp/);
  const kept = s.undo.record(c.card, { was: { template_id: "old", params: [] }, decision_id: "d3" }, TAB);
  assert.deepEqual(s.undo.call(kept, TAB).body, { template_id: "old", params: [] });
});

test("a draft is asked for, never made; keeping it makes the sequence whole, and its undo takes it away again", () => {
  assert.deepEqual(commit("sequence_draft", { words: "Thank them", previous: { name: "Win-back", steps: 2 } }), {
    route: "POST sequences/draft",
    body: { words: "Thank them", previous: { name: "Win-back", steps: 2 } },
  });
  assert.deepEqual(commit("sequence_draft", { words: "" }), { refused: "Say what it should do." });
  assert.equal(verbSpec("sequence_draft").undo, undefined);

  const make = verbSpec("sequence_make");
  const first = { name: "Welcome", trigger: "visited", template_id: MSG, params: [], run_hour: 10 };
  const then = [{ after_days: 28, only_if: ["no_booking"], template_id: MSG, params: [] }];
  const c = card("sequence_make", { first, then, start: false });
  assert.deepEqual(make.commit(c.card, TAB), { route: "POST sequences", body: { first, then, start: false } });
  assert.deepEqual(commit("sequence_make", { first: { trigger: "visited" } }), {
    refused: "Say what starts it and the message it sends first.",
  });
  assert.equal(make.receipt(c.card, { id: SEQ, state: "draft" }), "Kept as a draft: nothing goes yet");
  assert.equal(make.receipt(c.card, { id: SEQ, state: "on" }), "The sequence is on");
  assert.equal(make.made(c.card, { id: SEQ }), SEQ);
  assert.equal(
    make.open(c.card, { state: "done", receipt: "", atMs: 0, made: { kind: "sequence_make", id: SEQ } }),
    `campaigns/sequences/${SEQ}`,
  );
  const kept = make.undo.record(c.card, { id: SEQ, decision_id: "d4" }, TAB);
  assert.deepEqual(make.undo.call(kept, TAB), { route: "DELETE sequences/[id]", params: { id: SEQ } });
});

test("a draft is started through the campaign's own door, paused as its undo, and let go with no way back", () => {
  const start = verbSpec("sequence_start");
  const c = card("sequence_start", { sequence_id: SEQ, name: "Welcome" });
  assert.deepEqual(start.commit(c.card, TAB), {
    route: "PUT playbooks/[id]",
    params: { id: SEQ },
    body: { state: "running" },
  });
  assert.equal(start.receipt(c.card, {}), "“Welcome” is on");
  const kept = start.undo.record(c.card, { decision_id: "d5" }, TAB);
  assert.deepEqual(start.undo.call(kept, TAB).body, { state: "paused" });
  assert.deepEqual(commit("sequence_discard", { sequence_id: SEQ }), {
    route: "DELETE sequences/[id]",
    params: { id: SEQ },
  });
  assert.equal(verbSpec("sequence_discard").undo, undefined);
  assert.equal(verbSpec("sequence_discard").open({ payload: {} }, null), "campaigns/sequences");
});
