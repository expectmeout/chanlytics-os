/**
 * A kept bell row closes when what it announced stops waiting (decision 0048, point 2; the wiring plan's task 5.2, finding NS-3).
 *
 * Kept rows were marks only: "Campaign X is ready: 40 people. Nothing is sent until you do" stayed unread, and counted in the bell's
 * badge and in Today's While you were away, after the owner approved the run; so did "A booking email needs a look" after the email
 * was dismissed, "New on Google" after the review was answered, and "Invitation pending" after the invitation was accepted. The rows
 * say what they are about, and the surfaces the browser holds say whether that subject still waits, so the row is read as read from
 * those, on every device, with no migration and no write.
 *
 * Run on contracts' rule (noticeStillWaits, closeSettledNotices, bellFeed) over fixtures, and on the bridge's bell over the surfaces
 * it reads (whatWaits), with a stand-in for the server's door.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_READ_STATE,
  NOTHING_WAITS_KNOWN,
  bellFeed,
  buildNotificationFeed,
  closeSettledNotices,
  noticeStillWaits,
  serverNotificationRows,
  todayAwayGrouped,
  unreadCount,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const NOW = Date.parse("2026-10-11T18:00:00Z");
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const KEPT_AT = NOW - HOUR;

const RUN = "aaaaaaaa-0000-4000-8000-000000000001";
const RUN2 = "aaaaaaaa-0000-4000-8000-000000000002";
const RUN3 = "aaaaaaaa-0000-4000-8000-000000000003";
const MAIL = "bbbbbbbb-0000-4000-8000-000000000001";
const MAIL2 = "bbbbbbbb-0000-4000-8000-000000000002";
const REVIEW = "cccccccc-0000-4000-8000-000000000001";
const INVITATION = "dddddddd-0000-4000-8000-000000000001";
const INVITATION2 = "dddddddd-0000-4000-8000-000000000002";

let seq = 0;
/** A kept row as the server holds it, with this person's marks: unread, and kept an hour ago. */
const kept = (kind, title, about, over = {}) => ({
  id: `eeeeeeee-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  kind,
  title,
  body: "x",
  route: null,
  subject_type: about?.type ?? null,
  subject_id: about?.id ?? null,
  created_at: iso(KEPT_AT),
  read: false,
  dismissed: false,
  ...over,
});
const ready = (about = { type: "broadcast", id: RUN }, title = "Campaign “Win-back” is ready: 40 people") =>
  kept("playbook", title, about);

/** What the Sent surface holds of its runs, as read after the rows were kept (unless said otherwise). */
const runs = (states, readAt = NOW) => ({ readAt, held: new Map(Object.entries(states)) });
const waitsOf = (over) => ({ ...NOTHING_WAITS_KNOWN, ...over });
const feed = (notices, waits, derived = []) =>
  bellFeed({ derived, device: { ...EMPTY_READ_STATE }, kept: { notifications: notices, seen_at: null }, waits });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

/* ------------------------------------------------------ in contracts ------------------------------------------------------ */

test("a run approved or skipped reads its 'is ready' row as read, in the old word and a reach-out's, and a run still waiting does not", () => {
  const a = ready();
  const b = ready({ type: "broadcast", id: RUN2 }, "Playbook “Win-back” is ready: 40 people");
  const c = ready({ type: "broadcast", id: RUN3 }, "A reach-out waits for you: Spring");
  const rows = byId(
    feed([a, b, c], waitsOf({ runs: runs({ [RUN]: "pending_approval", [RUN2]: "scheduled", [RUN3]: "cancelled" }) })),
  );
  assert.equal(rows[`n:${a.id}`].unread, true, "the run still waits: the row still asks");
  assert.equal(rows[`n:${a.id}`].tone, "warn", "and asks as a decision, not as good news");
  assert.equal(rows[`n:${b.id}`].unread, false, "approved: it is on its way");
  assert.equal(rows[`n:${c.id}`].unread, false, "skipped: it will not go");
  assert.equal(rows[`n:${b.id}`].tone, "", "a settled row wears no warning");
  assert.equal(unreadCount(Object.values(rows)), 1, "the badge counts the one that still waits");
  // Every state a run goes on to is a run that no longer waits on a word.
  for (const state of ["scheduled", "sending", "sent", "failed", "cancelled"])
    assert.equal(
      noticeStillWaits(
        { ...serverNotificationRows({ notifications: [a], seen_at: null })[0] },
        waitsOf({ runs: runs({ [RUN]: state }) }),
      ),
      false,
      state,
    );
});

test("unknown is not settled: a surface not read, a run it does not hold, or a read from before the row was kept close nothing", () => {
  const row = serverNotificationRows({ notifications: [ready()], seen_at: null })[0];
  assert.equal(noticeStillWaits(row, NOTHING_WAITS_KNOWN), null, "no surface read");
  assert.equal(
    noticeStillWaits(row, waitsOf({ runs: runs({ [RUN2]: "sent" }) })),
    null,
    "a run the surface does not hold",
  );
  assert.equal(
    noticeStillWaits(row, waitsOf({ runs: runs({ [RUN]: "sent" }, KEPT_AT - 1) })),
    null,
    "REGRESSION: a surface read before the row was kept had not heard of the run: a new row was read the moment it arrived",
  );
  assert.equal(
    noticeStillWaits(row, waitsOf({ runs: runs({ [RUN]: "sent" }, KEPT_AT) })),
    false,
    "read at the moment it was kept",
  );
});

test("only a row that announces a wait closes: the check's held emails, a run that goes unless stopped, and a run's finish are news", () => {
  const states = waitsOf({ runs: runs({ [RUN]: "sent" }) });
  const news = [
    kept("playbook", "The check held 2 emails in Spring", { type: "broadcast", id: RUN }),
    kept("playbook", "Campaign “Win-back” sends tomorrow 9:00 AM: 3 people", { type: "broadcast", id: RUN }),
    kept("broadcast_sent", "Broadcast “Spring” sent", { type: "broadcast", id: RUN }),
    kept("broadcast_stopped", "Broadcast “Spring” stopped", { type: "broadcast", id: RUN }),
    kept("playbook", "Campaign “Win-back” is ready: 40 people", null),
    kept("playbook", "Campaign “Win-back” is ready: 40 people", { type: "playbook", id: RUN }),
    kept("member_joined", "ada@example.com joined your team", { type: "invitation", id: INVITATION }),
  ];
  for (const n of news) {
    const row = serverNotificationRows({ notifications: [n], seen_at: null })[0];
    assert.equal(noticeStillWaits(row, states), null, `${n.kind}: ${n.title}`);
  }
  assert.equal(unreadCount(feed(news, states)), news.length, "none of them reads as read");
});

test("a booking email dismissed or read again reads its row as read; one still held does not; a list cut short settles nothing", () => {
  const a = kept("booking_notice", "A booking email needs a look", { type: "booking_notice", id: MAIL });
  const b = kept("booking_notice", "A booking email needs a look", { type: "booking_notice", id: MAIL2 });
  const held = (ids, readAt = NOW) => waitsOf({ heldEmails: { readAt, held: new Set(ids) } });
  const rows = byId(feed([a, b], held([MAIL2])));
  assert.equal(rows[`n:${a.id}`].unread, false, "dismissed, it leaves the held list");
  assert.equal(rows[`n:${b.id}`].unread, true, "the other is held still");
  assert.equal(rows[`n:${a.id}`].tone, "", "a settled row wears no warning");
  assert.equal(unreadCount(feed([a, b], held([]))), 0, "none held: both are settled");
  assert.equal(unreadCount(feed([a, b], waitsOf())), 2, "the Calendar not read: nothing is settled");
  assert.equal(unreadCount(feed([a], held([], KEPT_AT - 1))), 1, "read before the email was told of: not judged by it");
});

test("a review answered reads its notice as read; the notice that the receptionist replied is news; a review the read does not hold is unknown", () => {
  const byGoogleId = kept("review", "New on Google: ★★★★★ from Ana", { type: "review", id: "g-ana" });
  const byRow = kept("review", "New on Google: ★★★★★ from Bo", { type: "review", id: REVIEW });
  const replied = kept("review", "Replied to Bo's review", { type: "review", id: REVIEW });
  const many = kept("review", "2 new reviews on Google", null);
  const reviews = (list, readAt = NOW) => waitsOf({ reviews: { readAt, held: list } });
  const open = { id: "11111111-0000-4000-8000-000000000001", reviewId: "g-ana", replied: false };
  const done = { id: REVIEW, reviewId: "g-bo", replied: true };
  let rows = byId(feed([byGoogleId, byRow, replied, many], reviews([open, done])));
  assert.equal(rows[`n:${byGoogleId.id}`].unread, true, "unanswered: it waits for one");
  assert.equal(rows[`n:${byRow.id}`].unread, false, "answered, kept about its row");
  assert.equal(
    rows[`n:${replied.id}`].unread,
    true,
    "REGRESSION: 'Replied to Bo's review' is news and was read the moment the review had a reply",
  );
  assert.equal(rows[`n:${many.id}`].unread, true, "a count of reviews is about none");
  rows = byId(feed([byGoogleId], reviews([{ ...open, replied: true }])));
  assert.equal(rows[`n:${byGoogleId.id}`].unread, false, "answered, kept about Google's own id for the review");
  rows = byId(feed([byGoogleId], reviews([done])));
  assert.equal(rows[`n:${byGoogleId.id}`].unread, true, "a review the read does not hold is unknown, not settled");
});

test("an invitation accepted takes the bell's 'Invitation pending' row with it, whatever the Team read still lists", () => {
  const derived = buildNotificationFeed({
    invites: [
      { id: INVITATION, email: "ada@example.com", created_at: iso(NOW - 24 * HOUR) },
      { id: INVITATION2, email: "bo@example.com", created_at: iso(NOW - 24 * HOUR) },
    ],
    now: NOW,
  });
  assert.deepEqual(derived.map((r) => r.key).sort(), [`invite:${INVITATION}`, `invite:${INVITATION2}`]);
  const joined = kept("member_joined", "ada@example.com joined your team", { type: "invitation", id: INVITATION });
  const rows = feed([joined], NOTHING_WAITS_KNOWN, derived);
  assert.deepEqual(
    rows.map((r) => r.key).sort(),
    [`invite:${INVITATION2}`, `n:${joined.id}`].sort(),
    "Ada's is gone; Bo's still waits; the news that Ada joined is its own row",
  );
  assert.equal(rows.find((r) => r.key === `n:${joined.id}`).unread, true, "and is read when the owner reads it");
});

test("a row that is not kept is never closed here, and a closed row is read once: closing twice changes nothing", () => {
  const derived = buildNotificationFeed({
    threads: [{ id: "th-9", real: true, needsYou: true, who: "Dana", escalatedAtMs: NOW - HOUR }],
    now: NOW,
  });
  const rows = closeSettledNotices(
    derived.map((i) => ({ ...i, unread: true })),
    waitsOf({ runs: runs({ [RUN]: "sent" }) }),
  );
  assert.ok(
    rows.every((r) => r.unread),
    "a derived row leaves the feed when its page does",
  );
  const row = serverNotificationRows({ notifications: [ready()], seen_at: null })[0];
  const waits = waitsOf({ runs: runs({ [RUN]: "sent" }) });
  const once = closeSettledNotices([row], waits);
  assert.deepEqual(closeSettledNotices(once, waits), once);
});

test("a run waiting for a word is a warning, as its topic says: the away card lists it above good news", () => {
  const row = serverNotificationRows({ notifications: [ready()], seen_at: null })[0];
  assert.equal(
    row.tone,
    "warn",
    "REGRESSION: a campaign waiting for a yes wore the tone of good news and sorted below the warnings",
  );
  const news = { ...row, id: "n:news", key: "n:news", kind: "leads_ready", tone: "ok", title: "Your search is done" };
  const { groups } = todayAwayGrouped(
    [
      { ...news, id: "n:a" },
      { ...row, id: "n:b" },
    ],
    [],
    5,
  );
  assert.deepEqual(
    groups.map((g) => g.row.id),
    ["n:b", "n:a"],
  );
});

/* ------------------------------------------------------ the bridge's bell ------------------------------------------------------ */

const bridge = await importSrc("apps/dashboard/src/legacy-bridge/notifications.ts");
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { surfaceMoved } = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
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
  for (const key of ["broadcasts", "calendar", "google"]) setSurfaceValue(key, undefined);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const puts = () =>
  requests.filter((r) => r.method === "PUT" && r.url.includes("/api/v1/notifications")).map((r) => r.body);
const bell = (notices) => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const win = {
    addEventListener() {},
    document: { visibilityState: "visible" },
    focus() {},
    location: { hash: "" },
    INBOX_DATA: { THREADS: [] },
    __LIVE: { now: [], recent: [] },
    __TEAM_INVITES: [],
    __NOTIFICATIONS: { dto: { notifications: notices, seen_at: null } },
  };
  return { api: bridge.installNotifications(win, storage), win };
};
/** The surfaces as the tab holds them, read after the rows were kept. */
const hold = ({ rows, held, reviews } = {}) => {
  const fetchedAt = Date.now() + 1000;
  setSurfaceValue("broadcasts", rows ? { rows, fetchedAt } : undefined);
  setSurfaceValue("calendar", held ? { vm: { feed: { notices: held } }, fetchedAt } : undefined);
  setSurfaceValue("google", reviews ? { dto: { reviews }, fetchedAt } : undefined);
};

test("the bridge reads the surfaces: approving the run drops the badge, and a list of held emails cut at its twenty settles none", () => {
  const a = ready();
  const m = kept("booking_notice", "A booking email needs a look", { type: "booking_notice", id: MAIL });
  // Backdated: the rows were kept before the surfaces below were read.
  const { api } = bell([
    { ...a, created_at: iso(Date.now() - HOUR) },
    { ...m, created_at: iso(Date.now() - HOUR) },
  ]);
  hold();
  assert.equal(api.unread(), 2, "nothing read: nothing settled");
  hold({ rows: [{ id: RUN, state: "pending_approval" }] });
  assert.equal(api.unread(), 2, "the run waits");
  hold({ rows: [{ id: RUN, state: "scheduled" }] });
  assert.equal(api.unread(), 1, "approved: the 'is ready' row is read, and the badge says so");
  assert.equal(api.feed().find((r) => r.id === `n:${a.id}`).unread, false);
  assert.equal(api.feed().find((r) => r.id === `n:${a.id}`).tone, "");
  // Twenty-one held, the card lists twenty: the notice is not among them and is held still, so nothing is settled.
  hold({ held: { held: 21, heldList: Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, noticeId: `y${i}` })) } });
  assert.equal(api.unread(), 2, "a list cut short is not the whole of them");
  // REGRESSION (the wiring's second audit, S6-2): the card lists a held email by its own row, and the bell's row is about the
  // delivery it was read from (the edge's tell keeps that id). Held still, under its row's id: it waits, and is not read.
  hold({ held: { held: 1, heldList: [{ id: "row-of-mail", noticeId: MAIL }] } });
  assert.equal(api.unread(), 2, "held still: the row waits");
  hold({ held: { held: 1, heldList: [{ id: "row-of-mail2", noticeId: MAIL2 }] } });
  assert.equal(api.unread(), 1, "the whole list, and the email is not in it: dismissed");
  // A server from before the list said each email's delivery cannot say this one is gone.
  hold({ held: { held: 1, heldList: [{ id: "row-of-mail2", noticeId: null }] } });
  assert.equal(api.unread(), 2, "a list that does not name the deliveries settles nothing");
  hold({ rows: [{ id: RUN, state: "scheduled" }], held: { held: 0, heldList: [] } });
  assert.equal(api.unread(), 0);
  hold();
});

test("the bell is drawn again when a surface it judges by moves, without a new row", () => {
  const { api } = bell([ready()]);
  let drawn = 0;
  const off = api.onChange(() => (drawn += 1));
  surfaceMoved("broadcasts");
  surfaceMoved("calendar");
  surfaceMoved("google");
  surfaceMoved("people");
  assert.equal(drawn, 3, "Sent, the Calendar and Google; not a surface the rows do not depend on");
  off();
});

test("readWhere reads the kept rows that match on the server and leaves the rest: an answered review's notices", async () => {
  requests.length = 0;
  const a = kept("review", "New on Google: ★★★★★ from Ana", { type: "review", id: "g-ana" });
  const b = kept("review", "Replied to Ana's review", { type: "review", id: REVIEW });
  const c = kept("review", "New on Google: ★★★★★ from Bo", { type: "review", id: "g-bo" });
  const d = kept("handoff", "Dana needs a person", { type: "conversation", id: "c1" });
  const done = kept("review", "New on Google: ★★★★★ from Old", { type: "review", id: "g-ana" }, { read: true });
  const { api } = bell([a, b, c, d, done]);
  api.readWhere(
    (n) =>
      n.kind === "review" && n.about && n.about.type === "review" && (n.about.id === "g-ana" || n.about.id === REVIEW),
  );
  await settle();
  assert.deepEqual(
    puts().sort((x, y) => x.id.localeCompare(y.id)),
    [
      { id: a.id, read: true },
      { id: b.id, read: true },
    ].sort((x, y) => x.id.localeCompare(y.id)),
    "the two unread notices of that review, by either id; not the other review's, not another kind's, not one already read",
  );
});
