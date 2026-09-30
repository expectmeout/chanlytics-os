/**
 * How long a person's touch keeps the receptionist off a thread: one rule, pauseHoursOf and its ms twin, read by
 * every pause (the inbound path's handoff, the dashboard's take-over and reply, the WhatsApp app's echo, a call handed
 * to a person) and by the words that state one (the handoff email, the Autonomy pane). Five sites used to derive it,
 * and they disagreed on what a stored value that is not a whole number of hours means.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { HOUR_MS, PAUSE_HOURS_DEFAULT, hardLimitsWords, pauseHoursOf, pauseMsOf } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { pauseMsFor } = await import(at("apps/dashboard/src/server/verbs.ts"));

const DAY = PAUSE_HOURS_DEFAULT * HOUR_MS;

// What a stored `pause_hours` may be, and what each means: a whole number from 1 to 168 is the owner's, as the reply
// policy's schema and `PUT policies` take it; anything else is the default day.
const CASES = [
  ["nothing stored", undefined, DAY],
  ["null", null, DAY],
  ["0", 0, DAY],
  ["half an hour", 0.5, DAY],
  ["an hour", 1, HOUR_MS],
  ["two days", 48, 48 * HOUR_MS],
  ["a week, the most the dial takes", 168, 168 * HOUR_MS],
  ["past a week", 169, DAY],
  ["a negative", -4, DAY],
  ["a string", "48", DAY],
  ["NaN", NaN, DAY],
];

test("the pause is the stored whole number of hours from 1 to 168, and the default day for anything else", () => {
  assert.equal(DAY, 24 * 3600 * 1000);
  for (const [what, stored, ms] of CASES) {
    assert.equal(pauseMsOf({ pause_hours: stored }), ms, what);
    assert.equal(pauseHoursOf({ pause_hours: stored }), ms / HOUR_MS, `${what}, in hours`);
  }
  assert.equal(pauseMsOf(null), DAY, "no limits at all");
  assert.equal(pauseMsOf(undefined), DAY);
  assert.equal(pauseMsOf({}), DAY);
});

test("the Autonomy pane's dial says the hours the pause applies", () => {
  for (const [what, stored, ms] of CASES)
    assert.equal(hardLimitsWords({ pause_hours: stored }).hours, ms / HOUR_MS, what);
});

test("a take-over or a reply from the dashboard pauses for what the workspace's reply row says, read through the one rule", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const row = (limits) => ({ id: "p1", tenant_id: T, class: "reply", mode: "auto", subject_type: null, limits });
  for (const [what, stored, ms] of CASES) {
    const limits = stored === undefined ? {} : { pause_hours: stored };
    const got = await pauseMsFor({ supabase: fakeDb({ policies: [row(limits)] }) }, T);
    assert.equal(got, ms, what);
    assert.equal(got, pauseMsOf(limits), `${what}: the verb and the rule agree`);
  }
  assert.equal(await pauseMsFor({ supabase: fakeDb({ policies: [] }) }, T), DAY, "no reply row at all");
  const perPerson = { ...row({ pause_hours: 2 }), subject_type: "contact", subject_id: "c1" };
  assert.equal(
    await pauseMsFor({ supabase: fakeDb({ policies: [perPerson] }) }, T),
    DAY,
    "a per-person row is not the workspace's",
  );
});
