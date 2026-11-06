/**
 * A copy of a phone's screen never says a time it cannot stand behind (decision 0101; the load PRD's F1). Once some minutes old it
 * draws no time at all, and what it hides is whatever says it says one (kit/says-when.ts). So every time a row can say says so,
 * here over the states the test workspace lacks: a snoozed thread, a visit tomorrow, a wait on Today. A list of class names did
 * this job until 6 Nov 2026 and missed Need you's wait, People's next visit, the Inbox's snooze and the head's sentence. A person's
 * own words are theirs, and stay. e2e/shell/first-rows.spec.ts holds the same over the real pages, by a walk of the copy itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM } from "@chanlytics/contracts";
import { all, fresh, installLegacyReact, textOf } from "../../_legacy-react.mjs";
import { personRow } from "../../consent/_person-row.mjs";
import { timesSaid, unmarkedTimes } from "./_unmarked-times.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const S = "../../../apps/dashboard/src/surfaces";
const { threadRows } = await import(`${S}/inbox/pages/list-rows.tsx`);
const { PL_CARD } = await import(`${S}/people/cells/columns.tsx`);
const { AttnRow } = await import(`${S}/kit/attention/attn-row.tsx`);
const { PageHead } = await import(`${S}/kit/head/page-head.tsx`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);

const ZONE = "America/New_York";
/** Wednesday, Sep 23, 2026, noon in New York. */
const NOW_MS = Date.parse("2026-09-23T16:00:00Z");
const NOW = new Date(NOW_MS);
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60_000;

const CONVERSATION = {
  id: "c1",
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: iso(NOW_MS - 40 * MIN),
  last_message_at: iso(NOW_MS - 20 * MIN),
  last_inbound_at: iso(NOW_MS - 40 * MIN),
  contact: {
    id: "k-1",
    display_name: "Dana Cole",
    wa_profile_name: null,
    phone_e164: "+13055550100",
    consent: "opted_in",
    dnc: false,
  },
  messages: [
    {
      id: "m-1",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Hello there",
      media: null,
      meta: null,
      status: "received",
      created_at: iso(NOW_MS - 40 * MIN),
      channel_ts: iso(NOW_MS - 40 * MIN),
    },
  ],
};

/** What the Inbox's list hands a row. */
const LIST = {
  activeBucket: "all",
  inNeedsBucket: false,
  searching: false,
  multipleAgents: false,
  activeThreadId: null,
  selected: [],
  tabStopId: undefined,
  sendingIn: () => null,
  onSelectThread() {},
  onToggleSelect() {},
  onRowKey() {},
};

/** A row as the Inbox draws it: one of the list's, the list holding it alone. */
const rowOf = (over = {}, list = {}) => {
  fresh();
  return threadRows(
    { ...LIST, ...list, visible: [{ ...toInboxThreadVM(CONVERSATION, null, ZONE, NOW), ...over }] },
    { parts: [{ kind: "row", index: 0 }], measure: () => {} },
  )[0];
};

/** What a cell of People's table is handed besides its row. */
const CTX = { attention: {}, onOpen() {}, onWarm() {}, shows: {}, bookingLink: null, drop: null, listsOf: {} };

const attn = (over) => {
  fresh();
  return h(AttnRow, { name: "Ana Reyes", ...over });
};

const marked = (tree) => all(tree, (n) => n.props?.["data-when"] !== undefined);

test("a thread's one time says so, whichever time it is", () => {
  for (const over of [
    { state: "escalated", waitingMin: 120, waited: "2h" },
    { state: "snoozed", wake: "Tomorrow 9 AM" },
    { state: "done", lastAt: "Nov 5" },
    { state: "done", lastAt: "5:51 PM" },
    { state: "done", resolution: { action: "Approved", at: "2h ago", declined: false } },
  ]) {
    const row = rowOf(over);
    assert.ok(timesSaid(row).length > 0, `the fixture says one: ${JSON.stringify(over)}`);
    assert.deepEqual(unmarkedTimes(row), [], JSON.stringify(over));
  }
});

test("the seconds before a reply goes out are a time too", () => {
  const row = rowOf({}, { sendingIn: () => 3 });
  assert.match(textOf(row), /Sends in.*0:03/);
  assert.ok(
    all(row, (n) => String(n.props?.className ?? "").includes("ix-sending")).some(
      (n) => n.props?.["data-when"] !== undefined,
    ),
    "the seconds stand frozen on a copy",
  );
});

test("a thread's own words are theirs, whatever they say", () => {
  const row = rowOf({ preview: "Can you do Tuesday at 3pm?", state: "done", lastAt: "Nov 5" });
  assert.match(textOf(row), /Tuesday at 3pm/);
  assert.deepEqual(
    timesSaid(row).map((t) => t.words),
    ["Nov 5"],
    "their words are no time the app claims",
  );
  const words = all(row, (n) => String(n.props?.className ?? "").includes("ix-thread-preview"))[0];
  assert.equal(marked(words).length, 0, "and they stay on a copy some minutes old");
});

test("a person's card says when they come and when you last spoke, and says so", () => {
  fresh();
  const card = PL_CARD.cell(
    {
      ...personRow({ display_name: "Rosa Example" }),
      nextVisitLine: { day: "Tomorrow", time: "3:00 PM", state: null },
    },
    CTX,
  );
  assert.match(textOf(card), /Tomorrow · 3:00 PM/);
  assert.match(textOf(card), /3d ago/, "the builder's own words for the last contact");
  assert.deepEqual(unmarkedTimes(card), []);
});

test("Need you's wait says so", () => {
  const row = attn({ wait: { words: "22h", long: false } });
  assert.match(textOf(row), /22h/);
  assert.deepEqual(unmarkedTimes(row), []);
});

test("a sentence of ours says so, in either of its shapes", () => {
  for (const over of [
    { sentence: "Proposal sent 3 days ago" },
    { sentence: "Proposal sent 3 days ago", lead: "A proposal" },
  ]) {
    const row = attn(over);
    assert.match(textOf(row), /3 days ago/);
    assert.deepEqual(unmarkedTimes(row), [], JSON.stringify(over));
  }
});

test("a person's own sentence is theirs, and stays", () => {
  for (const over of [
    { sentence: "Can you do Tuesday at 3pm?", quoted: true },
    { sentence: "Can you do Tuesday at 3pm?", quoted: true, lead: "Moving my visit" },
  ]) {
    const row = attn(over);
    assert.deepEqual(unmarkedTimes(row), [], JSON.stringify(over));
    assert.equal(marked(row).length, 0, "and it stays on a copy some minutes old");
  }
});

test("the head's date and sentence say so", () => {
  fresh();
  const head = h(PageHead, { title: "Inbox", dateline: "Friday, November 6", sentence: "the oldest since 2:26 PM" });
  assert.match(textOf(head), /2:26 PM/);
  assert.deepEqual(unmarkedTimes(head), []);
});

test("a head with neither says nothing of a time, and its name is its name", () => {
  fresh();
  const head = h(PageHead, { title: "Today" });
  assert.deepEqual(unmarkedTimes(head), [], "a page called Today is no claim about when");
  assert.equal(marked(head).length, 0);
});
