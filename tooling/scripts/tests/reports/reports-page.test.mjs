/**
 * The Reports page (apps/dashboard/src/surfaces/reports, TSX since decision 0015), EXECUTED on a stub React over the view
 * models the bridge publishes through the seam (surface-values.ts): the headline (the
 * receptionist's share, Worth knowing), the tiles compared in counts, every card under its testid with the view
 * model's own sentence, the empty, failed, unreadable-calendar and no-calendar states, a v2 payload, the period (the head's
 * act on a desk, a row of the page's own on a phone), a period that fails to load, Google's section, and the demo. The page's regressions live here too, moved from
 * reports-honest and rewritten for this page (C13, C25 to C28): every row a door, the period before drawn where it
 * reads, one keyboard stop per chart, a period control that never holds (the latest pick wins), and a table that
 * leaves the page. The period's own door (period.ts) runs for real, over a fetch this test holds, answers or refuses.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { toReportVM, toDealReportVM, REPORT_CHANNELS } from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  find,
  byTestId,
  textOf,
  classes,
  press,
  settle,
  atWidth,
} from "../_legacy-react.mjs";
import {
  reportDto,
  quiet,
  campaignDto,
  dealsDto,
  CALENDAR,
  NO_DEALS,
  DEALS,
  surface,
  rday,
  cday,
  googleConnection,
  reviewsDto,
  reviewsGoogle,
  reviewsHeld,
  reviewsLedger,
  writtenReview,
} from "./_report-world.mjs";

const went = [];
const flashed = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
globalThis.__WORKSPACES = [
  {
    id: "w1",
    slug: "harbor",
    name: "Harbor Studio",
    status: "active",
    timezone: "America/New_York",
    sells_by: "proposal",
    role: "owner",
  },
];
globalThis.__ACTIVE_WORKSPACE = "w1";
const S = "../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { RPT_CHANNELS } = await import(`${S}/surfaces/reports/series.ts`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);
const { reviewsSample } = await import(`${S}/surfaces/reports/sample.ts`);
const { setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { startSurfaces } = await import(`${S}/legacy-bridge/surface-runner.ts`);
// The shell's doors, which the surface reaches through the bridge's verbs (surfaces/legacy-verbs.ts).
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  usePPToast: () => [null, (m) => flashed.push([m.tone, textOf(m.msg)])],
  canDo: () => true,
});
// The page reads through the runner, which the period's own door refreshes through; nothing to boot.
const stopRunner = startSurfaces([], () => () => {});
after(() => stopRunner());
const realConsoleError = console.error;
console.error = () => {};
after(() => {
  console.error = realConsoleError;
});

/* ------------- the period's read: period.ts over a fetch this test holds, answers or refuses ------------- */

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const period = { asked: [], held: [], mode: "hold" };
/** The days each period's answer says it covers (Month on this fixture's day: four). */
const DAYS_OF = { "7d": 7, "30d": 30, "90d": 90, month: 4 };
const answer = (id) =>
  json(200, {
    ok: true,
    data: {
      report: reportDto({ days: DAYS_OF[id] }),
      booking: { ...CALENDAR, days: DAYS_OF[id] },
      deals: null,
    },
  });
/**
 * A reply posted to a review, and what the answer's re-read of the Reviews surface finds (null: no reply is on its way). The route
 * accepts the reply, then the refresh map re-reads Google and the Reviews read, which this serves as Google's now holds the review.
 */
const reviewReply = { posted: [], reread: 0, googleReads: 0, now: null };
globalThis.window.fetch = async (url, init) => {
  const u = new URL(String(url), "https://app.test");
  if (reviewReply.now) {
    if (/\/google\/reviews\/[^/]+\/reply$/.test(u.pathname)) {
      reviewReply.posted.push(JSON.parse(String(init?.body ?? "{}")).comment);
      return json(200, { ok: true, data: { ok: true } });
    }
    if (u.pathname.endsWith("/google")) {
      reviewReply.googleReads += 1;
      return json(200, { ok: true, data: { google: reviewReply.now.google } });
    }
    if (u.pathname.endsWith("/reports/reviews")) {
      reviewReply.reread += 1;
      return json(200, { ok: true, data: reviewReply.now });
    }
  }
  if (/\/reports\/(campaigns|reach-outs)$/.test(u.pathname))
    return json(500, { ok: false, error: { code: "internal", message: "not read here" } });
  if (!u.pathname.endsWith("/reports")) return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  const id = u.searchParams.get("period");
  period.asked.push(id);
  if (period.mode === "refuse") return json(500, { ok: false, error: { code: "internal", message: "down" } });
  if (period.mode === "answer") return answer(id);
  return new Promise((res) => period.held.push({ id, res }));
};
/** A period asked for and held is answered (it lands) or refused (it fails), and the read behind it is over. */
const land = async () => {
  for (const h of period.held.splice(0)) h.res(answer(h.id));
  for (let i = 0; i < 12; i++) await settle();
};
const refuse = async () => {
  for (const h of period.held.splice(0)) h.res(json(500, { ok: false, error: { code: "internal", message: "down" } }));
  for (let i = 0; i < 12; i++) await settle();
};
const inPeriodTest = async (mode, run) => {
  period.mode = mode;
  period.asked.length = 0;
  try {
    await run();
  } finally {
    await refuse();
    period.mode = "hold";
  }
};

/** Reports' lenses' addresses, in the strip's order: the page's old whole is these six drawn one after another. */
const LENS_PATHS = ["", "/receptionist", "/people", "/pipeline", "/campaigns", "/reviews"].map(
  (l) => `/w/harbor/reports${l}`,
);
/** The lens the address names: the Overview, unless a test says another. */
let lensAt = LENS_PATHS[0];
const draw = () => ReportsPage({ pathname: lensAt });
/** One lens drawn over what `set` puts in the surface, as a person at its address sees it. */
const drawOnce = (set) => {
  set();
  fresh();
  went.length = 0;
  return draw();
};
const pageOnce = (opts) => drawOnce(() => setSurfaceValue("reports", surface(opts)));
/**
 * Every lens's body in one tree, for what a test reads across the old page (a card, a row, a sentence). The Overview is drawn
 * last, so the frame the stub keeps (what `redraw` draws again, and where a press's state lands) is the Overview's, whose period
 * row the tests press.
 */
const across = (set) => {
  const trees = new Map();
  for (const path of [...LENS_PATHS].reverse()) {
    lensAt = path;
    trees.set(path, drawOnce(set));
  }
  lensAt = LENS_PATHS[0];
  return { type: "Fragment", props: { children: LENS_PATHS.map((path) => trees.get(path)) } };
};
const page = (opts) => across(() => setSurfaceValue("reports", surface(opts)));
/** A test that presses a card of one lens: that lens is the page the stub keeps, so a press's state lands where it is drawn again. */
const inLens = (n, run) => {
  lensAt = LENS_PATHS[n];
  try {
    return run();
  } finally {
    lensAt = LENS_PATHS[0];
  }
};
const redraw = () => again(draw);
const card = (tree, id) => byTestId(tree, id);
const plot = (tree, id) => find(card(tree, id), (n) => classes(n).includes("ck-plot"));
const cls = (tree, c) => find(tree, (n) => classes(n).includes(c));
const { Segmented } = await import(`${S}/surfaces/kit/segmented/segmented.tsx`);
const { Field } = await import(`${S}/surfaces/kit/field/field.tsx`);
const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);
const { standingSaid } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { Popover } = await import(`${S}/surfaces/kit/popover/popover.tsx`);
const { MonthRange } = await import(`${S}/surfaces/kit/datepicker/month-range.tsx`);
// What the period's button opens loads on demand in the app (period-picker.tsx, held by periods/period-picker.test.mjs); the page's
// tests read and press it open, so it is loaded first, as a pointer on the button loads it.
const { loadPeriodPopover } = await import("../../../../apps/dashboard/src/surfaces/reports/period-picker.tsx");
await loadPeriodPopover();
/**
 * What a person sees of the page: its tree, and on a desk what it said to the frame's head as its act (the period, at the right of
 * the strip of lenses), which the frame draws beside it. The stub's window is a desk's: it matches no width query.
 */
const seen = (tree) => ({ type: "Fragment", props: { children: [tree, standingSaid()?.act ?? null] } });
/** A phone's frame for one run: the window answers the frame's `(max-width: 900px)` as a phone's does. */
const onAPhone = (run) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    media: q,
    matches: q === "(max-width: 900px)",
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    return run();
  } finally {
    globalThis.matchMedia = was;
  }
};
/** The period control: the kit's segmented control, and the option a person presses, by its words. */
const control = (tree) => find(seen(tree), (n) => n.type === Segmented);
/** What is said of a period that failed to load, beside the control. */
const failedLine = (tree) => cls(seen(tree), "rpt-failed");
const choose = (tree, label) => {
  const c = control(tree);
  c.props.onValueChange(c.props.options.find((o) => o.label === label).value);
};
const chosen = (tree) => {
  const c = control(tree);
  return c.props.options.find((o) => o.value === c.props.value)?.label;
};
const takeaway = (tree, id) => textOf(find(card(tree, id), (n) => classes(n).includes("ck-card-takeaway")));

/* ------------------------------------------ the headline ------------------------------------------ */

test("the headline: the receptionist's part of the answered as a meter, the period before as a tick, the view model's sentence under it", () => {
  const hero = card(page(), "reports-hero");
  assert.equal(textOf(cls(hero, "rpt-hero-number")), "76%");
  assert.equal(
    textOf(cls(hero, "rpt-hero-line")),
    "13 of 17 customer messages, without you. Half of its replies went out within 28s.",
  );
  assert.equal(textOf(cls(hero, "rpt-hero-compare")), "100% the 7 days before");
  assert.ok(cls(hero, "ck-radial-marker"), "the period before, a tick on the ring");
  const none = card(page({ report: quiet() }), "reports-hero");
  assert.equal(textOf(cls(none, "rpt-hero-line")), "No customer wrote in this period.");
  assert.equal(cls(none, "rpt-hero-number"), null, "no share of nothing: the ring's centre stays empty");
  assert.equal(cls(none, "ck-radial-value"), null, "an empty ring");
  assert.equal(cls(none, "rpt-hero-compare"), null, "and nothing to compare with");
});

test("Worth knowing: the bridge's facts in their order, one line each, a row with a door is one link", () => {
  const facts = all(card(page(), "reports-facts"), (n) => n.type === "li");
  assert.deepEqual(
    facts.map((f) => f.props["data-fact"]),
    ["unanswered", "handovers", "busiest"],
  );
  assert.equal(textOf(facts[0]), "1 message has no reply yetOpen the Inbox");
  assert.ok(classes(facts[0]).includes("is-warn"), "in amber, with its icon");
  assert.equal(textOf(facts[1]), "Top reason it handed over: asked for a person2 timesSee them");
  assert.equal(textOf(facts[2]), "Tuesday was your busiest daypeak 10am to 12pm");
  const row = find(facts[0], (n) => n.type === "a");
  assert.ok(classes(row).includes("rpt-fact-row"), "the whole row is the door, and a door is a link");
  assert.match(row.props.href, /inbox$/, "REGRESSION: a button that went nowhere a link could: no address in it");
  assert.equal(
    row.props.title,
    undefined,
    "no native title: the sentence is the row's words, wrapped, never cut short",
  );
  press(row);
  assert.deepEqual(went, ["inbox"]);
  assert.equal(
    find(facts[2], (n) => n.type === "a" || n.type === "button"),
    null,
    "a fact with no door is no link and no button",
  );
});

test("a period that had people in it but nothing to act on says so in one line", () => {
  // Every day of the week alike (no one busiest day), nothing unanswered, no handover, no channel counted.
  const even = {
    series: reportDto().series.map((d, i) => (i < 7 ? d : rday(d.day, { messages_in: 2, answered_ai: 2 }))),
    reasons: {},
    channels: undefined,
    hours: undefined,
    replies: undefined,
  };
  assert.equal(
    textOf(card(page({ report: even, campaigns: null }), "reports-facts")),
    "Worth knowingA quiet period. Nothing stood out.",
  );
});

test("the strip's figures: five counts, each named by its metric, the period before said in counts beside the value, booked from the calendar", () => {
  const read = (t) => [
    t.props["data-figure"],
    textOf(cls(t, "figure-term") ?? cls(t, "figure-label")),
    ...["figure-value", "figure-meta"].map((c) => textOf(cls(t, c))),
  ];
  const figures = (opts) =>
    all(card(page(opts), "reports-tiles"), (n) => n.type === "div" && classes(n).includes("figure")).map(read);
  assert.deepEqual(figures(), [
    ["customer_messages", "Customer messages", "17up from 7", "on 6 of 7 days"],
    ["calls", "Calls", "3none the 7 days before", "7 min on the phone · 1 to voicemail"],
    ["new_people", "New people", "2down from 3", "first contact in this period, by evidence"],
    ["booked", "Booked", "3", "of 8 who asked"],
    ["handovers", "Needed you", "3none the 7 days before", "times the receptionist stopped"],
  ]);
  assert.deepEqual(figures({ booking: { calendar: "none", days: 7, asked: 0, booked: 0 } })[3], [
    "booked",
    "Booked",
    "—",
    "no calendar to read",
  ]);
  assert.deepEqual(figures({ booking: { calendar: "unavailable", days: 7, asked: 4, booked: 0 } })[3], [
    "booked",
    "Booked",
    "—",
    "the calendar could not be read",
  ]);
  const strip = card(page(), "reports-tiles");
  assert.equal(strip.type, "dl", "terms and their values");
  assert.deepEqual(all(strip, (n) => n.type === "dt").length, 5);
});

/* ------------------------------------------ the cards ------------------------------------------ */

test("every card is drawn, under the testids the e2e, Today and the Google tests read, in three sections", () => {
  const tree = page();
  for (const id of [
    "chart-answered",
    "chart-reply",
    "chart-reasons",
    "chart-calls",
    "chart-booking",
    "chart-channels",
    "chart-rhythm",
    "chart-people",
    "chart-funnel",
    "chart-campaigns",
    "chart-sources",
  ])
    assert.ok(card(tree, id), id);
  assert.deepEqual(all(tree, (n) => n.type === "h2").map(textOf), [
    "Worth knowing",
    "The receptionist",
    "Your customers",
    "Campaigns",
  ]);
  assert.equal(
    find(tree, (n) => n.type === "section" && n.props["aria-label"] === "This period").props.className,
    "rpt-grid rpt-top",
  );
});

test("each card's one line is the view model's, and adds the next thing: never a number the hero, a tile or a legend gives", () => {
  const tree = page();
  assert.equal(takeaway(tree, "chart-answered"), "Most messages on Sep 1: 5.");
  assert.equal(takeaway(tree, "chart-reply"), "The slowest took 33m.", "eight replies: too few for a nine-in-ten");
  assert.equal(
    takeaway(tree, "chart-calls"),
    "About 2m 10s a call.",
    "390 seconds over 3 calls; the minutes and the voicemail are the tile's",
  );
  assert.equal(takeaway(tree, "chart-channels"), "Mostly WhatsApp, as the 7 days before.");
  assert.equal(takeaway(tree, "chart-rhythm"), "Nothing on Monday.", "the busy side of the week is Worth knowing's");
  assert.equal(takeaway(tree, "chart-funnel"), "3 people said yes to messages, 2 people asked to stop.");
  assert.equal(
    takeaway(tree, "chart-campaigns"),
    "From 3 broadcast and playbook runs.",
    "the sends are the funnel's; the card says what sent them",
  );
  for (const id of ["chart-reasons", "chart-people", "chart-booking"])
    assert.equal(takeaway(tree, id), "", `${id}: its tile already says it`);
});

test("'every message was answered without you' is said only when it is true", () => {
  const without = page({
    report: {
      reasons: {},
      series: reportDto().series.map((d) => ({ ...d, answered_you: 0, unanswered: 0, escalations: 0 })),
    },
  });
  assert.ok(textOf(card(without, "chart-reasons")).includes("every message was answered without you"));
  const said = textOf(card(page({ report: { reasons: {} } }), "chart-reasons"));
  assert.ok(!said.includes("without you") && said.includes("answered by you or by nobody"), said);
});

test("the channels in messages and calls, their colour fixed by channel, the week round the radar and the hours under it", () => {
  const tree = page();
  const pie = card(tree, "chart-channels");
  assert.equal(textOf(cls(pie, "ck-pie-center")), "20messages and calls");
  assert.deepEqual(
    all(pie, (n) => classes(n).includes("ck-slice")).map((s) => s.props.fill),
    ["var(--color-whatsapp)", "var(--color-voice)", "var(--color-email)", "var(--color-sms)"],
  );
  assert.equal(pie.props.style["--color-voice"], "var(--chart-cat-2)", "the card publishes the channel colours");
  const rhythm = card(tree, "chart-rhythm");
  assert.equal(all(rhythm, (n) => classes(n).includes("ck-cell")).length, 24, "a cell an hour");
});

test("a caller's mood and the reply spread are part-bars in their own order, each part in its colour and its word", () => {
  const tree = page();
  const mood = byTestId(card(tree, "chart-calls"), "caller-mood");
  assert.deepEqual(
    [mood.props.style["--color-Positive"], mood.props.style["--color-Neutral"]],
    ["var(--ok)", "var(--chart-prior)"],
  );
  assert.equal(textOf(find(mood, (n) => classes(n).includes("ck-legend"))), "Positive2Neutral1");
  const spread = byTestId(card(tree, "chart-reply"), "reply-spread");
  assert.deepEqual(
    all(
      find(spread, (n) => classes(n).includes("ck-segbar-bar")),
      (n) => n.type === "i",
    ).map((i) => i.props.style.background),
    ["var(--color-lt15)", "var(--color-lt60)", "var(--color-lt300)", "var(--color-lt1800)", "var(--color-gte1800)"],
    "fastest first: 4, 8 and 12s; 15 and 40s; 70s; 400s; 2000s",
  );
  assert.equal(spread.props.style["--color-lt15"], "var(--chart-ramp-5)", "the fastest the darkest ink");
});

test("with a hold set the reply card draws it: the chart's one reference is the hold and the spread is said against it; with none there is neither", () => {
  const held = Array.from({ length: 8 }, () => ({ day: "2026-09-01", s: 63, hold: 60 }));
  const reply = card(page({ report: { replies: held, reply_seconds: held.map((r) => r.s) } }), "chart-reply");
  assert.equal(textOf(cls(reply, "ck-ref")), "1-minute hold");
  const spread = byTestId(reply, "reply-spread");
  assert.equal(textOf(cls(spread, "ck-segbar-title")), "Every reply, against your hold");
  assert.deepEqual(
    all(
      find(spread, (n) => classes(n).includes("ck-segbar-bar")),
      (n) => n.type === "i",
    ).map((i) => i.props.style.background),
    ["var(--color-atEnd)"],
    "every reply went out as the hold ended: one part",
  );
  const plain = card(page(), "chart-reply");
  assert.equal(cls(plain, "ck-ref"), null, "no hold: no yardstick the owner never set");
  assert.equal(textOf(cls(byTestId(plain, "reply-spread"), "ck-segbar-title")), "Every reply, by how long it took");
});

/* --- phase A through the page (the Reports lenses spec, D14 and A2): the hold the owner set, and the hours they keep --- */

/** The workspace's hours as the surface reads them: Monday to Friday 9 to 6, Saturday 10 to 2, and no Sunday. */
const HOURS = {
  profile: {
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "10:00", close: "14:00" },
    },
  },
};
const quarter = (h, m = 0) => h * 4 + Math.floor(m / 15);
/** What came in by the quarter hour: 2 + 4 + 2 while open, and 1 + 2 + 3 + 1 = 7 while closed, by HOURS. */
const ARRIVALS = [
  { d: "2026-08-29", q: quarter(11), n: 2 }, // Saturday, open 10 to 2
  { d: "2026-08-29", q: quarter(15, 30), n: 1 }, // after closing
  { d: "2026-08-30", q: quarter(12), n: 2 }, // Sunday: no hours
  { d: "2026-09-01", q: quarter(10), n: 4 }, // Tuesday, open
  { d: "2026-09-01", q: quarter(20), n: 3 }, // Tuesday evening
  { d: "2026-09-03", q: quarter(8, 45), n: 1 }, // Thursday, before opening
  { d: "2026-09-03", q: quarter(14), n: 2 }, // open
];
/** Most replies waited the 60-second hold and went out as it ended; one had none, and three took longer, one in each span. */
const HELD = [
  ...Array.from({ length: 8 }, () => ({ day: "2026-09-01", s: 62, hold: 60 })),
  { day: "2026-08-29", s: 6, hold: 0 },
  { day: "2026-08-30", s: 100, hold: 60 },
  { day: "2026-09-03", s: 200, hold: 60 },
  { day: "2026-09-04", s: 600, hold: 60 },
];
const factOf = (tree, id) => find(card(tree, "reports-facts"), (n) => n.props?.["data-fact"] === id);

test("the page says the hold and the closed hours: the hero, the speed chart's yardstick, the spread's five rows, and what came while closed", () => {
  const tree = page({
    report: { replies: HELD, reply_seconds: HELD.map((r) => r.s), arrivals: ARRIVALS },
    ...HOURS,
  });
  assert.equal(
    textOf(cls(card(tree, "reports-hero"), "rpt-hero-line")),
    "13 of 17 customer messages, without you. 8 of 12 went out as your 1-minute hold ended.",
    "the hold, never the speed the setting made",
  );
  const reply = card(tree, "chart-reply");
  assert.equal(textOf(cls(reply, "ck-ref")), "1-minute hold", "the speed chart's one reference is the owner's hold");
  const spread = byTestId(reply, "reply-spread");
  assert.equal(textOf(cls(spread, "ck-segbar-title")), "Every reply, against your hold");
  assert.deepEqual(
    all(spread, (n) => classes(n).includes("ck-legend-item")).map(textOf),
    ["with no hold1", "as the hold ended8", "up to 1m later1", "1 – 5m later1", "over 5m later1"],
    "five rows, each with its count",
  );
  assert.equal(takeaway(tree, "chart-reply"), "3 replies took longer than the hold, at most 9m more.");
  assert.equal(
    textOf(factOf(tree, "busiest")),
    "Tuesday was your busiest daypeak 10am to 12pm, 7 while you were closed",
    "counted by the workspace's own hours and closures",
  );
  assert.equal(factOf(tree, "hours"), null, "hours said: no door to set them");
});

test("a workspace with no hours is asked for them through the page, with the door to Settings; an unread profile is asked nothing", () => {
  // Nothing unanswered and no handover, so the third fact has room: Worth knowing keeps three.
  const calm = {
    series: reportDto().series.map((d) => ({ ...d, unanswered: 0, escalations: 0 })),
    reasons: {},
    arrivals: ARRIVALS,
  };
  const tree = page({ report: calm, campaigns: null, profile: {} });
  const hours = factOf(tree, "hours");
  assert.equal(textOf(hours), "Set your business hours to see what came in while you were closedOpen Settings");
  assert.ok(
    !textOf(factOf(tree, "busiest")).includes("closed"),
    "and no count of what a guess would have called closed",
  );
  press(find(hours, (n) => n.type === "a"));
  assert.deepEqual(went, ["admin/workspace"], "the door opens Settings, where the hours are kept");
  const unread = page({ report: calm, campaigns: null, profile: null });
  assert.equal(factOf(unread, "hours"), null, "a profile that could not be read says nothing of the hours");
});

test("the channels are contracts' words, in contracts' order, each in the colour kept for it", () => {
  assert.deepEqual(
    Object.keys(RPT_CHANNELS),
    REPORT_CHANNELS.map((c) => c.key),
    "in the order a chart lists them",
  );
  for (const { key, label } of REPORT_CHANNELS)
    assert.equal(RPT_CHANNELS[key].label, label, `${key} says contracts' word`);
  assert.deepEqual(Object.fromEntries(Object.entries(RPT_CHANNELS).map(([k, v]) => [k, v.color])), {
    whatsapp: "var(--chart-cat-1)",
    voice: "var(--chart-cat-2)",
    email: "var(--chart-cat-3)",
    sms: "var(--chart-cat-4)",
  });
});

test("when they reach you, as a table: the seven days, then the twenty-four hours", () =>
  inLens(2, () => {
    let tree = pageOnce();
    press(byTestId(card(tree, "chart-rhythm"), "card-table"));
    tree = redraw();
    const rows = all(card(tree, "chart-rhythm"), (n) => n.type === "tr")
      .slice(1)
      .map((r) => all(r, (c) => c.type === "td").map(textOf));
    assert.equal(rows.length, 31);
    assert.deepEqual(rows[1], ["Tuesday", "7", "1"]);
    assert.deepEqual(rows[7 + 10], ["10am to 11am", "7", "—"], "an hour has no period before to set beside it");
  }));

/* ------------------------------------------ states ------------------------------------------ */

test("a period with nothing in it: one card that says so, no Worth knowing, and the door to 90 days", async () => {
  await inPeriodTest("hold", async () => {
    const tree = page({ report: quiet() });
    const empty = card(tree, "reports-empty");
    assert.ok(textOf(empty).includes("Nobody wrote or called between Aug 29 and Sep 4."));
    assert.equal(card(tree, "chart-answered"), null, "no chart of nothing");
    assert.equal(card(tree, "reports-facts"), null, "the headline and this card already say it");
    press(find(empty, (n) => n.type === "button"));
    assert.deepEqual(period.asked, ["90d"]);
    await settle();
  });
});

test("the campaign read failing leaves the receptionist's numbers standing; nothing sent says so and opens Broadcasts", () => {
  const failed = page({ campaigns: null });
  assert.ok(textOf(card(failed, "chart-campaigns")).includes("The receptionist's own numbers above are current."));
  assert.ok(card(failed, "reports-hero") && card(failed, "chart-answered"), "the rest of the page stands");
  const nothing = page({
    campaigns: { ...campaignDto(), series: campaignDto().series.map((d) => cday(d.day)), sources: [] },
  });
  const c = card(nothing, "chart-campaigns");
  assert.ok(textOf(c).includes("Nothing went out"));
  press(find(c, (n) => n.type === "button"));
  assert.deepEqual(went, ["broadcasts"]);
});

test("asked, then booked: the share as a meter beside the view model's words, the calendar's sentence, or a failed read", () => {
  const ok = card(page(), "chart-booking");
  assert.equal(textOf(cls(ok, "rpt-booked-number")), "38%");
  assert.equal(
    textOf(cls(ok, "rpt-booked-copy")),
    "of the people who wrote or called in the last 7 days have an appointment on the calendar.",
  );
  const none = card(page({ booking: { calendar: "none", days: 7, asked: 0, booked: 0 } }), "chart-booking");
  assert.ok(textOf(none).includes("Connect your calendar under Settings › Business to see who booked."));
  press(find(none, (n) => n.type === "button"));
  assert.deepEqual(went, ["admin/workspace"]);
  const unread = card(page({ booking: { calendar: "unavailable", days: 7, asked: 4, booked: 0 } }), "chart-booking");
  assert.ok(
    textOf(unread).includes("Couldn't read your calendar"),
    "a calendar that could not be read is a failed read",
  );
  assert.ok(!textOf(unread).includes("Open Settings"), "not a missing one: no door to connect what is connected");
  assert.ok(
    textOf(card(page({ booking: { calendar: "ok", days: 7, asked: 0, booked: 0 } }), "chart-booking")).includes(
      "Nobody asked",
    ),
  );
});

test("asked, then booked: the share's other side sits on the card's foot, with the door to the people it names", () => {
  // 3 of 8 booked, so five are still waiting for a time: the half of the meter an owner can act on, and the only
  // place on the page that says it. The sentence is the view model's; the page adds no number of its own.
  const ok = card(page(), "chart-booking");
  const rest = byTestId(ok, "booked-rest");
  assert.ok(textOf(rest).includes("5 of the 8 who asked have nothing on the calendar yet."));
  // People keeps a list of these people already, so the door lands on that list and not on the page of everyone, and
  // it wears the list's name: the list counts its own month, this card counts the period above.
  assert.equal(textOf(byTestId(ok, "booked-rest-door")), "Asked, never booked");
  globalThis.__listRoute = (id) => `clients/seg:${id}`;
  try {
    press(byTestId(card(page(), "chart-booking"), "booked-rest-door"));
    assert.deepEqual(went, ["clients/seg:asked_never_booked"]);
  } finally {
    delete globalThis.__listRoute;
  }
  press(byTestId(card(page(), "chart-booking"), "booked-rest-door"));
  assert.deepEqual(went, ["clients"], "and on People itself before the lists are known");
  // Everybody booked: the good news, and nothing to open.
  const all8 = card(page({ booking: { calendar: "ok", days: 7, asked: 8, booked: 8 } }), "chart-booking");
  assert.equal(textOf(byTestId(all8, "booked-rest")), "Everyone who asked in the last 7 days has an appointment.");
  assert.equal(byTestId(all8, "booked-rest-door"), null);
  // Nothing counted, nothing said: no calendar, one that could not be read, and nobody asking.
  for (const booking of [
    { calendar: "none", days: 7, asked: 0, booked: 0 },
    { calendar: "unavailable", days: 7, asked: 4, booked: 0 },
    { calendar: "ok", days: 7, asked: 0, booked: 0 },
  ]) {
    assert.equal(byTestId(card(page({ booking }), "chart-booking"), "booked-rest"), null, booking.calendar);
  }
});

test("where they reach you: the same split the period before, under the donut, in its own counts", () => {
  const tree = page();
  const before = byTestId(card(tree, "chart-channels"), "channels-before");
  assert.ok(before, "a part-bar of the period before");
  assert.equal(textOf(find(before, (n) => classes(n).includes("ck-segbar-title"))), "The 7 days before");
  // Seven on WhatsApp then, twelve now: the legend's counts are the prior ones, which no tile and no donut gives.
  assert.ok(textOf(before).includes("WhatsApp") && textOf(before).includes("7"));
});

test("a v2 payload still draws: what it cannot know is said, never invented", () => {
  const v2 = reportDto();
  for (const k of ["replies", "channels", "hours"]) delete v2[k];
  const tree = across(() => setSurfaceValue("reports", { ...surface(), vm: toReportVM(v2) }));
  assert.ok(textOf(card(tree, "chart-channels")).includes("Not counted for this period yet."));
  assert.equal(takeaway(tree, "chart-channels"), "", "and no sentence about channels it never counted");
  assert.equal(plot(tree, "chart-reply"), null, "no speed line without the replies");
  assert.ok(byTestId(card(tree, "chart-reply"), "reply-spread"), "the spread still reads");
  assert.equal(cls(card(tree, "chart-rhythm"), "ck-heat"), null, "no hours without the grid");
});

test("the head names Reports on every lens with no way back above it: a lens is picked in the strip", () => {
  for (const path of LENS_PATHS) {
    lensAt = path;
    const tree = pageOnce();
    const said = standingSaid();
    assert.equal(said.title, "Reports", `${path}: the name`);
    assert.equal(said.back, null, `${path}: REGRESSION: "‹ Reports" stood over every lens but the Overview`);
    assert.equal(byTestId(tree, "reports-ask"), null, `${path}: and no Ask door: the period row asks nothing`);
  }
  lensAt = LENS_PATHS[0];
});

test("the period is a round button that opens the table's periods, each with a test id, the days in words and on a month", () => {
  const tree = page();
  const c = control(tree);
  assert.deepEqual(
    c.props.options.map((o) => [o.value, o.label, o.testid]),
    [
      ["7d", "7 days", "period-7d"],
      ["30d", "30 days", "period-30d"],
      ["90d", "90 days", "period-90d"],
      ["month", "Month", "period-month"],
    ],
  );
  assert.equal(c.props.label, "Period");
  const period = byTestId(seen(tree), "reports-period");
  const pop = find(period, (n) => n.type === Popover);
  // A glyph alone, as the Calendar's options are, opening it: named for a screen reader by the period and its days.
  const open = pop.props.trigger;
  assert.equal(open.props["data-testid"], "reports-period-open");
  assert.equal(open.props.iconOnly, true);
  assert.equal(open.props["aria-label"], "Period: Last 7 days, Aug 29 – Sep 4");
  assert.equal(pop.props.label, "Period", "what it opens names itself");
  assert.equal(textOf(byTestId(pop, "reports-period-range")), "Aug 29 – Sep 4", "the days in words");
  assert.match(textOf(cls(pop, "rpt-when-said")), /^Last 7 days · .+ time$/, "the period and the zone the days follow");
  const month = find(pop, (n) => n.type === MonthRange);
  assert.deepEqual(
    [month.props.from, month.props.to, month.props.today],
    ["2026-08-29", "2026-09-04", "2026-09-04"],
    "and on a month: the window's first day to today",
  );
});

test("the window picked shows at once, before its read lands: Month is the 1st to today", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    choose(tree, "Month");
    tree = redraw();
    const pop = find(seen(tree), (n) => n.type === Popover);
    assert.equal(
      textOf(byTestId(pop, "reports-period-range")),
      "Sep 1 – Sep 4",
      "said at once, from the business's today",
    );
    assert.match(textOf(cls(pop, "rpt-when-said")), /^This month so far · /);
    const month = find(pop, (n) => n.type === MonthRange);
    assert.deepEqual([month.props.from, month.props.to], ["2026-09-01", "2026-09-04"]);
  });
});

test("a period on its way keeps the one showing, dimmed by the one rule every page uses, and says it is busy", async () => {
  // The loading standard's H: Reports dimmed its own way (.rpt-body.is-loading, at once, to 0.55). It is the shared
  // rule now -- the page wears data-loading, the body data-dims (components.css): a beat before it dims, so a period
  // the tab holds (painted at once) never flickers.
  await inPeriodTest("hold", async () => {
    let tree = page();
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], undefined, "nothing on its way");
    choose(tree, "90 days");
    tree = redraw();
    assert.equal(byTestId(tree, "reports-real").props["data-loading"], "", "the page says its period is on its way");
    const body = cls(tree, "rpt-body");
    assert.equal(body.props["aria-busy"], "true");
    assert.equal(body.props["data-dims"], true, "and the body is what dims");
    assert.ok(!String(body.props.className).includes("is-loading"), "by the one rule, not a page's own");
    // The answer lands: its own read is published (the surface's fetchedAt moves), and the page clears what it held.
    await land();
    redraw(); // the effect that follows the new answer clears what the page held, and the next draw shows it
    tree = redraw();
    assert.equal(
      byTestId(tree, "reports-real").props["data-loading"],
      undefined,
      "the period landed: nothing on its way",
    );
    assert.equal(chosen(tree), "90 days", "and it is the period the read answered");
  });
});

test("a period that fails to load says so, keeps the one showing, and lets the tabs go again", async () => {
  // 30 days, which no test above has read: a period this tab holds paints at once (held views) and cannot fail to load.
  await inPeriodTest("refuse", async () => {
    let tree = page();
    choose(tree, "30 days");
    for (let i = 0; i < 12; i++) await settle();
    tree = redraw();
    assert.equal(textOf(failedLine(tree)), "Couldn't load 30 days. Still showing 7 days.");
    assert.equal(chosen(tree), "7 days", "the pick that failed is taken back: the control says what the page shows");
  });
});

/** Northside Studio on Google as the edge answers it: the listing, the Business Profile synced, and one review through it. */
const NORTHSIDE = {
  ready: { places: true, profile: true },
  listing: {
    place_id: "p-1",
    name: "Northside Studio",
    address: null,
    maps_uri: null,
    business_status: "OPERATIONAL",
    rating: 4.8,
    review_count: 213,
    linked_at: "2026-08-01T12:00:00Z",
    checked_at: "2026-09-04T12:00:00Z",
    check_error: null,
  },
  connection: {
    google_email: "owner@example.com",
    account_title: "Northside",
    location_name: "locations/1",
    location_title: "Northside Studio",
    connected_at: "2026-08-01T12:00:00Z",
    last_synced_at: "2026-09-04T12:00:00Z",
    sync_error: null,
  },
  reviews: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      review_id: "r-ana",
      origin: "profile",
      rating: 5,
      author: "Ana P.",
      author_uri: null,
      author_photo_uri: null,
      body: "Careful and kind.",
      language_code: "en",
      published_at: "2026-09-03T13:00:00Z",
      reply_text: null,
      replied_at: null,
      maps_uri: null,
      first_seen_at: "2026-09-03T14:00:00Z",
    },
  ],
  days: [
    { day: "2026-08-29", rating: 4.8, review_count: 205 },
    { day: "2026-09-01", rating: 4.8, review_count: 209 },
    { day: "2026-09-04", rating: 4.8, review_count: 213 },
  ],
  reply_mode: "ask",
};
/** The reviews on record when Ana's is the only one this week, and she has not been answered: the reply the receptionist held for her named a price. */
const northsideLedger = (over = {}) => {
  const [ana] = NORTHSIDE.reviews;
  return reviewsLedger({
    written: [writtenReview(ana.id, ana.published_at, 5)],
    waiting_total: 1,
    waiting: [{ ...ana, held: "price" }],
    ...over,
  });
};
/** The Reviews read for seven days, held as the surface holds it (the fold and its period), the period the strip shows and the read follows. */
const holdReviews = (google, ledger) => {
  keepReportPeriod("7d");
  const held = reviewsHeld(reviewsDto({ days: 7, google, ledger }));
  setSurfaceValue("reports_reviews", held);
  return held.vm;
};
const reviewRows = (tree) => all(tree, (n) => n.props?.["data-testid"] === "google-review");
const figureIds = (tree) => all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => n.props.id);
const sectionMeta = (tree) =>
  textOf(
    cls(
      find(tree, (n) => n.type === "section" && n.props["aria-label"] === "Google reviews"),
      "rpt-section-meta",
    ),
  );

test("Google's reviews under the period, from the Business Profile: five figures, the stars, the weeks, who waits and the latest, with the reply door", () => {
  const V = holdReviews(NORTHSIDE, northsideLedger());
  try {
    const tree = page();
    const section = find(tree, (n) => n.type === "section" && n.props["aria-label"] === "Google reviews");
    assert.ok(section, "a section of its own");
    assert.ok(sectionMeta(tree).startsWith("Northside Studio · checked "), sectionMeta(tree));
    assert.ok(sectionMeta(tree).includes(V.google.connection.words), "the Business Profile's own words, drawn");
    assert.ok(
      !sectionMeta(tree).includes("history on record"),
      "the record is whole: nothing to say of where it starts",
    );
    assert.deepEqual(
      all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => [n.props.id, n.props.value]),
      [
        ["rating", "4.8"],
        ["reviews", "213"],
        ["reviews_written", "1"],
        ["reviews_answered", "0 of 1"],
        ["review_reply_time", "—"],
      ],
      "the kit's Figure, in the strip's pattern, each named by its metric: five, from the reviews on record",
    );
    assert.ok(classes(byTestId(tree, "google-tiles")).includes("rpt-figures"), "the strip's own frame");
    assert.ok(
      classes(byTestId(tree, "google-tiles")).includes("profile") &&
        !classes(byTestId(tree, "google-tiles")).includes("listing"),
      "the profile's strip, named for what it counts and not for how many: five columns is the strip's own",
    );
    // The mix of the period's stars: a row to each, five down to one, and the page says what the fold says under it.
    assert.deepEqual(
      all(card(tree, "chart-reviews-stars"), (n) => classes(n).includes("ck-barlist-head")).map(textOf),
      ["5 stars1 · 100%", "4 stars0 · 0%", "3 stars0 · 0%", "2 stars0 · 0%", "1 star0 · 0%"],
    );
    assert.equal(takeaway(tree, "chart-reviews-stars"), V.lines.mix);
    assert.equal(V.lines.mix, "1 of the 1 review written in the last 7 days is 4 or 5 stars.");
    assert.ok(plot(tree, "chart-reviews-weekly"), "the weeks, on the kit");
    assert.equal(takeaway(tree, "chart-reviews-weekly"), V.lines.weekly);
    // Who waits: Ana, with the reply the receptionist wrote and held, and the door to answer her.
    const waiting = card(tree, "reviews-waiting");
    assert.equal(textOf(find(waiting, (n) => classes(n).includes("ck-card-title"))), "Waiting for a reply (1)");
    assert.equal(reviewRows(waiting).length, 1);
    assert.equal(
      textOf(byTestId(waiting, "google-review-held")),
      "The receptionist wrote a reply and held it: it named a price.",
    );
    assert.equal(V.waiting.rows[0].held, textOf(byTestId(waiting, "google-review-held")), "the fold's own words");
    assert.ok(byTestId(waiting, "google-reply"), "a review through the Business Profile can be answered");
    // A review is drawn once: Ana waits above, so the latest has none of its own, and says why.
    const latest = card(tree, "chart-google-latest");
    assert.equal(reviewRows(latest).length, 0);
    assert.match(textOf(latest), /The latest reviews are the ones waiting for a reply, above\./);
    assert.equal(reviewRows(tree).length, 1, "one review row on the page");
    assert.equal(card(tree, "chart-google-gained"), null, "the profile counts what was written: no day-by-day gain");
    assert.equal(card(tree, "reviews-connect"), null, "nothing to connect: it is");
    // Neither card sets the other's height: the stars and the weeks share a row, the rest take the whole one.
    for (const [id, span] of [
      ["chart-reviews-stars", "rpt-span-5"],
      ["chart-reviews-weekly", "rpt-span-7"],
      ["reviews-waiting", "rpt-span-12"],
      ["chart-google-latest", "rpt-span-12"],
    ])
      assert.ok(classes(card(tree, id)).includes(span), id);
    // The reply box is the kit's Field: its words kept, a limit of 4096, and no typing while a draft is on its way.
    lensAt = LENS_PATHS[5];
    const reviews = pageOnce();
    press(byTestId(card(reviews, "reviews-waiting"), "google-reply"));
    const box = find(again(draw), (n) => n.type === Field);
    assert.deepEqual(
      [box.props.rows, box.props.maxLength, box.props.readOnly, box.props["data-testid"]],
      [3, 4096, true, "google-reply-text"],
    );
    assert.ok(box.props["aria-label"], "named, with no label drawn");
    lensAt = LENS_PATHS[0];
    // Five reviews are what Google hands back, never the listing: the way to the rest is the listing's own address,
    // in a tab of its own. No listing address, no link -- the card never invents one.
    assert.equal(
      byTestId(card(tree, "chart-google-latest"), "google-open-listing"),
      null,
      "no address from Google, no link: the card never invents one",
    );
    holdReviews(
      { ...NORTHSIDE, listing: { ...NORTHSIDE.listing, maps_uri: "https://maps.google.com/?cid=7" } },
      northsideLedger(),
    );
    const out = byTestId(card(page(), "chart-google-latest"), "google-open-listing");
    assert.equal(textOf(out), "Read every review on Google");
    assert.deepEqual(
      [out.props.href, out.props.target, out.props.rel],
      ["https://maps.google.com/?cid=7", "_blank", "noreferrer"],
      "the listing's own address, in a tab of its own",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a review that waits is drawn once, above Latest, which keeps the ones that do not; the held reply is said only where one was held", () => {
  const [ana] = NORTHSIDE.reviews;
  const bea = {
    ...ana,
    id: "22222222-2222-4222-8222-222222222222",
    review_id: "r-bea",
    author: "Bea R.",
    published_at: "2026-09-02T13:00:00Z",
    reply_text: "Thank you, Bea!",
    replied_at: "2026-09-02T20:00:00Z",
  };
  holdReviews(
    { ...NORTHSIDE, reviews: [ana, bea] },
    northsideLedger({
      written: [writtenReview(ana.id, ana.published_at, 5), writtenReview(bea.id, bea.published_at, 5, bea.replied_at)],
    }),
  );
  try {
    const tree = page();
    assert.equal(reviewRows(card(tree, "reviews-waiting")).length, 1, "Ana waits");
    assert.match(textOf(card(tree, "reviews-waiting")), /Ana P\./);
    const kept = reviewRows(card(tree, "chart-google-latest"));
    assert.equal(kept.length, 1, "and is not drawn again under Latest, which keeps Bea");
    assert.match(textOf(kept), /Bea R\./);
    assert.equal(
      all(tree, (n) => n.props?.["data-testid"] === "google-review-held").length,
      1,
      "one held reply, Ana's",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
  const answered = { ...ana, reply_text: "Thank you, Ana!", replied_at: "2026-09-03T20:00:00Z" };
  const V = holdReviews(
    { ...NORTHSIDE, reviews: [answered] },
    northsideLedger({
      written: [writtenReview(ana.id, ana.published_at, 5, "2026-09-03T20:00:00Z")],
      waiting_total: 0,
      waiting: [],
    }),
  );
  try {
    const tree = page();
    const waiting = card(tree, "reviews-waiting");
    assert.equal(textOf(find(waiting, (n) => classes(n).includes("ck-card-title"))), "Waiting for a reply (0)");
    assert.match(textOf(waiting), /Nothing is waiting for a reply\./);
    assert.equal(reviewRows(waiting).length, 0);
    const latest = card(tree, "chart-google-latest");
    assert.equal(reviewRows(latest).length, 1, "the answered review is the latest, once");
    assert.equal(byTestId(tree, "google-review-held"), null, "no reply was held: nothing is said of one");
    assert.equal(V.tiles.at(3)?.value, "1 of 1", "and it counts as answered");
    assert.match(textOf(latest), /Thank you, Ana!/, "its reply, under it");
    assert.equal(
      takeaway(tree, "chart-google-latest"),
      `every review, from your Business Profile · ${V.google.reply.words}`,
      "the source is named, and what the receptionist does under a new review beside it",
    );
    assert.ok(V.google.reply.words, "which is something to say, under Ask");
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a record that starts after the period says where, in the section's meta and where the figures would be, and draws a dash for what it cannot count: never a zero", () => {
  // 100 of Google's 213 on record, the sync did not read the whole list, and the connection began Aug 30: the week began Aug 29
  const V = holdReviews(
    reviewsGoogle({ connection: googleConnection({ connected_at: "2026-08-30T12:00:00Z" }) }),
    reviewsLedger({ on_record: { profile: 100, places: 0, oldest_day: "2026-08-30", complete: false } }),
  );
  try {
    const tree = page();
    assert.ok(sectionMeta(tree).includes("history on record starts Aug 30"), sectionMeta(tree));
    assert.deepEqual(
      all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => [n.props.id, n.props.value]),
      [
        ["rating", "4.8"],
        ["reviews", "213"],
        ["reviews_written", "—"],
        ["reviews_answered", "—"],
        ["review_reply_time", "—"],
      ],
    );
    const stars = card(tree, "chart-reviews-stars");
    assert.equal(all(stars, (n) => classes(n).includes("ck-barlist-row")).length, 0, "no mix of what is not counted");
    assert.ok(
      textOf(stars).includes(V.lines.historyTitle),
      "the fold's own words for a title, never the page's lower-casing of the other",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("Google's reviews from the five it shows first: four figures, the ratings gained day by day, the latest, and what the Business Profile would add", () => {
  const places = { ...NORTHSIDE, connection: null, reviews: [{ ...NORTHSIDE.reviews[0], origin: "places" }] };
  // The reader keeps no ledger where no profile has synced: the five public reviews are no record to count.
  const V = holdReviews(places, null);
  try {
    const tree = page();
    assert.deepEqual(
      figureIds(tree),
      ["rating", "reviews", "ratings_gained", "newest_review"],
      "the listing's four, each named by its metric",
    );
    assert.ok(
      classes(byTestId(tree, "google-tiles")).includes("listing") &&
        !classes(byTestId(tree, "google-tiles")).includes("profile"),
      "the listing's strip: four columns by its role (--cells), never by a class that says four",
    );
    assert.ok(plot(tree, "chart-google-gained"), "the ratings gained, day by day, on the kit");
    assert.equal(takeaway(tree, "chart-google-gained"), "", "the count gained is the tiles'");
    assert.equal(reviewRows(card(tree, "chart-google-latest")).length, 1, "the five Google shows first, here one");
    assert.equal(
      takeaway(tree, "chart-google-latest"),
      "the one Google shows first",
      "the source is named, and no reply to say where a review cannot be answered from here",
    );
    for (const id of ["chart-reviews-stars", "chart-reviews-weekly", "reviews-waiting"])
      assert.equal(card(tree, id), null, `${id}: the five public reviews count nothing`);
    assert.equal(
      byTestId(tree, "google-reply"),
      null,
      "a review that did not come through the profile cannot be answered",
    );
    for (const id of ["chart-google-gained", "chart-google-latest"])
      assert.ok(classes(card(tree, id)).includes("rpt-span-12"), id);
    const connect = card(tree, "reviews-connect");
    assert.ok(textOf(connect).includes(V.lines.connect), "what the profile would add, in the fold's own words");
    assert.equal(V.lines.connect, "Connect your Business Profile to see every review, who answered, and how fast.");
    press(find(connect, (n) => n.type === "button"));
    assert.deepEqual(went, ["admin/integrations"], "and the door to Connections");
    // Connected, the location not yet chosen: the same five, the connection's own words in the meta and in the card.
    holdReviews(
      {
        ...places,
        connection: { ...NORTHSIDE.connection, location_name: null, location_title: null, last_synced_at: null },
      },
      null,
    );
    const pending = page();
    assert.ok(sectionMeta(pending).includes("Connected as owner@example.com · choose the location to finish"));
    assert.ok(textOf(card(pending, "reviews-connect")).includes("choose the location to finish"));
    assert.deepEqual(figureIds(pending), ["rating", "reviews", "ratings_gained", "newest_review"]);
    // One reading of Google's count is no difference: the card says so in the fold's words, with no days to draw.
    const first = holdReviews({ ...places, days: places.days.slice(-1) }, null);
    const young = page();
    assert.equal(first.lines.gained, "Needs a second day of reading.");
    assert.equal(takeaway(young, "chart-google-gained"), first.lines.gained);
    assert.ok(textOf(card(young, "chart-google-gained")).includes(first.lines.gainedEmpty));
    assert.equal(plot(young, "chart-google-gained"), null, "nothing to plot");
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a reply from a waiting row says it is on Google: the answer takes the review out of the waiting card, and the toast is the section's, not the composer's", async () => {
  const [ana] = NORTHSIDE.reviews;
  const answered = { ...ana, reply_text: "Thank you, Ana!", replied_at: "2026-09-04T14:00:00Z" };
  // The shell's toast, as the shell holds it: the state of the component that asked for it, drawn only while that component is.
  const shellToast = globalThis.usePPToast;
  globalThis.usePPToast = () => {
    const [said, say] = globalThis.React.useState(null);
    return [said ? globalThis.React.createElement("div", { "data-testid": "toast" }, textOf(said.msg)) : null, say];
  };
  keepReportPeriod("7d");
  holdReviews(NORTHSIDE, northsideLedger());
  reviewReply.posted.length = 0;
  reviewReply.reread = 0;
  reviewReply.now = reviewsDto({
    days: 7,
    google: { ...NORTHSIDE, reviews: [answered] },
    ledger: northsideLedger({
      written: [writtenReview(ana.id, ana.published_at, 5, answered.replied_at)],
      waiting_total: 0,
      waiting: [],
    }),
  });
  const settled = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };
  /** Until the Reviews read has been asked for again, by the answer, and then for the rest of what follows it. */
  const reread = async () => {
    for (let i = 0; i < 300 && !reviewReply.reread; i++) await new Promise((r) => setTimeout(r, 10));
    await settled();
  };
  try {
    lensAt = LENS_PATHS[5];
    let tree = pageOnce();
    assert.equal(reviewRows(card(tree, "reviews-waiting")).length, 1, "Ana waits");
    // The card's heading is where focus goes once the row that held it is gone: a place the section holds, which a browser would fill.
    const focused = [];
    find(card(tree, "reviews-waiting"), (n) => classes(n).includes("ck-card-title")).props.ref.current = {
      focus: () => focused.push("the waiting card's heading"),
    };
    press(byTestId(card(tree, "reviews-waiting"), "google-reply"));
    await settled(); // the draft is asked for, and none comes: the box is hers to fill
    tree = again(draw);
    find(tree, (n) => n.type === Field).props.onValueChange("Thank you, Ana!");
    tree = again(draw);
    press(byTestId(tree, "google-reply-send"));
    await reread(); // the reply is accepted, and the answer re-reads the Reviews surface before the verb returns
    tree = again(draw);
    assert.deepEqual(reviewReply.posted, ["Thank you, Ana!"], "her words went to the route");
    assert.deepEqual(focused, ["the waiting card's heading"], "focus is sent to the card, once, when the reply landed");
    assert.equal(
      reviewReply.googleReads,
      0,
      "and Google is not read beside the Reviews read: its answer carries Google's",
    );
    assert.match(
      textOf(card(tree, "reviews-waiting")),
      /Nothing is waiting for a reply\./,
      "the review left the waiting card",
    );
    const toasts = all(tree, (n) => n.props?.["data-testid"] === "toast");
    assert.equal(toasts.length, 1, "and the page still says it landed, once");
    assert.equal(textOf(toasts[0]), "Your reply is on Google, under the review.");
    // The section draws it, outside every review: a toast a row draws leaves with the row, which a real React would not keep.
    assert.deepEqual(
      all(tree, (n) => classes(n).includes("rp2-review") && !!byTestId(n, "toast")),
      [],
      "not inside a review's own composer",
    );
  } finally {
    reviewReply.now = null;
    globalThis.usePPToast = shellToast;
    lensAt = LENS_PATHS[0];
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("the reviews a card lists are a list, one item each, and a review's stars are an image that says its rating, or that it has none", () => {
  const [ana] = NORTHSIDE.reviews;
  const unrated = {
    ...ana,
    id: "33333333-3333-4333-8333-333333333333",
    review_id: "r-cy",
    author: "Cy T.",
    rating: null,
  };
  const answered = {
    ...ana,
    id: "22222222-2222-4222-8222-222222222222",
    review_id: "r-bea",
    author: "Bea R.",
    reply_text: "Thank you, Bea!",
    replied_at: "2026-09-02T20:00:00Z",
    published_at: "2026-09-02T13:00:00Z",
  };
  const V = holdReviews(
    { ...NORTHSIDE, reviews: [ana, unrated, answered] },
    northsideLedger({
      written: [writtenReview(answered.id, answered.published_at, 5, answered.replied_at)],
      waiting_total: 2,
      waiting: [
        { ...ana, held: "price" },
        { ...unrated, held: null },
      ],
    }),
  );
  try {
    const tree = page();
    for (const id of ["reviews-waiting", "chart-google-latest"]) {
      const list = find(card(tree, id), (n) => n.type === "ul");
      assert.ok(list, `${id}: a list`);
      assert.ok(classes(list).includes("rp2-reviews"));
      const items = all(list, (n) => n.type === "li");
      assert.deepEqual(
        items.map((li) => li.props["data-testid"]),
        items.map(() => "google-review"),
        `${id}: each review is an item of it`,
      );
      assert.equal(items.length, reviewRows(card(tree, id)).length, `${id}: and no review is drawn outside it`);
    }
    const images = all(card(tree, "reviews-waiting"), (n) => n.props?.role === "img");
    assert.deepEqual(
      images.map((n) => n.props["aria-label"]),
      ["5 of 5 stars", "No rating"],
      "the rating in words, and none said as none",
    );
    assert.deepEqual(
      images.map(textOf),
      V.waiting.rows.map((r) => r.stars),
      "over the glyphs the image stands for",
    );
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("on a phone the reviews that wait come first, ahead of the figures; with none waiting, and on a desk, they keep their place", () => {
  const ORDER = [
    "reviews-waiting",
    "google-tiles",
    "chart-reviews-stars",
    "chart-reviews-weekly",
    "chart-google-latest",
  ];
  const orderOf = (tree) =>
    all(tree, (n) => ORDER.includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]);
  const desk = [
    "google-tiles",
    "chart-reviews-stars",
    "chart-reviews-weekly",
    "reviews-waiting",
    "chart-google-latest",
  ];
  const [ana] = NORTHSIDE.reviews;
  const draws = (phone) => {
    const width = atWidth(phone);
    try {
      lensAt = LENS_PATHS[5];
      return pageOnce();
    } finally {
      width.put();
      lensAt = LENS_PATHS[0];
    }
  };
  try {
    holdReviews(NORTHSIDE, northsideLedger());
    assert.deepEqual(orderOf(draws(false)), desk, "a desk: the figures, the charts, then who waits");
    assert.deepEqual(
      orderOf(draws(true)),
      ["reviews-waiting", "google-tiles", "chart-reviews-stars", "chart-reviews-weekly", "chart-google-latest"],
      "a phone: who waits is the work, and comes first",
    );
    holdReviews(
      NORTHSIDE,
      northsideLedger({
        written: [writtenReview(ana.id, ana.published_at, 5, "2026-09-03T20:00:00Z")],
        waiting_total: 0,
        waiting: [],
      }),
    );
    assert.deepEqual(orderOf(draws(true)), desk, "nothing waits: a card that says so is no work, and keeps its place");
    // The listing's own figures count no reply: nothing to put first.
    holdReviews({ ...NORTHSIDE, connection: null, reviews: [{ ...ana, origin: "places" }] }, null);
    assert.equal(byTestId(draws(true), "reviews-waiting"), null);
  } finally {
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("the doors out of the Reviews lens are for a person who may use them: the words stay for the rest", () => {
  const places = { ...NORTHSIDE, connection: null, reviews: [{ ...NORTHSIDE.reviews[0], origin: "places" }] };
  const asWho = globalThis.canDo;
  const door = (tree) => find(byTestId(tree, "reviews-connect"), (n) => n.type === "button");
  try {
    for (const [who, may] of [
      ["an owner", () => true],
      ["an operator", (action) => action === "approve"],
      ["a viewer", () => false],
    ]) {
      globalThis.canDo = may;
      const V = holdReviews(places, null);
      const tree = page();
      assert.ok(textOf(byTestId(tree, "reviews-connect")).includes(V.lines.connect), `${who}: the words`);
      if (who === "an owner") {
        assert.equal(textOf(door(tree)), "Open Connections");
        press(door(tree));
        assert.deepEqual(went, ["admin/integrations"], "the owner's door leads to Connections");
      } else assert.equal(door(tree), null, `${who}: no door to what they may not do`);
    }
  } finally {
    globalThis.canDo = asWho;
    setSurfaceValue("reports_reviews", undefined);
  }
});

test("a pick whose Reviews read could not be made says so on the lens through the follower, with its Retry, while the page shows the period picked and the head says nothing it cannot show", async () => {
  const hash = globalThis.location.hash;
  globalThis.location.hash = "#/reports/reviews";
  lensAt = LENS_PATHS[5];
  try {
    await inPeriodTest("answer", async () => {
      // Seven days is read and held, as it was by the visit before; the report answers every period, and the Reviews read none.
      holdReviews(NORTHSIDE, northsideLedger());
      setStatus("reports_reviews", "live");
      let tree = pageOnce();
      assert.ok(byTestId(tree, "google-tiles"), "the figures stand");
      choose(tree, "30 days");
      for (let i = 0; i < 12; i++) await settle();
      redraw(); // the effect that follows the report's answer clears what the page held, and the next draw shows it
      tree = redraw();
      assert.equal(chosen(tree), "30 days", "the page shows the period it picked: the report landed");
      assert.equal(failedLine(tree), null, "which did not fail, so the page's own row says nothing");
      const words = byTestId(tree, "reviews-failed");
      assert.ok(words, "the lens says its own read failed");
      assert.ok(textOf(words).includes("Couldn't read your Google reviews"), textOf(words));
      assert.ok(
        find(tree, (n) => n.props?.surface === "reports_reviews"),
        "with the Retry that reads it again",
      );
      assert.equal(byTestId(tree, "google-tiles"), null, "the seven days it left are not drawn under thirty");
      assert.equal(standingSaid().sentence, undefined, "nor said at the head");
      assert.equal(
        byTestId(tree, "reports-real").props["data-loading"],
        undefined,
        "and nothing dims: a card that dims takes no press",
      );
    });
  } finally {
    globalThis.location.hash = hash;
    lensAt = LENS_PATHS[0];
    setStatus("reports_reviews", "live");
    setSurfaceValue("reports_reviews", undefined);
    keepReportPeriod("7d");
  }
});

test("a demo's Reviews lens draws the sample's listing through the same section, its tabs switch the sample's period, and nothing in it can be answered", () => {
  setSurfaceValue("reports", undefined);
  setSurfaceValue("reports_reviews", undefined);
  globalThis.__DEMO_MODE = true;
  lensAt = LENS_PATHS[5];
  try {
    fresh();
    let tree = draw();
    const sample = reviewsSample("30d");
    assert.ok(byTestId(tree, "reports-sample"), "the sample's page");
    assert.deepEqual(figureIds(tree), ["rating", "reviews", "ratings_gained", "newest_review"], "the listing's four");
    assert.equal(standingSaid().sentence, sample.vm.lines.head, "the head says the sample's fold");
    assert.equal(
      reviewRows(card(tree, "chart-google-latest")).length,
      sample.vm.latest.length,
      "the reviews Google shows",
    );
    assert.equal(byTestId(tree, "google-reply"), null, "a demo posts no reply to Google");
    assert.ok(
      textOf(byTestId(tree, "reviews-connect")).includes(sample.vm.lines.connect),
      "and says what a profile would add",
    );
    assert.equal(byTestId(tree, "reports-real"), null);
    assert.equal(
      byTestId(tree, "reports-sample").props["data-loading"],
      undefined,
      "the sample answers at once: nothing is on its way",
    );
    choose(tree, "90 days");
    tree = redraw();
    assert.equal(standingSaid().sentence, reviewsSample("90d").vm.lines.head, "the sample's own period");
  } finally {
    globalThis.__DEMO_MODE = false;
    lensAt = LENS_PATHS[0];
  }
});

test("a demo draws the same page from the sample, its tabs switch the sample; without a demo the page says what Reports reads", () => {
  setSurfaceValue("reports", undefined);
  globalThis.__DEMO_MODE = true;
  try {
    fresh();
    let tree = draw();
    assert.ok(
      byTestId(tree, "reports-sample") && byTestId(tree, "reports-hero"),
      "the one Reports page, on the sample",
    );
    lensAt = LENS_PATHS[2];
    fresh();
    assert.ok(byTestId(draw(), "chart-channels"), "and its People lens");
    lensAt = LENS_PATHS[0];
    fresh();
    tree = draw();
    assert.equal(chosen(tree), "30 days");
    choose(tree, "90 days");
    tree = redraw();
    assert.equal(chosen(tree), "90 days", "the sample's own period");
    globalThis.__DEMO_MODE = false;
    fresh();
    assert.ok(byTestId(draw(), "reports-none"), "no workspace and no demo: the page says what Reports reads");
  } finally {
    globalThis.__DEMO_MODE = false;
  }
});

/* ----------------------- the regressions, moved from reports-honest (C13, C25 to C28) ----------------------- */

test("REGRESSION (C13): each source row opens its playbook or its broadcast -- the rows were dead text", () => {
  const rows = all(page(), (n) => n.props?.["data-testid"] === "source-row");
  assert.equal(rows.length, 2);
  for (const r of rows) press(byTestId(r, "source-open"));
  assert.deepEqual(went, ["outbound/p1", "broadcasts/run:b1"], "REGRESSION: no door on either row");
  assert.deepEqual(
    rows.map((r) => byTestId(r, "source-open").props.href),
    ["#/outbound/p1", "#/broadcasts/run:b1"],
    "and each is a link with its address",
  );
});

test("REGRESSION (C25): the period before is drawn where it reads -- beside the running total and round the week, never zigzagging over daily columns", () => {
  const tree = page();
  assert.ok(cls(card(tree, "chart-people"), "ck-prior"), "REGRESSION: new people drew this period alone");
  assert.ok(
    find(card(tree, "chart-rhythm"), (n) => classes(n).includes("ck-radar-line") && classes(n).includes("prior")),
    "and so did the week",
  );
  for (const id of ["chart-answered", "chart-campaigns"])
    assert.equal(cls(card(tree, id), "ck-prior"), null, `${id}: no line over the columns (#557)`);
  for (const id of ["chart-people", "chart-rhythm"])
    assert.ok(textOf(card(tree, id)).includes("The 7 days before"), `${id}: the legend names it`);
});

test("REGRESSION (C26): a chart is one keyboard stop whose arrows read each day aloud -- its day areas answered focus no key could reach", () =>
  inLens(1, () => {
    let tree = pageOnce();
    const answered = () => card(tree, "chart-answered");
    assert.equal(plot(tree, "chart-answered").props.tabIndex, 0, "one stop for the chart");
    assert.equal(all(answered(), (n) => n.props && "tabIndex" in n.props).length, 1, "and none per day");
    const live = () => textOf(find(answered(), (n) => n.props?.["aria-live"] === "polite"));
    plot(tree, "chart-answered").props.onFocus();
    tree = redraw();
    assert.equal(
      live(),
      "Sep 4: 2 customer messages, 2 answered by the receptionist, 0 by you, 0 unanswered",
      "focus lands on the latest day",
    );
    const key = (k) => {
      plot(tree, "chart-answered").props.onKeyDown({ key: k, preventDefault() {} });
      tree = redraw();
    };
    key("Home");
    assert.equal(live(), "Aug 29: 4 customer messages, 3 answered by the receptionist, 1 by you, 0 unanswered");
    key("ArrowLeft");
    assert.match(live(), /^Aug 29:/, "held at the first day");
    key("ArrowRight");
    assert.match(live(), /^Aug 30:/);
    key("End");
    assert.match(live(), /^Sep 4:/);
  }));

test("REGRESSION: the period control never holds -- arrowing on to Month is a choice per key, each pick is read and the latest one wins", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    choose(tree, "30 days");
    tree = redraw();
    assert.equal(
      control(tree).props.readOnly,
      undefined,
      "REGRESSION: the control was read-only while a period loaded",
    );
    assert.equal(chosen(tree), "30 days", "the control shows the pick as it is made, so the next key goes on from it");
    choose(tree, "90 days");
    assert.deepEqual(period.asked, ["30d", "90d"], "each pick is read; none waits behind another");
    await land();
    redraw();
    tree = redraw();
    assert.equal(
      chosen(tree),
      "90 days",
      "the latest pick is the one shown: the surface dropped the answer for 30 days",
    );
    assert.equal(failedLine(tree), null, "and the pick that was left says nothing of its own");
  });
});

test("REGRESSION: a pick back to the period on screen, made while another loads, is shown at once and dims nothing -- the page waited on a read it did not need", async () => {
  // A workspace of its own, where no period is held yet, so the pick in between stays out until it lands.
  const was = globalThis.location.pathname;
  globalThis.location.pathname = "/w/pick-back";
  try {
    await inPeriodTest("hold", async () => {
      let tree = page();
      choose(tree, "30 days");
      await land();
      redraw();
      tree = redraw();
      assert.equal(chosen(tree), "30 days", "30 days is read, and held");
      choose(tree, "Month");
      tree = redraw();
      assert.equal(byTestId(tree, "reports-real").props["data-loading"], "", "Month is on its way");
      choose(tree, "30 days");
      redraw();
      tree = redraw();
      assert.equal(chosen(tree), "30 days", "the pick back is shown at once, from the 30 days held");
      assert.equal(
        byTestId(tree, "reports-real").props["data-loading"],
        undefined,
        "REGRESSION: the page dimmed, over the period it already showed, until a read behind it landed",
      );
      await land();
      redraw();
      tree = redraw();
      assert.deepEqual(period.asked, ["30d", "month", "30d"], "Month's read, and the read behind the held 30 days");
      assert.equal(chosen(tree), "30 days", "Month's answer, for a period left, is dropped");
      assert.equal(failedLine(tree), null, "and nothing failed");
    });
  } finally {
    globalThis.location.pathname = was;
  }
});

test("Month is a period of its own: its tab, its read by that name, and the page says the days it holds", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    assert.deepEqual(
      control(tree).props.options.map((o) => o.label),
      ["7 days", "30 days", "90 days", "Month"],
    );
    choose(tree, "Month");
    assert.deepEqual(period.asked, ["month"]);
    await land();
    redraw();
    tree = redraw();
    assert.equal(chosen(tree), "Month");
    assert.equal(failedLine(tree), null, "nothing failed");
  });
});

test("REGRESSION (C28): a card with a table saves it as a CSV -- the numbers were on screen and nowhere else", async () => {
  const saved = [];
  const clicked = [];
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, el: globalThis.document.createElement };
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return "blob:report";
  };
  URL.revokeObjectURL = () => {};
  globalThis.document.createElement = (tag) => ({
    tag,
    style: {},
    setAttribute() {},
    click() {
      clicked.push({ href: this.href, download: this.download });
    },
    remove() {},
  });
  try {
    const tree = page();
    press(byTestId(card(tree, "chart-campaigns"), "card-csv"));
    assert.deepEqual(
      clicked,
      [{ href: "blob:report", download: "sent-day-by-day.csv" }],
      "REGRESSION: no way to take the table",
    );
    const bytes = new Uint8Array(await saved[0].arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "a spreadsheet reads it as UTF-8");
    const lines = (await saved[0].text()).replace(String.fromCharCode(0xfeff), "").split("\r\n");
    assert.equal(
      lines[0],
      "Day,Sent,Delivered,Replied,Said yes,Asked to stop",
      "each cell spelled by contracts' csvCell",
    );
    assert.equal(lines.length, 8, "the header and a row a day, as the Table view shows");
    for (const id of ["chart-booking", "chart-funnel"])
      assert.equal(byTestId(card(tree, id), "card-csv"), null, `${id}: no CSV where there is no table`);
  } finally {
    URL.createObjectURL = real.create;
    URL.revokeObjectURL = real.revoke;
    globalThis.document.createElement = real.el;
  }
});

test("REGRESSION: a tile is a number, what it is and one line under it; the head says the period and its days once (#557)", () => {
  const tree = page();
  assert.equal(
    all(byTestId(tree, "reports-tiles"), (n) => n.type === "div" && classes(n).includes("rpt-cell")).length,
    5,
    "the Overview's strip is five cells; the Campaigns lens draws two of its own",
  );
  assert.equal(
    find(tree, (n) => /spark|delta/.test(String(n.props?.className || ""))),
    null,
    "REGRESSION: a sparkline and a percentage delta in every tile",
  );
  const head = byTestId(seen(tree), "reports-period");
  // The period is the segmented control's chosen option (the stub draws a Base UI part as a leaf, so its words are read from its props).
  assert.ok(
    head &&
      find(head, (n) => n.type === Segmented) &&
      chosen(head) === "7 days" &&
      textOf(cls(head, "rpt-dates")) === "Aug 29 – Sep 4",
    `the period and its days: ${textOf(head)}`,
  );
  const said = textOf(tree);
  assert.ok(
    !said.includes("What the receptionist handled"),
    "REGRESSION: a sub-headline under a title the top bar already says",
  );
  assert.ok(!said.includes("Reports"), "and the page does not title itself");
});

test("REGRESSION (C25): Reports says what the campaigns sent, not what offers earned -- a visit reminder is no offer", () => {
  const said = textOf(page());
  assert.ok(
    !said.includes("offers earned") && !said.includes("yes to offers"),
    "REGRESSION: offers over visit reminders",
  );
  assert.ok(said.includes("what your broadcasts and playbooks sent"), "the section says what a campaign is");
});

test("Reports draws a Deals section where deals are on and a deal was recorded: the headline, what became of the cohort in the kit's bars, the lines beside them, the stock", () => {
  // The bridge publishes contracts' DealReportVM (0004, 0008) from the route's report; nothing where deals are off or
  // none was ever recorded, so a workspace whose customers book never grows a section of zeros.
  const none = page({ deals: NO_DEALS });
  assert.equal(byTestId(none, "rpt-deals"), null, "nothing where no deal was ever recorded");
  assert.equal(byTestId(none, "rpt-deals-outcomes"), null);
  const tree = page({ deals: DEALS });
  const section = byTestId(tree, "rpt-deals");
  assert.ok(section, "its own section");
  assert.equal(textOf(byTestId(section, "rpt-deals-headline")), "5 proposals went out in the last 7 days.");
  const bars = byTestId(section, "rpt-deals-outcomes");
  assert.ok(classes(bars).includes("ck-card"), "the kit's card");
  assert.equal(textOf(cls(bars, "ck-card-title")), "What became of the proposals");
  const rows = all(bars, (n) => classes(n).includes("ck-barlist-row"));
  assert.deepEqual(
    rows.map((r) => [textOf(cls(r, "ck-barlist-label")), textOf(cls(r, "ck-barlist-value"))]),
    [
      ["Became clients", "3  60%"],
      ["Still waiting", "1  20%"],
      ["Passed", "1  20%"],
    ],
  );
  const drawn = all(bars, (n) => classes(n).includes("ck-barlist-bar")).map((b) => b.props.style);
  assert.deepEqual(
    drawn.map((s) => s.width),
    ["60%", "20%", "20%"],
    "each bar out of the proposals sent, not out of the largest outcome",
  );
  assert.ok(
    drawn.every((s) => s.background === "var(--chart-1)"),
    "the kit's one data hue, no colour of its own",
  );
  assert.deepEqual(
    all(byTestId(section, "rpt-deals-lines"), (n) => n.type === "li").map((l) => [l.props["data-line"], textOf(l)]),
    [
      ["median", "Median 9 days to a yes."],
      ["sources", "2 of 3 new clients came from Leads."],
      ["reasons", "Price was the reason given for passing."],
      ["open", "$4,250 still open across 3 proposals."],
    ],
  );
  assert.equal(textOf(byTestId(section, "rpt-deals-stock")), "4 clients now · $7,500 a month.");
  // Each fact once and nothing more: the section is its title, the headline, the card, the lines and the stock.
  assert.equal(
    textOf(section),
    [
      "Deals",
      "5 proposals went out in the last 7 days.",
      "What became of the proposals",
      "Became clients",
      "3  60%",
      "Still waiting",
      "1  20%",
      "Passed",
      "1  20%",
      "Median 9 days to a yes.",
      "2 of 3 new clients came from Leads.",
      "Price was the reason given for passing.",
      "$4,250 still open across 3 proposals.",
      "4 clients now · $7,500 a month.",
    ].join(""),
  );
  // Inside the Deals section only: the five tiles stay five, and none of the copy the e2e holds Reports to appears.
  assert.equal(
    all(byTestId(tree, "reports-tiles"), (n) => n.type === "div" && classes(n).includes("rpt-cell")).length,
    5,
  );
  for (const s of ["Revenue", "Lead sources", "Where bookings come from"]) assert.ok(!textOf(tree).includes(s), s);
});

test("a period no proposal went out in draws no bars: the headline, what is still open in the column, and the stock", () => {
  const tree = page({ deals: toDealReportVM(dealsDto({ clients: 2, open: { count: 2, amounts: [] } }), "7 days") });
  const section = byTestId(tree, "rpt-deals");
  assert.equal(textOf(byTestId(section, "rpt-deals-headline")), "No proposals went out in the last 7 days.");
  assert.equal(byTestId(section, "rpt-deals-outcomes"), null, "no bars of nothing");
  const lines = byTestId(section, "rpt-deals-lines");
  assert.deepEqual(all(lines, (n) => n.type === "li").map(textOf), ["2 proposals still open."]);
  assert.ok(!classes(lines).includes("rpt-span-7"), "no card to sit beside: the lines take the column");
  assert.equal(textOf(byTestId(section, "rpt-deals-stock")), "2 clients now.");
  const bare = page({ deals: toDealReportVM(dealsDto({ clients: 1 }), "7 days") });
  assert.equal(byTestId(bare, "rpt-deals-lines"), null, "nothing more to say: no lines");
  assert.equal(textOf(byTestId(bare, "rpt-deals-stock")), "1 client now.");
});

test("REGRESSION: a period nobody wrote or called in still says its deals -- the section sat inside the branch for a period with messages, so a workspace whose deals are made in meetings saw none", () => {
  const tree = page({
    report: quiet(),
    deals: toDealReportVM(dealsDto({ sent: 1, waiting: 1, open: { count: 1, amounts: [] } }), "7 days"),
  });
  assert.ok(card(tree, "reports-empty"), "the period is still said to be quiet");
  assert.ok(byTestId(tree, "rpt-deals"), "and the deals are there beside it");
  assert.equal(textOf(byTestId(tree, "rpt-deals-headline")), "1 proposal went out in the last 7 days.");
  assert.ok(byTestId(tree, "rpt-deals-outcomes"), "with what became of it");
  assert.equal(
    byTestId(page({ report: quiet(), deals: NO_DEALS }), "rpt-deals"),
    null,
    "a quiet workspace whose customers book grows nothing",
  );
});

test("REGRESSION: recording a deal re-reads Reports as well as People -- an open session kept the Deals section's old numbers until a reload", async () => {
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  // And the audiences with them (W3): a deal moved changes the deal lists and who a follow-up reaches.
  assert.deepEqual(
    AFTER["POST contacts/[id]/deal"]().map((o) => o.key),
    ["people", "reports", "broadcasts", "playbooks"],
  );
});

test("on a desk the period is the head's act on every lens, its days then its button, and the page draws no row of its own", () => {
  for (const path of LENS_PATHS) {
    lensAt = path;
    const tree = pageOnce();
    const group = byTestId(standingSaid()?.act, "reports-period");
    assert.ok(classes(group).includes("rpt-period"), `${path}: the period, said to the head as its act`);
    const kids = group.props.children.filter(Boolean);
    assert.equal(textOf(kids[0]), "Aug 29 – Sep 4", `${path}: the days it covers first`);
    assert.ok(
      find(kids.at(-1), (n) => n.type === Popover),
      `${path}: then the button that opens it, at the row's end`,
    );
    assert.equal(all(tree, (n) => classes(n).includes("rpt-head")).length, 0, `${path}: no period row in the page`);
    assert.equal(byTestId(tree, "reports-period"), null, `${path}: the period once, in the head`);
  }
  lensAt = LENS_PATHS[0];
});

test("on a phone the period is the button alone beside the strip, on every lens; the page draws no row of its own", () => {
  onAPhone(() => {
    for (const path of LENS_PATHS) {
      lensAt = path;
      const tree = pageOnce();
      const group = byTestId(standingSaid()?.act, "reports-period");
      assert.equal(
        find(group, (n) => n.type === Popover)?.props.trigger.props["data-testid"],
        "reports-period-open",
        `${path}: the button, the head's act beside the strip`,
      );
      assert.equal(cls(group, "rpt-dates"), null, `${path}: a phone has room for the button alone`);
      assert.equal(all(tree, (n) => classes(n).includes("rpt-head")).length, 0, `${path}: no period row in the page`);
    }
  });
  lensAt = LENS_PATHS[0];
});
