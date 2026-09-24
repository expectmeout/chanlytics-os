/**
 * The rails around the send.
 *
 * A broadcast could be scheduled at any hour in the browser's zone; broadcasts
 * did not count as touches, so the week's breath did not see them; a run that
 * died stranded half its audience; a recipient's line said "delivered" with
 * no time; a playbook's totals came from the recent fifty broadcasts of any
 * kind. Executed here: the next open moment by the business's clock across
 * the day and a clock change, the detail's receipt times from the stamps the
 * guard keeps, the history from every run, and the week's touches the page
 * shows as waiting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nextOpenMoment, PLAYBOOK_HOURS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const B = await import(at("apps/dashboard/src/server/broadcasts.ts"));
const P = await import(at("apps/dashboard/src/server/playbooks.ts"));

const NY = "America/New_York";
const iso = (s) => new Date(s).toISOString();

test("the next open moment, by the business's clock: inside stays, before goes to nine, after goes to nine tomorrow, and a clock change still yields nine", () => {
  assert.deepEqual(PLAYBOOK_HOURS, { min: 9, max: 20 });
  const inside = new Date("2026-09-07T14:00:00Z"); // 10:00 NY
  assert.deepEqual(nextOpenMoment(NY, inside), { at: inside, moved: false });
  const lastHour = new Date("2026-09-08T00:30:00Z"); // 20:30 NY: the twenty-hundred hour is still open
  assert.deepEqual(nextOpenMoment(NY, lastHour), { at: lastHour, moved: false });
  assert.deepEqual(
    nextOpenMoment(NY, new Date("2026-09-07T09:30:00Z")),
    { at: new Date("2026-09-07T13:00:00Z"), moved: true },
    "05:30 NY -> 09:00 NY the same morning",
  );
  assert.deepEqual(
    nextOpenMoment(NY, new Date("2026-09-07T03:00:00Z")),
    { at: new Date("2026-09-07T13:00:00Z"), moved: true },
    "23:00 NY the evening before -> nine that morning",
  );
  assert.deepEqual(
    nextOpenMoment(NY, new Date("2026-09-08T01:30:00Z")),
    { at: new Date("2026-09-08T13:00:00Z"), moved: true },
    "21:30 NY -> nine the next morning",
  );
  // The night the clocks go back (1 Nov 2026 in New York): 23:00 on 31 Oct is
  // EDT (03:00Z), and nine on 1 Nov is EST (14:00Z) -- five hours off, not four.
  assert.deepEqual(nextOpenMoment(NY, new Date("2026-11-01T03:00:00Z")), {
    at: new Date("2026-11-01T14:00:00Z"),
    moved: true,
  });
  // A zone with no daylight saving, and one east of Greenwich.
  assert.deepEqual(
    nextOpenMoment("Asia/Tokyo", new Date("2026-09-07T20:00:00Z")),
    { at: new Date("2026-09-08T00:00:00Z"), moved: true },
    "05:00 Tokyo -> 09:00 Tokyo",
  );
  assert.deepEqual(nextOpenMoment("UTC", new Date("2026-09-07T21:00:00Z")), {
    at: new Date("2026-09-08T09:00:00Z"),
    moved: true,
  });
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = (tables) => ({ supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", params: {} });
const row = (id, over = {}) => ({
  id,
  tenant_id: T,
  name: `Run ${id}`,
  template_id: "t1",
  template_name: "win_back",
  template_language: "en_US",
  params: [],
  audience: { kind: "list", id: "quiet", label: "Quiet" },
  state: "sent",
  scheduled_for: "2026-09-01T14:00:00Z",
  started_at: "2026-09-01T14:00:00Z",
  finished_at: "2026-09-01T14:05:00Z",
  recipient_count: 2,
  failure: null,
  created_at: "2026-09-01T13:00:00Z",
  playbook_id: "p1",
  run_for: "2026-09-01",
  ...over,
});

test("a recipient's line carries the times the receipts gave, and the first reply's; a row from before the stamp carries none", async () => {
  const tables = {
    broadcasts: [row("b1")],
    broadcast_recipients: [
      {
        tenant_id: T,
        broadcast_id: "b1",
        contact_id: "k1",
        state: "sent",
        reason: null,
        sent_at: "2026-09-01T14:00:10Z",
        messages: {
          conversation_id: "c1",
          status: "read",
          meta: {
            source: "broadcast",
            status_at: {
              sent: "2026-09-01T14:00:11Z",
              delivered: "2026-09-01T14:00:40Z",
              read: "2026-09-01T14:09:00Z",
            },
          },
        },
        contacts: { display_name: "Ada", wa_profile_name: null, phone_e164: "+13475550101" },
      },
      {
        tenant_id: T,
        broadcast_id: "b1",
        contact_id: "k2",
        state: "sent",
        reason: null,
        sent_at: "2026-09-01T14:00:20Z",
        messages: { conversation_id: "c2", status: "delivered", meta: {} },
        contacts: { display_name: "Bo", wa_profile_name: null, phone_e164: "+13475550102" },
      },
    ],
    messages: [
      // Ada replied twice inside the window; Bo asked something two weeks later, which is not a reply.
      { tenant_id: T, conversation_id: "c1", direction: "inbound", created_at: "2026-09-01T15:30:00Z" },
      { tenant_id: T, conversation_id: "c1", direction: "inbound", created_at: "2026-09-01T14:20:00Z" },
      { tenant_id: T, conversation_id: "c2", direction: "inbound", created_at: "2026-09-15T14:20:00Z" },
    ],
  };
  const d = await B.getBroadcast(ctx(tables), T, "b1");
  const ada = d.recipients.find((r) => r.contact_id === "k1");
  const bo = d.recipients.find((r) => r.contact_id === "k2");
  assert.deepEqual(
    [ada.message_status, ada.delivered_at, ada.read_at, ada.replied, ada.replied_at],
    ["read", "2026-09-01T14:00:40Z", "2026-09-01T14:09:00Z", true, "2026-09-01T14:20:00Z"],
    "each state's own time, and the FIRST reply",
  );
  assert.deepEqual(
    [bo.message_status, bo.delivered_at, bo.read_at, bo.replied, bo.replied_at],
    ["delivered", null, null, false, null],
    "a row from before 00111: the status, no times, no reply outside the window",
  );
  assert.deepEqual(d.broadcast.counts, {
    queued: 0,
    sent: 2,
    skipped: 0,
    failed: 0,
    delivered: 2,
    read: 1,
    replied: 1,
  });
  assert.equal(B.statusAt({ status_at: { delivered: "x" } }, "read"), null);
  assert.equal(B.statusAt(null, "read"), null);
  assert.equal(B.statusAt("junk", "read"), null);
});

test("a playbook's totals and history come from every run it made, not the recent fifty broadcasts of any kind", async () => {
  // Sixty daily runs of one playbook plus seventy broadcasts sent by hand, all
  // newer than the runs: the recent-fifty window held none of the runs.
  const broadcasts = [];
  const broadcast_recipients = [];
  for (let i = 0; i < 60; i++) {
    const id = `r${String(i).padStart(2, "0")}`;
    const day = new Date(Date.UTC(2026, 5, 1 + i)).toISOString();
    broadcasts.push(row(id, { created_at: day, scheduled_for: day, run_for: day.slice(0, 10), recipient_count: 3 }));
    broadcast_recipients.push({
      tenant_id: T,
      broadcast_id: id,
      contact_id: "k1",
      state: "sent",
      reason: null,
      sent_at: day,
      messages: { conversation_id: "c1", status: "delivered", meta: {} },
    });
    broadcast_recipients.push({
      tenant_id: T,
      broadcast_id: id,
      contact_id: "k2",
      state: "sent",
      reason: null,
      sent_at: day,
      messages: { conversation_id: "c2", status: "sent", meta: {} },
    });
    broadcast_recipients.push({
      tenant_id: T,
      broadcast_id: id,
      contact_id: "k3",
      state: "skipped",
      reason: "opted_out",
      sent_at: null,
      messages: null,
    });
  }
  for (let i = 0; i < 70; i++) {
    const day = new Date(Date.UTC(2026, 8, 1, i)).toISOString();
    broadcasts.push(
      row(`h${i}`, { created_at: day, scheduled_for: day, playbook_id: null, run_for: null, recipient_count: 1 }),
    );
  }
  const playbooks = [
    {
      id: "p1",
      tenant_id: T,
      name: "Win-back",
      trigger: "quiet_30",
      template_id: "t1",
      template_name: "win_back",
      template_language: "en_US",
      params: [],
      policy_class: "reengage",
      state: "running",
      run_hour: 10,
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
      last_run_for: "2026-07-30",
      last_run_at: null,
      created_by: null,
      created_at: "2026-05-01T00:00:00Z",
    },
  ];
  const [p] = await P.listPlaybooks(ctx({ broadcasts, broadcast_recipients, messages: [], playbooks }), T);
  assert.deepEqual(
    [p.totals.runs, p.totals.sent, p.totals.held, p.totals.delivered],
    [60, 120, 60, 60],
    "every run counted",
  );
  assert.equal(p.totals.history.length, P.HISTORY_ON_CARD, "the card lists the most recent ten");
  assert.deepEqual(
    p.totals.history.slice(0, 2).map((h) => [h.run_for, h.sent, h.held, h.state]),
    [
      ["2026-07-30", 2, 1, "sent"],
      ["2026-07-29", 2, 1, "sent"],
    ],
    "newest first, with what each earned",
  );
  assert.equal(p.totals.lastRun.run_for, "2026-07-30");
  const hand = await B.listBroadcasts(ctx({ broadcasts, broadcast_recipients, messages: [] }), T);
  assert.equal(hand.broadcasts.length, 50, "the Broadcasts page's own window is unchanged");
  assert.equal(hand.more, true, "and with 130 on file, the page is told older ones exist");
});

test("the week's touches: who any broadcast reached, or is about to, within the breath -- by hand or by a playbook -- and nobody older or canceled", async () => {
  const now = new Date("2026-09-12T12:00:00Z");
  const tables = {
    broadcasts: [
      row("run", { created_at: "2026-09-10T13:00:00Z", scheduled_for: "2026-09-10T14:00:00Z" }),
      row("hand", {
        created_at: "2026-09-11T13:00:00Z",
        scheduled_for: "2026-09-11T14:00:00Z",
        playbook_id: null,
        run_for: null,
      }),
      row("soon", {
        created_at: "2026-09-12T10:00:00Z",
        scheduled_for: "2026-09-13T14:00:00Z",
        state: "scheduled",
        playbook_id: null,
        run_for: null,
      }),
      row("old", {
        created_at: "2026-09-01T13:00:00Z",
        scheduled_for: "2026-09-01T14:00:00Z",
        playbook_id: null,
        run_for: null,
      }),
      row("gone", {
        created_at: "2026-09-11T13:00:00Z",
        scheduled_for: "2026-09-11T14:00:00Z",
        state: "canceled",
        playbook_id: null,
        run_for: null,
      }),
      // Noon in New York is eight in the morning of the 12th there: yesterday's run is the 11th's.
      row("waited", {
        created_at: "2026-09-11T14:00:00Z",
        scheduled_for: "2026-09-11T14:00:00Z",
        state: "pending_approval",
        run_for: "2026-09-11",
      }),
      row("waiting", {
        created_at: "2026-09-12T11:00:00Z",
        scheduled_for: "2026-09-12T11:00:00Z",
        state: "pending_approval",
        run_for: "2026-09-12",
      }),
    ],
    broadcast_recipients: [
      { tenant_id: T, broadcast_id: "run", contact_id: "a", state: "sent", sent_at: "2026-09-10T14:00:05Z" },
      { tenant_id: T, broadcast_id: "hand", contact_id: "a", state: "sent", sent_at: "2026-09-11T14:00:05Z" },
      { tenant_id: T, broadcast_id: "hand", contact_id: "b", state: "skipped", sent_at: null },
      { tenant_id: T, broadcast_id: "soon", contact_id: "c", state: "queued", sent_at: null },
      { tenant_id: T, broadcast_id: "old", contact_id: "d", state: "sent", sent_at: "2026-09-01T14:00:05Z" },
      { tenant_id: T, broadcast_id: "gone", contact_id: "e", state: "queued", sent_at: null },
      // Stopped after it sent to f: f was reached, and read as nobody f was messaged again.
      { tenant_id: T, broadcast_id: "gone", contact_id: "f", state: "sent", sent_at: "2026-09-11T14:00:07Z" },
      // Waiting for a person: yesterday's can never be approved and holds nobody; today's may go, and holds.
      { tenant_id: T, broadcast_id: "waited", contact_id: "g", state: "queued", sent_at: null },
      { tenant_id: T, broadcast_id: "waiting", contact_id: "h", state: "queued", sent_at: null },
    ],
    tenants: [{ id: T, timezone: NY }],
  };
  assert.deepEqual(await P.recentTouches(ctx(tables), T, now), {
    a: "2026-09-11T14:00:05Z", // the later of the two, the one by hand
    c: "2026-09-13T14:00:00Z", // on its way counts from when it is due
    f: "2026-09-11T14:00:07Z", // sent before its run was stopped
    h: "2026-09-12T11:00:00Z", // waiting for a person today: it may still go
  });
  assert.deepEqual(await P.recentTouches(ctx({ broadcasts: [], broadcast_recipients: [] }), T, now), {});
});

test("a proposal's follow-up is a touch of its own (0006): from any playbook's run, one since deleted too, and never a run that only carried other words", async () => {
  const { touchesSince, touchIndex } = await import(at("packages/db/src/repositories/touches.ts"));
  const now = new Date("2026-09-12T16:00:00Z");
  const link = [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }];
  const tables = {
    tenants: [{ id: T, timezone: NY }],
    broadcasts: [
      // A follow-up whose playbook was deleted since (its run's playbook_id set null), and a win-back of the same week.
      row("orphan", {
        created_at: "2026-09-05T13:00:00Z",
        scheduled_for: "2026-09-05T14:00:00Z",
        playbook_id: null,
        run_for: "2026-09-05",
        params: link,
      }),
      row("winback", {
        created_at: "2026-09-06T13:00:00Z",
        scheduled_for: "2026-09-06T14:00:00Z",
        params: [{ kind: "first_name" }],
      }),
    ],
    broadcast_recipients: [
      { tenant_id: T, broadcast_id: "orphan", contact_id: "a", state: "sent", sent_at: "2026-09-05T14:00:03Z" },
      { tenant_id: T, broadcast_id: "winback", contact_id: "b", state: "sent", sent_at: "2026-09-06T14:00:03Z" },
    ],
  };
  const touches = await touchesSince(fakeDb(tables), T, new Date("2026-09-01T00:00:00Z"), now);
  const idx = touchIndex(touches);
  assert.deepEqual([...idx.followUps.keys()], ["a"], "the follow-up, whoever sent it; the win-back is none");
  assert.equal(idx.followUps.get("a"), Date.parse("2026-09-05T14:00:03Z"));
  assert.deepEqual([...idx.byAny.keys()].sort(), ["a", "b"], "and both count for the breath");
  assert.equal(idx.byThis.get("p1")?.get("b"), Date.parse("2026-09-06T14:00:03Z"), "the win-back for its own gap");
  // The workspace's zone cannot be read: every waiting run still holds its people, the reading that messages nobody twice.
  const waiting = {
    ...tables,
    broadcasts: [
      row("held", {
        created_at: "2026-09-10T14:00:00Z",
        scheduled_for: "2026-09-10T14:00:00Z",
        state: "pending_approval",
        run_for: "2026-09-10",
      }),
    ],
    broadcast_recipients: [{ tenant_id: T, broadcast_id: "held", contact_id: "c", state: "queued", sent_at: null }],
  };
  const blind = await touchesSince(
    fakeDb(waiting, { "tenants.select": { message: "statement timeout" } }),
    T,
    new Date("2026-09-01T00:00:00Z"),
    now,
  );
  assert.deepEqual(
    blind.map((t) => t.contact_id),
    ["c"],
  );
  const seen = await touchesSince(fakeDb(waiting), T, new Date("2026-09-01T00:00:00Z"), now);
  assert.deepEqual(seen, [], "read, the 10th's run can never be approved on the 12th: it holds nobody");
});
