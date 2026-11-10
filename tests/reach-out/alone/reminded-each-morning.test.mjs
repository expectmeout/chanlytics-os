/**
 * Cold email that waits for an OK is reminded of each morning (decision 0120): the rule that says whether a workspace's
 * reminder is due, the name it is kept once under, and its words (contracts reach-out/waiting.ts). A run to leads has
 * no day to pass, so the wait's own sentence says it is reminded of, and that nothing new is written meanwhile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coldWaitsNotice,
  coldWaitsReminderKey,
  coldWaitsReminderOf,
  waitEndsWords,
  waitRuleOf,
} from "@chanlytics/contracts";

/** New York in November is five hours behind UTC. */
const TZ = "America/New_York";
const at = (iso) => Date.parse(iso);
/** Tuesday 10 November 2026, 9:05 AM in New York: the first sweep of the morning. */
const MORNING = at("2026-11-10T14:05:00Z");

const run = (id, name, emails, since) => ({ id, name, emails, since });
/** Waiting since Sunday afternoon, since Monday afternoon, and since eight this morning. */
const MOVERS = run("r1", "Movers in Austin · 2026-11-08", 8, "2026-11-08T20:00:00.000Z");
const DENTISTS = run("r2", "Dentists in Tampa · 2026-11-09", 4, "2026-11-09T20:00:00.000Z");
const FRESH = run("r3", "Gyms in Reno · 2026-11-10", 6, "2026-11-10T13:10:00.000Z");

test("the wait's own sentence says it is reminded of each morning, and what it holds back", () => {
  assert.equal(waitRuleOf("leads_batch").reminds, true);
  assert.equal(
    waitEndsWords("leads_batch"),
    "Waits for your OK, and you are reminded each morning; no new business is written to until you give it",
  );
  // Every other wait an OK answers says what it said.
  assert.equal(waitEndsWords("review_ask"), "Waits for your OK; nothing goes until you give it");
});

test("a reminder is due in the business's morning, for what has waited since before it", () => {
  const due = coldWaitsReminderOf([DENTISTS, FRESH, MOVERS], TZ, MORNING);
  assert.equal(due.day, "2026-11-10", "the business's own day");
  assert.deepEqual(
    due.runs.map((r) => r.id),
    ["r1", "r2"],
    "the longest-waiting first; one that began waiting this morning was told of when it was made",
  );
});

test("no reminder before nine or from noon on, by the business's clock, and none where nothing has waited", () => {
  assert.equal(coldWaitsReminderOf([MOVERS], TZ, at("2026-11-10T13:05:00Z")), null, "8:05 AM");
  assert.notEqual(coldWaitsReminderOf([MOVERS], TZ, at("2026-11-10T16:05:00Z")), null, "11:05 AM");
  assert.equal(coldWaitsReminderOf([MOVERS], TZ, at("2026-11-10T17:05:00Z")), null, "12:05 PM");
  assert.equal(coldWaitsReminderOf([FRESH], TZ, MORNING), null);
  assert.equal(coldWaitsReminderOf([], TZ, MORNING), null);
  // The same instant is the afternoon in London: no reminder there.
  assert.equal(coldWaitsReminderOf([MOVERS], "Europe/London", MORNING), null);
});

test("it is kept once a workspace a day", () => {
  assert.equal(coldWaitsReminderKey("t1", "2026-11-10"), "cold_email_waits:t1:2026-11-10");
  assert.notEqual(coldWaitsReminderKey("t1", "2026-11-10"), coldWaitsReminderKey("t1", "2026-11-11"));
  assert.notEqual(coldWaitsReminderKey("t1", "2026-11-10"), coldWaitsReminderKey("t2", "2026-11-10"));
});

test("one run that waits is named by its sequence, with how many emails and since when", () => {
  const told = coldWaitsNotice([MOVERS], TZ, MORNING);
  assert.equal(told.subject, "Movers in Austin still waits for your OK");
  assert.equal(
    told.body,
    "8 emails to businesses your search found have waited since Nov 8. Approve them, or skip the run. " +
      "Waits for your OK, and you are reminded each morning; no new business is written to until you give it.",
  );
  assert.equal(told.runId, "r1", "the bell's row opens the run");
  const one = coldWaitsNotice([{ ...MOVERS, emails: 1 }], TZ, MORNING);
  assert.match(
    one.body,
    /^1 email to businesses your search found has waited since Nov 8\. Approve it, or skip the run\./,
  );
});

test("several runs are counted, the longest-waiting named first, and the row opens that one", () => {
  const told = coldWaitsNotice([MOVERS, DENTISTS], TZ, MORNING);
  assert.equal(told.subject, "2 cold email runs still wait for your OK");
  assert.match(
    told.body,
    /^12 emails to businesses your searches found have waited since Nov 8: Movers in Austin \(8\), Dentists in Tampa \(4\)\. Approve or skip each run\./,
  );
  assert.equal(told.runId, "r1");
  const many = [MOVERS, DENTISTS, FRESH, run("r4", "Vets · 2026-11-07", 2, "2026-11-07T20:00:00.000Z")];
  assert.match(coldWaitsNotice(many, TZ, MORNING).body, /Gyms in Reno \(6\) and 1 more\./, "three are named");
  assert.equal(coldWaitsNotice([], TZ, MORNING), null);
});
