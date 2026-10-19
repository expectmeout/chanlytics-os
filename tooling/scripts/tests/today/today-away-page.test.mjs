/**
 * "While you were away", EXECUTED: the head is the bell's badge, the foot
 * accounts for every unread row not on screen, and the empty line never
 * congratulates over unread work.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SERVER_NOTIFICATION_KINDS,
  bellSections,
  todayAwayGrouped,
  unreadCount,
  leadQuestionRoute,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, all, byTestId, textOf } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
globalThis.appNavigate = () => {};
// The pages are the TSX surface's (apps/dashboard/src/surfaces/today/pages, decision 0015), drawn as elements of the stub React.
const { TodayAway } = await import("../../../../apps/dashboard/src/surfaces/today/pages/away.tsx");
const { TodayPins } = await import("../../../../apps/dashboard/src/surfaces/today/pages/pins.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { Icon } = await import("../../../../apps/dashboard/src/surfaces/kit/icon/icon.tsx");

const queued = (cv, who) => ({
  id: `needs:th-${cv}`,
  key: `needs:th-${cv}`,
  kind: "needs_you",
  title: `${who} needs you`,
  message: "",
  tone: "warn",
  icon: "alert",
  unread: true,
  about: null,
  time: "2m",
  actions: [{ label: "Open", to: "inbox", primary: true }],
});
const news = (id, title) => ({
  id,
  kind: "review",
  title,
  message: "",
  tone: "ok",
  icon: "star",
  unread: true,
  about: null,
  time: "1h",
  actions: [{ label: "Open", to: "reports", primary: true }],
});

const draw = (rows, cvs, queue = null) => {
  fresh();
  globalThis.__notifs = {
    feed: () => rows,
    onChange: () => () => {},
    read() {},
    dismiss() {},
    seenAll() {},
    older: () => 0,
  };
  // The day, through the seam the page reads it from (surface-values.ts), not off `window.TODAY_DATA`.
  setSurfaceValue("today", {
    queue: { rows: queue ?? cvs.map((id) => ({ kind: "handoff", conversationId: id, callId: null })) },
  });
  return globalThis.React.createElement(TodayAway, {});
};
const byClass = (tree, cls) => find(tree, (n) => String(n.props?.className || "").includes(cls));

test("the head is the bell's badge and the foot accounts for the rest", () => {
  const rows = [queued("cv-1", "Zoe Martin"), queued("cv-2", "Daniela Reyes"), news("n:3", "1 new rating on Google")];
  const tree = draw(rows, ["cv-1", "cv-2"]);
  const head = byClass(tree, "tq-count");
  assert.equal(textOf(head).trim(), String(unreadCount(rows)), "the card's head and the bell's badge are one number");
  assert.equal(textOf(head).trim(), "3");
  assert.equal(textOf(byClass(tree, "tq-foot")).trim(), "2 more in the bell, already in the queue above");
});

test('REGRESSION: empty because the queue above has everything -- no green check, no "All caught up."', () => {
  const rows = ["cv-1", "cv-2", "cv-3", "cv-4"].map((cv, i) => queued(cv, `Person ${i}`));
  const tree = draw(rows, ["cv-1", "cv-2", "cv-3", "cv-4"]);
  const line = byTestId(tree, "today-away-empty");
  assert.ok(line, "the card still says something rather than nothing");
  assert.ok(
    !textOf(line).includes("All caught up"),
    "REGRESSION: four unread rows and the card congratulated the owner",
  );
  assert.ok(textOf(line).includes("Everything new is already in the queue above."));
  const icon = find(line, (n) => n.type === Icon);
  assert.equal(icon.props.name, "arrow-up", "no check mark over unread work");
  assert.equal(textOf(byClass(tree, "tq-count")).trim(), "4", "the head does not read 0 while the bell reads 4");
  assert.equal(byClass(tree, "tq-foot"), null, "the head has said 4 once; the line says where they are");
});

test('nothing unread anywhere is the one state that may say "All caught up."', () => {
  const tree = draw([{ ...news("n:1", "old"), unread: false }], []);
  const line = byTestId(tree, "today-away-empty");
  assert.ok(textOf(line).includes("All caught up."));
  assert.equal(find(line, (n) => n.type === Icon).props.name, "check");
  assert.equal(textOf(byClass(tree, "tq-count")).trim(), "0");
});

// A search that stops to ask waits a day and then ends, so it is news worth a line of its own, and two of them are
// one line that says how many.
test("two searches waiting on their answers are one line that says how many", () => {
  const asks = (id, name) => ({
    id,
    kind: "leads_question",
    title: `Your search for ${name} is waiting for your answer`,
    message: "",
    tone: "warn",
    icon: "alert",
    unread: true,
    about: null,
    time: "5m",
    actions: [{ label: "Answer it", to: `clients/leads:s-${id}:c-excluded`, primary: true }],
  });
  const vm = todayAwayGrouped([asks("n:1", "florists"), asks("n:2", "bakers")]);
  assert.deepEqual(
    vm.groups.map((g) => [g.count, g.title]),
    [[2, "2 searches are waiting for your answer"]],
  );
});

// The nightly's seed found it (e2e/today/today.spec.ts, expectNoQueueRepeat): a search waiting on its answer is a row of
// Your queue, and the bell's question row about the same search was drawn again under While you were away.
test("a search waiting in the queue is not said again by the bell's question row about it", () => {
  const S = "5eed0000-0000-4000-8000-000000000001";
  const question = {
    id: "n:q",
    kind: "leads_question",
    title: "Your search for Pilates studios · Denver is waiting for your answer",
    message: "",
    tone: "warn",
    icon: "alert",
    unread: true,
    about: null,
    time: "3h",
    actions: [{ label: "Answer it", to: leadQuestionRoute(S), primary: true }],
  };
  const other = { ...question, id: "n:o", title: "Your search for florists is waiting for your answer" };
  other.actions = [
    { label: "Answer it", to: leadQuestionRoute("5eed0000-0000-4000-8000-000000000002"), primary: true },
  ];
  const searchRow = {
    kind: "search",
    conversationId: null,
    callId: null,
    cta: { label: "Answer", to: leadQuestionRoute(S) },
  };
  const tree = draw([question, other, news("n:3", "1 new rating on Google")], [], [searchRow]);
  const titles = all(tree, (n) => n.props?.["data-testid"] === "today-away-row").map((r) =>
    textOf(byClass(r, "ta-title")).trim(),
  );
  assert.deepEqual(titles, [other.title, "1 new rating on Google"], "the queued search is said once, up in the queue");
  assert.equal(textOf(byClass(tree, "tq-count")).trim(), "3", "the head is still the bell's badge");
  assert.equal(textOf(byClass(tree, "tq-foot")).trim(), "1 more in the bell, already in the queue above");
});

// Decision 0009: any list is a door on Today, pinned by the member (memberships.views.today.pins).
test("the lists a member pinned are one row of doors on Today, with People's counts; a list that isn't here is left out", async () => {
  const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  const people = {
    lists: [{ id: "quiet", label: "Quiet 30+ days", count: 4 }],
    saved: [
      { id: S2, name: "VIPs", count: 12, unknown: null },
      { id: "cccccccc-3333-4333-8333-cccccccccccc", name: "Booked soon", count: 0, unknown: "No calendar is read." },
    ],
    views: {
      today: {
        pins: [
          "seg:quiet",
          `list:${S2}`,
          "list:cccccccc-3333-4333-8333-cccccccccccc",
          "seg:gone",
          "list:dddddddd-4444-4444-8444-dddddddddddd",
        ],
      },
    },
  };
  const went = [];
  const kept = globalThis.appNavigate;
  globalThis.appNavigate = (to) => went.push(to);
  try {
    fresh();
    globalThis.__PEOPLE = people;
    setSurfaceValue("people", people);
    // People's own verb (people-lists.ts), over the surface as People publishes it.
    globalThis.__lists = (await import("../../../../apps/dashboard/src/surfaces/people/people-lists.ts")).lists;
    const tree = globalThis.React.createElement(TodayPins, {});
    const row = byTestId(tree, "today-pins");
    // The row holds ready-made lists as well as the member's own (decision 0009: any list pins), so it is not headed Your lists.
    assert.equal(row.props["aria-label"], "Pinned lists");
    const pins = [];
    (function walk(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.props?.["data-testid"] === "today-pin") pins.push(n);
      walk(n.props?.children);
    })(row);
    assert.deepEqual(
      pins.map((p) => textOf(p)),
      ["Quiet 30+ days4", "VIPs12", "Booked soon"],
      "a count where People has one; none where it can't be counted; a list that isn't here, left out",
    );
    // A list's name is the chip with its button inside, its count the tally.
    assert.ok(find(pins[0], (n) => String(n.props?.className || "").includes("tally")));
    find(pins[1], (n) => n.type === "button").props.onClick();
    assert.deepEqual(went, [`clients/list:${S2}`]);
    // Nothing pinned: no row at all.
    fresh();
    globalThis.__PEOPLE = { ...people, views: {} };
    setSurfaceValue("people", globalThis.__PEOPLE);
    assert.equal(byTestId(globalThis.React.createElement(TodayPins, {}), "today-pins"), null);
  } finally {
    globalThis.appNavigate = kept;
    delete globalThis.__PEOPLE;
    setSurfaceValue("people", undefined);
    delete globalThis.__lists;
  }
});

test("a group of rows about ONE thread says one conversation, however many alerts it raised (the 2 Oct 2026 audit, C8)", () => {
  const handoff = (i, id) => ({
    id: `n:${i}`,
    kind: "handoff",
    unread: true,
    title: "Reply delivery failed: Robin",
    message: "x",
    tone: "warn",
    icon: "alert",
    about: { type: "conversation", id },
  });
  const sixteen = todayAwayGrouped(Array.from({ length: 16 }, (_, i) => handoff(i, "c1")));
  assert.equal(sixteen.groups[0].title, "1 conversation needs you", "REGRESSION: it said 16 conversations");
  assert.equal(sixteen.groups[0].count, 16, "the group still stands for every row, so Mark read reaches all");
  assert.equal(sixteen.groups[0].ids.length, 16);
  const three = todayAwayGrouped([handoff(1, "c1"), handoff(2, "c2"), handoff(3, "c3")]);
  assert.equal(three.groups[0].title, "3 conversations need you");
  const mixed = todayAwayGrouped([handoff(1, "c1"), handoff(2, "c1"), handoff(3, "c2")]);
  assert.equal(mixed.groups[0].title, "2 conversations need you", "three rows, two threads");
  // A row that says nothing of what it is about stands for itself: two of them are two.
  const bare = (i) => ({ ...handoff(i, "x"), about: null });
  assert.equal(todayAwayGrouped([bare(1), bare(2)]).groups[0].title, "2 conversations need you");
});

// A group stands for several rows, and pressed it used to open the newest row's door and mark every row read: for the kinds
// whose rows point at different records (a handoff, a failed job, a campaign ready, a search waiting, a reply to a
// reach-out) the other records were never opened and no longer counted as unread (wiring/records-not-pages, N3).
const row = (i, kind, to, about = null) => ({
  id: `n:${i}`,
  kind,
  unread: true,
  title: `${kind} ${i}`,
  message: "x",
  tone: "warn",
  icon: "alert",
  about,
  time: "1m",
  actions: [{ label: "Open it", to, primary: true }],
});
const T1 = "inbox/th-11111111-1111-4111-8111-111111111111";
const T2 = "inbox/th-22222222-2222-4222-8222-222222222222";

// Each kind that groups (todayAwayGrouped's nouns) and the list that holds its rows: where a group of different records opens.
const LIST_DOORS = {
  call: "conversations/phone",
  job_failed: "inbox",
  review: "reports/reviews",
  calendar_people: "clients",
  booking_notice: "admin/workspace",
  handoff: "inbox",
  playbook: "campaigns/sequences",
  template_ready: "campaigns/messages",
  template_blocked: "campaigns/messages",
  broadcast_sent: "campaigns/sequences",
  broadcast_stopped: "campaigns/sequences",
  note_for_you: "clients",
  leads_question: "clients/leads",
  leads_ready: "clients/leads",
  reach_out_replied: "inbox",
  // Decision 0048: a customer's no is news on the bell, a booking that arrived and a teammate who joined too.
  opted_out: "clients",
  booking: "calendar",
  member_joined: "admin/team",
  member_left: "admin/team",
  // A note from an owner's correction waits on the Autonomy pane, where the notes waiting are listed (decision 0063).
  note_to_keep: "admin/autonomy",
};

test("a group whose rows point at different records opens the list that holds them; one record, that record", () => {
  const two = todayAwayGrouped([
    row(1, "handoff", T1, { type: "conversation", id: "c1" }),
    row(2, "handoff", T2, { type: "conversation", id: "c2" }),
  ]).groups[0];
  assert.equal(two.door, "inbox", "REGRESSION: it opened the newest conversation and marked the other read");
  assert.equal(two.ids.length, 2, "and what it opens, the Inbox, holds both: both are read");
  const one = todayAwayGrouped([
    row(1, "handoff", T1, { type: "conversation", id: "c1" }),
    row(2, "handoff", T1, { type: "conversation", id: "c1" }),
    row(3, "handoff", T1, { type: "conversation", id: "c1" }),
  ]).groups[0];
  assert.equal(one.door, T1, "sixteen alerts about one thread open that thread");
  const alone = todayAwayGrouped([row(1, "handoff", T2)]).groups[0];
  assert.equal(alone.door, T2, "a row alone opens its own door");
  const bare = todayAwayGrouped([
    { ...row(1, "handoff", T1), actions: [] },
    { ...row(2, "handoff", T1), actions: [] },
  ]).groups[0];
  assert.equal(bare.door, "inbox", "rows with no door of their own are held by their kind's list");
});

test("every kind that groups has a list door, and a group of different records opens it", () => {
  const grouped = [];
  for (const [kind, list] of Object.entries(LIST_DOORS)) {
    const g = todayAwayGrouped([row(1, kind, "somewhere/one"), row(2, kind, "somewhere/two")]).groups;
    assert.equal(g.length, 1, `${kind} groups`);
    assert.equal(g[0].count, 2, kind);
    assert.equal(g[0].door, list, `${kind}: two records open ${list}`);
    assert.ok(g[0].action && /^Open|^Answer/.test(g[0].action), `${kind}: the door says what it is, ${g[0].action}`);
    grouped.push(kind);
  }
  // A kind that groups and is not in the table above would be a noun with no list: found by trying every kind the edge writes.
  const groups = SERVER_NOTIFICATION_KINDS.filter(
    (kind) => todayAwayGrouped([row(1, kind, "a/b"), row(2, kind, "a/c")]).groups[0]?.count === 2,
  );
  assert.deepEqual(
    [...groups].sort(),
    grouped.sort(),
    "the kinds that group are exactly the ones with a list door here",
  );
});

// A group does one thing wherever it is drawn (task 5.2, D1-notice-two-drawings). In the bell a press on "9 calls" opens the notes under
// it; on Today it marked every note read and jumped to one page, leaving the records it never showed unseen and counted as read.
// Now both open the notes in place, and each note opens its own record and is read as it is opened.
test("pressed, a group opens in place as the bell's does: nothing is read or opened; each note under it opens its own record and is read", () => {
  const opened = [];
  const read = [];
  const kept = globalThis.appNavigate;
  globalThis.appNavigate = (to) => opened.push(to);
  try {
    const rows = [row(1, "handoff", T1), row(2, "handoff", T2), row(3, "handoff", T2)];
    let tree = draw(rows, []);
    globalThis.__notifs.read = (id) => read.push(id);
    const notesOf = (t) => all(t, (n) => n.props?.["data-testid"] === "today-away-note");
    assert.equal(byClass(tree, "ta-main").props["aria-expanded"], false, "closed until it is pressed");
    assert.equal(notesOf(tree).length, 0, "and the notes are not drawn");
    byClass(tree, "ta-main").props.onClick();
    assert.deepEqual(
      [opened, read],
      [[], []],
      "REGRESSION: a press read the three and opened one page, the other records never shown",
    );
    tree = again(() => globalThis.React.createElement(TodayAway, {}));
    assert.equal(byClass(tree, "ta-main").props["aria-expanded"], true, "open, in place");
    const notes = notesOf(tree);
    assert.deepEqual(
      notes.map((n) => textOf(byClass(n, "ta-title")).trim()),
      ["handoff 1", "handoff 2", "handoff 3"],
      "every note the group stands for, each with its own words",
    );
    byClass(notes[0], "ta-main").props.onClick();
    assert.deepEqual([opened, read], [[T1], ["n:1"]], "the first opens its thread and is read");
    byClass(notes[2], "ta-main").props.onClick();
    assert.deepEqual(
      [opened, read],
      [
        [T1, T2],
        ["n:1", "n:3"],
      ],
      "another opens its own; the one between is still unread",
    );
    // Pressed again, the group closes.
    byClass(tree, "ta-main").props.onClick();
    tree = again(() => globalThis.React.createElement(TodayAway, {}));
    assert.equal(byClass(tree, "ta-main").props["aria-expanded"], false);
    assert.equal(notesOf(tree).length, 0);
    // Two alerts about one thread open under their line too, each the thread.
    opened.length = 0;
    read.length = 0;
    tree = draw([row(1, "handoff", T1), row(2, "handoff", T1)], []);
    globalThis.__notifs.read = (id) => read.push(id);
    byClass(tree, "ta-main").props.onClick();
    tree = again(() => globalThis.React.createElement(TodayAway, {}));
    for (const n of notesOf(tree)) byClass(n, "ta-main").props.onClick();
    assert.deepEqual(opened, [T1, T1]);
    assert.deepEqual(read.sort(), ["n:1", "n:2"]);
    // A row alone is as it was: one press reads it and opens it.
    opened.length = 0;
    read.length = 0;
    tree = draw([row(1, "review", "reports/reviews")], []);
    globalThis.__notifs.read = (id) => read.push(id);
    byClass(tree, "ta-main").props.onClick();
    assert.deepEqual([opened, read], [["reports/reviews"], ["n:1"]]);
  } finally {
    globalThis.appNavigate = kept;
  }
});

test("the card and the bell group the same unread rows one way: bellSections is the one function; the card adds its warnings first and its cap", () => {
  const calls = [
    row(1, "call", "conversations/phone"),
    row(2, "call", "conversations/phone"),
    row(3, "call", "conversations/phone"),
  ];
  const mixed = [
    ...calls,
    row(4, "handoff", T1, { type: "conversation", id: "c1" }),
    row(5, "handoff", T2, { type: "conversation", id: "c2" }),
    row(6, "billing", "admin/billing"),
    { ...row(7, "alert", "today"), unread: false },
  ];
  const away = todayAwayGrouped(mixed, [], 10).groups;
  const bell = bellSections(mixed).find((s) => s.label === "New").lines;
  const shape = (rows) => rows.map((g) => [g.row.id, g.count, g.title, g.members.map((m) => m.id)]);
  assert.deepEqual(
    shape(away),
    shape(bell),
    "the same lines, the same counts, the same words, the same notes under each",
  );
  assert.deepEqual(
    away.map((g) => g.title),
    ["3 calls", "2 conversations need you", null],
    "three calls say three; a kind with no noun stands alone",
  );
  // What the card adds: a warning is never listed below good news, which the bell leaves in the order it came.
  const news = { ...row(8, "leads_ready", "clients/leads"), tone: "ok" };
  const sorted = todayAwayGrouped([news, ...mixed], [], 10).groups;
  assert.equal(sorted.at(-1).row.id, "n:8", "the card puts good news last");
  assert.equal(
    bellSections([news, ...mixed]).find((s) => s.label === "New").lines[0].row.id,
    "n:8",
    "the bell does not",
  );
});

test("a new review the card's line draws is not said again by the bell's notice of it; one it does not draw stands", () => {
  const REV = "11111111-1111-4111-8111-111111111111";
  const notice = (i, about) => ({
    ...row(i, "review", "reports/reviews"),
    tone: "ok",
    title: "New on Google: ★★★★★ from Ana",
    about,
  });
  const drawn = { review: { id: REV, reviewId: "g-ana" } };
  const out = todayAwayGrouped(
    [
      notice(1, { type: "review", id: "g-ana" }),
      notice(2, { type: "review", id: REV }),
      notice(3, { type: "review", id: "g-bo" }),
      { ...notice(4, null), title: "2 new reviews on Google" },
    ],
    [drawn],
    5,
  );
  assert.deepEqual(
    out.groups.flatMap((g) => g.members.map((m) => m.id)),
    ["n:3", "n:4"],
    "the notice kept about Google's id for the review and the one about its row are the line's; another review and a count are not",
  );
  assert.equal(out.queued, 2, "the two are counted in the head and the foot, as every row the page above holds is");
  // A row of another kind about the same id is not a review's notice, and is never dropped for it.
  const other = todayAwayGrouped([{ ...notice(5, { type: "review", id: REV }), kind: "billing" }], [drawn], 5);
  assert.equal(other.groups.length, 1);
});

test("the card draws no review notice under the line: Today's Google surface is the line's, and an answered review has none", () => {
  const REV = "11111111-1111-4111-8111-111111111111";
  const hour = 3_600_000;
  const at = (ago) => new Date(Date.now() - ago).toISOString();
  const google = (over = {}) => ({
    fetchedAt: Date.now(),
    dto: {
      ready: { places: true, profile: true },
      listing: {
        place_id: "p1",
        name: "Northside Movers",
        address: null,
        maps_uri: null,
        business_status: null,
        rating: 4.8,
        review_count: 12,
        linked_at: at(90 * 24 * hour),
        checked_at: at(hour),
        check_error: null,
      },
      connection: null,
      reviews: [
        {
          id: REV,
          review_id: "g-ana",
          origin: "profile",
          rating: 5,
          author: "Ana",
          author_uri: null,
          author_photo_uri: null,
          body: "Careful movers.",
          language_code: null,
          published_at: at(2 * hour),
          reply_text: null,
          replied_at: null,
          maps_uri: null,
          first_seen_at: at(hour),
          ...over,
        },
      ],
      days: [],
      reply_mode: "ask",
    },
  });
  const notice = {
    ...row(1, "review", "reports/reviews:" + REV),
    tone: "ok",
    title: "New on Google: ★★★★★ from Ana",
    about: { type: "review", id: REV },
  };
  const away = (surface) => {
    const rows = [notice];
    fresh();
    setSurfaceValue("google", surface);
    globalThis.__notifs = {
      feed: () => rows,
      onChange: () => () => {},
      read() {},
      dismiss() {},
      seenAll() {},
      older: () => 0,
    };
    setSurfaceValue("today", { queue: { rows: [] } });
    return globalThis.React.createElement(TodayAway, {});
  };
  try {
    const hidden = away(google());
    assert.equal(all(hidden, (n) => n.props?.["data-testid"] === "today-away-row").length, 0, "the line has it");
    assert.equal(textOf(byClass(hidden, "tq-count")).trim(), "1", "and the head still counts it: it is in the bell");
    const answered = away(google({ reply_text: "Thank you, Ana.", replied_at: at(10 * 60_000) }));
    assert.equal(
      all(answered, (n) => n.props?.["data-testid"] === "today-away-row").length,
      1,
      "answered, the line has gone, and a notice the bell has not read stands for itself",
    );
  } finally {
    setSurfaceValue("google", undefined);
  }
});
