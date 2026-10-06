/**
 * The Reports page (apps/dashboard/src/surfaces/reports, TSX since decision 0015), EXECUTED on a stub React over the view
 * models the bridge publishes through the seam (surface-values.ts): the headline (the
 * receptionist's share, Worth knowing), the tiles compared in counts, every card under its testid with the view
 * model's own sentence, the empty, failed, unreadable-calendar and no-calendar states, a v2 payload, the Ask door, a
 * period that fails to load, Google's section, and the demo. The page's regressions live here too, moved from
 * reports-honest and rewritten for this page (C13, C25 to C28): every row a door, the period before drawn where it
 * reads, one keyboard stop per chart, tabs that hold while a period loads, and a table that leaves the page. The
 * period's own door (period.ts) runs for real, over a fetch this test holds, answers or refuses.
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
} from "./_report-world.mjs";

const went = [];
const asked = [];
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
const { startSurfaces } = await import(`${S}/legacy-bridge/surface-runner.ts`);
// The shell's doors, which the surface reaches through the bridge's verbs (surfaces/legacy-verbs.ts).
Object.assign(globalThis, {
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  askAbout: (a) => asked.push(a),
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
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.test");
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
  asked.length = 0;
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
/** The period control: the kit's segmented control, and the option a person presses, by its words. */
const control = (tree) => find(tree, (n) => n.type === Segmented);
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

test("Worth knowing: the bridge's facts in their order, one line each, a row with a door is one button", () => {
  const facts = all(card(page(), "reports-facts"), (n) => n.type === "li");
  assert.deepEqual(
    facts.map((f) => f.props["data-fact"]),
    ["unanswered", "handovers", "busiest"],
  );
  assert.equal(textOf(facts[0]), "1 message has no reply yetOpen the Inbox");
  assert.ok(classes(facts[0]).includes("is-warn"), "in amber, with its icon");
  assert.equal(textOf(facts[1]), "Top reason it handed over: asked for a person2 timesSee them");
  assert.equal(textOf(facts[2]), "Tuesday was your busiest daypeak 10am to 12pm");
  const row = find(facts[0], (n) => n.type === "button");
  assert.ok(classes(row).includes("rpt-fact-row"), "the whole row is the door");
  assert.equal(row.props.title, "1 message has no reply yet", "the sentence rides in the title, for a line cut short");
  press(row);
  assert.deepEqual(went, ["inbox"]);
  assert.equal(
    find(facts[2], (n) => n.type === "button"),
    null,
    "a fact with no door is no button",
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
    ...["figure-label", "figure-value", "figure-meta"].map((c) => textOf(cls(t, c))),
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
  press(find(hours, (n) => n.type === "button"));
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

test("Ask about this period asks Ask, in the period's words, and names itself for a phone that shows only its icon", () => {
  const ask = byTestId(page(), "reports-ask");
  assert.equal(ask.props["aria-label"], "Ask about this period");
  press(ask);
  assert.deepEqual(asked, [{ prompt: "What stood out in my last 7 days?" }]);
});

test("the period control is the kit's Segmented over the table's periods, each option with a test id, and the Ask door is the kit's Button", () => {
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
  const ask = byTestId(tree, "reports-ask");
  assert.equal(ask.props.size, "sm");
  assert.equal(ask.props["aria-label"], "Ask about this period");
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
    assert.equal(textOf(cls(tree, "rpt-failed")), "Couldn't load 30 days. Still showing 7 days.");
    assert.equal(chosen(tree), "7 days", "the pick that failed is taken back: the control says what the page shows");
  });
});

test("Google's reviews under the period: four tiles, the ratings gained day by day, the latest reviews with the reply door", () => {
  const NOW = Date.parse("2026-09-04T15:00:00Z");
  const realNow = Date.now;
  Date.now = () => NOW;
  const dto = {
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
  setSurfaceValue("google", { dto, fetchedAt: 1 });
  try {
    const tree = page();
    const section = find(tree, (n) => n.type === "section" && n.props["aria-label"] === "Google reviews");
    assert.ok(section, "a section of its own");
    assert.equal(
      all(byTestId(tree, "google-tiles"), (n) => classes(n).includes("rp2-tile")).length,
      4,
      "the shared tile, as Today draws its week",
    );
    assert.ok(plot(tree, "chart-google-gained"), "the ratings gained, day by day, on the kit");
    assert.equal(takeaway(tree, "chart-google-gained"), "", "the count gained is the tiles'");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "google-review").length, 1);
    assert.ok(
      byTestId(card(tree, "chart-google-latest"), "google-reply"),
      "a review through the Business Profile can be answered",
    );
    // The reply box is the kit's Field: its words kept, a limit of 4096, and no typing while a draft is on its way.
    lensAt = LENS_PATHS[5];
    const reviews = pageOnce();
    press(byTestId(card(reviews, "chart-google-latest"), "google-reply"));
    const box = find(again(draw), (n) => n.type === Field);
    assert.deepEqual(
      [box.props.rows, box.props.maxLength, box.props.readOnly, box.props["data-testid"]],
      [3, 4096, true, "google-reply-text"],
    );
    assert.ok(box.props["aria-label"], "named, with no label drawn");
    lensAt = LENS_PATHS[0];
    // Neither card sets the other's height: a run of days and a list of reviews want different shapes, so they take
    // the row one above the other. Side by side, the reviews stretched the days to a picture of nothing.
    for (const id of ["chart-google-gained", "chart-google-latest"])
      assert.ok(classes(card(tree, id)).includes("rpt-span-12"), id);
    // Five reviews are what Google hands back, never the listing: the way to the rest is the listing's own address,
    // in a tab of its own. No listing address, no link -- the card never invents one.
    assert.equal(
      byTestId(card(tree, "chart-google-latest"), "google-open-listing"),
      null,
      "no address from Google, no link: the card never invents one",
    );
    setSurfaceValue("google", {
      dto: { ...dto, listing: { ...dto.listing, maps_uri: "https://maps.google.com/?cid=7" } },
      fetchedAt: 1,
    });
    const out = byTestId(card(page(), "chart-google-latest"), "google-open-listing");
    assert.equal(textOf(out), "Read every review on Google");
    assert.deepEqual(
      [out.props.href, out.props.target, out.props.rel],
      ["https://maps.google.com/?cid=7", "_blank", "noreferrer"],
      "the listing's own address, in a tab of its own",
    );
  } finally {
    setSurfaceValue("google", undefined);
    Date.now = realNow;
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
    assert.equal(cls(tree, "rpt-failed"), null, "and the pick that was left says nothing of its own");
  });
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
    assert.equal(cls(tree, "rpt-failed"), null, "nothing failed");
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
  assert.equal(all(tree, (n) => n.type === "div" && classes(n).includes("rpt-cell")).length, 5);
  assert.equal(
    find(tree, (n) => /spark|delta/.test(String(n.props?.className || ""))),
    null,
    "REGRESSION: a sparkline and a percentage delta in every tile",
  );
  const head = cls(tree, "rpt-head");
  // The period is the segmented control's chosen option (the stub draws a Base UI part as a leaf, so its words are read from its props).
  assert.ok(
    head &&
      find(head, (n) => n.type === Segmented) &&
      chosen(head) === "7 days" &&
      textOf(head).includes("Aug 29 to Sep 4"),
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

test("the page's head row stands over every lens, once, and the lens alone is drawn under it", () => {
  for (const path of LENS_PATHS) {
    lensAt = path;
    const tree = pageOnce();
    assert.equal(all(tree, (n) => classes(n).includes("rpt-head")).length, 1, `${path}: the period row, once`);
  }
  lensAt = LENS_PATHS[0];
});
