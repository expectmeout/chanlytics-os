/**
 * The people set differently, on Settings › Autonomy › Replies (the Settings wiring review, item 10, 18 Oct 2026;
 * contracts people/person-receptionist.ts ownModesOf and ownModesWords): every person whose receptionist has a mode of
 * their own is counted, under the mode they have, and the newest are named; the line says so in the person page's own
 * words, and says nothing where nobody is set apart. The read and the line on the page are proved where they are drawn
 * (ask/readers.test.mjs, workspace/settings-owner-panes.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OWN_MODE_NAMED, PERSON_MODE_LABELS, ownModesOf, ownModesWords } from "@chanlytics/contracts";

const row = (i, mode) => ({ id: `k${i}`, mode });

test("every person on a mode of their own is counted under it, and a mode no person may have is not", () => {
  const rows = [row(1, "never"), row(2, "ask"), row(3, "never"), row(4, "auto"), row(5, "veto")];
  const d = ownModesOf(rows, new Map(rows.map((r) => [r.id, `Person ${r.id}`])));
  assert.deepEqual(d.by_mode, { auto: 1, ask: 1, never: 2 });
  assert.equal(d.total, 4, "veto is the workspace's, never a person's");
  assert.deepEqual(
    d.named.map((p) => p.id),
    ["k1", "k2", "k3", "k4"],
    "in the order read: newest first",
  );
});

test("a person the server could not name is counted and not named, and the newest are named up to the line's cap", () => {
  const rows = Array.from({ length: OWN_MODE_NAMED + 5 }, (_, i) => row(i, "never"));
  const names = new Map(rows.filter((r) => r.id !== "k0").map((r) => [r.id, `Person ${r.id}`]));
  const d = ownModesOf(rows, names);
  assert.equal(d.total, OWN_MODE_NAMED + 5);
  assert.equal(d.named.length, OWN_MODE_NAMED);
  assert.equal(d.named[0].id, "k1", "the unnamed one is skipped, not called Unknown");
  assert.equal(
    ownModesWords(d).header,
    `The ${OWN_MODE_NAMED} changed last`,
    "and the menu says it is not all of them",
  );
});

test("the line says how many and under which modes, in the person page's own words, and nothing for nobody", () => {
  const one = ownModesOf([row(1, "ask")], new Map([["k1", "Dana Reyes"]]));
  assert.deepEqual(ownModesWords(one), {
    label: "People set differently",
    value: "1 person",
    hint: `1 ${PERSON_MODE_LABELS.ask}`,
    header: "Their own reply mode",
  });
  const many = ownModesOf([row(1, "auto"), row(2, "never"), row(3, "ask")], new Map());
  assert.equal(ownModesWords(many).value, "3 people");
  assert.equal(ownModesWords(many).hint, "1 Never · 1 Ask me first · 1 Answer", "what holds it back first");
  assert.equal(ownModesWords(ownModesOf([], new Map())), null);
  assert.equal(ownModesWords(null), null, "a read that failed says nothing");
});
