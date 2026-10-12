/**
 * "A booking email needs a look" opens the row that holds it (wiring/records-not-pages, task 1.7; finding A2b): the notice
 * was kept with the route `admin/workspace`, the top of Settings > Business, though the notice is about the booking tool's
 * email and the Business tab has a row for exactly that, open at `admin/workspace/calendar` (contracts
 * CALENDAR_SETTING_ROUTE, which every "set it up", "check it" and "look at them" about the calendar already uses). Several of
 * them in a day still open the list the kind lives on (contracts SERVER_LOOK, a group of rows), which is the Business tab.
 *
 * Run: the reader the job runner is handed, over a database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CALENDAR_SETTING_ROUTE, noticeRoute, serverNotificationRows } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { bookingReader } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/calendar/booking-read.ts")).href);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("the notice of a booking email held for a person opens the Business row that holds it, and names the notice", async () => {
  const tables = { notifications: [], jobs: [], tenants: [], tenant_config: [], tenant_channels: [] };
  const told = await bookingReader(fakeDb(tables)).tell(T, {
    noticeId: NOTICE,
    subject: "Your booking is confirmed",
    tool: "Calendly",
    reason: "it names no day",
  });
  assert.equal(told, undefined, "best effort: the port answers nothing");
  assert.equal(tables.notifications.length, 1, "one row on the bell");
  const [row] = tables.notifications;
  assert.equal(row.kind, "booking_notice");
  assert.equal(row.route, CALENDAR_SETTING_ROUTE);
  assert.equal(row.route, "admin/workspace/calendar");
  assert.deepEqual([row.subject_type, row.subject_id], ["booking_notice", NOTICE]);
  assert.equal(row.title, "A booking email needs a look");
});

test("the bell opens that row for the one notice, and the Business tab for a kind of notice with none of its own", () => {
  const [one] = serverNotificationRows({
    notifications: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "booking_notice",
        title: "A booking email needs a look",
        body: "x",
        route: CALENDAR_SETTING_ROUTE,
        subject_type: "booking_notice",
        subject_id: NOTICE,
        created_at: "2026-10-11T10:00:00.000Z",
        read: false,
        dismissed: false,
      },
    ],
    seen_at: null,
  });
  assert.equal(one.to, "admin/workspace/calendar");
  assert.equal(one.action, "Open Business");
  // A row kept before this change says the top of Business, and keeps saying it.
  assert.equal(noticeRoute("booking_notice", "admin/workspace"), "admin/workspace");
  assert.equal(noticeRoute("booking_notice", null), "admin/workspace");
});
