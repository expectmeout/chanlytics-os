/**
 * Combine (decision 0052, amending 0028): the record we wrote to at a business and the person who answered from their own
 * address there, offered as one person. The door keeps the person who answered with their own name, or none where they
 * gave none (00420: it gave them the business's, so the page offered Combine only to a named person until it landed).
 * merge-people.db.test.mjs holds the door; this file holds what the page offers and how the sheet says it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMBINE_WORDS, WORKS_AT_WORDS, combineOf, personNoticesOf } from "@chanlytics/contracts";

/** The page's facts for a person at a business: the stand-in (the record we wrote to) or the person who answered. */
const facts = (over) => ({
  head: { standIn: false, signer: null },
  business: null,
  doubts: [],
  email: null,
  phone: null,
  named: true,
  heardFrom: true,
  peopleHere: [],
  ...over,
});

const standIn = {
  id: "s1",
  name: "Northside Print Shop",
  email: "hi@northside.example",
  nameSource: "lead",
  named: true,
};
const dana = { id: "p1", name: "Dana Ortiz", email: "dana@northside.example", nameSource: "typed", named: true };
const someone = {
  id: "p2",
  name: "dana@northside.example",
  email: "dana@northside.example",
  nameSource: null,
  named: false,
};

const combines = (notices) => notices.filter((n) => n.act.do.kind === "combine");

test("the record we wrote to offers to combine with the person who answered, named or not (00420)", () => {
  const onStandIn = (who) =>
    combines(personNoticesOf(facts({ head: { standIn: true, signer: null }, heardFrom: false, peopleHere: [who] })));
  const [named] = onStandIn(dana);
  assert.equal(named.fact, WORKS_AT_WORDS.answeredFrom("Dana Ortiz", "dana@…"));
  assert.equal(named.act.label, "Combine with Dana Ortiz");
  assert.deepEqual(named.act.do, {
    kind: "combine",
    otherId: "p1",
    otherName: "Dana Ortiz",
    otherEmail: "dana@northside.example",
    keepsOther: true,
    keptNamed: true,
  });
  const [unnamed] = onStandIn(someone);
  assert.ok(unnamed, "REGRESSION: Combine waited for a name the person who answered never gave");
  assert.equal(unnamed.fact, WORKS_AT_WORDS.someoneAnswered("dana@…"), "someone, not their address said twice");
  assert.equal(unnamed.act.label, "Combine");
  assert.equal(unnamed.act.do.keptNamed, false);
});

test("the person who answered offers it from their own page, and says whether they keep a name", () => {
  const onPerson = (named) =>
    combines(personNoticesOf(facts({ email: someone.email, named, peopleHere: [standIn] })))[0];
  assert.equal(onPerson(true).act.do.keptNamed, true);
  const unnamed = onPerson(false);
  assert.ok(unnamed, "offered to someone with no name too");
  assert.deepEqual([unnamed.act.do.keepsOther, unnamed.act.do.keptNamed], [false, false]);
  // Two numbers are two people: the door refuses them, so the page does not offer it.
  const twoNumbers = personNoticesOf(
    facts({ email: dana.email, phone: "+15125550101", peopleHere: [{ ...standIn, phone: "+15125550102" }] }),
  );
  assert.deepEqual(combines(twoNumbers), []);
});

test("the sheet says what the door does: one who gave no name keeps none, and is never called by their address", () => {
  const W = COMBINE_WORDS;
  const act = (who) => ({
    kind: "combine",
    otherId: who.id,
    otherName: who.name,
    otherEmail: who.email,
    keepsOther: true,
    keptNamed: who.named,
  });
  const here = { id: standIn.id, name: standIn.name, email: standIn.email };
  const named = combineOf({ here, act: act(dana), business: "Northside Print Shop" });
  assert.deepEqual([named.keepId, named.dropId, named.title], ["p1", "s1", W.title("Dana Ortiz")]);
  assert.equal(named.rows[0], W.keeps);
  assert.equal(named.why, W.why("Northside Print Shop", standIn.email, "Dana Ortiz", dana.email));
  const unnamed = combineOf({ here, act: act(someone), business: "Northside Print Shop" });
  assert.equal(unnamed.title, W.yes, "the sheet is Combine, not Combine with an address");
  assert.equal(unnamed.body, W.bodySomeone("Northside Print Shop"));
  assert.equal(unnamed.rows[0], W.keepsNoName, "they keep no name, never the business's");
  assert.match(unnamed.why, /and someone answered from dana@northside\.example\.$/);
});
