/**
 * Where a page's time goes (decision 0053, 00412), run over doubles: the shell's own measures (client/page-speed.ts)
 * over a clock that only moves when told and frames that paint when told, what a wait went on from the reads that
 * landed in it, the browser's five as the reporter turns them into reports (client/field-data-reporter.ts), the back
 * office's read of page_speed and page_spots, and the card's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { PAGE_SPEED_MIN, PRIMARY_PART, pageSpeedWords } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { createPageSpeed, waitOf, readKeyOf, notACustomer } =
  await import("../../../../apps/dashboard/src/client/page-speed-rules.ts");
const { reportOf, detailOf } = await import("../../../../apps/dashboard/src/client/field-data-reporter.ts");
const { platformSpeed } = await import("../../../../apps/dashboard/src/server/platform/vitals.ts");

/** The rules over a clock set by hand and frames painted when the test says: each report, and each measure's name. */
function speedRig(waits = () => undefined) {
  let now = 0;
  const frames = [];
  const reports = [];
  const measures = [];
  const speed = createPageSpeed({
    now: () => now,
    afterPaint: (fn) => frames.push(fn),
    emit: (r) => reports.push(r),
    waits,
    measure: (name, start, end) => measures.push([name, start, end]),
  });
  return {
    speed,
    reports,
    measures,
    set: (t) => (now = t),
    /** The next frame painted at `t`: every callback waiting for it runs. */
    paint: (t) => {
      now = t;
      for (const fn of frames.splice(0)) fn(t);
    },
  };
}

test("a load's parts are timed from the document's start, and its first part is the page's READY with what it waited on", () => {
  const waited = [];
  const rig = speedRig((page, from, to) => {
    waited.push([page, from, to]);
    return { wait: "metrics", wait_ms: 600 };
  });
  rig.speed.begin("today", { from: null, at: 0, warm: false, cold: true });
  rig.set(800);
  rig.speed.partBegins({ page: "today", part: "setup", key: "", warm: true, changed: false }, 800);
  rig.speed.partReady("today", "setup", "");
  rig.paint(900);
  assert.deepEqual(
    rig.reports,
    [{ name: "READY", value: 900, page: "today", part: "setup", warm: false }],
    "held only if the page was",
  );
  rig.speed.partBegins({ page: "today", part: "queue", key: "", warm: false, changed: false }, 900);
  rig.set(1300);
  rig.speed.partReady("today", "queue", "");
  rig.paint(1400);
  assert.equal(PRIMARY_PART.today, "queue");
  assert.deepEqual(rig.reports.slice(1), [
    { name: "READY", value: 1400, page: "today", part: "queue", warm: false },
    { name: "READY", value: 1400, page: "today", warm: false, detail: { wait: "metrics", wait_ms: 600 } },
  ]);
  assert.deepEqual(waited, [["today", 0, 1400]]);
  assert.deepEqual(
    rig.measures.map(([n]) => n),
    ["today.setup ready", "today.queue ready", "today ready"],
  );
  // A part said ready twice is said once.
  rig.speed.partReady("today", "queue", "");
  rig.paint(1500);
  assert.equal(rig.reports.length, 3);
});

test("a move is timed from its press and says the page it left; a part of another page says nothing", () => {
  const rig = speedRig();
  rig.speed.begin("today", { from: null, at: 0, warm: true, cold: false });
  rig.speed.begin("calendar", { from: "today", at: 5000, warm: true, cold: false });
  rig.speed.partBegins({ page: "today", part: "queue", key: "", warm: true, changed: false }, 5010);
  rig.speed.partReady("today", "queue", "");
  rig.speed.partBegins({ page: "calendar", part: "board", key: "", warm: true, changed: false }, 5020);
  rig.speed.partReady("calendar", "board", "");
  rig.paint(5180);
  assert.deepEqual(rig.reports, [
    { name: "READY", value: 180, page: "calendar", part: "board", from: "today", warm: true },
    { name: "READY", value: 180, page: "calendar", from: "today", warm: true },
  ]);
});

test("a part that opens one thing at a time is timed from the press that opened each, as a move inside its page", () => {
  const rig = speedRig();
  rig.speed.begin("inbox", { from: "today", at: 1000, warm: true, cold: false });
  rig.set(1010);
  rig.speed.partBegins({ page: "inbox", part: "thread", key: "th-1", warm: true, changed: false }, 1010);
  rig.speed.partReady("inbox", "thread", "th-1");
  rig.paint(1100);
  rig.set(4000);
  rig.speed.partBegins({ page: "inbox", part: "thread", key: "th-2", warm: false, changed: true }, 3950);
  rig.set(4080);
  rig.speed.partReady("inbox", "thread", "th-2");
  rig.paint(4090);
  assert.deepEqual(rig.reports, [
    { name: "READY", value: 100, page: "inbox", part: "thread", from: "today", warm: true },
    { name: "READY", value: 140, page: "inbox", part: "thread", from: "inbox", warm: false },
  ]);
  assert.equal(rig.reports.filter((r) => !r.part).length, 0, "a thread opened is never the page's own READY");
});

test("a part first begun once its page was drawn is timed from the press that opened it, never from the page's start", () => {
  const rig = speedRig();
  rig.speed.begin("campaigns", { from: "today", at: 0, warm: true, cold: false });
  rig.set(10);
  rig.speed.partBegins({ page: "campaigns", part: "list", key: "", warm: true, changed: false }, 10);
  rig.speed.partReady("campaigns", "list", "");
  rig.paint(200);
  assert.equal(PRIMARY_PART.campaigns, "list");
  // Nothing was open as the list arrived: the first sequence opened, seconds later, mounts its part afresh.
  rig.set(5000);
  rig.speed.partBegins({ page: "campaigns", part: "record", key: "seq-1", warm: false, changed: false }, 4980);
  rig.set(5140);
  rig.speed.partReady("campaigns", "record", "seq-1");
  rig.paint(5150);
  assert.deepEqual(rig.reports, [
    { name: "READY", value: 200, page: "campaigns", part: "list", from: "today", warm: true },
    { name: "READY", value: 200, page: "campaigns", from: "today", warm: true },
    { name: "READY", value: 170, page: "campaigns", part: "record", from: "campaigns", warm: false },
  ]);
  // A sequence the address opened as the page arrived is the page's own wait, timed from its start.
  const load = speedRig();
  load.speed.begin("campaigns", { from: null, at: 0, warm: false, cold: true });
  load.speed.partBegins({ page: "campaigns", part: "record", key: "seq-1", warm: false, changed: false }, 0);
  load.speed.partBegins({ page: "campaigns", part: "list", key: "", warm: false, changed: false }, 0);
  load.speed.partReady("campaigns", "record", "seq-1");
  load.speed.partReady("campaigns", "list", "");
  load.paint(900);
  assert.deepEqual(
    load.reports.find((r) => r.part === "record"),
    {
      name: "READY",
      value: 900,
      page: "campaigns",
      part: "record",
      warm: false,
    },
  );
});

test("a begin said twice at once is one (strict mode), and a part drawn afresh later is a move inside its page", () => {
  const rig = speedRig();
  rig.speed.begin("people", { from: "today", at: 0, warm: true, cold: false });
  rig.set(10);
  rig.speed.partBegins({ page: "people", part: "table", key: "", warm: true, changed: false }, 10);
  rig.speed.partReady("people", "table", "");
  rig.set(20);
  rig.speed.partBegins({ page: "people", part: "table", key: "", warm: true, changed: true }, 20);
  rig.speed.partReady("people", "table", "");
  rig.paint(60);
  assert.equal(rig.reports.filter((r) => r.part === "table").length, 1, "the second begin, 10 ms on, was the same");
  rig.set(2000);
  rig.speed.partBegins({ page: "people", part: "table", key: "", warm: true, changed: false }, 1900);
  rig.speed.partReady("people", "table", "");
  rig.paint(2050);
  assert.deepEqual(rig.reports.at(-1), {
    name: "READY",
    value: 150,
    page: "people",
    part: "table",
    from: "people",
    warm: true,
  });
});

test("a page with no first part is READY at the frame after its gate opened, once", () => {
  const rig = speedRig();
  assert.equal(PRIMARY_PART.reports, undefined);
  rig.speed.begin("reports", { from: "today", at: 100, warm: false, cold: true });
  rig.speed.gate("reports");
  rig.speed.gate("reports");
  rig.paint(700);
  rig.speed.gate("reports");
  rig.paint(800);
  assert.deepEqual(rig.reports, [{ name: "READY", value: 600, page: "reports", from: "today", warm: false }]);
  rig.speed.begin("today", { from: "reports", at: 900, warm: true, cold: false });
  rig.speed.gate("today");
  rig.paint(950);
  assert.equal(rig.reports.length, 1, "a page with a first part waits for it, not for the gate");
});

test("SETTLED is said once, and only where a surface the page draws had still to be read", () => {
  const rig = speedRig(() => ({ wait: "contacts" }));
  rig.speed.begin("today", { from: null, at: 0, warm: true, cold: true });
  rig.speed.settle("today");
  rig.speed.settle("today");
  rig.paint(3000);
  assert.deepEqual(rig.reports, [
    { name: "SETTLED", value: 3000, page: "today", warm: true, detail: { wait: "contacts" } },
  ]);
  rig.speed.begin("inbox", { from: "today", at: 4000, warm: true, cold: false });
  rig.speed.settle("inbox");
  rig.paint(4050);
  assert.equal(rig.reports.length, 1, "everything already read is no news");
});

test("a page hidden before it was drawn says nothing, and nothing past a minute is a person waiting", () => {
  const rig = speedRig();
  rig.speed.begin("calendar", { from: "today", at: 0, warm: false, cold: true });
  rig.speed.partBegins({ page: "calendar", part: "board", key: "", warm: false, changed: false }, 0);
  rig.speed.partReady("calendar", "board", "");
  rig.speed.lose();
  rig.paint(400);
  assert.deepEqual(rig.reports, []);
  rig.speed.begin("people", { from: "calendar", at: 1000, warm: false, cold: true });
  rig.speed.partBegins({ page: "people", part: "table", key: "", warm: false, changed: false }, 1000);
  rig.speed.partReady("people", "table", "");
  rig.paint(1000 + 61_000);
  assert.deepEqual(rig.reports, []);
});

/** A resource as the watch keeps it. */
const landed = (kind, name, end, duration, server = []) => ({ kind, name, end, duration, server });

test("a wait went on the page's own read that landed last, the chunk it waited for, and the time left to draw", () => {
  const reads = [
    landed("read", "http://app/api/v1/contacts?workspace=acme", 300, 250, [
      { name: "auth", duration: 2, description: "" },
      { name: "app", duration: 180, description: "" },
      { name: "db", duration: 140, description: "6" },
    ]),
    landed("read", "http://app/api/v1/billing?workspace=acme", 420, 60),
    landed("chunk", "http://app/_next/static/chunks/leads.js", 380, 90),
    landed("read", "http://app/api/v1/views?workspace=acme", 50, 40),
  ];
  assert.deepEqual(waitOf(reads, 100, 500, { own: new Set(["contacts", "segments"]) }), {
    wait: "contacts",
    wait_ms: 250,
    server_ms: 182,
    db_ms: 140,
    db_n: 6,
    chunk_ms: 90,
    render_ms: 120,
  });
  assert.equal(waitOf(reads, 100, 500).wait, "billing", "with no read of its own, the last to land");
  assert.equal(waitOf(reads, 600, 700), undefined, "nothing landed, nothing to say");
  const router = [landed("read", "http://app/w/acme/calendar?_rsc=1x2y", 260, 210)];
  assert.deepEqual(waitOf(router, 50, 300, { own: new Set(["page"]) }), { wait: "page", wait_ms: 210, render_ms: 40 });
});

test("a move waits on the router's fetch of the page it moved to, never on another page warmed beside it", () => {
  const own = new Set(["page", "workspaces", "open"]);
  const fetches = [
    landed("read", "http://app/w/acme/people?_rsc=1x2y", 200, 120),
    // The sidebar warmed the Calendar while People was on its way, and it landed after People's fetch.
    landed("read", "http://app/w/acme/calendar?_rsc=3z4w", 280, 150),
  ];
  assert.deepEqual(waitOf(fetches, 50, 300, { own, here: "/w/acme/people" }), {
    wait: "page",
    wait_ms: 120,
    render_ms: 100,
  });
  assert.equal(
    waitOf(fetches, 50, 300, { own, here: "/w/acme/people/" }).wait,
    "page",
    "a trailing slash is the same page",
  );
  // Nothing of its own landed: the warm is what landed last, and says it was a warm.
  assert.deepEqual(waitOf(fetches.slice(1), 50, 300, { own, here: "/w/acme/people" }), {
    wait: "warm",
    wait_ms: 150,
    render_ms: 20,
  });
});

test("a read is named by its route's words alone: never an id, a query or a workspace", () => {
  assert.equal(
    readKeyOf("http://app/api/v1/contacts/5f0c9a3e-1111-4222-8333-444455556666/notes?workspace=acme"),
    "contacts/notes",
  );
  assert.equal(readKeyOf("/api/v1/reports/campaigns?period=30d&workspace=acme"), "reports/campaigns");
  assert.equal(readKeyOf("/api/v1/calendar?around=today"), "calendar");
  assert.equal(readKeyOf("/api/v1/conversations/th-1234"), "conversations");
  assert.equal(readKeyOf("/_next/static/chunks/x.js"), null);
});

/** A web-vitals metric as the attribution build hands it over. */
const metric = (over) => ({ id: "v6-1-2", value: 300, navigationType: "navigate", attribution: {}, ...over });
/** A load that landed on Today, moved to the Inbox at 5,000 and to People at 9,000 (installPageSpeed's timeline). */
const host = {
  landing: "today",
  pageAt: (t) =>
    t >= 9000
      ? { page: "people", from: "inbox" }
      : t >= 5000
        ? { page: "inbox", from: "today" }
        : { page: "today", from: null },
};

test("the browser's five as reports: a load's are its landing page's, a move's are the page it reached and the page it left", () => {
  assert.deepEqual(reportOf(metric({ name: "TTFB", value: 111 }), host), { id: "v6-1-2", name: "TTFB", value: 111 });
  const soft = metric({
    name: "LCP",
    value: 450,
    navigationType: "soft-navigation",
    navigationURL: "http://app/w/acme/inbox",
    navigationStartTime: 5003,
    attribution: {
      target: "ix-last-word",
      timeToFirstByte: 0,
      resourceLoadDelay: 0,
      resourceLoadDuration: 0,
      elementRenderDelay: 450,
    },
  });
  assert.deepEqual(reportOf(soft, host), {
    id: "v6-1-2",
    name: "LCP",
    value: 450,
    page: "inbox",
    from: "today",
    detail: {
      el: "ix-last-word",
      ttfb_ms: 0,
      load_delay_ms: 0,
      load_ms: 0,
      render_delay_ms: 450,
      phase: "render_delay",
    },
  });
  assert.equal(
    reportOf(metric({ name: "TTFB", navigationType: "soft-navigation" }), host),
    null,
    "a move has no first byte",
  );
  assert.equal(reportOf(metric({ name: "FCP", navigationType: "soft-navigation" }), host), null);
  // A browser without soft navigations counts a tap over the whole document: it was on the page on screen at the time.
  const tap = reportOf(
    metric({
      name: "INP",
      value: 240,
      attribution: {
        interactionTime: 9400,
        interactionTarget: "people-add",
        interactionType: "pointer",
        inputDelay: 10,
        processingDuration: 200,
        presentationDelay: 30,
        loadState: "complete",
      },
    }),
    host,
  );
  assert.deepEqual(
    [tap.page, tap.from, tap.detail.el, tap.detail.phase, tap.detail.processing_ms],
    ["people", "inbox", "people-add", "processing", 200],
  );
});

test("an element is said by the code's own words: a row's id is taken out, and a selector with ids is not said", () => {
  const inp = (target) =>
    detailOf(
      metric({
        name: "INP",
        attribution: { interactionTarget: target, inputDelay: 1, processingDuration: 2, presentationDelay: 3 },
      }),
    );
  assert.equal(inp("ld-row-5f0c9a3e-1111-4222-8333-444455556666").el, "ld-row-x");
  assert.equal(inp("th-12345").el, "th-x");
  assert.equal(inp("html>body>div#app>button.kit-btn").el, undefined, "the library's own selector names ids");
  assert.equal(inp("span.ix-thread-who").el, "span.ix-thread-who");
  const shift = detailOf(
    metric({
      name: "CLS",
      value: 0.12,
      attribution: { largestShiftTarget: "today-card", largestShiftValue: 0.11, loadState: "complete" },
    }),
  );
  assert.deepEqual(shift, { el: "today-card", shift: 0.11, state: "complete" });
  assert.equal(detailOf(metric({ name: "TTFB" })), undefined);
});

test("the back office reads where the time goes and the elements together; unread says null, a database before 00412 none", async () => {
  const speedRow = {
    metric: "READY",
    page: "inbox",
    part: "",
    how: "move",
    device: "desk",
    warm: "held",
    samples: 40,
    p75: 210,
    waits_on: "page",
    since: "2026-10-12T00:00:00Z",
  };
  const spot = { metric: "INP", page: "inbox", el: "inbox-approve", samples: 12, p75: 340, phase: "processing" };
  const asked = [];
  const office = (rpcs) => ({ db: fakeDb({}, {}, rpcs), session: null });
  const read = await platformSpeed(
    office({
      page_speed: (args) => (
        asked.push(["page_speed", args]),
        [speedRow, { ...speedRow, how: "sideways", device: "watch", warm: "maybe" }]
      ),
      page_spots: (args) => (asked.push(["page_spots", args]), [spot]),
    }),
  );
  assert.deepEqual(asked, [
    ["page_speed", { p_days: 7, p_most: 50_000 }],
    ["page_spots", { p_days: 7, p_most: 50_000 }],
  ]);
  assert.deepEqual(read.rows[0], {
    metric: "READY",
    page: "inbox",
    part: "",
    how: "move",
    device: "desk",
    warm: "held",
    samples: 40,
    p75: 210,
    waits_on: "page",
  });
  assert.deepEqual(
    [read.rows[1].how, read.rows[1].device, read.rows[1].warm],
    ["all", "unknown", "unknown"],
    "a word the card does not know is none of its own",
  );
  assert.deepEqual(read.spots, [
    { metric: "INP", page: "inbox", el: "inbox-approve", samples: 12, p75: 340, phase: "processing" },
  ]);
  const refuse = (code) => () => {
    throw Object.assign(new Error(code), { code });
  };
  assert.equal(await platformSpeed(office({ page_speed: refuse("57014"), page_spots: () => [] })), null);
  assert.deepEqual(await platformSpeed(office({ page_speed: refuse("PGRST202"), page_spots: () => [] })), {
    rows: [],
    spots: [],
  });
  assert.equal(await platformSpeed(office({})), null, "a call that throws before it answers is unread too");
});

test("the card: each page by its moves and loads, slowest first; the parts drawn last; the taps that waited longest", () => {
  const n = PAGE_SPEED_MIN;
  const row = (page, part, how, p75, over = {}) => ({
    metric: "READY",
    page,
    part,
    how,
    device: "all",
    warm: "all",
    samples: n,
    p75,
    waits_on: null,
    ...over,
  });
  const vm = pageSpeedWords({
    rows: [
      row(null, "", "move", 300, { samples: 640 }),
      row(null, "", "load", 1200, { samples: 120 }),
      row("calendar", "", "load", 1800, { waits_on: "calendar" }),
      row("calendar", "", "move", 900),
      row("calendar", "", "move", 200, { warm: "held", samples: 14 }),
      row("calendar", "", "move", 1300, { warm: "read", samples: 6, waits_on: "calendar" }),
      row("calendar", "", "move", 1100, { device: "phone" }),
      { ...row("calendar", "", "load", 2600), metric: "SETTLED" },
      row("inbox", "", "move", 150),
      row("inbox", "thread", "all", 90),
      row("today", "look", "all", 1400, { waits_on: "contacts" }),
      row("people", "", "move", 9000, { samples: n - 1 }),
    ],
    spots: [
      { metric: "INP", page: "inbox", el: "inbox-approve", samples: 12, p75: 340, phase: "processing" },
      { metric: "INP", page: "today", el: "today-queue", samples: 3, p75: 900, phase: "input" },
      { metric: "CLS", page: "today", el: "today-card", samples: 15, p75: 0.02, phase: null },
    ],
  });
  assert.equal(
    vm.sentence,
    "Of 640 moves in the last 7 days, three in four drew their page within 300 ms; of 120 page loads, within 1.2 s.",
  );
  assert.deepEqual(
    vm.pages.map((p) => [p.label, p.value, p.tone]),
    [
      ["Calendar", "900 ms", "warn"],
      ["Inbox", "150 ms", "ok"],
    ],
    "slowest move first; a page fewer moves reached than it takes to say something left out",
  );
  // The parts' card counts what drew a part, the page's own READY apart: the Calendar's held and read moves were too few
  // alone to be named, and its phone figure stood on its own rows.
  assert.equal(
    vm.pages[0].hint,
    "Opened 1.8 s · moved to 900 ms · all in 2.6 s · waits on calendar · on a phone 1.1 s · 20 moves",
  );
  assert.deepEqual(
    vm.parts.map((p) => [p.label, p.value]),
    [
      ["Today · Worth a look", "1.4 s"],
      ["Inbox · a thread opened", "90 ms"],
    ],
  );
  assert.equal(vm.parts[0].hint, "1.4 s · 20 times drawn · waits on contacts");
  assert.deepEqual(
    vm.taps.map((t) => [t.label, t.hint]),
    [["inbox-approve on Inbox", "340 ms · 12 taps · mostly in the page's own handlers"]],
    "a tap fewer than ten times said is an anecdote",
  );
  assert.deepEqual(vm.shifts, [], "a shift too small to feel is not named");
  assert.equal(pageSpeedWords(null).sentence, "Where the pages' time goes could not be read just now.");
  assert.equal(
    pageSpeedWords({ rows: [], spots: [] }).sentence,
    "Not enough pages have said where their time went in the last 7 days.",
  );
});

test("a step put off on the numbers says its number against its line, and warns once past it", () => {
  const people = (p75, samples = PAGE_SPEED_MIN) => ({
    metric: "READY",
    page: "people",
    part: "",
    how: "move",
    device: "all",
    warm: "all",
    samples,
    p75,
    waits_on: null,
  });
  const step3 = (rows) => pageSpeedWords({ rows, spots: [] }).deferred.find((d) => d.key === "people-projection");
  const taken =
    "Taken when People's moves pass 500 ms, three in four, or when a workspace passes 500 people (decision 0053).";
  assert.deepEqual(step3([people(254)]), {
    key: "people-projection",
    label: "Step 3, People without everyone",
    value: "254 ms of 500 ms",
    tone: "ok",
    hint: taken,
  });
  const past = step3([people(620)]);
  assert.deepEqual(
    [past.value, past.tone, past.hint],
    ["620 ms of 500 ms", "warn", `${taken} Past its line: take it.`],
  );
  const few = step3([people(9000, PAGE_SPEED_MIN - 1)]);
  assert.deepEqual([few.value, few.tone], ["too few moves", "ok"], "too few moves say nothing about the line");
  assert.deepEqual(pageSpeedWords(null).deferred, [], "a read that failed holds no number to set against a line");
});

test("a browser no customer is in sends nothing: one a test drives, and the Claude app's own browser pane", () => {
  // The pane's user agent, as it says itself (28 Oct 2026): its walks were counted as a customer's loads.
  const pane =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/3.6556.2 Chrome/152.0.7977.167 Safari/537.36 MSIX";
  const chrome =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
  assert.equal(notACustomer({ webdriver: false, userAgent: pane }), true);
  assert.equal(notACustomer({ webdriver: true, userAgent: chrome }), true);
  assert.equal(notACustomer({ webdriver: false, userAgent: chrome }), false);
  assert.equal(notACustomer({ userAgent: iphone }), false);
  // A word that only ends in the app's name is another app's, and its loads are counted.
  assert.equal(notACustomer({ userAgent: `${chrome} MyClaude/2.0` }), false);
  assert.equal(notACustomer({}), false);
});
