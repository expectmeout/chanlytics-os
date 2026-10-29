/**
 * The Inbox list and its counts say what is true (I2).
 *
 * Seen on the salon's workspace and in the code, 15 Sep 2026:
 * - the Needs you chip counted every flagged thread -- yours, a teammate's, and one you had just answered, which
 *   stays flagged for the whole pause -- while the badge and the tab counted what needs you;
 * - every row in Needs you wore "NEEDS YOU", a thread you own included: the check that drops the pill a bucket
 *   already says looks for the mockup's bucket, "needs", which no real thread is ever in;
 * - a thread you have, or a teammate has, waited in amber as if it were waiting on you;
 * - a Handled row whose last reply never left looked like every other;
 * - opening a thread cleared the dot that means it needs you, until the next read lit it again;
 * - the sidebar's first count used the old rule and counted a teammate's threads;
 * - the bulk snooze's Undo said "back where they were", where a snooze lets go of whoever had them.
 * Run against the contracts, and the pages drawn on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toInboxThreadVM, toBroadcastVM, stateOf, memberWords, replyWaitsOnYou } from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  find,
  byTestId,
  textOf,
  settle,
  unmount,
} from "../../_legacy-react.mjs";
import { until } from "../../shared/_until.mjs";

const ZONE = "America/New_York";
const NOW = new Date("2026-09-15T14:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const later = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
const ANA = "u-ana";
const TEAM = [{ userId: ANA, email: "ana@marisas.example.com", displayName: "Ana García" }];
const person = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+16465550123",
  consent: "opted_in",
  dnc: false,
});
const wrote = (id, body, min) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: ago(min),
  channel_ts: ago(min),
});
const ours = (id, sender, body, min, status = "delivered") => ({
  id,
  direction: "outbound",
  sender,
  type: "text",
  body,
  media: null,
  meta: null,
  status,
  created_at: ago(min),
  channel_ts: ago(min),
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
  contact: person(`p-${id}`, name),
  messages: [wrote(`m-${id}`, "Can I move my appointment?", 40)],
  ...over,
});
const asked = (id, min) => ({
  id: `e-${id}`,
  reason: "human_token",
  details: null,
  state: "open",
  created_at: ago(min),
});

// Three flagged threads, as the salon's Needs you bucket can hold them: one nobody has, one you have, one Ana has;
// and a Handled thread whose last reply never left.
const rosa = toInboxThreadVM(conv("c1", "Rosa Díaz"), asked("c1", 90), ZONE, NOW);
const mine = toInboxThreadVM(
  conv("c2", "Nina Park", { paused_until: later, assignee_user_id: "u-me", assignee_is_me: true }),
  asked("c2", 120),
  ZONE,
  NOW,
);
const anas = toInboxThreadVM(
  conv("c3", "Ada Lovelace", { paused_until: later, assignee_user_id: ANA, assignee_is_me: false }),
  asked("c3", 150),
  ZONE,
  NOW,
);
const unsent = toInboxThreadVM(
  conv("c4", "Zoe Martin", {
    state: "open",
    messages: [wrote("m-c4", "Can I book at 3?", 30), ours("m-c4b", "ai", "3pm works!", 29, "failed")],
  }),
  null,
  ZONE,
  NOW,
);

test("the fixtures stand where the salon's threads stand", () => {
  assert.deepEqual([rosa.state, rosa.needsYou], ["escalated", true]);
  assert.deepEqual([mine.state, mine.takenOver, mine.needsYou], ["escalated", true, false]);
  assert.deepEqual([anas.state, anas.claimedByOther, anas.needsYou], ["escalated", true, false]);
  assert.deepEqual([unsent.state, unsent.lastWord.short], ["done", "Didn't send"]);
});

/* -------------------------------- a browser -------------------------------- */

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const S = "../../../../../apps/dashboard/src";
const { Inbox } = await import(`${S}/surfaces/inbox/pages/inbox-page.tsx`);
const { InboxList } = await import(`${S}/surfaces/inbox/pages/inbox-list.tsx`);
const { ThreadPane } = await import(`${S}/surfaces/inbox/thread/thread-pane.tsx`);
const { ixSending, ixBucketOf, ixWaitsOnYou } = await import(`${S}/surfaces/inbox/rules.ts`);
const { threadUnread } = await import(`${S}/surfaces/seen.ts`);
const { VW_STORE } = await import(`${S}/surfaces/inbox/store.ts`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
// Sent's surface, as the app registers it: its value is mirrored where the rows of runs waiting read it (window.__BROADCASTS,
// surfaces/waits/run-acts.tsx), Today's and the Inbox's alike.
await import(`${S}/surfaces/campaigns/broadcasts/surface.ts`);
const { getSurfaceStatuses, setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { needsYouNow } = await import(`${S}/surfaces/needs-you.ts`);
Object.assign(globalThis, {
  location: {
    pathname: "/w/marisas",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __chrome: { state: stateOf, replyWaits: replyWaitsOnYou },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  // The workspace's zone, so a bulk snooze says tomorrow at ten by it without reading the workspace first.
  __WORKSPACES: [{ id: "w-marisas", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "w-marisas",
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
// The badge, the strip's tab, the title and the phone count by one selector over the surfaces (surfaces/needs-you.ts), and the
// page sends no number for them: any event named inbox:counts is a regression, so it is watched for where it is dispatched.
const sentCounts = [];
const dispatched = globalThis.dispatchEvent;
globalThis.dispatchEvent = (e) => {
  if (e && e.type === "inbox:counts") sentCounts.push(e.detail);
  return dispatched(e);
};
// The shell's own toast and role gate, which the page draws through the bridge (surfaces/legacy-verbs.ts).
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();

/** A read landing (surface:inbox) is fired at what listens for it, by name: a page adds several listeners. */
const landsARead = () => globalThis.dispatchEvent({ type: "surface:inbox" });

const findAll = all;
const takesOver = (n) => !!n.props?.["data-takeover"];
const hasClass = (cls) => (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls);
const buttonNamed = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);

const REAL_BUCKETS = [
  { id: "escalated", label: "Needs you", icon: "flag", accent: true },
  { id: "done", label: "Handled", icon: "check" },
  { id: "snoozed", label: "Snoozed", icon: "clock" },
];
const inboxWith = (threads) => {
  setSurfaceValue("inbox", {
    INBOX_BUCKETS: REAL_BUCKETS,
    INBOX_VIEWS: [],
    CHANNEL_LABELS: {},
    INBOX_BASELINE: { doneThisWeek: 0 },
    THREADS: threads,
  });
};
/** The Inbox page, and what its list and its pane were last given: the props of the elements it drew. */
const page = (threads) => {
  VW_STORE.state = {};
  inboxWith(threads);
  fresh();
  let tree;
  const seen = {
    get list() {
      return find(tree, (n) => n.type === InboxList)?.props ?? null;
    },
    get pane() {
      return find(tree, (n) => n.type === ThreadPane)?.props ?? null;
    },
  };
  const render = () => (tree = again(() => Inbox({ showAgentRail: false })));
  render();
  return { seen, render };
};
const listProps = (over = {}) => ({
  threads: [rosa, mine, anas],
  allThreads: [rosa, mine, anas, unsent],
  buckets: [{ id: "escalated", label: "Needs you", icon: "flag", count: 1 }],
  views: [],
  activeBucket: "escalated",
  onBucketChange() {},
  activeThreadId: rosa.id,
  onSelectThread() {},
  selected: [],
  onToggleSelect() {},
  onClearSelection() {},
  ...over,
});

/* --------------------------------- the page --------------------------------- */

test("REGRESSION: a bucket picked is a list, never a conversation -- on a phone Handled and Snoozed opened their first thread over the rows, and an empty bucket showed neither", () => {
  const { seen, render } = page([rosa, unsent]);
  // A tap is what opens a thread over the list: that is what a phone's one screen is for.
  seen.list.onSelectThread(rosa.id);
  assert.ok(takesOver(render()), "a tap opens the thread over the list");

  // Handled: its rows, and the list back on the screen.
  seen.list.onBucketChange("done");
  assert.equal(
    takesOver(render()),
    false,
    "REGRESSION: picking the bucket opened its first thread over the rows -- the list was gone and a customer nobody asked for was on the phone",
  );
  assert.equal(seen.list.activeBucket, "done", "the bucket picked");
  assert.deepEqual(
    seen.list.threads.map((t) => t.id),
    [unsent.id],
    "and the list is that bucket's rows",
  );

  // A bucket with nothing in it is an empty list, never a blank screen: the pane is hidden on a phone, so leaving
  // the thread open showed the rows of no list and no thread either.
  seen.list.onSelectThread(unsent.id);
  assert.ok(takesOver(render()));
  seen.list.onBucketChange("snoozed");
  assert.equal(
    takesOver(render()),
    false,
    "REGRESSION: an empty bucket left the thread open with nothing in it -- neither the list nor a conversation was on the screen",
  );
  assert.deepEqual(seen.list.threads, [], "nothing in it, and the list says so");
});

test("REGRESSION: a bucket the member picked survives the next read -- picking an empty Snoozed and waiting threw them into Needs you, a moment after the tap", () => {
  const place = {};
  const had = globalThis.window.__tabMemory;
  globalThis.window.__tabMemory = {
    place: () => place,
    keepPlace: (_p, _k, v) => Object.assign(place, v),
    // The pane's composer asks for a draft of what was being written, and finds none.
    draft: () => null,
    keepDraft() {},
    dropDraft() {},
  };
  try {
    const { seen, render } = page([rosa, unsent]);
    seen.list.onBucketChange("snoozed");
    render();
    assert.equal(seen.list.activeBucket, "snoozed", "the bucket picked");
    assert.deepEqual(seen.list.threads, [], "with nothing in it");
    // A read lands, as one does every time the surface refreshes.
    landsARead();
    render();
    assert.equal(
      seen.list.activeBucket,
      "snoozed",
      "REGRESSION: the read moved them to the first bucket with anything in it, so an empty one could not be looked at",
    );
  } finally {
    globalThis.window.__tabMemory = had;
  }
});

test("the Needs you chip counts what needs you, the badge's number -- not every thread flagged for a person", () => {
  sentCounts.length = 0;
  const { seen } = page([anas, mine, rosa, unsent]);
  const chip = (id) => seen.list.buckets.find((b) => b.id === id).count;
  assert.equal(
    chip("escalated"),
    1,
    "REGRESSION: it counted the thread you have and Ana's too, under a badge that said 1",
  );
  assert.equal(needsYouNow(), 1, "the badge's own number: the selector over the threads the page was given");
  assert.deepEqual(sentCounts, [], "and the page sends none");
  assert.deepEqual(
    [chip("done"), chip("snoozed")],
    [3, 0],
    "and the chip counts what its own list holds: Handled has the answered one, the thread you took over and Ana's",
  );
  // The chip cannot say a number its list does not hold -- the two came apart once, three rows under a chip of two.
  assert.equal(
    seen.list.threads.length,
    chip("escalated"),
    "REGRESSION: the list filtered on the thread's STATE, which stays escalated whoever holds it, while the chip asked what waits on you",
  );
});

/**
 * A campaign run waiting for your approval, made for today by the business's clock (contracts runsThatWait asks the days
 * now, by the real clock, so its day is today's here too), as Sent's runs hold it.
 */
const waitingRun = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
  const at = new Date().toISOString();
  return toBroadcastVM(
    {
      id: "b-wait",
      name: `Win-back · ${today}`,
      template_id: "t-1",
      template_name: "winback_offer",
      template_language: "en_US",
      params: [],
      audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
      state: "pending_approval",
      scheduled_for: at,
      started_at: null,
      finished_at: null,
      recipient_count: 4,
      failure: null,
      created_at: at,
      playbook_id: "pb-1",
      run_for: today,
      sequence_id: "q-1",
      counts: { queued: 4, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 },
    },
    ZONE,
    new Date(),
  );
};

test("a campaign run waiting for your say is a row of Needs you: its chip counts it, the Inbox opens on it, a search stands it aside, and no card says nobody is waiting over it", () => {
  const place = {};
  const had = globalThis.window.__tabMemory;
  globalThis.window.__tabMemory = {
    place: () => place,
    keepPlace: (_p, _k, v) => Object.assign(place, v),
    draft: () => null,
    keepDraft() {},
    dropDraft() {},
  };
  setSurfaceValue("broadcasts", { rows: [waitingRun()] });
  try {
    // Nothing but a Handled thread: the run is all that waits on you, and the Inbox opens where it is.
    const { seen } = page([unsent]);
    assert.equal(
      seen.list.activeBucket,
      "escalated",
      "it opened on Handled, and the run waited under a tab of no number",
    );
    assert.equal(seen.list.buckets.find((b) => b.id === "escalated").count, 1, "the chip counts it, as the badge does");
    assert.equal(needsYouNow(), 1, "the badge's own number");
    const list = (q) => {
      place.q = q;
      fresh();
      return again(() => InboxList(listProps({ threads: [], allThreads: [unsent], activeBucket: "escalated" })));
    };
    const tree = list("");
    // The Inbox's wait rows are Today's too (surfaces/waits/wait-rows.tsx, the Campaigns wiring review's lane 4).
    const rows = all(tree, (n) => n.props?.testid === "brief-run-row");
    assert.equal(rows.length, 1, "the run is a row of Needs you");
    assert.equal(rows[0].props.name.startsWith("Win-back"), true, "called by its own name, less its day");
    // Its door is the run at its home under its sequence, which the frame opens over the Inbox (lanes 2 and 3).
    const went = [];
    const keepNav = globalThis.window.appNavigate;
    globalThis.window.appNavigate = (route) => went.push(route);
    try {
      rows[0].props.onOpen();
    } finally {
      globalThis.window.appNavigate = keepNav;
    }
    assert.deepEqual(went, ["campaigns/sequences/q-1/runs/b-wait"], "and its door is the run, at its home");
    assert.equal(
      textOf(tree).includes("Nobody's waiting on you"),
      false,
      "Needs you with a run in it is not empty: no card says nobody is waiting over the run",
    );
    // A search finds threads: the run stands aside while one is typed.
    const searched = list("rosa");
    assert.equal(byTestId(searched, "inbox-runs-waiting"), null, "a search stands the run aside");
  } finally {
    setSurfaceValue("broadcasts", undefined);
    globalThis.window.__tabMemory = had;
  }
});

test("REGRESSION: a run that Sent's read brings after the Inbox opened on the runs the tab's cache restored moves it to Needs you, unless the member picked a bucket -- it sat on Handled under 'Needs you 1'", () => {
  const place = {};
  const had = globalThis.window.__tabMemory;
  globalThis.window.__tabMemory = {
    place: () => place,
    keepPlace: (_p, _k, v) => Object.assign(place, v),
    draft: () => null,
    keepDraft() {},
    dropDraft() {},
  };
  // What a new tab's boot holds of Sent's runs: yesterday's, from the tab's cache (surface-cache.ts marks them ready and
  // gives them no status), none waiting, and no read of them yet. The test reaches into the statuses for that: a tab's
  // first read is the one thing a test cannot take back.
  const booted = () => {
    getSurfaceStatuses().delete("broadcasts");
    setSurfaceValue("broadcasts", { rows: [] });
  };
  // A read lands: its rows first, then its status (surface-runner.ts refreshSurface).
  const readLands = (rows) => {
    setSurfaceValue("broadcasts", { rows });
    setStatus("broadcasts", "live");
  };
  try {
    // Every Inbox drawn above still hears the surface (the stub unmounts nothing): a read with no run waiting settles them.
    booted();
    readLands([]);
    booted();
    let { seen, render } = page([unsent]);
    assert.equal(seen.list.activeBucket, "done", "opened where its threads are, by the runs it held, none waiting");
    readLands([waitingRun()]);
    render();
    assert.equal(
      seen.list.activeBucket,
      "escalated",
      "REGRESSION: the cached runs counted as read, so the read that brought today's run moved nothing",
    );
    // Only that first read: a run another read brings later never moves a bucket being read.
    seen.list.onBucketChange("done");
    delete place.bucket;
    readLands([waitingRun()]);
    render();
    assert.equal(seen.list.activeBucket, "done", "a later read moves nothing");

    // A bucket the member picked holds, though the first read brings a run.
    unmount();
    booted();
    ({ seen, render } = page([unsent]));
    seen.list.onBucketChange("done");
    render();
    readLands([waitingRun()]);
    render();
    assert.equal(seen.list.activeBucket, "done", "their own pick holds");
  } finally {
    unmount();
    setSurfaceValue("broadcasts", undefined);
    globalThis.window.__tabMemory = had;
  }
});

test("Needs you holds what waits on you and nothing else: the thread you took over and a teammate's are Handled", () => {
  const { seen, render } = page([anas, mine, rosa]);
  assert.deepEqual(
    seen.list.threads.map((t) => t.who),
    ["Rosa Díaz"],
    "REGRESSION: it listed all three -- the list read the thread's STATE, which stays escalated whoever holds it, while the chip over it counted what waits on you",
  );
  assert.equal(seen.pane.thread.id, rosa.id, "REGRESSION: the pane opened on Ada's thread, which Ana is answering");
  // They are not hidden: Handled has them, each row still saying whose it is, yours before a teammate's (ixRank).
  seen.list.onBucketChange("done");
  render();
  assert.deepEqual(
    seen.list.threads.map((t) => t.who),
    ["Nina Park", "Ada Lovelace"],
    "the one you took over, then the one Ana has",
  );
});

test("opening a real thread reads it, and it stays read over the next read: the dot is the reader's own mark, kept on the server; a demo's is the page's", async () => {
  // Iris wrote five minutes ago, and the reader last opened her an hour ago: new to them. On a phone the list is the
  // screen, so nothing is read by landing.
  const iris = toInboxThreadVM(
    conv("c9", "Iris Vale", { last_inbound_at: ago(5), seen_at: ago(60) }),
    asked("c9", 30),
    ZONE,
    NOW,
  );
  const realFetch = globalThis.fetch;
  const realMatch = globalThis.matchMedia;
  const marks = [];
  globalThis.fetch = async (url, init = {}) => {
    const hit = /\/api\/v1\/contacts\/([^/]+)\/seen/.exec(String(url));
    if (hit && init.method === "PUT") marks.push([hit[1], JSON.parse(String(init.body)).seen]);
    // The door's answer: the stamp of the mark it wrote, which the tab holds its own word against.
    return new Response(JSON.stringify({ ok: true, data: { marked_at: new Date().toISOString() } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    const { seen, render } = page([mine, iris]);
    const dot = (id) => threadUnread(seen.list.threads.find((t) => t.id === id));
    assert.equal(dot(iris.id), true, "new to the reader: the row wears the dot");
    await settle();
    assert.deepEqual(marks, [], "a phone's list read nobody by landing");
    seen.list.onSelectThread(iris.id);
    render();
    await settle();
    assert.equal(dot(iris.id), false, "REGRESSION: a thread never went from unread to read by being opened");
    assert.deepEqual(marks, [["p-c9", true]], "and the mark is the server's, so it is read on their other screens");
    // The next read left before the mark landed, and still says new: the tab's own word holds.
    landsARead();
    render();
    assert.equal(dot(iris.id), false, "REGRESSION: opening it cleared the dot, and the next read lit it again");
    assert.deepEqual(marks.length, 1, "opened once, marked once");
  } finally {
    globalThis.fetch = realFetch;
    globalThis.matchMedia = realMatch;
  }
  const seeded = {
    id: "t-seed",
    real: false,
    who: "Aisha",
    state: "needs",
    unread: true,
    tags: [],
    whoMeta: "",
    timeline: [],
    agent: { name: "Front Desk", glyph: "F" },
    // What the pane the page draws beside the list reads of a seeded thread.
    avatar: "A",
    channels: ["whatsapp"],
    primaryChannel: "whatsapp",
    subject: "",
    preview: "",
    summary: "",
    lastAt: "",
    lastAtFull: "",
    pinned: false,
    priority: "P2",
  };
  const demo = page([seeded]);
  demo.seen.list.onSelectThread("t-seed");
  demo.render();
  assert.equal(
    demo.seen.list.threads.find((t) => t.id === "t-seed").unread,
    false,
    "the demo's unread dot still clears when it is read",
  );
});

test("the bulk snooze's Undo says they are back in the Inbox -- a snooze lets go of whoever had them, so not 'back where they were'", async () => {
  const { seen, render } = page([rosa, mine]);
  // The courier's own asks go to the server, which takes each of them.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    seen.list.onToggleSelect(rosa.id);
    render();
    seen.list.onToggleSelect(mine.id);
    render();
    await seen.list.onBulkSnooze();
    let tree = render();
    const toasts = () =>
      findAll(tree, (n) => typeof n.props?.className === "string" && n.props.className.startsWith("pp-toast "));
    buttonNamed(
      toasts().find((t) => /snoozed/.test(textOf(t))),
      "Undo",
    ).props.onClick();
    // The wake asks the server for each thread, and says so when the last has answered.
    await until(() => {
      tree = render();
      return /Snooze undone/.test(toasts().map(textOf).join(" | "));
    }, "the wake said they are back");
    const said = toasts().map(textOf).join(" | ");
    assert.match(said, /Snooze undone — 2 back in the Inbox/);
    assert.ok(
      !said.includes("back where"),
      "REGRESSION: 'back where they were', for a thread whose claim the snooze had let go",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* --------------------------------- the list --------------------------------- */

test("each row says whose it is -- nothing more where the bucket already says Needs you, 'You have it', 'Ana García has it' -- and waits in amber only when the wait is on you", () => {
  globalThis.window.__TEAM = TEAM;
  try {
    fresh();
    const draw = (over = {}) => again(() => InboxList(listProps(over)));
    let tree = draw();
    const row = (who) => find(tree, (n) => n.props?.role === "option" && textOf(n).includes(who));
    // The pills as drawn: the spans, not the StatePill elements that draw them.
    const pills = (r) => findAll(r, (n) => n.type === "span" && hasClass("ix-state-pill")(n)).map(textOf);
    assert.deepEqual(pills(row("Rosa Díaz")), [], "REGRESSION: 'NEEDS YOU' on every row of the Needs you bucket");
    assert.deepEqual(pills(row("Nina Park")), ["You have it"], "REGRESSION: a thread you own read NEEDS YOU");
    assert.deepEqual(pills(row("Ada Lovelace")), ["Ana García has it"]);
    const amber = (who) => hasClass("pill-warn")(find(row(who), hasClass("ix-wait")));
    assert.deepEqual(
      [amber("Rosa Díaz"), amber("Nina Park"), amber("Ada Lovelace")],
      [true, false, false],
      "REGRESSION: a thread you have waited in amber as if it were waiting on you",
    );
    assert.equal(
      find(tree, hasClass("ix-list-head")),
      null,
      "REGRESSION: the list's head said the chip's number again ('1 needs you · 2 being answered'), and once '3 threads' under a chip that counts what needs you",
    );

    // A search spans every bucket, so a row there says Needs you again -- only the one that does.
    find(tree, (n) => n.props?.["data-testid"] === "inbox-search").props.onChange({
      target: { value: "a" },
    });
    tree = draw();
    assert.equal(textOf(find(tree, hasClass("ix-list-count"))), "4 matches", "a search says what it found");
    assert.deepEqual(
      ["Rosa Díaz", "Nina Park", "Ada Lovelace", "Zoe Martin"].map((who) => pills(row(who))),
      [["Needs you"], ["You have it"], ["Ana García has it"], ["Didn't send"]],
      "REGRESSION: a search listed a thread you own as Needs you",
    );

    fresh();
    tree = draw({ threads: [unsent], allThreads: [unsent], activeBucket: "done", activeThreadId: unsent.id });
    assert.deepEqual(
      pills(row("Zoe Martin")),
      ["Didn't send"],
      "REGRESSION: a Handled row whose last reply never left looked like every other",
    );
  } finally {
    globalThis.window.__TEAM = null;
  }
});

/* -------------------------------- the badge -------------------------------- */

test("the badge's first count is the chip's: what needs you, not every flagged thread nobody in this tab holds, and none before the Inbox is read", () => {
  setSurfaceValue("inbox", undefined);
  assert.equal(needsYouNow(), null, "a count of what nothing has read is no count: the seeded threads are no one's");
  inboxWith([rosa, mine, anas, unsent]);
  assert.equal(needsYouNow(), 1, "REGRESSION: it counted Ana's thread as waiting on you until the Inbox mounted");
});

/* --------------------------- a reply about to send --------------------------- */

// A quiet thread whose receptionist reply is queued behind its hold window. Its times are the real clock's, because
// the page counts down to the SERVER's deadline with Date.now(), not to the fixture's hour.
const sendingThread = () => {
  const at = new Date(Date.now() - 30_000).toISOString();
  return toInboxThreadVM(
    conv("c5", "Jess Park", {
      state: "open",
      last_message_at: at,
      messages: [
        wrote("m-c5", "Is Thursday free?", 5),
        {
          id: "m-c5d",
          direction: "outbound",
          sender: "ai",
          type: "text",
          body: "Thursday at 2 works — shall I book it?",
          media: null,
          meta: { delay_ms: 90_000 },
          status: "queued",
          created_at: at,
          channel_ts: null,
        },
      ],
    }),
    null,
    ZONE,
    NOW,
  );
};

test("REGRESSION: a reply about to send is at the top of Needs you, counted by the chip and the badge -- it sat in Handled, on a row that said nothing about it", () => {
  VW_STORE.state = {};
  const jess = sendingThread();
  assert.equal(jess.state, "done", "the thread itself is quiet: nobody asked for a person");
  assert.ok(jess.veto && jess.veto.endsAtMs > Date.now(), "and its reply is still counting down");
  assert.deepEqual([ixSending(jess), ixBucketOf(jess), ixWaitsOnYou(jess)], [true, "escalated", true]);
  assert.equal(ixWaitsOnYou(unsent), false, "a thread with nothing on its way does not");

  const { seen } = page([rosa, mine, anas, unsent, jess]);
  assert.equal(seen.list.activeBucket, "escalated");
  assert.deepEqual(
    seen.list.threads.map((t) => t.who),
    ["Jess Park", "Rosa Díaz"],
    "first, above what needs a person -- and only what waits on you is in the bucket with them",
  );
  assert.equal(seen.pane.thread.who, "Jess Park", "and it is the thread the page opens on");
  const chip = (id) => seen.list.buckets.find((b) => b.id === id).count;
  assert.deepEqual(
    [chip("escalated"), chip("done")],
    [2, 3],
    "the chip counts it and matches its own list; Handled holds the rest and not this one while it counts down",
  );
  assert.equal(seen.list.threads.length, chip("escalated"), "the chip is the length of the list under it");
  assert.equal(needsYouNow(), 2, "the badge is that same number");
  inboxWith([rosa, mine, anas, unsent, jess]);
  assert.equal(needsYouNow(), 2, "and reads the same rule when the Inbox is not mounted");

  // Held: the countdown stops, and the thread is quiet again -- in the badge as in the chip, before the cancel's re-read.
  VW_STORE.state = { [`draft:${jess.veto.messageId}`]: { held: true } };
  assert.deepEqual(
    [ixSending(jess), ixBucketOf(jess), ixWaitsOnYou(jess)],
    [false, "done", false],
    "a held draft claims nothing",
  );
  assert.equal(needsYouNow(), 1, "REGRESSION: the badge kept the reply this tab had just held, one over the chip");
  VW_STORE.state = {};
  // Past its last second it is Handled again, until the re-read says what actually happened.
  assert.equal(ixBucketOf(jess, jess.veto.endsAtMs + 1), "done");
});

test("the row says the seconds, where the time it last moved would be", () => {
  const jess = sendingThread();
  fresh();
  const tree = again(() =>
    InboxList(
      listProps({
        threads: [jess, rosa],
        allThreads: [jess, rosa],
        activeThreadId: jess.id,
        sendingIn: (id) => (id === jess.id ? 72 : null),
      }),
    ),
  );
  const row = (who) => find(tree, (n) => n.props?.role === "option" && textOf(n).includes(who));
  assert.equal(textOf(find(row("Jess Park"), hasClass("ix-sending"))).trim(), "sending in 72s");
  assert.equal(
    find(row("Jess Park"), hasClass("ix-thread-time")),
    null,
    "REGRESSION: its row said when it last moved, and nothing about the reply going out",
  );
  assert.equal(find(row("Rosa Díaz"), hasClass("ix-sending")), null, "only the thread whose reply is on its way");
});

/* ---- one count: the chip, the badge and Today's headline are the same rule (the 2 Oct 2026 audit; OW1) ---- */

/** The wire's threads the salon's Inbox holds, with the escalation each has open: the rows the page and Today both read. */
const wireThread = (id, name, over, esc) => ({ dto: conv(id, name, over), esc });
const sendingDto = () => {
  const at = new Date(Date.now() - 30_000).toISOString();
  return conv("c5", "Jess Park", {
    state: "open",
    last_message_at: at,
    messages: [
      wrote("m-c5", "Is Thursday free?", 5),
      { ...ours("m-c5d", "ai", "Thursday at 2 works.", 0, "queued"), created_at: at, meta: { delay_ms: 90_000 } },
    ],
  });
};
const pastDeadlineDto = () =>
  conv("c6", "Lee Chen", {
    state: "open",
    messages: [
      wrote("m-c6", "Any slots?", 30),
      { ...ours("m-c6d", "ai", "Friday at 3 works.", 20, "queued"), meta: { delay_ms: 10 * 60_000 } },
    ],
  });
const salon = () => [
  wireThread("c1", "Rosa Díaz", {}, asked("c1", 90)),
  wireThread(
    "c2",
    "Nina Park",
    { paused_until: later, assignee_user_id: "u-me", assignee_is_me: true },
    asked("c2", 120),
  ),
  wireThread(
    "c3",
    "Ada Lovelace",
    { paused_until: later, assignee_user_id: ANA, assignee_is_me: false },
    asked("c3", 150),
  ),
  { dto: conv("c4", "Zoe Martin", { state: "open", messages: [wrote("m-c4", "Can I book at 3?", 30)] }), esc: null },
  { dto: sendingDto(), esc: null },
  { dto: pastDeadlineDto(), esc: null },
];

test("conversationWaitsOnYou: nobody has it, or a reply is counting down; not a draft past its deadline, not a teammate's thread", async () => {
  const { conversationWaitsOnYou } = await import("@chanlytics/contracts");
  const open = (over = {}) =>
    conv("c-w", "Rosa Díaz", {
      state: "open",
      paused_until: null,
      assignee_user_id: null,
      assignee_is_me: false,
      ...over,
    });
  const esc = { id: "e1", reason: "human_token", details: null, state: "open", created_at: ago(5) };
  assert.equal(conversationWaitsOnYou(open(), esc, NOW), true, "an open escalation nobody has");
  assert.equal(
    conversationWaitsOnYou(open({ assignee_user_id: ANA, assignee_is_me: false }), esc, NOW),
    false,
    "a teammate's",
  );
  const draft = (min) => ({
    ...ours("d1", "ai", "Friday at 3 works.", min, "queued"),
    meta: { delay_ms: 10 * 60_000 },
  });
  assert.equal(
    conversationWaitsOnYou(open({ messages: [wrote("m1", "Any slots?", 2), draft(1)] }), null, NOW),
    true,
    "counting down",
  );
  assert.equal(
    conversationWaitsOnYou(open({ messages: [wrote("m1", "Any slots?", 30), draft(20)] }), null, NOW),
    false,
    "past its deadline: the job's to send",
  );
  assert.equal(conversationWaitsOnYou(open({ messages: [wrote("m1", "Any slots?", 2)] }), null, NOW), false, "quiet");
});

test("the wire's count is the chip's: each thread waits on you on the wire exactly when the Inbox's row says it does", async () => {
  const { conversationWaitsOnYou } = await import("@chanlytics/contracts");
  const now = new Date();
  VW_STORE.state = {};
  const rows = salon();
  const wire = rows.map(({ dto, esc }) => conversationWaitsOnYou(dto, esc, now));
  const chip = rows.map(({ dto, esc }) => ixWaitsOnYou(toInboxThreadVM(dto, esc, ZONE, now), now.getTime()));
  assert.deepEqual(wire, chip, "REGRESSION: Today counted what needs a person and left the replies counting down out");
  assert.deepEqual(wire, [true, false, false, false, true, false], "Rosa, and Jess whose reply is on its way");
});

/** The wire as the salon's Today reads it: the routes' answers, the metrics as the page's own fixtures write them. */
const todayWire = (rows, replies) => {
  const metrics = {
    workspace: { name: "Marisa's Beauty Salon", timezone: ZONE, status: "active" },
    channels: [{ kind: "whatsapp", status: "active", number: "+13055550188" }],
    window: {
      days: 1,
      since: "2026-09-15T04:00:00+00:00",
      since_local: "2026-09-15T00:00:00",
      now_local: "2026-09-15T10:00:00",
    },
    now: {
      escalations_open: 3,
      oldest_open_escalation_at: ago(150),
      threads_needing_human: 3,
      threads_snoozed: 0,
      threads_awaiting_reply: 0,
      last_inbound_at: null,
      last_outbound_at: null,
    },
    period: {
      messages_in: 0,
      messages_out_ai: 0,
      messages_out_you: 0,
      conversations_active: 0,
      answered_by_ai: 0,
      answered_by_you: 0,
      unanswered_in_window: 0,
      median_reply_seconds_ai: null,
      send_failures: 0,
      escalations_new: 0,
      escalation_reasons: {},
      calls: 0,
      call_seconds: 0,
      call_sentiments: {},
      calls_voicemail: 0,
      new_contacts: 0,
    },
  };
  const answers = {
    "/api/v1/metrics": { metrics },
    "/api/v1/conversations": { conversations: rows.map((r) => r.dto) },
    "/api/v1/escalations": {
      escalations: rows.flatMap((r) => (r.esc ? [{ ...r.esc, conversation_id: r.dto.id }] : [])),
    },
    "/api/v1/calls": { calls: [] },
    "/api/v1/lead-searches": { searches: [] },
    // The readings of replies to reach-outs, when the case has some: a route the wire does not answer is a read that failed.
    ...(replies ? { "/api/v1/reach-out-replies": { replies, mailbox: null } } : {}),
  };
  globalThis.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    let data = answers[u.pathname];
    // A read of threads by their ids (Today's of the holds past the hundred) is answered with those threads alone, as the
    // route answers it.
    const ids = u.searchParams.get("ids");
    if (data && u.pathname === "/api/v1/conversations" && ids) {
      const wanted = new Set(ids.split(","));
      data = { conversations: data.conversations.filter((c) => wanted.has(c.id)) };
    }
    return new Response(
      JSON.stringify(data ? { ok: true, data } : { ok: false, error: { code: "not_found", message: "no" } }),
      {
        status: data ? 200 : 404,
        headers: { "content-type": "application/json" },
      },
    );
  };
};

test("Today sends no number for the badge: it reads, and the badge is the selector over the Inbox's threads -- a reply held in the tab is not put back by a Today read", async () => {
  const realFetch = globalThis.fetch;
  try {
    const { todayOverride } = await import(`${S}/surfaces/today/override.ts`);
    VW_STORE.state = {};
    const inbox = salon().map(({ dto, esc }) => toInboxThreadVM(dto, esc, ZONE, new Date()));
    inboxWith(inbox);
    const jess = inbox[4];
    assert.equal(
      needsYouNow(),
      inbox.filter((t) => ixWaitsOnYou(t)).length,
      "the chip's own number: Rosa, and Jess whose reply is on its way",
    );
    // The owner presses Hold: the cancel's re-read has not landed, so the thread still carries its draft.
    VW_STORE.state = { [`draft:${jess.veto.messageId}`]: { held: true } };
    assert.equal(needsYouNow(), 1, "the badge drops the held reply at once, as the chip does");
    // A Today refresh lands inside that window. It used to send the wire's 2 over the Inbox's 1 and nothing put the 1 back.
    todayWire(salon());
    sentCounts.length = 0;
    await todayOverride.apply();
    assert.deepEqual(sentCounts, [], "REGRESSION: Today sent a number for the badge, over the Inbox's");
    assert.equal(needsYouNow(), 1, "REGRESSION: the held reply was counted again until something else moved the badge");
    VW_STORE.state = {};
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Today's headline says the badge's number, and a flagged thread older than the newest hundred counts in both", async () => {
  const realFetch = globalThis.fetch;
  try {
    const { todayOverride } = await import(`${S}/surfaces/today/override.ts`);
    const { surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
    VW_STORE.state = {};
    // Rosa, Jess whose reply is counting down, and a customer flagged weeks ago whose thread is past the conversations
    // read's newest hundred: the escalations read holds it, the conversations read does not. The Inbox reads that
    // thread by id and counts it; Today published 2 over it on every read, and its headline said 2 as well.
    const old = wireThread("c9", "Lena Ruiz", {}, { ...asked("c9", 60 * 24 * 20) });
    const rows = salon();
    todayWire(rows);
    const wire = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = new URL(String(url), "https://app.chanlytics.com");
      // Today reads that customer's thread by its id too (readHeldThreads), as the Inbox does.
      if (u.pathname === "/api/v1/conversations" && u.searchParams.get("ids")?.split(",").includes(old.dto.id))
        return new Response(JSON.stringify({ ok: true, data: { conversations: [old.dto] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      const res = await wire(url);
      if (u.pathname !== "/api/v1/escalations") return res;
      const body = await res.json();
      body.data.escalations.push({ ...old.esc, conversation_id: old.dto.id });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    await todayOverride.apply();
    // The Inbox reads that customer's thread by id and counts it: the same rows, the same rule, the badge's number.
    const inbox = [...rows, old].map(({ dto, esc }) => toInboxThreadVM(dto, esc, ZONE, new Date()));
    inboxWith(inbox);
    assert.equal(
      needsYouNow(),
      3,
      "the badge: Rosa, Jess whose reply is counting down, and the customer flagged weeks ago",
    );
    assert.equal(
      surfaceValue("today")?.standing.headline,
      "3 conversations need you.",
      "REGRESSION: the headline counted escalations alone, so a reply counting down was on the badge and not here",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a Today load asks for the replies to reach-outs once, as the surface that holds them does: Today asks for none of its own", async () => {
  const realFetch = globalThis.fetch;
  try {
    const { todayOverride } = await import(`${S}/surfaces/today/override.ts`);
    const { repliesOverride } = await import(`${S}/legacy-bridge/reach-out/replies.ts`);
    const reading = (conversation_id, intent) => ({ conversation_id, intent, undone: false, claim: "person" });
    const requests = [];
    const asked = () => requests.filter((u) => u.includes("/api/v1/reach-out-replies")).length;
    /** The wire as the salon's Today reads it, with every request it receives recorded. */
    const wire = () => {
      requests.length = 0;
      VW_STORE.state = {};
      todayWire(salon(), [reading("c4", "wrong_person")]);
      const answer = globalThis.fetch;
      globalThis.fetch = (url, init) => {
        requests.push(String(url));
        return answer(url, init);
      };
    };

    wire();
    await todayOverride.apply();
    assert.equal(
      asked(),
      0,
      "REGRESSION: Today read the replies a second time (and the head a third) over the surface that holds them",
    );

    // What a Today load runs: its own surface and the replies it draws beside it (surface-registry ROUTE_DRAWS).
    wire();
    await Promise.all([todayOverride.apply(), repliesOverride.apply()]);
    assert.equal(asked(), 1, "one read of the replies on a Today load, the one main makes");
    assert.deepEqual(
      globalThis.__REPLIES.replies.map((r) => [r.conversation_id, r.intent]),
      [["c4", "wrong_person"]],
      "and the surface holds what Today lays over its rows",
    );

    // A read that fails is none: the replies are null, and Today takes nobody for gone (helpers.ts readings).
    wire();
    todayWire(salon());
    await repliesOverride.apply().catch(() => {});
    assert.equal(globalThis.__REPLIES, null);
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__REPLIES;
  }
});

/** A row of the settings read's templates, as the Inbox's picker is made of it: one WhatsApp message in a state. */
const tplRow = (name, over = {}) => ({
  id: `t-${name}`,
  channel: "whatsapp",
  name,
  language: "en_US",
  meta_status: "approved",
  hidden_at: null,
  category: "utility",
  variables: [],
  body_preview: `Words of ${name}`,
  ...over,
});
/** What the settings surface publishes of the templates (legacy-bridge/surfaces/settings.ts), and no more than the Inbox's picker reads of it. */
const settingsOf = (rows) => ({ templatesAll: rows, templateVersions: [], messages: [] });

test("the Inbox asks for no templates, however often it reads again: its picker is the settings read's as it stands -- absent while that is read, null where it failed", async () => {
  const realFetch = globalThis.fetch;
  try {
    const { inboxOverride } = await import(`${S}/surfaces/inbox/surface.ts`);
    const { inboxData } = await import(`${S}/surfaces/inbox/store.ts`);
    const requests = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      const answers = {
        "/api/v1/conversations": { conversations: [] },
        "/api/v1/escalations": { escalations: [] },
        "/api/v1/workspaces": { workspaces: [] },
      };
      const data = answers[new URL(String(url), "https://app.chanlytics.com").pathname];
      return new Response(
        JSON.stringify(data ? { ok: true, data } : { ok: false, error: { code: "not_found", message: "no" } }),
        { status: data ? 200 : 404, headers: { "content-type": "application/json" } },
      );
    };
    const asked = () => requests.filter((u) => u.includes("/api/v1/templates")).length;
    setSurfaceValue("settings", undefined);

    // Three passes as the feed brings them: a message, its receipt, a flag.
    await inboxOverride.apply();
    await inboxOverride.apply();
    await inboxOverride.apply();
    assert.equal(
      asked(),
      0,
      "REGRESSION: the templates were read again with every message the Inbox read again for (B12)",
    );
    assert.equal(
      inboxData().templates,
      undefined,
      "Settings is not read yet: the picker is still reading, not 'none approved'",
    );
    assert.equal(inboxData().templatesHeld, undefined);

    // Settings lands: the Inbox is made of it with no read of its own, and says why the rest are left out.
    setSurfaceValue(
      "settings",
      settingsOf([
        tplRow("welcome"),
        tplRow("still_in_review", { meta_status: "pending" }),
        tplRow("put_away", { hidden_at: "2026-10-01T00:00:00Z" }),
      ]),
    );
    assert.deepEqual(
      inboxData().templates.map((t) => t.name),
      ["welcome"],
      "the approved, shown messages of WhatsApp",
    );
    assert.deepEqual(inboxData().templatesHeld, { pending: 1, rejected: 0, paused: 0, disabled: 0, hidden: 1 });
    await inboxOverride.apply();
    assert.deepEqual(
      inboxData().templates.map((t) => t.name),
      ["welcome"],
      "and the Inbox's own read keeps what Settings holds",
    );

    // A templates read that failed on Settings is 'could not read' on the Inbox, which is still drawn.
    setSurfaceValue("settings", { ...settingsOf([]), templatesAll: null });
    assert.equal(inboxData().templates, null);
    assert.equal(inboxData().templatesHeld, null);
    await inboxOverride.apply();
    assert.equal(inboxData().templates, null);
    assert.equal(inboxData().THREADS.length, 0, "the Inbox still lists its threads");
    assert.equal(asked(), 0, "and not once did it read a template");
  } finally {
    globalThis.fetch = realFetch;
    setSurfaceValue("settings", undefined);
  }
});

test("a template approved while the Inbox is reading is in its picker: the Inbox takes the settings read as it stands when it publishes, not as it stood when it began", async () => {
  const realFetch = globalThis.fetch;
  try {
    const { inboxOverride } = await import(`${S}/surfaces/inbox/surface.ts`);
    const { inboxData } = await import(`${S}/surfaces/inbox/store.ts`);
    const { AFTER } = await import(`${S}/legacy-bridge/refresh-map.ts`);
    let release = () => {};
    const held = new Promise((resolve) => (release = resolve));
    globalThis.fetch = async (url) => {
      const path = new URL(String(url), "https://app.chanlytics.com").pathname;
      // The conversations answer is on the way when the member saves a template and Settings is read again.
      if (path === "/api/v1/conversations") await held;
      const data = {
        "/api/v1/conversations": { conversations: [] },
        "/api/v1/escalations": { escalations: [] },
        "/api/v1/workspaces": { workspaces: [] },
      }[path];
      return new Response(
        JSON.stringify(data ? { ok: true, data } : { ok: false, error: { code: "not_found", message: "no" } }),
        { status: data ? 200 : 404, headers: { "content-type": "application/json" } },
      );
    };
    setSurfaceValue("settings", settingsOf([tplRow("before_the_save")]));
    const reading = inboxOverride.apply();
    // The save's own refresh names Settings alone, as the bridge runs it after the write (refresh-map's templates group)...
    assert.deepEqual(
      AFTER["POST templates"]().map((o) => o.key),
      ["settings"],
      "a template written re-reads the one read of the templates",
    );
    // ...and Settings' read lands while the Inbox's is still out.
    setSurfaceValue("settings", settingsOf([tplRow("before_the_save"), tplRow("after_the_save")]));
    release();
    await reading;
    assert.deepEqual(
      inboxData().templates.map((t) => t.name),
      ["before_the_save", "after_the_save"],
      "REGRESSION: the picker offered the list from before the save for five minutes",
    );
  } finally {
    globalThis.fetch = realFetch;
    setSurfaceValue("settings", undefined);
  }
});
