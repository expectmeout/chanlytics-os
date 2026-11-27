/**
 * Notifications that last: every alert the edge raises is a row the
 * workspace keeps; the bell shows them beside what it derives; a person's
 * read state follows them across devices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_KINDS,
  serverNotificationRows,
  SERVER_KEY_PREFIX,
  SERVER_NOTIFICATION_KINDS,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { toldFor } from "../_live-feed.mjs";
import { listedTogether } from "../shell/boot/_frame-boot.mjs";

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

// The route named the family (`clients`), so a search's rows said "Open People" over a door to Leads, and the
// question's own verb never showed: the owner read "go to People" for a search that was waiting on them.
test("a search's rows say Leads: a finished one opens Leads, and one that asks keeps its own verb", () => {
  const S = "a516a5a6-ecb5-4ad1-96bf-56a65afceac8";
  const [asks, done] = serverNotificationRows({
    notifications: [
      row({
        id: "44444444-4444-4444-8444-444444444444",
        kind: "leads_question",
        title: "Your search for wedding photographers is waiting for your answer",
        body: "Some of the first 16 are large studio chains, which I'm leaving out. Is that what you meant?",
        route: `clients/leads:s-${S}:c-excluded`,
      }),
      row({
        id: "55555555-5555-4555-8555-555555555555",
        kind: "leads_ready",
        title: "Your search for florists is done",
        body: "12 found.",
        route: `clients/leads:s-${S}`,
        created_at: new Date(NOW - 120_000).toISOString(),
      }),
    ],
    seen_at: null,
  });
  assert.deepEqual([asks.action, asks.tone, asks.to], ["Answer it", "warn", `clients/leads:s-${S}:c-excluded`]);
  assert.equal(done.action, "Open Leads", "not People: the route names Leads");
  assert.ok(ALERT_KINDS.includes("leads_question"), "a question that waits a day wakes the device");
});

test("the wiring: the table and its doors, the route, the surface, the bell reading both, and every edge alert kept with a kind and a route", async () => {
  // The table, its RPCs, its RLS and the purge run on Postgres: notifications.db.test.mjs.
  // The route reaches the doors by name through its server module; the calls themselves are packages/db's (decision 0111).
  // The route marks the bell seen and one row read or dismissed through the two doors, counted in its own bucket: run
  // through the route in routes/reads-routes.test.mjs ("marking notifications"). Pinned as the route's and the doors'
  // text until 25 Nov 2026.
  // This person's marks ride on each row -- their read and their dismissal, never another person's -- RUN through the
  // route in reads-routes.test.mjs ("reading notifications") and through its reader in ask/readers/.
  // The surface repaints as the edge writes a row: one override, heard on the notifications it declares it reads.
  const { notificationsOverride } = await importSrc("apps/dashboard/src/bridge/surfaces/notifications.ts");
  assert.deepEqual(
    [notificationsOverride.key, notificationsOverride.reads, notificationsOverride.fresh],
    ["notifications", ["notification"], "live"],
    "repaints as the edge writes a row",
  );
  assert.ok(
    listedTogether("calendar", "notifications", "setup", "google", "billing"),
    "read as the frame loads, beside the reads Settings draws (bridge/boot)",
  );
  assert.deepEqual(
    toldFor("notifications"),
    ["INSERT", "UPDATE"],
    "the live feed is told of a note kept, and of one closed when what it asked for ended (00421)",
  );
  // Run, not read (pinned as the modules' text until 26 Nov 2026): the bell reads the derived rows beside the kept ones,
  // a hold once, newest first (notifications.test.mjs, "the feed"; record/one-row-for-one-hold.test.mjs), heard again on
  // surface:notifications (notifications.test.mjs); a look written as seen, a read, a dismissal and a restore reaching the
  // server for a kept row (record/a-note-is-unread-until-it-is-read.test.mjs, "closing the bell is a look";
  // record/one-row-for-one-hold.test.mjs, "dismissing and restoring a hold"). On the edge, the row is kept before the mail
  // leaves, addressed or not, and losing it never loses the mail (ops/notify-transport.test.mjs, "the row is kept BEFORE
  // the mail leaves", "losing the row never loses the mail"); a job's alert is kept as what the job said it is
  // (notify-transport, "a job's alert is kept as what the job said it is"); a handoff points at its thread, by its kind,
  // its route and what it is about (conversations/escalations/a-hold-is-told-in-the-owner-s-words.test.mjs, "the notice";
  // inbound/phases/every-way-out-says-what-the-message-became.test.mjs); a playbook run that waits is told where it is
  // approved (cron/cron-playbooks-door.test.mjs); and WhatsApp's news keeps the kind and the door its words name (below).
  // The look and the door of a broadcast that finished: good news, on Sequences, where its run is a day of its History.
  const done = serverNotificationRows({
    seen_at: null,
    notifications: [row({ kind: "broadcast_sent", title: "Broadcast “Spring offer” sent", route: "broadcasts" })],
  });
  assert.deepEqual(
    [done[0].icon, done[0].tone, done[0].action, done[0].to],
    ["check", "ok", "Open Campaigns", "broadcasts"],
  );
  const stopped = serverNotificationRows({
    seen_at: null,
    notifications: [row({ kind: "broadcast_stopped", title: "Broadcast “Spring offer” stopped", route: "broadcasts" })],
  });
  assert.deepEqual(
    [stopped[0].icon, stopped[0].tone, stopped[0].action, stopped[0].to],
    ["alert", "warn", "Open Campaigns", "broadcasts"],
  );
  const { setPg } = await importSrc("apps/edge/lib/shared/pg.ts");
  const { describeWabaChange, handleWabaChange } = await importSrc("apps/edge/lib/whatsapp/waba-events.ts");
  const { fakeDb } = await import("../_fake-db.mjs");
  const T = "aaaaaaaa-0000-4000-8000-0000000000c1";
  const WABA = "207650000000977";
  const channel = {
    id: "ch-1",
    tenant_id: T,
    kind: "whatsapp",
    external_id: "106540000000971",
    waba_id: WABA,
    status: "active",
    number_e164: "+13055550971",
    config: {},
    created_at: "2026-09-01T09:00:00.000Z",
  };
  const tables = {
    tenant_channels: [channel],
    templates: [
      {
        id: "tpl-1",
        tenant_id: T,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        meta_status: "pending",
        rejected_reason: null,
        source: "chanlytics",
        created_at: "2026-10-14T09:00:00.000Z",
        updated_at: "2026-10-14T09:00:00.000Z",
      },
    ],
    events: [],
    notifications: [],
  };
  const change = {
    field: "message_template_status_update",
    value: {
      event: "REJECTED",
      message_template_name: "winback_offer",
      message_template_language: "en_US",
      reason: "NONE",
    },
  };
  const db = fakeDb(tables);
  setPg(db);
  try {
    assert.equal(await handleWabaChange(db, WABA, change, async () => null), "alerted");
  } finally {
    setPg(null);
  }
  const said = describeWabaChange(change, channel.number_e164);
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.route]),
    [[said.kind, said.route]],
    "the change decides its kind and its door (describeWabaChange); the sender never re-derives them",
  );
});

// A video that could not be made rang as a job that failed, whose door said "Open the Inbox" over a row that opened Files.
test("a video made here (0122): ready opens the video itself and says Watch it; not made opens Files and says Files", () => {
  const video = "9c000000-0000-4000-8000-0000000000a1";
  const [ready, failed] = serverNotificationRows({
    seen_at: null,
    notifications: [
      row({
        id: "55555555-5555-4555-8555-555555555555",
        kind: "video_ready",
        title: "Your video is ready",
        body: "I asked for volume is in Files, under Made by Ask.",
        route: `admin/files?do=file:${video}`,
      }),
      row({
        id: "66666666-6666-4666-8666-666666666666",
        kind: "job_failed",
        title: "Your video could not be made",
        body: "It could not be drawn this time. Try again.",
        route: "admin/files",
      }),
    ],
  });
  assert.deepEqual(
    [ready.icon, ready.tone, ready.action, ready.to],
    ["video", "ok", "Watch it", `admin/files?do=file:${video}`],
    "its door says what she will do there, its row names the video, and wears a video's mark",
  );
  assert.deepEqual(
    [failed.tone, failed.action, failed.to],
    ["warn", "Open Library", "admin/files"],
    "a door says the page it opens",
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
  assert.equal(
    verbForRoute("clients/leads"),
    "Open Leads",
    "a scope of it says the scope: the owner was sent to People for a search",
  );
});
