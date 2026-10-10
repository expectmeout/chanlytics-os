/**
 * The People lens drawn (surfaces/reports/lenses/people.tsx, people-mix.tsx and people-now.tsx), EXECUTED on the stub React over the
 * two reads it draws from: the frame's (`reports`: the week round the radar, the hours, and New people, adding up, the cards it
 * kept) and its own (`reports_people`: the window and the book, folded on the page by the real `toPeopleReportVM`). Each read fails
 * alone: the kept cards stand without the new ones, one failed read stands in their place, a database with no people_series draws
 * no window card and no failure, and a pool that could not be counted draws the window and one failed read where the book stands.
 * Every sentence, row and word a card says is the fold's; a quiet period hides nothing and draws no bar of nothing; a share of too
 * few is greyed and says so; and the donut is gone. The page has three sections: the customers (the strip and the mix), the time
 * between steps (the window's steps done and email stopped), and what is stuck now with where the book stands (the book's two strips).
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { toPeopleReportVM } from "@chanlytics/contracts/report-lens";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find, press } from "../../_legacy-react.mjs";
import { quiet, surface } from "../_report-world.mjs";
import { POOL, QUIET, dtoWith, held } from "./_people-world.mjs";

const navigated = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, { CHANLY: { nav: (to) => navigated.push(to), R: { admin: (pane) => `admin/${pane}` } } });
globalThis.window.fetch = async () =>
  new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "not read here" } }), { status: 500 });
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
const S = "../../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);
const { setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { standingSaid, forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { RPT_CHANNEL_COLORS } = await import(`${S}/surfaces/reports/series.ts`);
const { BarList } = await import(`${S}/surfaces/kit/charts/bar.tsx`);
const { ChartCard } = await import(`${S}/surfaces/kit/charts/card.tsx`);
const { RadarChart } = await import(`${S}/surfaces/kit/charts/radar.tsx`);
const { HeatStrip } = await import(`${S}/surfaces/kit/charts/heat.tsx`);
const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);
const { RptSection } = await import(`${S}/surfaces/reports/blocks.tsx`);
after(() => forgetStanding());

/** The People lens over what both reads hold, for the period the strip shows (the week: the frame's, whatever days the DTO is of). */
const draw = ({ R = surface(), ...opts } = {}) => {
  keepReportPeriod("7d");
  setSurfaceValue("reports", R);
  setSurfaceValue("reports_people", "own" in opts ? opts.own : held(dtoWith(), "7d"));
  fresh();
  navigated.length = 0;
  return ReportsPage({ pathname: "/w/harbor/reports/people" });
};
/** The window's cards and the strip over them (and the time between steps, which is the window's); the book's parts; the cards the frame keeps. */
const WINDOW_IDS = [
  "people-strip",
  "chart-people-channels",
  "chart-people-first",
  "chart-people-yeses",
  "chart-people-stops",
  "people-time",
  "chart-people-steps",
  "chart-people-bounced",
];
const BOOK_CARDS = ["chart-people-wires", "chart-people-fresh"];
const BOOK_IDS = [...BOOK_CARDS, "people-stuck", "people-stand"];
const KEPT_IDS = ["chart-people", "chart-rhythm"];
const ORDER = [
  "people-strip",
  "chart-people-channels",
  "chart-people-first",
  "chart-people",
  "chart-people-yeses",
  "chart-people-stops",
  "chart-people-wires",
  "chart-people-fresh",
  "chart-rhythm",
  "people-time",
  "chart-people-steps",
  "chart-people-bounced",
  "people-stuck",
  "people-stand",
];
/** The sections the page draws, by their labels (a section that names what the tab says draws no heading). */
const sectionsOf = (tree) =>
  all(tree, (n) => n.type === "section" && n.props.className === "rpt-section").map((n) => n.props["aria-label"]);
const present = (tree, ids) => ids.map((id) => !!byTestId(tree, id));
const yes = (ids) => ids.map(() => true);
const no = (ids) => ids.map(() => false);
const figureOf = (tree, metric) => find(tree, (n) => n.type === "div" && n.props["data-figure"] === metric);
const metricsOf = (strip) =>
  all(strip, (n) => n.type === "div" && n.props["data-figure"]).map((n) => n.props["data-figure"]);
const valueOf = (figure) => textOf(find(figure, (n) => classes(n).includes("figure-value")));
const rowsOf = (tree, id) => find(byTestId(tree, id), (n) => n.type === BarList).props.rows;
const lineOf = (tree, id) => textOf(find(byTestId(tree, id), (n) => classes(n).includes("ck-card-takeaway")));
const cardOf = (tree, id) => find(tree, (n) => n.type === ChartCard && n.props.testid === id);
const dimmed = (tree) => all(tree, (n) => n.props?.["data-loading"] === "");
const foldOf = (dto = dtoWith()) => toPeopleReportVM(dto);
/** The route's answer from a database with no people_series yet, and from a pool that could not be counted. */
const NO_FUNCTION = { ...dtoWith(), series: null };
const NO_POOL = dtoWith({}, null);

/**
 * The test id a node stands for in the page's order. A section's id is on the section it renders, which the walk reaches after
 * the section's children, so the section's own element (the one that names it) stands for it, and what it renders does not.
 */
const orderedId = (n) => {
  if (n.type === RptSection) return n.props.testid ?? undefined;
  const id = n.props?.["data-testid"];
  return id === "people-time" ? undefined : id;
};

test("the five parts, in order, for a workspace that has everything", () => {
  const tree = draw();
  const seen = all(tree, (n) => ORDER.includes(orderedId(n))).map(orderedId);
  assert.deepEqual(
    seen,
    ORDER,
    "the strip against before, three rows of the mix, the time between steps, then what is stuck now and where they stand",
  );
  const strip = byTestId(tree, "people-strip");
  assert.equal(strip.type, "dl", "terms and their values");
  assert.ok(classes(strip).includes("quad"), "four across");
  assert.deepEqual(metricsOf(strip), ["people_reached", "new_people", "yeses_won", "stops_recorded"]);
  assert.equal(byTestId(tree, "reports-real").props["data-lens"], "people");
  assert.equal(byTestId(tree, "reports-empty"), null, "the lens never says that nothing came in");
  assert.deepEqual(dimmed(tree), [], "nothing is on its way");
  // A section that names what the tab says draws no heading, and keeps its label for a screen reader.
  assert.deepEqual(sectionsOf(tree), ["Your customers", "Time between steps", "Stuck now"]);
  assert.equal(all(tree, (n) => n.type === "h2").length, 0);
  // The time between steps is the window's two cards, side by side in one grid; what is stuck is two strips, three and four across.
  const time = byTestId(tree, "people-time");
  assert.equal(time.type, "section");
  assert.equal(time.props["aria-label"], "Time between steps");
  const grid = find(time, (n) => classes(n).includes("rpt-grid"));
  assert.deepEqual(
    all(grid, (n) => n.type === ChartCard).map((n) => n.props.testid),
    ["chart-people-steps", "chart-people-bounced"],
  );
  assert.deepEqual([byTestId(tree, "people-stuck").type, byTestId(tree, "people-stand").type], ["dl", "dl"]);
  assert.ok(classes(byTestId(tree, "people-stuck")).includes("trio"), "three across");
  assert.ok(classes(byTestId(tree, "people-stand")).includes("quad"), "four across");
  assert.deepEqual(metricsOf(byTestId(tree, "people-stuck")), [
    "steps_overdue",
    "steps_due_today",
    "email_stopped_now",
  ]);
  assert.deepEqual(metricsOf(byTestId(tree, "people-stand")), [
    "said_yes_messages",
    "can_receive_offers",
    "opted_out_now",
    "quiet_now",
  ]);
  const stuck = find(tree, (n) => n.type === "section" && n.props["aria-label"] === "Stuck now");
  assert.ok(byTestId(stuck, "people-stuck") && byTestId(stuck, "people-stand"), "both strips sit under Stuck now");
});

test("every row, line and title a window or book card draws is the fold's, and each offers its table", () => {
  const v = foldOf();
  const tree = draw();
  const cards = [
    ["chart-people-channels", v.channels, "Who reached you, by channel", ["Channel", "People"]],
    ["chart-people-first", v.firstCame, "How they first came", ["How they first came", "New people"]],
    ["chart-people-yeses", v.yeses, "How the yeses were won", ["How it was won", "Yeses"]],
    ["chart-people-stops", v.stops, "How the stops came", ["How it came", "Stops"]],
    ["chart-people-steps", v.stepsDone, "Steps you set", ["When it was done", "Steps"]],
    ["chart-people-bounced", v.emailStopped, "Email that stopped working", ["Why it stopped", "Addresses"]],
    ["chart-people-wires", v.wires, "Ways they reach you", ["Ways they reach you", "People"]],
    ["chart-people-fresh", v.fresh, "How fresh your book is", ["Since they last wrote or called", "People"]],
  ];
  for (const [id, part, title, columns] of cards) {
    const wanted = part.rows.map((r) => [r.label, r.value]);
    assert.ok(wanted.length > 0, `${id}: the world has rows`);
    assert.deepEqual(
      rowsOf(tree, id).map((r) => [r.label, r.value]),
      wanted,
      `${id}: a bar a row`,
    );
    assert.equal(lineOf(tree, id), part.line, `${id}: its line`);
    assert.equal(textOf(find(byTestId(tree, id), (n) => n.type === "h3")), title);
    assert.deepEqual(cardOf(tree, id).props.table, { columns, rows: wanted }, `${id}: the table twin`);
  }
  // The book is as of now, whatever period is picked, and says so in each of its own lines.
  assert.match(lineOf(tree, "chart-people-fresh"), /Of 520 people as of today:/);
  assert.match(lineOf(tree, "chart-people-wires"), /have reached you more than one way, as of today\.$/);
  const figure = (metric) => find(tree, (n) => n.type === Figure && n.props.id === metric);
  for (const f of v.strip) {
    assert.equal(figure(f.metric).props.value, f.value, `${f.metric}: the fold's number`);
    assert.equal(figure(f.metric).props.meta, f.meta, `${f.metric}: and its line`);
  }
});

test("the channels wear the channel colours and say a person may be in each; there is no donut", () => {
  const v = foldOf();
  const tree = draw();
  const rows = rowsOf(tree, "chart-people-channels");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["whatsapp", "voice", "email", "sms"],
    "most first: the fold's order",
  );
  assert.deepEqual(
    Object.fromEntries(rows.map((r) => [r.id, r.color])),
    RPT_CHANNEL_COLORS,
    "a channel is one colour wherever it is drawn",
  );
  assert.deepEqual(RPT_CHANNEL_COLORS, {
    whatsapp: "var(--chart-cat-1)",
    voice: "var(--chart-cat-2)",
    email: "var(--chart-cat-3)",
    sms: "var(--chart-cat-4)",
  });
  assert.equal(lineOf(tree, "chart-people-channels"), v.channels.line);
  assert.match(v.channels.line, /counted in each/, "a person who reached you more than one way is in each");
  // The other mixes are one colour: only a channel has one of its own.
  for (const id of [
    "chart-people-first",
    "chart-people-yeses",
    "chart-people-stops",
    "chart-people-steps",
    "chart-people-bounced",
    "chart-people-wires",
    "chart-people-fresh",
  ])
    assert.ok(
      rowsOf(tree, id).every((r) => r.color === undefined),
      `${id}: no colour of its own`,
    );
  // The walk reaches what the kit's parts rendered (a card wears ck-card), so a pie's class would be found where it drew one.
  assert.ok(all(tree, (n) => classes(n).includes("ck-card")).length > 0, "the kit's own output is in the walk");
  assert.deepEqual(
    all(tree, (n) => classes(n).some((c) => /^ck-(pie|slice)/.test(c))),
    [],
    "the donut counted messages and calls: no element wears a ck-pie or ck-slice class",
  );
  assert.equal(byTestId(tree, "channels-before"), null, "and the part-bar of the period before with it");
  assert.equal(byTestId(tree, "chart-channels"), null);
});

test("the steps you set are two bars and the fold's line; the email that stopped working is its reasons", () => {
  const v = foldOf();
  const tree = draw();
  assert.deepEqual(
    rowsOf(tree, "chart-people-steps").map((r) => [r.label, r.value]),
    [
      ["Done on or before their day", 8],
      ["Done after their day", 3],
    ],
    "on their day or before, and after it: 8 of 11",
  );
  assert.equal(lineOf(tree, "chart-people-steps"), "8 of 11 were done on or before their day.");
  assert.equal(lineOf(tree, "chart-people-steps"), v.stepsDone.line);
  assert.deepEqual(
    rowsOf(tree, "chart-people-bounced").map((r) => [r.label, r.value]),
    [
      ["Bounced for good", 1],
      ["Marked as spam", 1],
    ],
    "the reasons, as the fold names them",
  );
  assert.equal(lineOf(tree, "chart-people-bounced"), "2 addresses stopped working in this period.");
  // Fewer than five steps are only counted, never a share; a bar is drawn only for a part that has steps in it.
  const few = draw({ own: held(dtoWith({ steps: { done: 3, on_time: 3 } }), "7d") });
  assert.equal(lineOf(few, "chart-people-steps"), "3 steps were done in this period.", "too few for a share");
  assert.deepEqual(
    rowsOf(few, "chart-people-steps").map((r) => [r.label, r.value]),
    [["Done on or before their day", 3]],
    "no bar of nothing for the steps done late",
  );
  // The two cards are not doors: the steps done and the addresses stopped have no list of their own.
  for (const id of ["chart-people-steps", "chart-people-bounced"])
    assert.equal(
      find(byTestId(tree, id), (n) => n.type === "a" || classes(n).includes("door")),
      null,
      `${id}: a count with no page of its own`,
    );
});

test("the fresh book's quiet door: the fold's line, and a link to the list it counts, at the card's foot", () => {
  const v = foldOf();
  const tree = draw();
  const line = byTestId(byTestId(tree, "chart-people-fresh"), "people-quiet-door");
  assert.ok(line, "on the fresh card");
  assert.ok(classes(line).includes("rpt-door-line"));
  assert.ok(textOf(line).includes(v.fresh.quiet.line), textOf(line));
  const door = find(line, (n) => n.type === "a");
  assert.equal(door.props.href, "#/clients/seg:quiet", "People's own list of the people quiet for 30 days or more");
  assert.equal(textOf(door), v.fresh.quiet.label);
  press(door);
  assert.deepEqual(navigated, ["clients/seg:quiet"], "and a plain press goes there by the app's own way");
  const body = find(byTestId(tree, "chart-people-fresh"), (n) => classes(n).includes("ck-card-body"));
  assert.equal(body.props.children.flat().at(-1), line, "the last thing in the card: its foot");
  // Nobody has been quiet: no line and no door.
  const none = draw({ own: held(dtoWith({}, { ...POOL, lists: { ...POOL.lists, quiet: 0 } }), "7d") });
  assert.equal(byTestId(none, "people-quiet-door"), null);
  assert.ok(byTestId(none, "chart-people-fresh"), "the card itself stands");
});

test("a quiet period hides nothing: the strip says 0, each window card says why it is empty, the book still draws, and no bar is of nothing", () => {
  const tree = draw({ R: surface({ report: quiet() }), own: held(dtoWith(QUIET), "7d") });
  const v = foldOf(dtoWith(QUIET));
  assert.equal(
    byTestId(tree, "reports-empty"),
    null,
    "REGRESSION: the Overview's empty stood where the lens's cards belong",
  );
  const strip = byTestId(tree, "people-strip");
  assert.deepEqual(metricsOf(strip), ["people_reached", "new_people", "yeses_won", "stops_recorded"]);
  assert.deepEqual(
    metricsOf(strip).map((m) => valueOf(figureOf(strip, m))),
    ["0", "0", "0", "0"],
    "a count that is zero is shown as 0",
  );
  const empty = [
    ["chart-people-channels", v.channels],
    ["chart-people-first", v.firstCame],
    ["chart-people-yeses", v.yeses],
    ["chart-people-stops", v.stops],
    ["chart-people-steps", v.stepsDone],
    ["chart-people-bounced", v.emailStopped],
  ];
  for (const [id, part] of empty) {
    const card = byTestId(tree, id);
    assert.ok(part.empty, `${id}: the fold says why`);
    assert.ok(textOf(card).includes(part.empty), `${id}: ${textOf(card)}`);
    assert.equal(
      find(card, (n) => n.type === BarList),
      null,
      `${id}: no bars`,
    );
    assert.equal(
      find(card, (n) => classes(n).includes("ck-barlist-bar")),
      null,
      `${id}: and none of nothing`,
    );
    assert.equal(cardOf(tree, id).props.table, null, `${id}: no table of nothing`);
  }
  assert.ok(textOf(byTestId(tree, "chart-people")).includes("Nobody new reached you in this period."));
  const rhythm = byTestId(tree, "chart-rhythm");
  assert.ok(textOf(rhythm).includes("Nobody wrote or called in this period."), textOf(rhythm));
  assert.equal(
    find(rhythm, (n) => n.type === RadarChart || n.type === HeatStrip),
    null,
    "no radar or strip of zeros",
  );
  // The book is of now, not of the days: it draws.
  for (const id of BOOK_CARDS)
    assert.ok(
      find(byTestId(tree, id), (n) => n.type === BarList),
      `${id}: its bars`,
    );
  assert.deepEqual(
    present(tree, [...WINDOW_IDS, ...BOOK_IDS]),
    yes([...WINDOW_IDS, ...BOOK_IDS]),
    "and every part of the page stands: the time between steps, what is stuck now and where they stand say so in numbers and words",
  );
  assert.deepEqual(sectionsOf(tree), ["Your customers", "Time between steps", "Stuck now"]);
  const text = [...WINDOW_IDS, ...BOOK_IDS, ...KEPT_IDS].map((id) => textOf(byTestId(tree, id))).join(" | ");
  assert.doesNotMatch(text, /\b0%|NaN|Infinity/, text);
});

test("its own read still out: the kept cards stand and the others are absent, and the page dims until it lands", () => {
  const tree = draw({ own: undefined });
  assert.deepEqual(present(tree, KEPT_IDS), yes(KEPT_IDS), "the frame's cards stand on the frame's read");
  assert.deepEqual(
    present(tree, [...WINDOW_IDS, ...BOOK_IDS]),
    no([...WINDOW_IDS, ...BOOK_IDS]),
    "nothing of the lens's own",
  );
  assert.equal(byTestId(tree, "people-failed"), null, "a read still out is not a failed one");
  assert.equal(byTestId(tree, "people-now-failed"), null);
  assert.deepEqual(
    dimmed(tree),
    [byTestId(tree, "reports-real")],
    "the page says a period is on its way, by the one rule",
  );
  assert.equal(all(tree, (n) => n.props?.["data-dims"] === true)[0].props["aria-busy"], "true");
  // The read held is of another period than the one shown: it is not drawn under this one's name.
  const left = draw({ own: held(dtoWith(), "30d") });
  assert.deepEqual(
    present(left, [...WINDOW_IDS, ...BOOK_IDS]),
    no([...WINDOW_IDS, ...BOOK_IDS]),
    "a period left is not drawn",
  );
  assert.deepEqual(present(left, KEPT_IDS), yes(KEPT_IDS));
  assert.equal(dimmed(left).length, 1);
  // And it lands: nothing is on its way any more.
  const landed = draw();
  assert.deepEqual(dimmed(landed), []);
  assert.deepEqual(
    present(landed, [...WINDOW_IDS, ...BOOK_IDS, ...KEPT_IDS]),
    yes([...WINDOW_IDS, ...BOOK_IDS, ...KEPT_IDS]),
  );
});

test("its own read failed: one failed read with its Retry stands in place of the new cards, and the kept cards stand", () => {
  setStatus("reports_people", "seeded");
  try {
    const tree = draw({ own: undefined });
    const failed = all(tree, (n) => n.props?.["data-testid"] === "people-failed");
    assert.equal(failed.length, 1, "one, not one a card");
    assert.ok(textOf(failed[0]).includes("Couldn't read who reached you and who you can reach"), textOf(failed[0]));
    const read = find(tree, (n) => n.props?.surface === "reports_people");
    assert.ok(read, "its Retry reads the lens's own surface again");
    assert.equal(read.props.kind, "card");
    assert.deepEqual(present(tree, [...WINDOW_IDS, ...BOOK_IDS]), no([...WINDOW_IDS, ...BOOK_IDS]));
    assert.deepEqual(
      sectionsOf(tree),
      ["Your customers"],
      "the failed read stands in the one section; there are no others",
    );
    assert.equal(byTestId(tree, "people-now-failed"), null, "the book's own failure is a different thing");
    assert.deepEqual(present(tree, KEPT_IDS), yes(KEPT_IDS), "the frame's read is current and stands");
    assert.deepEqual(dimmed(tree), [], "nothing is dimmed: a dimmed card takes no press, and the Retry is on it");
  } finally {
    setStatus("reports_people", "live");
  }
});

test("a pick whose own read could not be made says so with its Retry, and never holds the period it left under the new one's name", () => {
  setStatus("reports_people", "degraded");
  try {
    const tree = draw({ own: held(dtoWith(), "30d") });
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "people-failed").length, 1);
    assert.deepEqual(
      present(tree, [...WINDOW_IDS, ...BOOK_IDS]),
      no([...WINDOW_IDS, ...BOOK_IDS]),
      "the period left is not drawn",
    );
    assert.deepEqual(dimmed(tree), []);
    // The same failed read, with what is held of the period shown: the figures are current and stand.
    const current = draw();
    assert.equal(byTestId(current, "people-failed"), null);
    assert.deepEqual(present(current, [...WINDOW_IDS, ...BOOK_IDS]), yes([...WINDOW_IDS, ...BOOK_IDS]));
  } finally {
    setStatus("reports_people", "live");
  }
});

test("a database without 00395 draws the book and the kept cards, nothing of the window and no failure", () => {
  const tree = draw({ own: held(NO_FUNCTION, "7d") });
  assert.deepEqual(
    present(tree, WINDOW_IDS),
    no(WINDOW_IDS),
    "no strip, none of the window's cards, no time between steps",
  );
  assert.deepEqual(
    present(tree, BOOK_IDS),
    yes(BOOK_IDS),
    "the book is counted without it: its cards, what is stuck, where they stand",
  );
  assert.deepEqual(present(tree, KEPT_IDS), yes(KEPT_IDS));
  assert.deepEqual(sectionsOf(tree), ["Your customers", "Stuck now"], "the section of the window is not drawn empty");
  assert.equal(byTestId(tree, "people-failed"), null, "a missing function is not a failed read");
  assert.equal(byTestId(tree, "people-now-failed"), null);
  assert.deepEqual(dimmed(tree), []);
});

test("a pool that could not be counted draws the window and one failed read where the book stands, and no Stuck now", () => {
  const tree = draw({ own: held(NO_POOL, "7d") });
  assert.deepEqual(
    present(tree, WINDOW_IDS),
    yes(WINDOW_IDS),
    "the window is whole without it, the time between steps too",
  );
  assert.deepEqual(
    present(tree, BOOK_IDS),
    no(BOOK_IDS),
    "no bar, no stuck count and no standing of a book nobody counted",
  );
  assert.deepEqual(present(tree, KEPT_IDS), yes(KEPT_IDS));
  assert.deepEqual(sectionsOf(tree), ["Your customers", "Time between steps"], "and no Stuck now to say 0 of it");
  const failed = all(tree, (n) => n.props?.["data-testid"] === "people-now-failed");
  assert.equal(failed.length, 1, "one, not one a card");
  assert.ok(textOf(failed[0]).includes("Couldn't read who you can reach now"), textOf(failed[0]));
  const read = find(tree, (n) => n.props?.surface === "reports_people");
  assert.ok(read, "its Retry reads the lens's own surface again");
  assert.equal(read.props.kind, "card");
  assert.equal(byTestId(tree, "people-failed"), null, "the lens as a whole did not fail");
  assert.deepEqual(dimmed(tree), []);
});

/** The cards a grid draws directly, a card that is absent (false) left out. */
const cardsOf = (grid) => [grid.props.children].flat(Infinity).filter((n) => n && typeof n === "object");
/** How many of the grid's twelve columns a card takes: its `rpt-span-N` class. */
const spanOf = (card) =>
  Number(
    classes(card)
      .find((c) => /^rpt-span-\d+$/.test(c))
      ?.slice("rpt-span-".length),
  );
/** Every grid of cards the page draws, in order, as the columns each of its cards takes. */
const rowsOfSpans = (tree) =>
  all(tree, (n) => n.type === "div" && classes(n).includes("rpt-grid")).map((grid) => cardsOf(grid).map(spanOf));

test("every row of cards fills the grid's twelve columns, whichever of the lens's reads were made: no card stands alone at a third of its row", () => {
  const NEITHER = { ...dtoWith({}, null), series: null };
  const full = [
    [4, 4, 4],
    [4, 4, 4],
    [8, 4],
    [5, 7],
  ];
  const states = [
    ["everything", draw(), full],
    // The pool failed: the failed read takes the last row alone, and the rhythm card moves up to fill the second.
    ["no pool", draw({ own: held(NO_POOL, "7d") }), [[4, 4, 4], [4, 4, 4], [12], [5, 7]]],
    // 00395 not applied: the kept cards fill their row (8 and 4), and the book's cards theirs (4 and 8).
    [
      "no 00395",
      draw({ own: held(NO_FUNCTION, "7d") }),
      [
        [8, 4],
        [4, 8],
      ],
    ],
    ["neither read", draw({ own: held(NEITHER, "7d") }), [[8, 4], [12]]],
    ["still out", draw({ own: undefined }), [[8, 4]]],
    ["a period left", draw({ own: held(dtoWith(), "30d") }), [[8, 4]]],
  ];
  for (const [state, tree, wanted] of states) {
    assert.deepEqual(rowsOfSpans(tree), wanted, `${state}: the rows, by the columns each card takes`);
    for (const spans of rowsOfSpans(tree)) {
      assert.ok(spans.every(Number.isInteger), `${state}: every card names its columns`);
      assert.equal(
        spans.reduce((a, b) => a + b, 0),
        12,
        `${state}: a row of ${spans.join(" + ")} leaves a hole`,
      );
    }
  }
  // A pick whose own read could not be made: the failed read stands above the kept cards, a row of its own.
  setStatus("reports_people", "degraded");
  try {
    const failed = draw({ own: held(dtoWith(), "30d") });
    assert.equal(all(failed, (n) => n.props?.["data-testid"] === "people-failed").length, 1, "the read failed");
    assert.deepEqual(rowsOfSpans(failed), [[12], [8, 4]], "the failed read, then the kept cards");
  } finally {
    setStatus("reports_people", "live");
  }
  // The cards are the same ones in a different row: nothing is added or dropped by the merge.
  assert.deepEqual(
    present(states[2][1], [...BOOK_CARDS, ...KEPT_IDS]),
    yes([...BOOK_CARDS, ...KEPT_IDS]),
    "no 00395: the book's cards and the kept ones",
  );
  assert.ok(byTestId(states[1][1], "chart-rhythm"), "no pool: the rhythm card is still drawn");
  assert.ok(byTestId(states[1][1], "people-now-failed"), "no pool: and the failed read where the book stands");
});

/** A figure of the page, as the kit draws it, by its metric. */
const figureProps = (tree, metric) => find(tree, (n) => n.type === Figure && n.props.id === metric)?.props;
/** The address a figure's number opens, as its link says it (no link: null). */
const hrefOf = (tree, metric) => find(figureOf(tree, metric), (n) => n.type === "a")?.props.href ?? null;

test("the stuck figures are doors and wear their tone", () => {
  const v = foldOf();
  const tree = draw();
  const strip = byTestId(tree, "people-stuck");
  assert.deepEqual(
    metricsOf(strip).map((m) => figureProps(tree, m).label),
    ["Steps overdue", "Steps due today", "Email stopped working"],
  );
  assert.deepEqual(
    metricsOf(strip).map((m) => valueOf(figureOf(tree, m))),
    ["6", "3", "4"],
    "the book's counts",
  );
  assert.equal(hrefOf(tree, "steps_overdue"), "#/clients/seg:steps_due", "the Steps due list");
  assert.equal(hrefOf(tree, "steps_due_today"), "#/clients/seg:steps_due", "the same list");
  assert.equal(hrefOf(tree, "email_stopped_now"), null, "no list of its own: not a door");
  assert.deepEqual(
    ["steps_overdue", "steps_due_today", "email_stopped_now"].map((m) => figureProps(tree, m).tone),
    ["warn", undefined, "fail"],
    "amber for what needs you, red for what failed, and plain ink for what is only due today",
  );
  assert.ok(classes(figureOf(tree, "steps_overdue")).includes("is-warn"));
  assert.ok(classes(figureOf(tree, "email_stopped_now")).includes("is-fail"));
  assert.equal(
    classes(figureOf(tree, "steps_due_today")).some((c) => /^is-(warn|fail)$/.test(c)),
    false,
  );
  // Every sentence under a number is the fold's, and none is the page's.
  for (const f of v.stuck) assert.equal(figureProps(tree, f.metric).meta, f.meta, `${f.metric}: the fold's line`);
  // A figure that opens a list is a plain press the app's own way, as every door is.
  press(find(figureOf(tree, "steps_overdue"), (n) => n.type === "a"));
  assert.deepEqual(navigated, ["clients/seg:steps_due"]);
  // A count that is zero is shown as 0, and wears no tone: nothing needs you.
  const none = draw({
    own: held(dtoWith({}, { ...POOL, steps: { overdue: 0, due_today: 0 }, email_stopped: 0 }), "7d"),
  });
  assert.deepEqual(
    metricsOf(byTestId(none, "people-stuck")).map((m) => valueOf(figureOf(none, m))),
    ["0", "0", "0"],
  );
  assert.deepEqual(
    ["steps_overdue", "steps_due_today", "email_stopped_now"].map((m) => figureProps(none, m).tone),
    [undefined, undefined, undefined],
    "with nothing overdue and nothing stopped, no figure is toned",
  );
  assert.equal(
    all(byTestId(none, "people-stuck"), (n) => classes(n).some((c) => /^is-(warn|fail)$/.test(c))).length,
    0,
    "and none is drawn amber or red",
  );
  assert.equal(hrefOf(none, "steps_overdue"), "#/clients/seg:steps_due", "the list is still a door at 0");
});

test("where they stand: four lists, a door each, greyed under five people", () => {
  const v = foldOf();
  const tree = draw();
  const strip = byTestId(tree, "people-stand");
  assert.deepEqual(
    metricsOf(strip).map((m) => figureProps(tree, m).label),
    ["Said yes to messages", "Can receive offers", "Opted out", "Quiet 30+ days"],
    "People's own names for its lists",
  );
  assert.deepEqual(
    metricsOf(strip).map((m) => valueOf(figureOf(tree, m))),
    ["340", "40", "22", "270"],
  );
  assert.deepEqual(
    ["said_yes_messages", "can_receive_offers", "opted_out_now", "quiet_now"].map((m) => hrefOf(tree, m)),
    ["#/clients/seg:opted_in", "#/clients/seg:offers_ok", "#/clients/seg:opted_out", "#/clients/seg:quiet"],
    "a door to each list",
  );
  for (const f of v.stand) {
    const props = figureProps(tree, f.metric);
    assert.equal(props.meta, f.meta, `${f.metric}: the fold's line, of the book`);
    assert.deepEqual([props.n, props.minN], [520, 5], `${f.metric}: a share of the book`);
    assert.equal(classes(figureOf(tree, f.metric)).includes("is-thin"), false, `${f.metric}: of 520 it is read`);
    assert.equal(props.tone, undefined, `${f.metric}: where they stand needs nobody, and failed nothing`);
  }
  // A book of three people: every figure is a share of too few, greyed and saying so.
  const small = { ...POOL, people: 3, lists: { opted_in: 2, offers_ok: 1, opted_out: 0, quiet: 1 } };
  const thin = draw({ own: held(dtoWith({}, small), "7d") });
  for (const m of ["said_yes_messages", "can_receive_offers", "opted_out_now", "quiet_now"]) {
    assert.deepEqual([figureProps(thin, m).n, figureProps(thin, m).minN], [3, 5], `${m}: n=3, minN=5`);
    assert.ok(classes(figureOf(thin, m)).includes("is-thin"), `${m}: greyed`);
    assert.equal(
      textOf(find(figureOf(thin, m), (n) => classes(n).includes("figure-n"))),
      "only 3, too few to read",
      `${m}: and it says how few`,
    );
  }
  assert.equal(valueOf(figureOf(thin, "opted_out_now")), "0", "a count that is zero is still shown");
  assert.equal(hrefOf(thin, "quiet_now"), "#/clients/seg:quiet", "and the lists are still doors");
});

test("a share of too few is greyed and says so", () => {
  const few = dtoWith({ reached: { now: { people: 3, new: 1 }, before: { people: 31, new: 8 } } });
  const tree = draw({ own: held(few, "7d") });
  const figure = find(tree, (n) => n.type === Figure && n.props.id === "new_people");
  assert.deepEqual([figure.props.n, figure.props.minN], [3, 5], "new people of 3 who reached you");
  const drawn = figureOf(tree, "new_people");
  assert.ok(classes(drawn).includes("is-thin"), "the kit greys it");
  assert.equal(textOf(find(drawn, (n) => classes(n).includes("figure-n"))), "only 3, too few to read");
  assert.equal(valueOf(drawn).startsWith("1"), true, "the number is still said");
  const plain = find(tree, (n) => n.type === Figure && n.props.id === "people_reached");
  assert.equal(plain.props.n, undefined, "a count of people is not a share");
  assert.equal(classes(figureOf(tree, "people_reached")).includes("is-thin"), false);
  // Enough people: read.
  assert.equal(classes(figureOf(draw(), "new_people")).includes("is-thin"), false, "of 40 it is read");
});

test("the head says the lens's own sentence once its read is held, and the frame's own until then and when it failed", () => {
  const fold = foldOf();
  const R = surface();
  assert.ok(fold.head, "the world's read says something");
  draw({ R });
  assert.equal(standingSaid().title, "Reports");
  assert.equal(standingSaid().sentence, fold.head, "the read held: the fold's head");
  draw({ R, own: undefined });
  assert.equal(standingSaid().sentence, R.vm.lines.people, "before it lands: the frame's count of new people");
  // A read for a period on its way: what is held of the period left still names its comparison, as Reviews' does.
  draw({ R, own: held(dtoWith(), "30d") });
  assert.equal(standingSaid().sentence, fold.head, "the period left");
  // One that failed says nothing of the period it left.
  setStatus("reports_people", "degraded");
  try {
    draw({ R, own: held(dtoWith(), "30d") });
    assert.equal(standingSaid().sentence, R.vm.lines.people, "failed: the frame's");
    setStatus("reports_people", "seeded");
    draw({ R, own: undefined });
    assert.equal(standingSaid().sentence, R.vm.lines.people, "failed with none held: the frame's");
  } finally {
    setStatus("reports_people", "live");
  }
  // A database with no people_series has no head to say.
  draw({ R, own: held(NO_FUNCTION, "7d") });
  assert.equal(standingSaid().sentence, R.vm.lines.people, "no window: the frame's");
  // A period nobody reached the business in still has one.
  draw({ R: surface({ report: quiet() }), own: held(dtoWith(QUIET), "7d") });
  assert.equal(standingSaid().sentence, foldOf(dtoWith(QUIET)).head);
  assert.match(standingSaid().sentence, /^Nobody reached you in this period/);
});

test("the kept cards are the frame's: New people, adding up, and when they reach you", () => {
  const R = surface();
  const tree = draw({ R });
  assert.deepEqual(
    cardOf(tree, "chart-people").props.table.rows,
    R.vm.people.points.map((p) => [p.label, p.newPeople]),
    "the frame's days",
  );
  assert.equal(lineOf(tree, "chart-rhythm"), R.vm.lines.rhythm, "the week's own line");
  // The hours and the week are counted in the frame's unit, said in contracts' words.
  assert.equal(find(tree, (n) => n.type === HeatStrip).props.unit, "messages and calls");
  assert.equal(
    all(byTestId(tree, "chart-rhythm"), (n) => classes(n).includes("ck-cell")).length,
    R.vm.hours ? 24 : 0,
    "a cell an hour",
  );
});
