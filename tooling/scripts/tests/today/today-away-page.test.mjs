/**
 * "While you were away", EXECUTED: the head is the bell's badge, the foot
 * accounts for every unread row not on screen, and the empty line never
 * congratulates over unread work.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayAwayGrouped, unreadCount, leadQuestionRoute } from "@chanlytics/contracts";
import { installLegacyReact, fresh, find, all, byTestId, textOf } from "../_legacy-react.mjs";

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
  globalThis.__notifs = { feed: () => rows, onChange: () => () => {}, read() {}, dismiss() {}, seenAll() {} };
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
