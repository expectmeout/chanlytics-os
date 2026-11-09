/**
 * What GET today reads beside the day (Today in three zones, 2 Nov 2026), executed over a database in memory on a fixed
 * clock: "N done today" by Need you's door (readers/today.ts doneToday over db getTodayDoneCount) and Since you looked
 * (getSinceYouLooked over db findBellSeenAt, findAnsweredSince and findContactName). The 3 Nov audit's items 45, 46, 47, 51 and 56:
 *
 * - the business's day starts where metrics_summary says (its `window.since`), not at UTC's midnight: a decision at six
 *   in the evening in New York is today's;
 * - each subject once, the members' own decisions of the counted verbs only, and none taken back, nor the Undo itself;
 * - the receptionist's replies that left counted since the member last looked, the last of its words cut at a word as
 *   every receipt is (never to one letter), to a person named by the one rule (a number where there is no name).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerContext } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { findDoneToday, getSinceYouLooked } = await import(at("apps/dashboard/src/server/readers/today.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
/** Monday 2 November 2026, 10:30 PM in New York (3:30 the next morning in UTC): the business's day is still the 2nd. */
const NOW = new Date("2026-11-03T03:30:00.000Z");
/** The day's start as metrics_summary says it: midnight in New York, 5 AM UTC once the clocks went back on the 1st. */
const SINCE = "2026-11-02T05:00:00.000Z";
const METRICS = {
  workspace: { name: "Harbor", timezone: "America/New_York", status: "active" },
  channels: [],
  window: { days: 1, since: SINCE, since_local: "2026-11-02T00:00:00", now_local: "2026-11-02T22:30:00" },
  now: {},
  period: {},
};

const rcOver = (tables) =>
  readerContext(
    {
      supabase: fakeDb(tables, {}, { metrics_summary: () => METRICS }),
      userId: USER,
      email: "ada@example.com",
      params: {},
    },
    { tenantId: A, role: "owner", facts: null },
    NOW,
  );

const decision = (id, verb, subject, createdAt, over = {}) => ({
  id,
  tenant_id: A,
  actor_type: "user",
  actor_id: USER,
  verb,
  subject_type: "conversation",
  subject_id: subject,
  created_at: createdAt,
  undo_of: null,
  ...over,
});

test("done today: the business's own day, each subject once, the members' counted decisions only, none taken back", async () => {
  const decisions = [
    decision("d1", "reply", "c1", "2026-11-02T04:59:59.000Z"), // 11:59 PM on the 1st, local: yesterday's
    decision("d2", "reply", "c2", "2026-11-02T05:00:00.000Z"), // midnight: today's
    decision("d3", "hand_back", "c3", "2026-11-02T23:00:00.000Z"), // 6 PM local, the 3rd in UTC's: today's
    decision("d4a", "reply", "c4", "2026-11-02T14:00:00.000Z"),
    decision("d4b", "resolve", "c4", "2026-11-02T14:05:00.000Z"), // two verbs, one subject: once
    decision("d5", "snooze", "c5", "2026-11-02T15:00:00.000Z"), // not a thing done
    decision("d6", "reply", "c6", "2026-11-02T15:00:00.000Z", { actor_type: "ai" }), // the receptionist's, not a member's
    // Mark all done, then its Undo: neither is a thing done.
    decision("d7", "hand_back", "c7", "2026-11-02T16:00:00.000Z"),
    decision("d7u", "take_over", "c7", "2026-11-02T16:01:00.000Z", { undo_of: "d7" }),
    // A hand-back that undoes a take-over is a reversal, never a thing done.
    decision("d8", "take_over", "c8", "2026-11-02T17:00:00.000Z"),
    decision("d8u", "hand_back", "c8", "2026-11-02T17:01:00.000Z", { undo_of: "d8" }),
    // Undone, then done again: once.
    decision("d9a", "hand_back", "c9", "2026-11-02T18:00:00.000Z"),
    decision("d9u", "take_over", "c9", "2026-11-02T18:01:00.000Z", { undo_of: "d9a" }),
    decision("d9b", "hand_back", "c9", "2026-11-02T18:05:00.000Z"),
  ];
  assert.equal(
    await findDoneToday(rcOver({ decisions })),
    4,
    "c2, c3, c4 and c9: REGRESSION, it counted c7's Mark all done its Undo had taken back, and c8's Undo itself",
  );
});

const message = (id, status, createdAt, over = {}) => ({
  id,
  tenant_id: A,
  direction: "outbound",
  sender: "ai",
  status,
  body: `Reply ${id}`,
  created_at: createdAt,
  contact_id: "p-1",
  ...over,
});

test("since you looked: nothing for a member who never looked; else what the receptionist answered since, its last words cut at a word, to whom", async () => {
  assert.deepEqual(await getSinceYouLooked(rcOver({ notification_reads: [] })), { seen_at: null, answered: null });
  const seen = "2026-11-03T01:00:00.000Z";
  const unbroken = "x".repeat(300);
  const tables = {
    notification_reads: [{ tenant_id: A, user_id: USER, seen_at: seen }],
    contacts: [
      { id: "p-1", tenant_id: A, display_name: null, wa_profile_name: null, phone_e164: "+19175550102", email: null },
    ],
    messages: [
      message("m1", "sent", "2026-11-03T01:10:00.000Z"),
      message("m2", "delivered", "2026-11-03T01:20:00.000Z"),
      message("m3", "read", "2026-11-03T02:40:00.000Z", { body: unbroken }),
      message("m4", "failed", "2026-11-03T02:50:00.000Z"), // it never left
      message("m5", "sent", "2026-11-03T00:50:00.000Z"), // before they looked
      message("m6", "sent", "2026-11-03T02:55:00.000Z", { sender: "user" }), // a member's own
    ],
  };
  const since = await getSinceYouLooked(rcOver(tables));
  assert.equal(since.seen_at, seen);
  assert.equal(since.answered.count, 3);
  assert.equal(since.answered.last.at, "2026-11-03T02:40:00.000Z");
  assert.equal(since.answered.last.who, "+1 (917) 555-0102", "REGRESSION: someone with no name was 'a customer'");
  const text = since.answered.last.text;
  assert.ok(text.endsWith("…") && text.length > 200, `REGRESSION: an unbroken reply was cut to one letter: ${text}`);
  // A short reply, whole.
  tables.messages.push(message("m7", "sent", "2026-11-03T03:00:00.000Z", { body: "Saturday at 10 works." }));
  assert.equal((await getSinceYouLooked(rcOver(tables))).answered.last.text, "Saturday at 10 works.");
});
