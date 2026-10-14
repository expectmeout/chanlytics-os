/**
 * The person who writes reaches the pages that show them (docs/decisions/0047, task 1.2 of the wiring plan; N1), and a read of the
 * Calendar no longer makes people for any page to hear (F3b, retired by task 6.3).
 *
 * F3b (retired by decision 0047, lane 6, task 6.3): the Calendar board used to make up to forty people from the owner's calendar every
 * time an owner or operator opened it, said how many it made (`people_added`), and the Calendar surface read People again when it was more
 * than none. A read of the board adds nobody now, so the count is gone and the surface reads nothing of People: an older server that still
 * says it changes nothing, whichever deploys first. The people the sweep adds reach People through the bell row (notice-re-reads.ts).
 *
 * N1: an open person's page did not hear that person writing. People re-reads a message only while its own list is on screen (#1347,
 * which removed the cost of every page of People read for each message), and a person's page is another route. The page hears the
 * Inbox and Conversations, which every message re-reads, and reads its one person again when either holds something of theirs newer
 * than the page: never People's list. A take-over, a hand-back, a snooze and its wake move no message clock (the wiring's second
 * audit, W-thread-wait-step-1): the page reads them again when a thread of theirs the Inbox held stands otherwise. (The page itself
 * is drawn in people/person-honest.test.mjs; what else it hears, its own surface, in hearing/a-person-s-page-hears-its-person.test.mjs.)
 *
 * Run on the real Calendar surface and the real runner for the retired F3b, and on the real surface values for N1.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/calendar" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
/** The window as an event target: what the page hears is what is dispatched. */
const bus = new EventTarget();
globalThis.window.addEventListener = (...a) => bus.addEventListener(...a);
globalThis.window.removeEventListener = (...a) => bus.removeEventListener(...a);
globalThis.window.dispatchEvent = (e) => bus.dispatchEvent(e);
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The calendar the route answers: a board of no days, and how many people the read made (said only by an old server, which the surface now ignores). */
const BOARD = {
  timezone: "America/New_York",
  from: "2026-09-07",
  to: "2026-09-13",
  feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
  hours: null,
  closures: [],
  rules: null,
  services: [],
  booking_link: null,
  next_opening: null,
  days: [],
};
let made;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  if (u.pathname === "/api/v1/calendar")
    return json(200, { ok: true, data: { calendar: BOARD, ...(made === undefined ? {} : { people_added: made }) } });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { calendarOverride, warmCalendar } = await importSrc("apps/dashboard/src/surfaces/calendar/surface.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { hearTheirThread } = await importSrc("apps/dashboard/src/surfaces/people/person/their-thread.ts");
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    for (let j = 0; j < 20; j += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

test("a calendar read reads nothing of People, whatever an older server says it made", async (t) => {
  const stop = startSurfaces([{ key: "nothing-in-particular", apply: async () => {} }], () => () => {});
  try {
    await flush();
    const read = [];
    t.mock.method(peopleOverride, "apply", async () => void read.push("people"));
    for (const said of [3, 0, undefined]) {
      made = said;
      await calendarOverride.apply();
      await flush();
    }
    assert.deepEqual(
      read,
      [],
      "a count in the answer is not heard: the board's read adds nobody, and People has nothing to catch up on",
    );
  } finally {
    stop();
  }
});

test("a window the board reads ahead of need reads nothing of People either", async (t) => {
  const stop = startSurfaces([{ key: "nothing-in-particular", apply: async () => {} }], () => () => {});
  try {
    await flush();
    const read = [];
    t.mock.method(peopleOverride, "apply", async () => void read.push("people"));
    made = 2;
    await warmCalendar({ from: "2026-11-02", days: 63 });
    await flush();
    assert.deepEqual(read, []);
  } finally {
    stop();
  }
});

/* --------------------------------------- an open person's page --------------------------------------- */

const PERSON = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
const OTHER = "0b9a7e33-1d0c-4d74-93a4-0d0f3a2f9a11";
const tell = (type) => globalThis.window.dispatchEvent(new CustomEvent(type));
const inbox = (...threads) => setSurfaceValue("inbox", { THREADS: threads });
const conversations = (...rows) => setSurfaceValue("conversations", { CONVERSATIONS: rows });

test("the page is told when the Inbox or Conversations holds something of theirs newer than it, once for each newer moment, and never for another person", () => {
  const told = [];
  let known = 1_000;
  const stop = hearTheirThread(
    PERSON,
    () => known,
    (newest) => {
      told.push(newest);
      known = newest;
    },
  );
  try {
    tell("surface:inbox");
    assert.deepEqual(told, [], "nothing is held: nothing newer");
    inbox({ clientId: OTHER, lastAtMs: 5_000 }, { clientId: null, lastAtMs: 6_000 });
    conversations({ clientId: OTHER, ts: 7_000 });
    tell("surface:inbox");
    tell("surface:conversations");
    assert.deepEqual(told, [], "someone else wrote, and a thread of nobody's is no one's");
    inbox({ clientId: PERSON, lastAtMs: 1_000 });
    tell("surface:inbox");
    assert.deepEqual(told, [], "nothing newer than the page holds");
    inbox({ clientId: PERSON, lastAtMs: 3_000 });
    tell("surface:inbox");
    assert.deepEqual(told, [3_000], "they wrote");
    tell("surface:inbox");
    tell("surface:conversations");
    assert.deepEqual(told, [3_000], "the same moment, said again by another read, is not news");
    conversations({ clientId: PERSON, ts: 4_000 });
    tell("surface:conversations");
    assert.deepEqual(told, [3_000, 4_000], "and they phoned");
  } finally {
    stop();
  }
  inbox({ clientId: PERSON, lastAtMs: 9_000 });
  tell("surface:inbox");
  assert.deepEqual(told, [3_000, 4_000], "a page that has gone hears nothing");
  inbox();
  conversations();
});

test("the page is told when a thread of theirs the Inbox holds changes hands: taken, handed back, snoozed, woken, a reply held; never for a thread first held, nor another's", () => {
  const told = [];
  /** One of their threads as the Inbox's row says it: open, nobody has it, nothing waits. */
  const row = (over = {}) => ({
    id: "th-1",
    clientId: PERSON,
    lastAtMs: 2_000,
    state: "done",
    needsYou: false,
    takenOver: false,
    claimedByOther: false,
    assigneeUserId: null,
    holdAct: null,
    heldDraft: null,
    ...over,
  });
  inbox();
  const stop = hearTheirThread(
    PERSON,
    () => 5_000,
    (newest) => told.push(newest),
  );
  try {
    inbox(row());
    tell("surface:inbox");
    assert.deepEqual(told, [], "the Inbox's first read of a thread of theirs is no news: the page read them itself");
    inbox(row({ id: "th-2", clientId: OTHER, takenOver: true }), row());
    tell("surface:inbox");
    assert.deepEqual(told, [], "another person's thread taken is not theirs");
    const steps = [
      ["a hold opened, no message: it waits on you", { state: "escalated", needsYou: true, holdAct: "reply" }],
      ["taken by you", { state: "escalated", needsYou: false, takenOver: true, assigneeUserId: "u-1" }],
      ["taken by a teammate", { state: "escalated", takenOver: true, claimedByOther: true, assigneeUserId: "u-2" }],
      ["handed back", { state: "done" }],
      ["snoozed", { state: "snoozed", wake: "Tomorrow 9:00" }],
      ["woken", { state: "escalated", needsYou: true, holdAct: "call_back" }],
      ["a reply held to send", { heldDraft: { messageId: "m-9", body: "On my way", sendsAtMs: 9_000 } }],
    ];
    let n = 0;
    for (const [what, over] of steps) {
      inbox(row(over));
      tell("surface:inbox");
      n += 1;
      assert.equal(told.length, n, `${what}: the page reads them again`);
      tell("surface:inbox");
      tell("surface:conversations");
      assert.equal(told.length, n, `${what}: and once, however often the Inbox is read again`);
    }
    inbox();
    tell("surface:inbox");
    assert.equal(
      told.length,
      n + 1,
      "a thread of theirs gone from the Inbox (archived, combined away) is read for too",
    );
  } finally {
    stop();
  }
  const heard = told.length;
  inbox(row({ takenOver: true }));
  tell("surface:inbox");
  assert.equal(told.length, heard, "a page that has gone hears nothing");
  inbox();
});

after(() => {
  setSurfaceValue("inbox", undefined);
  setSurfaceValue("conversations", undefined);
});
