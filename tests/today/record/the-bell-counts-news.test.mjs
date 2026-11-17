/**
 * The closed bell is for news (decision 0137).
 *
 * A wait was said twice in the frame: the one count on the Inbox's badge, and a note on the bell that raised the bell's
 * number too. On a phone, one batch of cold emails waiting for an approval lit both, beside a card and a line on Today
 * that said it again (17 Nov 2026). So a note about what Need you already counts stays on the bell, wearing its dot, and
 * adds nothing to the closed bell's number or its dot.
 *
 * Judged by what the count holds, never by a note's kind alone: someone who has waited past a week is in no count, so
 * their note still lights the bell, and before Today is read nothing is known to be counted, so every note does.
 *
 * Run on the contracts' rule, and on the bridge's bell over Today's own rows.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { leadQuestionRoute, NOTHING_WAITS_KNOWN, noticeInNeedYou, toTodayVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { metrics, msg, NOW, settingsRead, thread } from "./_world.mjs";

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SEARCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ROUND = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** A bell row as the rule reads it. */
const note = (kind, over = {}) => ({ kind, title: "A note", at: 1_000, to: "today", about: null, ...over });
const aboutThread = (id) => ({ about: { type: "conversation", id }, to: `inbox/th-${id}` });
/** Need you counts Ana's thread and one search waiting for an answer. */
const COUNTED = { threads: new Set([ANA]), searches: new Set([SEARCH]) };
/** The Sent surface holds one run, read after every note here was kept. */
const runsHeld = (state, held = null) => ({
  ...NOTHING_WAITS_KNOWN,
  runs: { readAt: 2_000, held: new Map([[RUN, { state, audience: { kind: "all" }, held }]]) },
});
const said = (row, waits = NOTHING_WAITS_KNOWN) => noticeInNeedYou(row, COUNTED, waits);

test("a person the count holds is the count's: the row the browser derives, the hold the edge kept, a reply counting down, a lead's reply", () => {
  assert.equal(said(note("needs_you", { to: `inbox/th-${ANA}` })), true, "a thread that needs you");
  assert.equal(said(note("held_draft", { to: `inbox/th-${ANA}` })), true, "a reply counting down");
  for (const kind of ["handoff", "deadman", "reply_held", "reach_out_replied"])
    assert.equal(said(note(kind, aboutThread(ANA))), true, kind);
  assert.equal(
    said(note("call", aboutThread(ANA))),
    true,
    "a call whose thread waits on a person is that person's wait",
  );
});

test("a person the count does not hold still lights the bell: past a week they are Older, in no count", () => {
  assert.equal(said(note("needs_you", { to: `inbox/th-${BEN}` })), false);
  assert.equal(said(note("handoff", aboutThread(BEN))), false);
  assert.equal(said(note("deadman", aboutThread(BEN))), false, "REGRESSION: a week's wait lit no mark at all");
});

test("news about the same person is news: a stop, a form, a booking, a call that is about a call", () => {
  for (const kind of ["opted_out", "website_form", "booking", "note_for_you"])
    assert.equal(said(note(kind, aboutThread(ANA))), false, kind);
  assert.equal(said(note("call", { about: { type: "call", id: "k1" }, to: "conversations/phone" })), false);
  assert.equal(said(note("missed_call", { to: `conversations/${ANA}` })), false, "a call that never connected");
  assert.equal(said(note("invite", { to: "admin/team" })), false);
});

test("a search's question is the count's while the count holds that search", () => {
  const about = { type: "lead_round", id: ROUND };
  assert.equal(said(note("leads_question", { about, to: leadQuestionRoute(SEARCH) })), true);
  assert.equal(said(note("leads_question", { about, to: leadQuestionRoute(RUN) })), false, "another search's");
  assert.equal(said(note("leads_ready", { about, to: leadQuestionRoute(SEARCH) })), false, "a search that finished");
});

test("a run that waits for a word is the count's; one decided, one that goes unless stopped, and one nobody read are not", () => {
  const about = { type: "broadcast", id: RUN };
  const waits = note("playbook", { about, title: "Campaign “Win-back” is ready: 12 people" });
  assert.equal(said(waits, runsHeld("pending_approval")), true);
  assert.equal(
    said(note("playbook", { about, title: "Early gyms waits for your approval" }), runsHeld("pending_approval")),
    true,
    "cold email's batch",
  );
  assert.equal(said(waits, runsHeld("sent")), false, "approved and gone: its row reads as read by the other rule");
  assert.equal(said(waits), false, "no surface holds the run: nothing is known to be counted");
  assert.equal(
    said(note("playbook", { about, title: "The check held 3 emails in Early gyms" }), runsHeld("sending", 3)),
    true,
    "emails held for a look are Cold email's row",
  );
  assert.equal(
    said(
      note("playbook", { about, title: "Campaign “Win-back” sends at 9:00 AM unless you stop it" }),
      runsHeld("scheduled"),
    ),
    false,
    "Going today is the day's, which no count holds",
  );
});

test("what no count holds is the bell's: a review to answer is To do's, a booking email the Calendar's", () => {
  assert.equal(said(note("review", { about: { type: "review", id: "r1" }, title: "New on Google" })), false);
  assert.equal(said(note("booking_notice", { about: { type: "booking_notice", id: "b1" } })), false);
  for (const kind of ["number", "billing", "job_failed", "reach_out_day", "ask_cards"])
    assert.equal(said(note(kind)), false, kind);
});

/* ------------------------------------------------------ the bridge's bell ------------------------------------------------------ */

const bridge = await importSrc("apps/dashboard/src/bridge/notifications.ts");
const { setSurfaceValue: landRead } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
landRead("settings", settingsRead());
const was = globalThis.window;
globalThis.window = {
  fetch: async () => new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 }),
  location: { pathname: "/w/marisas", hash: "", origin: "https://app.chanlytics.com", assign() {} },
};
after(() => {
  landRead("today", undefined);
  globalThis.window = was;
});

/** A moment `min` minutes before the real clock, which the bridge reads. */
const live = (min) => new Date(Date.now() - min * 60_000).toISOString();
/** A booking that arrived five minutes ago: news. */
const BOOKING = {
  id: "a",
  kind: "booking",
  title: "New booking · Dani",
  body: "Friday at 10.",
  route: "calendar",
  subject_type: null,
  subject_id: null,
  created_at: live(5),
  read: false,
  dismissed: false,
};
/** The Inbox's thread for a person who needs you, waiting five minutes: the row the browser derives. */
const inboxThread = (id, who) => ({
  id: `th-${id}`,
  real: true,
  needsYou: true,
  who,
  escalatedAtMs: Date.now() - 5 * 60_000,
});
/** A bell over one booking and the threads the Inbox holds, never looked at. */
const bell = (threads) => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const win = {
    addEventListener() {},
    document: { visibilityState: "visible" },
    focus() {},
    location: { hash: "" },
    INBOX_DATA: { THREADS: threads },
    __LIVE: { now: [], recent: [] },
    __NOTIFICATIONS: { dto: { notifications: [BOOKING], seen_at: null, read_through_at: null } },
  };
  return bridge.installNotifications(win, storage, 5);
};
/** Today's read with these people waiting on a person, each since `at`. */
const todayWith = (people) =>
  toTodayVM(
    metrics(),
    people.map(([id, name, at]) =>
      thread(id, name, [msg(`m-${id}`, "Can I talk to someone?", at)], { state: "needs_human" }),
    ),
    people.map(([id, , at]) => ({
      id: `e-${id}`,
      conversation_id: id,
      reason: "human_token",
      details: null,
      state: "open",
      created_at: at,
    })),
    [],
    NOW,
  );
const flags = (api) => api.feed().map((r) => [r.kind, r.unread, r.in_need_you]);

test("before Today is read nothing is known to be counted: a person waiting lights the bell", () => {
  landRead("today", undefined);
  const api = bell([inboxThread(ANA, "Ana Reyes")]);
  assert.equal(api.unread(), 2, "the person and the booking");
  assert.deepEqual(flags(api), [
    ["needs_you", true, false],
    ["booking", true, false],
  ]);
});

test("once Today counts them, a person's note keeps its dot on the bell and leaves the bell's number to the news", () => {
  // Ana asked for a person an hour and forty minutes before the world's clock: Up next, in the count.
  landRead("today", todayWith([[ANA, "Ana Reyes", "2026-09-18T18:19:00Z"]]));
  const api = bell([inboxThread(ANA, "Ana Reyes")]);
  assert.equal(
    api.unread(),
    1,
    "REGRESSION: the Inbox's badge said 1 and the bell said it again, two marks for one person",
  );
  assert.deepEqual(
    flags(api),
    [
      ["needs_you", true, true],
      ["booking", true, false],
    ],
    "the note is listed, unread, and marked as the count's",
  );
});

test("someone who has waited past a week is in no count, so their note still lights the bell", () => {
  // Ben wrote nine days before the world's clock: Older, at Need you's foot, counted nowhere.
  landRead(
    "today",
    todayWith([
      [ANA, "Ana Reyes", "2026-09-18T18:19:00Z"],
      [BEN, "Ben Ortiz", "2026-09-09T18:19:00Z"],
    ]),
  );
  const api = bell([inboxThread(ANA, "Ana Reyes"), inboxThread(BEN, "Ben Ortiz")]);
  assert.equal(api.unread(), 2, "Ben and the booking; Ana is the count's");
  const byWho = Object.fromEntries(api.feed().map((r) => [r.title, r.in_need_you]));
  assert.equal(byWho["Ana Reyes needs you"], true);
  assert.equal(byWho["Ben Ortiz needs you"], false, "REGRESSION: a week's wait lit no mark at all");
});
