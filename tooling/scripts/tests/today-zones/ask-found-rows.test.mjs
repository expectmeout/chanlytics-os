/**
 * Ask found's rows, ranked once (contracts askFoundOf; Today in three zones, 2 Nov 2026): the rules that look at a person
 * first, what Ask noticed, the rules that wait on someone else, the calls worth a listen and the leads who tried, then
 * Ask's ideas, last; three drawn and the rest said; a row set aside lately left out; each row its one act, and a rule's
 * who it names and what Ask why asks. And the member's rests stay a small object however many are pressed (the 3 Nov
 * audit, items 39, 41 and 49).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_FOUND_WORDS as F, askFoundOf, isRested, restedWith } from "@chanlytics/contracts";

const TODAY = "2026-09-18";
const rule = (id, tone, over = {}) => ({
  id,
  tone,
  tag: tone === "warn" ? "No reply" : "Waiting",
  icon: "alert",
  text: `3 people ${id}.`,
  math: `3 of 9 ${id}`,
  people: [],
  peopleLead: null,
  ask: `3 people ${id}. 3 of 9 ${id}. Why is that?`,
  cta: { label: "See who", to: `clients/${id}` },
  also: null,
  ...over,
});
const card = (id, over = {}) => ({
  id,
  kind: "message",
  needs: "operator",
  title: `Card ${id}`,
  summary: `What ${id} changes.`,
  payload: {},
  undo: null,
  ...over,
});
const call = (id) => ({
  id,
  kind: "call",
  who: "Ana Ruiz",
  sentence: "Asked about Saturday",
  status: ["4 min"],
  cta: { label: "Listen", to: `conversations/cv-${id}` },
});
const input = (over = {}) => ({
  rules: [],
  cards: [],
  found: [],
  lately: [],
  rested: {},
  today: TODAY,
  ...over,
});

test("one ranking: a person's rules, what Ask noticed, the rules that wait on others, the calls, then Ask's ideas; three drawn, the rest said", () => {
  const out = askFoundOf(
    input({
      rules: [rule("waiting", "info"), rule("unanswered", "warn")],
      cards: [
        card("p-idea"),
        card("finding-fell-s1", { payload: { door: "Look at it", to: "campaigns/sequences/s1" } }),
      ],
      found: [call("c1")],
    }),
  );
  assert.deepEqual(
    out.rows.map((r) => [r.key, r.source]),
    [
      ["rule:unanswered", "rule"],
      ["finding-fell-s1", "noticed"],
      ["rule:waiting", "rule"],
    ],
  );
  assert.equal(out.more, 2, "the call and the idea, said");
  const all = askFoundOf(input({ cards: [card("p-idea")], found: [call("c1")] }));
  assert.deepEqual(
    all.rows.map((r) => r.source),
    ["call", "idea"],
    "a model's idea never stands before what the numbers say",
  );
});

test("a row set aside lately is left out until its week runs out, and what came of an idea approved lately is said", () => {
  const rested = restedWith({}, "rule:unanswered", TODAY);
  const out = askFoundOf(
    input({
      rules: [rule("unanswered", "warn"), rule("waiting", "info")],
      rested,
      lately: [{ title: "Find gyms", said: "Found 40 gyms" }],
    }),
  );
  assert.deepEqual(
    out.rows.map((r) => r.key),
    ["rule:waiting"],
  );
  assert.equal(out.came, "Find gyms: Found 40 gyms");
  assert.equal(isRested(rested, "rule:unanswered", "2026-09-25"), false, "a week, and back");
});

test("each row its one act: a rule's door, a card's door where it names one, else the card's own Approve or Open in Ask", () => {
  const rows = askFoundOf(
    input({
      rules: [rule("unanswered", "warn")],
      cards: [
        card("finding-steady-s2", { kind: "playbook_change", line: "Your last 3 batches all went out." }),
        card("p-fix", { kind: "fix", payload: { door: "Get their yes", to: "clients/get-yes" } }),
      ],
    }),
  ).rows;
  assert.deepEqual(
    rows.map((r) => [r.key, r.act]),
    [
      ["rule:unanswered", { label: "See who", to: "clients/unanswered" }],
      ["finding-steady-s2", { label: F.approve, to: null }],
      ["p-fix", { label: "Get their yes", to: "clients/get-yes" }],
    ],
  );
  const plan = askFoundOf(input({ cards: [card("p-plan", { plan: { id: "pl-1", step: 1, of: 2 } })] })).rows[0];
  assert.deepEqual(plan.act, { label: F.openInAsk, to: null }, "a step of a plan opens in Ask");
  const steady = rows[1];
  assert.deepEqual(
    [steady.tag, steady.sentence, steady.why],
    [F.noticed, "Your last 3 batches all went out.", "What finding-steady-s2 changes."],
    "its line, with its number, as the sentence; what Approve changes as why",
  );
});

test("a rule carries who it names and what Ask why asks; no other row names anyone or is asked about", () => {
  const ana = { id: "p-ana", name: "Ana Ruiz", to: "clients/p-ana", title: "Waiting since 9 AM" };
  const rows = askFoundOf(
    input({
      rules: [rule("unanswered", "warn", { people: [ana], peopleLead: "Waiting now" })],
      cards: [card("p-idea")],
    }),
  ).rows;
  assert.deepEqual(
    [rows[0].people, rows[0].peopleLead, rows[0].ask],
    [[ana], "Waiting now", "3 people unanswered. 3 of 9 unanswered. Why is that?"],
  );
  assert.deepEqual([rows[1].people, rows[1].peopleLead, rows[1].ask], [[], null, null]);
  assert.equal(rows[1].why, "What p-idea changes.", "an idea with no line still says what Approve changes");
});

test("the member's rests stay a small object: the 25 that run out last are kept, the rest let go, never the new one", () => {
  let rested = {};
  for (let i = 0; i < 40; i++)
    rested = restedWith(rested, `call:q-c-${String(i).padStart(36, "0")}`, `2026-09-${10 + (i % 9)}`);
  assert.equal(Object.keys(rested).length, 25);
  const key = "finding-steady-00000000-0000-4000-8000-000000000000";
  const after = restedWith(rested, key, TODAY);
  assert.equal(Object.keys(after).length, 25);
  assert.ok(isRested(after, key, TODAY), "the newest press is kept");
  assert.ok(JSON.stringify({ rested: after }).length < 2000, "under what PUT views/:page takes");
  assert.deepEqual(Object.keys(restedWith({ a: "2026-09-01" }, "b", TODAY)), ["b"], "one run out is let go");
});
