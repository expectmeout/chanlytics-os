/**
 * One count of what needs you (decision 0048, point 1; task 5.1 of the wiring plan; OW1).
 *
 * The Inbox's badge in the sidebar, the phone's Inbox tab, the title of the browser's tab, the phone app's badge and Today's
 * head each showed the number the last `inbox:counts` event carried, from two senders that counted a reply the owner had just
 * held differently, and the Needs-you tab beside Conversations counted a third time off the Inbox's rows. Three things wait on
 * a person: a hold nobody has taken (not snoozed, not a teammate's, never a customer's STOP), a reply counting down that can
 * still be stopped, and a run waiting for a word. They are counted once, in contracts (`waitsOf`, `needsYouCount`), and every
 * surface that says the number reads one selector over the Inbox's threads and the runs (surfaces/needs-you.ts).
 *
 * Run on the contracts over the four sources, on the selector over the surfaces' values with the hold this tab has made, and
 * on Today's queue drawn on the stub React: its head is the badge's number. The threads stand on the real clock, because the
 * selector and the page count a reply down to the server's deadline with Date.now().
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  conversationWaitsOnYou,
  heldEmailsWords,
  needsYouCount,
  runHeldEmails,
  runsWaitingSentence,
  todayRunWords,
  threadWait,
  threadsWaitingOnYou,
  toInboxThreadVM,
  toTodayVM,
  waitsOf,
} from "@chanlytics/contracts";
import { waitingRunsOf } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import { installLegacyReact, fresh, byTestId, textOf } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";
import { NOW as DAY, ZONE, handoffDay, metrics } from "./_world.mjs";

installLegacyReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate() {},
  usePPToast: () => [null, () => {}],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
});
const W = globalThis.window;
const SRC = "apps/dashboard/src";
const { needsYouNow, hearNeedsYou, needsYouMoved } = await importSrc(`${SRC}/surfaces/needs-you.ts`);
const { setSurfaceValue } = await importSrc(`${SRC}/surfaces/surface-values.ts`);
const { surfaceMoved } = await importSrc(`${SRC}/legacy-bridge/surface-status.ts`);
const { VW_STORE, IX_STORE, inboxData } = await importSrc(`${SRC}/surfaces/inbox/store.ts`);
// The demo's seed, fetched only in a demo session (inbox/shell.ts demoCode): it hands its rows to the store as it lands.
const { demoCode } = await importSrc(`${SRC}/surfaces/inbox/shell.ts`);
const { useTodayStanding } = await importSrc(`${SRC}/surfaces/today/pages/today-head.tsx`);
const { standingSaid } = await importSrc(`${SRC}/surfaces/kit/head/standing.ts`);

const nowMs = Date.now();
const NOW = new Date(nowMs);
/** The business's days the runs are judged by (contracts runDaysAt): none of these runs is made for a day. */
const DAYS = { today: "2026-09-26", sendsOn: "2026-09-26" };
const ago = (min) => new Date(nowMs - min * 60_000).toISOString();

/* ------------------------------------- the salon's threads, as the wire has them ------------------------------------- */

const wrote = (id, body, min) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  created_at: ago(min),
  channel_ts: ago(min),
});
/** The receptionist's reply, written `min` minutes ago and waiting out `holdMin` minutes before it goes. */
const queued = (id, min, holdMin) => ({
  id,
  direction: "outbound",
  sender: "ai",
  type: "text",
  body: "Friday at 3 works.",
  media: null,
  meta: { delay_ms: holdMin * 60_000 },
  status: "queued",
  channel: "whatsapp",
  created_at: ago(min),
  channel_ts: null,
});
const person = (id, name, over = {}) => ({
  id: `p-${id}`,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "opted_in",
  dnc: false,
  ...over,
});
const conv = (id, name, over = {}) => ({
  id,
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: ago(40),
  last_message_at: ago(40),
  last_inbound_at: ago(40),
  contact: person(id, name),
  messages: [wrote(`m-${id}`, "Can someone call me back?", 40)],
  ...over,
});
const hold = (id, reason = "human_token") => ({
  id: `e-${id}`,
  conversation_id: id,
  reason,
  details: null,
  state: "open",
  created_at: ago(35),
});

/** Seven threads, one per way of waiting or not: the two that wait are the first two. */
const salon = () => [
  { dto: conv("c-hold", "Hana Hold"), esc: hold("c-hold") },
  {
    dto: conv("c-send", "Sam Send", {
      state: "open",
      messages: [wrote("m-c-send", "Any slots Friday?", 3), queued("d-c-send", 1, 10)],
    }),
    esc: null,
  },
  {
    dto: conv("c-late", "Lee Late", {
      state: "open",
      messages: [wrote("m-c-late", "Any slots?", 31), queued("d-c-late", 30, 5)],
    }),
    esc: null,
  },
  { dto: conv("c-snz", "Zoe Snoozed", { state: "snoozed", snooze_until: ago(-600) }), esc: hold("c-snz") },
  {
    dto: conv("c-mine", "Nina Mine", { assignee_user_id: "u-me", assignee_is_me: true, paused_until: ago(-60) }),
    esc: hold("c-mine"),
  },
  {
    dto: conv("c-theirs", "Ada Theirs", { assignee_user_id: "u-ana", assignee_is_me: false, paused_until: ago(-60) }),
    esc: hold("c-theirs"),
  },
  {
    dto: conv("c-stop", "Dulce Stop", {
      state: "open",
      contact: person("c-stop", "Dulce Stop", { consent: "opted_out", dnc: true }),
      messages: [wrote("m-c-stop", "STOP", 20)],
    }),
    esc: hold("c-stop", "opt_out"),
  },
];
const viewModels = (rows = salon()) => rows.map(({ dto, esc }) => toInboxThreadVM(dto, esc, ZONE, NOW));
const facts = (vm) => ({ needsYou: vm.needsYou, send: vm.veto ? { endsAtMs: vm.veto.endsAtMs } : null });

/* ------------------------------------------------ the count, in contracts ------------------------------------------------ */

test("a thread waits on you as a hold or as a held send, and a hold wins: one wait, whatever else is on it", () => {
  const soon = nowMs + 60_000;
  assert.equal(threadWait({ needsYou: true }, nowMs), "hold");
  assert.equal(
    threadWait({ needsYou: true, send: { endsAtMs: soon } }, nowMs),
    "hold",
    "a hold with a reply on its way",
  );
  assert.equal(threadWait({ needsYou: false, send: { endsAtMs: soon } }, nowMs), "send", "a reply that can be stopped");
  assert.equal(
    threadWait({ needsYou: false, send: { endsAtMs: soon, held: true } }, nowMs),
    null,
    "a reply this tab has just held is stopped, though the wire has not said so yet",
  );
  assert.equal(
    threadWait({ needsYou: false, send: { endsAtMs: nowMs - 1 } }, nowMs),
    null,
    "past its deadline it is going out in the owner's name, not waiting on them",
  );
  assert.equal(threadWait({ needsYou: false }, nowMs), null);
});

test("waitsOf counts the holds, the held sends and the runs waiting; needsYouCount is their sum", () => {
  const soon = { endsAtMs: nowMs + 60_000 };
  const w = waitsOf({
    threads: [
      { needsYou: true },
      { needsYou: true, send: soon },
      { needsYou: false, send: soon },
      { needsYou: false, send: { ...soon, held: true } },
      { needsYou: false, send: { endsAtMs: nowMs - 1 } },
      { needsYou: false },
    ],
    // Only a run waiting for a word waits on a person: one about to go, one going, one gone and one stopped do not.
    runs: [
      { state: "pending_approval" },
      { state: "scheduled" },
      { state: "sending" },
      { state: "sent" },
      { state: "canceled" },
      { state: "failed" },
      { state: "pending_approval" },
    ],
    unreadHolds: 1,
    days: DAYS,
    nowMs,
  });
  assert.deepEqual(
    w,
    { holds: 3, sends: 1, runs: 2 },
    "two holds and the one whose thread could not be read; one send; two runs",
  );
  assert.equal(needsYouCount(w), 6);
  // A visit's run made for a day that has passed waits on nobody: the verb would refuse it (contracts runApprovalRefusal).
  const late = waitsOf({
    threads: [],
    runs: [{ state: "pending_approval", playbook_id: "p1", run_for: "2026-09-25" }],
    unreadHolds: 0,
    days: DAYS,
    nowMs,
  });
  assert.equal(
    late.runs,
    0,
    "REGRESSION (S7-4): yesterday's run, which can only be skipped, was counted as needing you",
  );
  assert.equal(
    needsYouCount(waitsOf({ threads: [], runs: [], unreadHolds: 0, days: DAYS, nowMs })),
    0,
    "a zero is shown",
  );
});

test("a going run whose emails the check holds waits on you once, however many it holds; one holding none, or not going, does not (Ruben, 13 Oct 2026)", () => {
  const reach = { kind: "reach_out" };
  const w = waitsOf({
    threads: [],
    runs: [
      { state: "sending", audience: reach, held: 12 },
      { state: "scheduled", audience: reach, held: 1 },
      { state: "sending", audience: reach, held: 0 },
      { state: "sending", audience: reach },
      // A run that is not going holds nothing for your say: its held count, if any, is not read.
      { state: "sent", audience: reach, held: 3 },
      { state: "canceled", audience: reach, held: 2 },
    ],
    unreadHolds: 0,
    days: DAYS,
    nowMs,
  });
  assert.equal(w.runs, 2, "two going runs hold emails: one wait each, never one per email");
  assert.deepEqual(
    [
      runHeldEmails({ state: "sending", held: 12 }),
      runHeldEmails({ state: "sent", held: 3 }),
      runHeldEmails({ state: "sending" }),
    ],
    [12, 0, 0],
  );
  // The words every page draws the run with: the held emails, and the rest of the run going as planned.
  const words = todayRunWords({
    state: "sending",
    recipient_count: 40,
    when: "",
    counts: { sent: 9, replied: 0 },
    audience: reach,
    held: 2,
  });
  assert.equal(words.held.sentence, "2 emails wait for your say. The rest of the run goes as planned.");
  assert.equal(heldEmailsWords(1), "1 email waits for your say");
  assert.equal(
    runsWaitingSentence(2),
    "2 campaign runs are waiting for your say.",
    "one sentence for both kinds of wait",
  );
});

test("the server reads the runs waiting for a word as the page counts them: those waiting for approval, and the going reach-out runs whose check holds emails, with how many", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const reach = { kind: "reach_out", chain_id: "c1" };
  const run = (id, state, audience, created_at) => ({
    id,
    tenant_id: T,
    name: id,
    state,
    playbook_id: null,
    run_for: null,
    audience,
    recipient_count: 3,
    created_at,
  });
  const send = (broadcast_id, state) => ({ tenant_id: T, broadcast_id, state });
  const db = fakeDb({
    broadcasts: [
      run("waiting", "pending_approval", { kind: "list" }, "2026-09-26T08:00:00Z"),
      run("holding", "sending", reach, "2026-09-26T09:00:00Z"),
      run("clear", "sending", reach, "2026-09-26T10:00:00Z"),
      run("playbook-going", "scheduled", { kind: "list" }, "2026-09-26T11:00:00Z"),
      run("done", "sent", reach, "2026-09-26T07:00:00Z"),
    ],
    reach_out_sends: [send("holding", "held"), send("holding", "held"), send("clear", "sent"), send("done", "held")],
  });
  const runs = await waitingRunsOf(db, T);
  assert.deepEqual(
    runs.map((r) => [r.id, r.held ?? null]),
    [
      ["holding", 2],
      ["waiting", null],
    ],
    "newest first: the going run holding two emails, then the run waiting for approval; nothing else waits",
  );
  assert.equal(waitsOf({ threads: [], runs, unreadHolds: 0, days: DAYS, nowMs }).runs, 2, "and the count says both");
});

test("a hold is not snoozed, not a teammate's, not yours, and never a customer's STOP; a held send is not past its deadline", () => {
  const rows = salon();
  const wire = rows.map(({ dto, esc }) => conversationWaitsOnYou(dto, esc, NOW));
  assert.deepEqual(
    wire,
    [true, true, false, false, false, false, false],
    "Hana (a hold) and Sam (a reply counting down); not Lee (late), Zoe (snoozed), Nina (yours), Ada (a teammate's), Dulce (a STOP)",
  );
  assert.equal(
    threadsWaitingOnYou(
      rows.map((r) => r.dto),
      rows.flatMap((r) => (r.esc ? [r.esc] : [])),
      NOW,
    ),
    2,
    "Today's headline counts the same two",
  );
});

test("a hold whose thread the page could not read counts as waiting, unless it waits on nobody", () => {
  const rows = salon();
  const convs = rows.map((r) => r.dto);
  const escs = rows.flatMap((r) => (r.esc ? [r.esc] : []));
  assert.equal(
    threadsWaitingOnYou(convs, [...escs, hold("c-old")], NOW),
    3,
    "unknown is not handled: a customer flagged before the newest page is waiting",
  );
  assert.equal(
    threadsWaitingOnYou(convs, [...escs, hold("c-old-stop", "opt_out")], NOW),
    2,
    "and a STOP nobody could read is news, not a wait",
  );
});

test("the wire's rule and the Inbox's rule are one: each thread waits exactly when its view model says it does", () => {
  const rows = salon();
  const vms = viewModels(rows);
  rows.forEach(({ dto, esc }, i) => {
    assert.equal(
      conversationWaitsOnYou(dto, esc, NOW),
      threadWait(facts(vms[i]), nowMs) !== null,
      `${dto.id}: the wire and the view model say the same`,
    );
  });
  // The sum of the threads' part is Today's headline's count.
  assert.equal(
    needsYouCount(waitsOf({ threads: vms.map(facts), runs: [], unreadHolds: 0, days: DAYS, nowMs })),
    threadsWaitingOnYou(
      rows.map((r) => r.dto),
      rows.flatMap((r) => (r.esc ? [r.esc] : [])),
      NOW,
    ),
  );
});

/* ------------------------------------------ the selector, over the surfaces ------------------------------------------ */

const inboxOf = (vms) => ({ INBOX_BUCKETS: [], INBOX_VIEWS: [], CHANNEL_LABELS: {}, INBOX_BASELINE: {}, THREADS: vms });
/** A run as the broadcasts surface publishes it (toBroadcastVM), as far as the queue and the count read it. */
const runRow = (id, state, over = {}) => ({
  id,
  state,
  recipient_count: 3,
  audience: { label: "Win-back" },
  playbook_id: "p1",
  scheduled_for: null,
  when: "today 6:00 PM",
  counts: { sent: 0, replied: 0 },
  ...over,
});
const reset = () => {
  setSurfaceValue("inbox", undefined);
  setSurfaceValue("broadcasts", undefined);
  VW_STORE.state = {};
};
after(reset);

test("the badge's number is none before the Inbox has been read: a count of what nothing has read is no count", () => {
  reset();
  assert.equal(needsYouNow(nowMs), null);
  setSurfaceValue("inbox", inboxOf([]));
  assert.equal(needsYouNow(nowMs), 0, "a zero is shown once it has been read");
  reset();
});

test("the holds, the held sends and the runs waiting are one number, and a reply held in this tab leaves it before the re-read", () => {
  reset();
  const vms = viewModels();
  setSurfaceValue("inbox", inboxOf(vms));
  assert.equal(needsYouNow(nowMs), 2, "Hana, and Sam whose reply is on its way");
  // The campaigns surface: two runs wait for a word, one is about to go, one went.
  setSurfaceValue("broadcasts", {
    rows: [
      runRow("r1", "pending_approval"),
      runRow("r2", "scheduled"),
      runRow("r3", "pending_approval"),
      runRow("r4", "sent"),
    ],
  });
  assert.equal(needsYouNow(nowMs), 4, "and the two runs");
  // The owner presses Hold on Sam's reply: the cancel's re-read has not landed, so the thread still carries its draft.
  const sam = vms[1];
  VW_STORE.state = { [`draft:${sam.veto.messageId}`]: { held: true } };
  assert.equal(
    needsYouNow(nowMs),
    3,
    "REGRESSION: the badge kept the reply this tab had held until something else moved it, one over the chip",
  );
  // Past its deadline a reply goes out in the owner's name: it does not wait.
  VW_STORE.state = {};
  assert.equal(needsYouNow(sam.veto.endsAtMs + 1), 3, "Sam's reply is gone; the hold and the runs remain");
  reset();
});

test("a demo session counts its seeded threads by the mockup's rule, less the decisions it made", async () => {
  reset();
  W.__DEMO_MODE = true;
  await demoCode();
  try {
    const seeded = needsYouNow(nowMs);
    assert.ok(seeded > 0, "the demo's Inbox has threads that wait");
    assert.deepEqual(Object.values(IX_STORE.decisions), [], "no decision yet");
    // A decision on a seeded thread that waits takes it out of the count, the way it leaves the Inbox's Needs you.
    const waiting = inboxData().THREADS.find(
      (t) => !t.real && (t.state === "needs" || (t.state === "escalated" && !t.takenOver)),
    );
    IX_STORE.set(waiting.id, { action: "Approve", at: "12:04", kind: "decided" });
    assert.equal(needsYouNow(nowMs), seeded - 1);
    IX_STORE.clear(waiting.id);
    assert.equal(needsYouNow(nowMs), seeded);
  } finally {
    W.__DEMO_MODE = false;
  }
});

test("the readers are told when what the count is made of moves, and not when something else does", () => {
  reset();
  const told = [];
  const stop = hearNeedsYou(() => told.push(1));
  surfaceMoved("inbox");
  surfaceMoved("broadcasts");
  needsYouMoved();
  assert.equal(told.length, 3, "the Inbox's threads, the campaigns' runs, and what only the Inbox's page knows");
  surfaceMoved("today");
  surfaceMoved("people");
  assert.equal(told.length, 3, "Today and People are not what it is made of");
  stop();
  surfaceMoved("inbox");
  assert.equal(told.length, 3, "and a reader that stopped is not told");
});

/* ----------------------------------------------- Today's head, drawn ----------------------------------------------- */

/** What Today's head says leads its sentence, as the page tells it to the frame's head (today-head.tsx): "3 need you.". */
function HeadProbe() {
  useTodayStanding();
  return null;
}
const head = (vm) => {
  setSurfaceValue("today", vm);
  fresh();
  try {
    W.React.createElement(HeadProbe, {});
    const lead = textOf(byTestId(standingSaid()?.sentence ?? null, "today-head-lead")).trim();
    return /^(\d+) needs? you\.$/.exec(lead)?.[1] ?? lead;
  } finally {
    setSurfaceValue("today", undefined);
  }
};

test("Today's head is the badge's number: the holds, the held sends and the runs waiting, not the windows, searches or calls beside them", () => {
  reset();
  const day = handoffDay();
  assert.equal(
    head(day),
    "1",
    "until the Inbox has been read, Today's own copy of the same threads (its headline's count)",
  );
  // The Inbox has been read: two threads wait, and a run waits for a word, which Today's own rows do not know of the
  // same way. The head says the number the sidebar says.
  setSurfaceValue("inbox", inboxOf(viewModels()));
  setSurfaceValue("broadcasts", { rows: [runRow("r1", "pending_approval")] });
  assert.equal(needsYouNow(), 3, "Hana, Sam's reply, and the run waiting for a word");
  assert.equal(head(day), "3", "REGRESSION: the head counted its own rows, and said another number than the badge");
  reset();
});

test("Today's head says the runs waiting for a word until the Inbox is read, and no more than they are", () => {
  reset();
  const day = toTodayVM(metrics(), [], [], [], DAY);
  // Sent's runs as the surface publishes them (the count reads the seam: needs-you.ts waitingRunsNow), and on the window,
  // where the queue's own rows read them.
  const runs = {
    rows: [
      runRow("r1", "pending_approval"),
      runRow("r2", "scheduled", { scheduled_for: new Date(nowMs + 3_600_000).toISOString() }),
    ],
  };
  setSurfaceValue("broadcasts", runs);
  W.__BROADCASTS = runs;
  try {
    assert.equal(head(day), "1", "one run waits for a word; the one about to go is the day's, with its Stop");
  } finally {
    setSurfaceValue("broadcasts", undefined);
    delete W.__BROADCASTS;
  }
});
