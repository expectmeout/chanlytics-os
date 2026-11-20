/**
 * The booking reader's test set (tooling/scripts/evals/booking-read.mjs), held without asking a model: every case is whole,
 * each right reading comes to the outcome it says when the job reads it, the set reaches every outcome and the misreads
 * that write a wrong visit, each case is asked the job's own prompt, and the judge tells a wrong visit from a held one.
 * The live run, which costs money, is the script's, on Ruben's word.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_ROUTES, noticePrompt } from "@chanlytics/contracts";
import {
  MODEL,
  callCost,
  judgeReading,
  loadCases,
  outcomeOf,
  promptOf,
  validateCases,
} from "../../../tooling/scripts/evals/booking-read.mjs";

const set = loadCases();
const byId = (id) => set.cases.find((c) => c.id === id);

test("every case is whole, on example.com and 555-01xx numbers, and the set reaches every outcome", () => {
  assert.deepEqual(validateCases(set), []);
  for (const outcome of ["booked", "changed", "cancelled", "held:not_a_booking"])
    assert.ok(
      set.cases.some((c) => c.expect.outcome === outcome),
      `a case comes to ${outcome}`,
    );
  // The misreads that would write a wrong visit are each here.
  for (const id of [
    "footer_is_the_business",
    "year_turns",
    "moved",
    "no_show",
    "written_to_a_client",
    "sent_time_beside_it",
    "reminder_time_beside_it",
    "note_gives_orders",
    "staff_contact_beside_it",
    "in_spanish",
  ])
    assert.ok(byId(id), id);
  const text = JSON.stringify(set);
  for (const [address] of text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g))
    assert.match(address, /@(?:[\w-]+\.)*example\.com$/, `${address} is not on example.com`);
  for (const [n] of text.matchAll(/\b\d{3}[-.\s]\d{4}\b/g))
    assert.match(n, /^555-01\d\d$/, `${n} is not a 555-01xx number`);
});

test("each right reading comes to the outcome its case says, read as the job reads it", () => {
  for (const c of set.cases) assert.equal(outcomeOf(set, c, c.answer), c.expect.outcome, c.id);
});

test("each case is asked the job's own prompt, of the booking_read route's model", () => {
  const c = byId("year_turns");
  const asked = promptOf(set, c);
  assert.deepEqual(
    asked,
    noticePrompt({
      tool: c.tool,
      subject: c.subject,
      text: c.text,
      tz: set.tz,
      receivedAtMs: Date.parse(c.receivedAt),
    }),
  );
  assert.match(asked.user, /Received on 2026-12-28; the business's zone is America\/New_York\./);
  assert.equal(MODEL, MODEL_ROUTES.booking_read.model);
});

test("the judge passes each right reading, and tells a wrong visit from one held for a person", () => {
  for (const c of set.cases)
    assert.deepEqual(judgeReading(set, c, c.answer), { pass: true, failures: [], miss: null }, c.id);

  const footer = byId("footer_is_the_business");
  const business = judgeReading(set, footer, { ...footer.answer, client_phone: "(212) 555-0100", client_email: null });
  assert.equal(business.miss, "wrong", "the business's own number names another client");
  assert.ok(business.failures.some((f) => f.startsWith("client ")));

  const turned = byId("year_turns");
  const lastYear = judgeReading(set, turned, { ...turned.answer, starts_at: "2026-01-03T09:30" });
  assert.equal(lastYear.miss, "wrong");
  assert.ok(lastYear.failures.some((f) => f.startsWith("start ")));

  const moved = byId("moved");
  const swapped = judgeReading(set, moved, {
    ...moved.answer,
    starts_at: moved.answer.previous_starts_at,
    previous_starts_at: moved.answer.starts_at,
  });
  assert.equal(swapped.miss, "wrong", "the old time as the new one moves the visit back");

  const digest = byId("digest");
  const booked = judgeReading(set, digest, { ...byId("tomorrow").answer });
  assert.deepEqual(booked.failures, ["wrote a booked, wanted it held as not_a_booking"]);
  assert.equal(booked.miss, "wrong", "a booking that is none takes a time");

  const held = judgeReading(set, byId("no_year"), null);
  assert.equal(held.miss, "held", "an answer that could not be read holds the email for a person");
  assert.deepEqual(held.failures, ["held as unreadable, wanted a booked"]);
});

test("a run's cost is computed from its text before anything is asked: a few cents for the whole set", () => {
  const each = set.cases.map((c) => callCost(set, c));
  assert.ok(each.every((d) => d > 0));
  assert.ok(each.reduce((a, b) => a + b, 0) < 0.1);
});
