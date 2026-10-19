/**
 * The bell says a hold once, and its read mark is the server's (decision 0048; OW5 of the wiring plan, task 5.1).
 *
 * A customer who needs a person is two rows when the bell is made: the row the browser derives from the Inbox's threads, and
 * the notice the edge kept when it handed the customer over. dedupeFeed already hid the kept one while the derived one stands,
 * because they said the same thing twice in two voices. Their marks lived apart: the derived row's read mark was this
 * device's, so an owner who read it on the laptop saw it unread on the phone, and the two badges differed until the thread was
 * answered. Where the edge has kept the hold the row is one and its marks are the server's; where it has not, they are this
 * device's, as they were.
 *
 * Run on the contracts' bellFeed over the two kinds of row, and on the bridge's bell with a stand-in for the server's door.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_READ_STATE, bellFeed, buildNotificationFeed, holdMarksOf, unreadCount } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const NOW = Date.parse("2026-09-18T20:00:00Z");
const ago = (min) => NOW - min * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const K1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const K2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

/** The Inbox thread the bell derives a row from: Dana needs a person, and has since 30 minutes ago. */
const thread = (id, who, over = {}) => ({
  id: `th-${id}`,
  real: true,
  needsYou: true,
  who,
  ask: { kind: "wrote", label: "They wrote", text: "Can someone call me?", quoted: true },
  escalatedAtMs: ago(30),
  ...over,
});
/** The notice the edge kept for a hold, with this person's marks on it. */
const notice = (id, conversation, over = {}) => ({
  id,
  kind: "handoff",
  title: "Dana needs a person — nobody picked this up",
  body: "They wrote: “Can someone call me?”",
  route: `inbox/th-${conversation}`,
  subject_type: "conversation",
  subject_id: conversation,
  created_at: iso(ago(29)),
  read: false,
  dismissed: false,
  ...over,
});
const derivedOf = (threads) => buildNotificationFeed({ threads, now: NOW });
const feed = ({ threads = [thread(C1, "Dana")], notices = [], seenAt = null, device = {} } = {}) =>
  bellFeed({
    derived: derivedOf(threads),
    device: { ...EMPTY_READ_STATE, ...device },
    kept: { notifications: notices, seen_at: seenAt },
  });
const keys = (rows) => rows.map((r) => r.key);

/* ------------------------------------------------------ in contracts ------------------------------------------------------ */

test("one row for one hold: the derived row stands, and the kept notice of the same conversation is not drawn beside it", () => {
  const rows = feed({ notices: [notice(K1, C1)] });
  assert.deepEqual(keys(rows), [`needs:th-${C1}`], "the row the thread's words and door are as live as");
  assert.equal(rows[0].kind, "needs_you");
  assert.equal(unreadCount(rows), 1);
  // Another conversation's notice is another thing, and a kept row about nothing the browser derives is the record.
  const others = feed({ notices: [notice(K1, C1), notice(K2, C2)] });
  assert.deepEqual(keys(others), [`needs:th-${C1}`, `n:${K2}`]);
});

test("where the edge has kept the hold, the row's read mark is the server's: read there, read on every device; a device's own mark does not hide it", () => {
  const unread = feed({ notices: [notice(K1, C1)] });
  assert.equal(unread[0].unread, true);
  // Read on another device: the server's mark is on the notice, and this device has marked nothing.
  const readElsewhere = feed({ notices: [notice(K1, C1, { read: true })] });
  assert.equal(readElsewhere[0].unread, false, "REGRESSION: read on the laptop, still unread on the phone");
  assert.equal(unreadCount(readElsewhere), 0, "and the badge is the same number on both");
  // This device's own mark of the derived key (made before the hold was kept, or by an older build) does not decide it.
  const stale = feed({ notices: [notice(K1, C1)], device: { read: [`needs:th-${C1}`] } });
  assert.equal(stale[0].unread, true, "the server has it unread, so every device does");
});

test("a Mark all read that has not been re-read counts at once, and one before the hold was kept does not hide it", () => {
  const kept = notice(K1, C1);
  const keptAt = Date.parse(kept.created_at);
  // This device's seen moment is later than the notice: nothing is new to it, before the server's copy is back.
  assert.equal(feed({ notices: [kept], device: { seenAt: keptAt + 1000 } })[0].unread, false);
  // The server's seen moment, the same on every device.
  assert.equal(feed({ notices: [kept], seenAt: iso(keptAt + 1000) })[0].unread, false);
  // A moment before the notice was kept hides nothing.
  assert.equal(
    feed({ notices: [kept], seenAt: iso(keptAt - 1000), device: { seenAt: keptAt - 5000 } })[0].unread,
    true,
  );
});

test("dismissed on the server, by any device, the hold is not on this bell: neither the derived row nor the notice", () => {
  const gone = feed({ notices: [notice(K1, C1, { dismissed: true })] });
  assert.deepEqual(
    keys(gone),
    [],
    "REGRESSION: the derived row came back unread on the other device, as if never dealt with",
  );
  // A hold of another conversation is untouched.
  const two = feed({
    threads: [thread(C1, "Dana"), thread(C2, "Rosa")],
    notices: [notice(K1, C1, { dismissed: true }), notice(K2, C2)],
  });
  assert.deepEqual(keys(two), [`needs:th-${C2}`]);
});

test("where no notice is kept yet, the derived row keeps this device's marks, as it did", () => {
  const key = `needs:th-${C1}`;
  assert.equal(feed()[0].unread, true);
  assert.equal(feed({ device: { read: [key] } })[0].unread, false, "read here");
  assert.deepEqual(keys(feed({ device: { dismissed: [key] } })), [], "dismissed here");
  assert.equal(feed({ device: { seenAt: NOW } })[0].unread, false, "everything seen");
});

test("two devices read the same notice and agree, whatever each remembers of its own", () => {
  const dto = [notice(K1, C1, { read: true })];
  const laptop = feed({ notices: dto, device: { read: [`needs:th-${C1}`] } });
  const phone = feed({ notices: dto, device: EMPTY_READ_STATE });
  assert.deepEqual(
    [unreadCount(laptop), unreadCount(phone)],
    [0, 0],
    "the badge is one number, from the server's mark",
  );
  const unreadDto = [notice(K1, C1)];
  assert.deepEqual(
    [
      unreadCount(feed({ notices: unreadDto, device: { read: [`needs:th-${C1}`] } })),
      unreadCount(feed({ notices: unreadDto })),
    ],
    [1, 1],
    "and it stays unread on both until it is read on one: a mark kept on one device decided nothing",
  );
});

test("once the thread is answered the derived row is gone and the notice stays as the record, with its server marks", () => {
  const answered = feed({ threads: [], notices: [notice(K1, C1, { read: true })] });
  assert.deepEqual(keys(answered), [`n:${K1}`]);
  assert.equal(answered[0].unread, false);
  assert.equal(feed({ threads: [], notices: [notice(K1, C1)] })[0].unread, true);
});

test("only a hold's notices carry the derived row's marks: a reply from a lead about the same thread stays under it, unmarked", () => {
  const reply = notice(K2, C1, { kind: "reach_out_replied", title: "A business wrote back" });
  const rows = feed({ notices: [notice(K1, C1, { read: true }), reply] });
  assert.deepEqual(keys(rows), [`needs:th-${C1}`], "hidden while the thread waits, as dedupeFeed always hid it");
  assert.equal(rows[0].unread, false, "the hold's own notice decides");
  assert.deepEqual(
    holdMarksOf(`needs:th-${C1}`, { notifications: [notice(K1, C1), reply], seen_at: null }).map((n) => n.id),
    [K1],
  );
  assert.deepEqual(
    holdMarksOf(`draft:m-1`, { notifications: [notice(K1, C1)], seen_at: null }),
    [],
    "a held draft has none",
  );
  assert.deepEqual(holdMarksOf(`call:k1`, { notifications: [notice(K1, C1)], seen_at: null }), [], "nor a missed call");
  assert.deepEqual(holdMarksOf(`needs:th-${C1}`, null), [], "nor before the bell's rows are read");
});

test("a notice the server closed belongs to a hold that ended: a new hold on the thread is not read by its marks (00421)", () => {
  const ended = notice(K1, C1, { read: true, closed_at: iso(ago(10)) });
  assert.deepEqual(holdMarksOf(`needs:th-${C1}`, { notifications: [ended], seen_at: null }), []);
  const rows = feed({ notices: [ended] });
  const needs = rows.find((r) => r.key === `needs:th-${C1}`);
  assert.ok(needs, "the thread waits again: its derived row stands");
  assert.equal(
    needs.unread,
    true,
    "REGRESSION: the ended hold's read mark read the new hold as read before its own notice was kept",
  );
  assert.equal(rows.find((r) => r.key === `n:${K1}`)?.unread ?? false, false, "and the closed notice asks nobody");
  for (const kind of ["handoff", "deadman", "call"])
    assert.deepEqual(
      holdMarksOf(`needs:th-${C1}`, { notifications: [notice(K1, C1, { kind })], seen_at: null }).map((n) => n.kind),
      [kind],
      `a ${kind} notice is a hold's (contracts kindsEndedBy("hold"))`,
    );
});

test("a derived row that is not a hold's keeps this device's marks whatever the server holds", () => {
  const draft = {
    id: `th-${C1}`,
    real: true,
    needsYou: false,
    who: "Dana",
    veto: { window: 600, endsAtMs: NOW + 5 * 60_000, messageId: "m-d1", draft: "Friday works." },
  };
  const rows = bellFeed({
    derived: derivedOf([draft]),
    device: { ...EMPTY_READ_STATE, read: ["draft:m-d1"] },
    kept: { notifications: [notice(K1, C1)], seen_at: null },
  });
  assert.equal(rows.find((r) => r.key === "draft:m-d1").unread, false, "read here, and it is nothing the server keeps");
});

/* ------------------------------------------------------ the bridge's bell ------------------------------------------------------ */

const bridge = await importSrc("apps/dashboard/src/legacy-bridge/notifications.ts");
const requests = [];
const was = globalThis.window;
globalThis.window = {
  // The server's door, standing in: the request is what is read, and its refusal keeps the write from refreshing a surface.
  fetch: async (url, init) => {
    requests.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "stand-in" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  },
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {} },
};
after(() => {
  globalThis.window = was;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const puts = () =>
  requests.filter((r) => r.method === "PUT" && r.url.includes("/api/v1/notifications")).map((r) => r.body);
/** A bell on a device of its own: its storage, its window, the Inbox's threads and the rows the workspace keeps. */
const bell = (notices, threads = [thread(C1, "Dana")]) => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const win = {
    addEventListener() {},
    document: { visibilityState: "visible" },
    focus() {},
    location: { hash: "" },
    INBOX_DATA: { THREADS: threads },
    __LIVE: { now: [], recent: [] },
    __TEAM_INVITES: [],
    __NOTIFICATIONS: { dto: { notifications: notices, seen_at: null } },
  };
  return { api: bridge.installNotifications(win, storage), win, store };
};

test("the bell draws a hold once, and reading it writes to the server's notice, not to this device", async () => {
  requests.length = 0;
  const { api, store } = bell([notice(K1, C1)]);
  assert.deepEqual(
    api.feed().map((r) => r.id),
    [`needs:th-${C1}`],
  );
  assert.equal(api.unread(), 1);
  api.read(`needs:th-${C1}`);
  await settle();
  assert.deepEqual(puts(), [{ id: K1, read: true }], "the notice's mark is written, as a kept row's is");
  assert.equal(store.size, 0, "and nothing is marked on this device");
});

test("dismissing and restoring a hold write the notice's dismissal; a hold the edge has not kept yet is marked on this device", async () => {
  requests.length = 0;
  const kept = bell([notice(K1, C1)]);
  kept.api.dismiss(`needs:th-${C1}`);
  kept.api.restore(`needs:th-${C1}`);
  await settle();
  assert.deepEqual(puts(), [
    { id: K1, dismissed: true },
    { id: K1, dismissed: false },
  ]);
  requests.length = 0;
  const unkept = bell([]);
  unkept.api.read(`needs:th-${C1}`);
  await settle();
  assert.deepEqual(puts(), [], "nothing for the server to hold yet");
  assert.deepEqual(JSON.parse([...unkept.store.values()][0]).read, [`needs:th-${C1}`], "this device keeps the mark");
  assert.equal(unkept.api.unread(), 0);
});

test("every notice of a hold is marked together: a handoff and the deadman's second alert are one row", async () => {
  requests.length = 0;
  const { api } = bell([
    notice(K1, C1),
    notice(K2, C1, { kind: "deadman", title: "A customer wrote and nothing answered" }),
  ]);
  assert.equal(api.feed().length, 1, "one row for the one hold");
  api.read(`needs:th-${C1}`);
  await settle();
  assert.deepEqual(
    puts().map((b) => b.id),
    [K1, K2],
  );
});

test("two bells on one server agree: once the notice reads as read, neither draws the hold as new", () => {
  const notices = [notice(K1, C1, { read: true })];
  const laptop = bell(notices);
  const phone = bell(notices);
  assert.deepEqual([laptop.api.unread(), phone.api.unread()], [0, 0]);
  assert.deepEqual([laptop.api.feed()[0].unread, phone.api.feed()[0].unread], [false, false]);
});
