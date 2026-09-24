/**
 * Notifications that last: every alert the edge raises is a row the
 * workspace keeps; the bell shows them beside what it derives; a person's
 * read state follows them across devices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { serverNotificationRows, SERVER_KEY_PREFIX, SERVER_NOTIFICATION_KINDS } from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

const NOW = Date.parse("2026-09-06T16:00:00.000Z");
const row = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "handoff",
  title: "WhatsApp handoff needed: +13055550134",
  body: "The WhatsApp assistant flagged a conversation for a human.\n\nCustomer: +13055550134",
  route: "inbox/th-abc",
  subject_type: null,
  subject_id: null,
  created_at: new Date(NOW - 60_000).toISOString(),
  read: false,
  dismissed: false,
  ...over,
});

test("a kept row on the bell: keyed apart from derived ones, unread by the seen moment and the read mark, dismissed ones gone, the first line as the message", () => {
  const rows = serverNotificationRows({
    notifications: [
      row(),
      row({
        id: "22222222-2222-4222-8222-222222222222",
        kind: "calendar_people",
        title: "2 people added from your calendar",
        body: "Appointments carried numbers.",
        route: "clients",
        created_at: new Date(NOW - 3_600_000).toISOString(),
      }),
      row({ id: "33333333-3333-4333-8333-333333333333", dismissed: true }),
    ],
    seen_at: new Date(NOW - 1_800_000).toISOString(),
  });
  assert.equal(rows.length, 2, "a dismissed row is gone");
  assert.equal(rows[0].key, `${SERVER_KEY_PREFIX}11111111-1111-4111-8111-111111111111`);
  assert.equal(rows[0].unread, true, "after the seen moment, not read");
  assert.equal(rows[0].message, "The WhatsApp assistant flagged a conversation for a human.");
  assert.equal(rows[0].to, "inbox/th-abc");
  assert.deepEqual([rows[0].icon, rows[0].tone, rows[0].action], ["alert", "warn", "Open the Inbox"]);
  assert.equal(rows[1].unread, false, "before the seen moment");
  assert.deepEqual([rows[1].icon, rows[1].tone, rows[1].action, rows[1].to], ["users", "ok", "Open People", "clients"]);
  const read = serverNotificationRows({ notifications: [row({ read: true })], seen_at: null });
  assert.equal(read[0].unread, false, "a read mark wins over never having pressed seen");
  const odd = serverNotificationRows({ notifications: [row({ kind: "something_new", route: null })], seen_at: null });
  assert.deepEqual(
    [odd[0].kind, odd[0].to, odd[0].action],
    ["alert", "today", "Open Today"],
    "an unknown kind is a plain alert with somewhere to go",
  );
  assert.deepEqual(serverNotificationRows(null), []);
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("handoff") && SERVER_NOTIFICATION_KINDS.includes("calendar_people"));
});

test("the wiring: the table and its doors, the route, the surface, the bell reading both, and every edge alert kept with a kind and a route", () => {
  // The table, its RPCs, its RLS and the purge run on Postgres: notifications.db.test.mjs.
  const route = readCode("apps/dashboard/app/api/v1/notifications/route.ts");
  assert.ok(
    route.includes('rpc("notifications_seen", { p_tenant_id: tenantId })') &&
      route.includes('rpc("notification_mark", {') &&
      route.includes('rate: "notify_mark",'),
  );
  assert.ok(
    /read: !!m\?\.read_at,\s*dismissed: !!m\?\.dismissed_at,/.test(route),
    "this person's marks ride on each row",
  );
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(
    sd.includes('key: "notifications",') && sd.includes('refreshOnTables: ["notifications"],'),
    "repaints as the edge writes a row",
  );
  assert.ok(
    /calendarOverride,\s*notificationsOverride,\s*setupOverride,\s*googleOverride,\s*billingOverride,?\s*\]/.test(
      readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx"),
    ),
  );
  assert.ok(
    readCode("packages/db/src/realtime.ts").includes('{ table: "notifications", event: "INSERT" }'),
    "the channel watches the table",
  );
  const bell = readCode("apps/dashboard/src/legacy-bridge/notifications.ts");
  assert.ok(
    /dedupeFeed\(\[\s*\.\.\.applyReadState\(feedFromGlobals\(win, Date\.now\(\)\), deviceState\(\)\),\s*\.\.\.serverNotificationRows\(win\.__NOTIFICATIONS\?\.dto\),?\s*\]\)\.sort\(\(a, b\) => b\.at - a\.at\)/.test(
      bell,
    ),
    "derived beside kept, once, newest first, the seen moment the server's",
  );
  assert.ok(
    bell.includes('"surface:notifications"') &&
      bell.includes("void mark({ seen: true })") &&
      bell.includes("dismissed: false }"),
    "seen, read, dismiss and restore reach the server for kept rows",
  );
  const notify = readCode("apps/edge/lib/ops/notify.ts");
  assert.ok(
    notify.includes("export async function recordNotification(") &&
      /const kept = await recordNotification\(\s*target\.tenantId,\s*\{ kind: msg\.kind, title: msg\.subject, body: msg\.body, route: msg\.route, about: msg\.about \},\s*db,?\s*\);/.test(
        notify,
      ),
    "the row first, addressed or not",
  );
  assert.ok(notify.includes('L.error("notification_record_failed"'), "losing the row never loses the email");
  const wa = readCode("packages/core/src/inbound/answer.ts");
  assert.ok(
    readCode("apps/edge/lib/whatsapp/alerts.ts").includes('kind: "handoff",') &&
      wa.includes('route: ing ? `inbox/th-${ing.conversation_id}` : "inbox",') &&
      wa.includes('about: ing ? { type: "conversation", id: ing.conversation_id } : null,'),
    "a handoff points at its thread",
  );
  // The call and deadman bells run: retell-webhook-door.test.mjs and cron-deadman-door.test.mjs.
  // Moved out of fire.ts when a second place could fail a job: the stale-jobs
  // sweep alerts too, and two copies of who-may-be-told is how a business's
  // delivery failure once reached a different business's owner.
  assert.ok(
    /\{\s*kind: news\.kind,\s*route: news\.route,/.test(readCode("apps/edge/lib/ops/job-alert.ts")),
    "the job that raises the alert decides what it is; this file only decides who may be told",
  );
  // The look and the door of a broadcast that finished: good news, on the page it happened on.
  const done = serverNotificationRows({
    seen_at: null,
    notifications: [row({ kind: "broadcast_sent", title: "Broadcast “Spring offer” sent", route: "broadcasts" })],
  });
  assert.deepEqual(
    [done[0].icon, done[0].tone, done[0].action, done[0].to],
    ["check", "ok", "Open Broadcasts", "broadcasts"],
  );
  const stopped = serverNotificationRows({
    seen_at: null,
    notifications: [row({ kind: "broadcast_stopped", title: "Broadcast “Spring offer” stopped", route: "broadcasts" })],
  });
  assert.deepEqual(
    [stopped[0].icon, stopped[0].tone, stopped[0].action, stopped[0].to],
    ["alert", "warn", "Open Broadcasts", "broadcasts"],
  );
  assert.ok(
    readCode("apps/edge/lib/playbooks.ts").includes('kind: "playbook",') &&
      /await notify\(target, \{\s*kind: described\.kind,\s*route: described\.route,/.test(
        readCode("apps/edge/lib/whatsapp/waba-events.ts"),
      ),
    "the change decides its kind and its door (describeWabaChange); the sender never re-derives them",
  );
});

test("a note left for you (0007, 00158) is a row of its own kind: it names who wrote it and whom it is about, and opens their page", async () => {
  const { verbForRoute } = await import("@chanlytics/contracts");
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("note_for_you"));
  const id = "76386d57-a03f-44dc-b677-ebc30451c571";
  const [r] = serverNotificationRows({
    seen_at: null,
    notifications: [
      {
        id: "n1",
        kind: "note_for_you",
        title: "Maria left you a note on Tom Baker",
        body: "It is on their page.",
        route: `clients/${id}`,
        subject_type: "contact",
        subject_id: id,
        created_at: "2026-09-23T14:00:00Z",
        read: false,
        dismissed: false,
      },
    ],
  });
  assert.deepEqual([r.icon, r.action, r.to, r.unread], ["edit", "Open their page", `clients/${id}`, true]);
  assert.equal(verbForRoute("clients"), "Open People", "People itself keeps its door");
  assert.equal(verbForRoute("clients/leads"), "Open People", "and so does a scope of it");
});
