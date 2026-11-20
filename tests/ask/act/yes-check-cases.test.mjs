/**
 * The yes check's test set (tooling/scripts/evals/yes-check.mjs), held without asking a model: every case is whole, the set
 * reaches both languages and every kind of answer, each case is asked the very two lines the press asks, of the press's own
 * model, and a reading is told apart as the run tells it (a false yes from a false no). The live run, which costs money, is
 * the script's, on Ruben's word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MODEL_ROUTES } from "@chanlytics/contracts";
import {
  MODEL,
  callCost,
  loadCases,
  questionOf,
  validateCases,
  verdictOf,
} from "../../../tooling/scripts/evals/yes-check.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const check = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/ask/act/yes-check.ts")).href);

const cases = loadCases();

test("every case is whole and has an id of its own, and the set reaches both languages and every kind of answer", () => {
  assert.deepEqual(validateCases(cases), []);
  assert.deepEqual([...new Set(cases.map((c) => c.lang))].sort(), ["en", "es"]);
  for (const expect of [true, false, null])
    assert.ok(
      cases.some((c) => c.expect === expect),
      `a case expects ${String(expect)}`,
    );
  for (const lang of ["en", "es"])
    for (const expect of [true, false])
      assert.ok(
        cases.some((c) => c.lang === lang && c.expect === expect),
        `a ${lang} case expects ${String(expect)}`,
      );
  // A set that asks only what anyone would answer proves nothing: the kinds of no the check must hold are each here.
  for (const id of ["shorter_en", "other_place_en", "ok_question_en", "saw_it_en", "card_says_yes_en", "manana_es"])
    assert.ok(
      cases.some((c) => c.id === id),
      id,
    );
});

test("a set with a problem says it, one sentence a case", () => {
  const bad = [
    { id: "a", lang: "fr", action: "Send", words: "yes", expect: true, why: "a reason long enough" },
    { id: "a", lang: "en", action: " ", words: "", expect: "yes", why: "short" },
  ];
  assert.deepEqual(validateCases(bad), [
    "a: lang is en or es",
    "a: needs an id of its own",
    "a: the action is the card's own words",
    "a: the words are what the person said",
    "a: expect is true, false or null",
    "a: says why",
  ]);
});

test("each case is asked the press's own two lines and system, of the press's own model, within its ceiling", () => {
  const c = cases.find((x) => x.id === "other_place_en");
  assert.equal(questionOf(c), `The action: ${c.action}\nThey said: ${c.words}`);
  assert.equal(questionOf(c), check.yesCheckQuestion(c.action, c.words));
  assert.match(check.YES_CHECK_SYSTEM, /A change, a question, a doubt, a maybe or a no does not count/);
  assert.equal(MODEL, MODEL_ROUTES.lead_json.model, "the small JSON route's model, as askForJson names it");
  assert.equal(check.YES_CHECK_MAX_TOKENS, 64);
  assert.deepEqual(check.YesCheckAnswerSchema.parse({ yes: true }), { yes: true });
  assert.equal(check.YesCheckAnswerSchema.safeParse({ yes: "yes" }).success, false);
});

test("a reading is told apart as the run tells it: a false yes would have pressed, a false no would have waited, the product's call is never judged", () => {
  const yes = { expect: true };
  const no = { expect: false };
  const open = { expect: null };
  assert.equal(verdictOf(yes, true), "pass");
  assert.equal(verdictOf(no, false), "pass");
  assert.equal(verdictOf(no, true), "false_yes");
  assert.equal(verdictOf(yes, false), "false_no");
  assert.equal(verdictOf(no, null), "unread", "an answer it could not read is a no at the press, and a miss here");
  assert.equal(verdictOf(open, true), "open");
  assert.equal(verdictOf(open, null), "open");
});

test("a run's cost is computed from its text before anything is asked: a few cents for the whole set", () => {
  const each = cases.map(callCost);
  assert.ok(each.every((d) => d > 0));
  assert.ok(each.reduce((a, b) => a + b, 0) < 0.1);
});
