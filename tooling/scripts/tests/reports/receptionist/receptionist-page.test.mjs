/**
 * The Receptionist lens drawn in the spec's five parts (surfaces/reports/lenses/receptionist.tsx, receptionist-mix.tsx and
 * receptionist-time.tsx), EXECUTED on the stub React over the two reads it draws from: the frame's (`reports`: who answered, why it
 * stopped, the calls, asked then booked, how fast it answers) and its own (`reports_receptionist`: the hold, the topics, the
 * languages, how calls ended, the booking link, the time between steps and what is stuck, folded on the page by the real
 * `toReceptionistReportVM`). Each read fails alone: the kept cards stand without the new ones, one failed read stands in their
 * place, and a database with no function yet draws neither. A figure carries the count it is of, a period with nothing in a part
 * says so in the fold's words and draws no bar of nothing, and "why it stopped" is no door.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shiftKey } from "@chanlytics/contracts";
import { toReceptionistReportVM } from "@chanlytics/contracts/report-lens";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find, press } from "../../_legacy-react.mjs";
import { quiet, rday, surface } from "../_report-world.mjs";
import { FACTS, NO_FUNCTION, QUIET, READ_AT, dtoWith, ownHeld } from "./_receptionist-world.mjs";

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
const { forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const SERIES = await import(`${S}/surfaces/reports/series.ts`);
const CHARTS_CSS = readFileSync(new URL(`${S}/legacy/styles/charts.css`, import.meta.url), "utf8");
const { DotPlot } = await import(`${S}/surfaces/kit/charts/dot.tsx`);
const { BarList } = await import(`${S}/surfaces/kit/charts/bar.tsx`);
const { LineChart } = await import(`${S}/surfaces/kit/charts/line.tsx`);
const { ChartCard, SegmentBar } = await import(`${S}/surfaces/kit/charts/card.tsx`);
const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);
after(() => forgetStanding());

/** The week's replies as the frame reads them: most waited the one-minute hold and went out as it ended, three took longer, one had none. */
const HELD = [
  ...Array.from({ length: 8 }, () => ({ day: "2026-09-01", s: 62, hold: 60 })),
  { day: "2026-08-29", s: 6, hold: 0 },
  { day: "2026-08-30", s: 100, hold: 60 },
  { day: "2026-09-03", s: 200, hold: 60 },
  { day: "2026-09-04", s: 600, hold: 60 },
];
/** The frame's read of a week with a hold set, and of the same week with none. */
const HOLD_R = surface({ report: { replies: HELD, reply_seconds: HELD.map((r) => r.s) } });
const PLAIN_R = surface();

/** The Receptionist lens over what both reads hold, for the period the strip shows. */
const draw = ({ R = HOLD_R, period = "7d", ...opts } = {}) => {
  keepReportPeriod(period);
  setSurfaceValue("reports", R);
  setSurfaceValue("reports_receptionist", "own" in opts ? opts.own : ownHeld(dtoWith(), period));
  fresh();
  navigated.length = 0;
  return ReportsPage({ pathname: "/w/harbor/reports/receptionist" });
};
const NEW_IDS = [
  "chart-hold",
  "chart-topics",
  "chart-languages",
  "chart-call-endings",
  "receptionist-link",
  "receptionist-figures",
  "receptionist-stuck",
];
const KEPT_IDS = [
  "receptionist-strip",
  "chart-answered",
  "chart-reasons",
  "chart-calls",
  "chart-booking",
  "chart-reply",
];
const present = (tree, ids) => ids.map((id) => !!byTestId(tree, id));
const figureOf = (tree, metric) => find(tree, (n) => n.type === "div" && n.props["data-figure"] === metric);
const metricsOf = (strip) =>
  all(strip, (n) => n.type === "div" && n.props["data-figure"]).map((n) => n.props["data-figure"]);
const plotOf = (tree) => find(byTestId(tree, "chart-reply"), (n) => n.type === DotPlot);
const dimmed = (tree) => all(tree, (n) => n.props?.["data-loading"] === "");
const foldOf = (dto = dtoWith()) => toReceptionistReportVM(dto, { nowMs: READ_AT });

test("the five parts, in order, for a workspace that has everything", () => {
  const tree = draw();
  const order = [
    "receptionist-strip",
    "chart-answered",
    "chart-reasons",
    "chart-hold",
    "chart-topics",
    "chart-languages",
    "chart-calls",
    "chart-call-endings",
    "chart-booking",
    "chart-reply",
    "receptionist-figures",
    "receptionist-stuck",
  ];
  const seen = all(tree, (n) => order.includes(n.props?.["data-testid"])).map((n) => n.props["data-testid"]);
  assert.deepEqual(seen, order, "the strip against before, the mix, the time between steps, what is stuck");
  assert.ok(byTestId(tree, "receptionist-time"), "the time between steps is a part of its own");
  const strip = byTestId(tree, "receptionist-strip");
  assert.equal(strip.type, "dl", "terms and their values");
  assert.ok(classes(strip).includes("quad"), "four across");
  assert.deepEqual(metricsOf(strip), ["customer_messages", "answered_share", "reply_median", "handovers"]);
  // The time between steps: your first reply and the time to settle a handover, the calls nobody took, and what came while closed.
  assert.deepEqual(metricsOf(byTestId(tree, "receptionist-figures")), [
    "handover_first_reply",
    "handover_settled",
    "missed_calls_answered",
    "answered_while_closed",
  ]);
  assert.ok(classes(byTestId(tree, "receptionist-figures")).includes("quad"));
  assert.deepEqual(metricsOf(byTestId(tree, "receptionist-stuck")), [
    "waiting_on_you",
    "call_backs",
    "replies_held_back",
  ]);
  assert.ok(classes(byTestId(tree, "receptionist-stuck")).includes("trio"), "three across");
  assert.equal(byTestId(tree, "reports-real").props["data-lens"], "receptionist");
});

test("every sentence and number a new card draws is the fold's: the rows, their lines, the link and the figures", () => {
  const v = foldOf();
  const tree = draw();
  const rowsOf = (id) => find(byTestId(tree, id), (n) => n.type === BarList).props.rows.map((r) => [r.label, r.value]);
  const lineOf = (id) => textOf(find(byTestId(tree, id), (n) => classes(n).includes("ck-card-takeaway")));
  const wanted = (part) => part.rows.map((r) => [r.label, r.value]);
  assert.deepEqual(rowsOf("chart-hold"), wanted(v.hold));
  assert.equal(lineOf("chart-hold"), v.hold.line);
  assert.deepEqual(rowsOf("chart-topics"), wanted(v.topics));
  assert.equal(lineOf("chart-topics"), v.topics.line);
  assert.deepEqual(rowsOf("chart-languages"), wanted(v.languages));
  assert.equal(lineOf("chart-languages"), v.languages.line);
  assert.deepEqual(rowsOf("chart-call-endings"), wanted(v.callEndings));
  assert.equal(lineOf("chart-call-endings"), v.callEndings.line);
  assert.equal(
    textOf(byTestId(tree, "receptionist-link")),
    v.link.line,
    "the booking link and what came of it, in the fold's words",
  );
  assert.ok(
    find(byTestId(tree, "chart-booking"), (n) => n.props?.["data-testid"] === "receptionist-link"),
    "under the share asked, then booked",
  );
  for (const [metric, fig] of [
    ...v.handover.map((f) => [f.metric, f]),
    [v.missed.metric, v.missed],
    [v.closed.metric, v.closed],
    ...v.stuck.map((f) => [f.metric, f]),
  ]) {
    const drawn = figureOf(tree, metric);
    assert.equal(textOf(find(drawn, (n) => classes(n).includes("figure-value"))).startsWith(fig.value), true, metric);
    assert.equal(textOf(find(drawn, (n) => classes(n).includes("figure-meta"))), fig.meta, `${metric}: its line`);
  }
  // The title of each card names it for a person who reads the page aloud.
  assert.deepEqual(
    ["chart-hold", "chart-topics", "chart-languages", "chart-call-endings"].map((id) =>
      textOf(find(byTestId(tree, id), (n) => n.type === "h3")),
    ),
    ["In the hold", "What they asked about", "Replied in", "How calls ended"],
  );
});

test("Why it stopped is not a door: the Inbox takes no reason, so its rows are plain and nothing in the lens leads there from them", () => {
  const tree = draw();
  const reasons = byTestId(tree, "chart-reasons");
  assert.ok(
    find(reasons, (n) => n.type === BarList),
    "its rows are still there",
  );
  assert.equal(
    find(reasons, (n) => n.props?.onPick),
    null,
    "no row opens anything",
  );
  assert.equal(
    all(reasons, (n) => n.type === "button" && classes(n).includes("ck-barlist-row")).length,
    0,
    "and none is a button",
  );
  assert.equal(
    find(tree, (n) => n.type === BarList && n.props.onPick),
    null,
    "no list of the lens is a door",
  );
  // The door to the Inbox is part five's "Waiting on you" (the next test), not a row here.
});

test("the stuck figures are doors: Waiting on you and Replies held back open the Inbox, Call-backs open Today", () => {
  const tree = draw();
  const door = (metric) => find(figureOf(tree, metric), (n) => n.type === "a");
  const label = (metric) => find(tree, (n) => n.type === Figure && n.props.id === metric).props.label;
  assert.equal(label("waiting_on_you"), "Waiting on you");
  assert.equal(door("waiting_on_you").props.href, "#/inbox");
  assert.equal(label("call_backs"), "Call-backs");
  assert.equal(door("call_backs").props.href, "#/today");
  assert.equal(label("replies_held_back"), "Replies held back");
  assert.equal(door("replies_held_back").props.href, "#/inbox");
  press(door("waiting_on_you"));
  press(door("call_backs"));
  assert.deepEqual(navigated, ["inbox", "today"], "and a plain press goes there by the app's own way");
  // The figures of the time between steps open nothing: they count what is past.
  for (const metric of ["handover_first_reply", "handover_settled", "missed_calls_answered", "answered_while_closed"])
    assert.equal(door(metric), null, `${metric}: no page of its own`);
});

test("the reply card plots each reply past its hold: a dot a reply on the window's days, the hold the line they are measured from, and no line of medians", () => {
  const tree = draw();
  const card = byTestId(tree, "chart-reply");
  const plot = plotOf(tree);
  assert.ok(plot, "a dot plot");
  assert.equal(plot.props.dots.length, HOLD_R.vm.replyTime.dots.length);
  assert.equal(plot.props.dots.length, HELD.length, "a dot for every reply");
  assert.deepEqual(
    plot.props.dots.map((d) => d.value),
    HOLD_R.vm.replyTime.dots.map((d) => d.past),
    "each is the seconds past its own hold",
  );
  assert.deepEqual(
    plot.props.reference,
    { value: 0, label: "your 1-minute hold ends" },
    "the line is where the hold ends",
  );
  assert.deepEqual(
    plot.props.days.map((d) => d.day),
    HOLD_R.vm.answered.points.map((p) => p.day),
    "the slots are the window's days, one a calendar day",
  );
  assert.equal(
    find(card, (n) => n.type === LineChart),
    null,
    "no line of medians over it",
  );
  assert.ok(byTestId(card, "reply-spread"), "the spread stays under the plot");
  const said = all(card, (n) => classes(n).includes("ck-dotplot-ref"));
  assert.deepEqual(said.map(textOf), ["your 1-minute hold ends"], "the reference is said once, in the plot's caption");
  assert.equal(
    textOf(find(card, (n) => n.type === "svg")).includes("your 1-minute hold ends"),
    false,
    "and not on the line, where the replies sent as the hold ended land",
  );
  // Its table twin is the dots by day: the replies each day had and the slowest.
  const twin = find(tree, (n) => n.type === ChartCard && n.props.testid === "chart-reply").props.table;
  assert.deepEqual(twin.columns, ["Day", "Replies plotted", "Slowest, past the hold"]);
  assert.deepEqual(twin.rows, [
    ["Aug 29", 1, "6s, no hold"],
    ["Aug 30", 1, "40s"],
    ["Sep 1", 8, "2s"],
    ["Sep 3", 1, "2m 20s"],
    ["Sep 4", 1, "9m"],
  ]);
  // No hold set: the line is not drawn, and a dot is a reply's seconds.
  const plain = plotOf(draw({ R: PLAIN_R }));
  assert.equal(plain.props.reference, null, "no yardstick the owner never set");
  assert.equal(plain.props.dots.length, PLAIN_R.vm.replyTime.dots.length);
});

test("a dot says what it is: seconds past the hold for a held reply, the whole time and no hold for one sent with none", () => {
  const replies = [...HELD, { day: "2026-09-02", s: 41, hold: 60 }];
  const R = surface({ report: { replies, reply_seconds: replies.map((r) => r.s) } });
  const plot = plotOf(draw({ R }));
  const said = (reply) => {
    const i = replies.indexOf(reply);
    return plot.props.describe(plot.props.dots[i], i);
  };
  assert.equal(said(HELD[8]), "Aug 29: answered in 6s, no hold", "a reply with no hold is not 'past the hold'");
  assert.equal(said(HELD[0]), "Sep 1: 2s past the hold");
  assert.equal(said(HELD[10]), "Sep 3: 2m 20s past the hold");
  assert.equal(said(replies.at(-1)), "Sep 2: went out as the hold ended");
  // The table twin words the same: an unheld day's slowest is its whole time, said so; a held day's is past the hold.
  const twin = find(draw({ R }), (n) => n.type === ChartCard && n.props.testid === "chart-reply").props.table;
  assert.deepEqual(
    twin.rows.map((r) => [r[0], r[2]]),
    [
      ["Aug 29", "6s, no hold"],
      ["Aug 30", "40s"],
      ["Sep 1", "2s"],
      ["Sep 2", "0s"],
      ["Sep 3", "2m 20s"],
      ["Sep 4", "9m"],
    ],
  );
  // No hold set at all: every reply is a whole time, and the plot says so without 'no hold' on each.
  const plain = plotOf(draw({ R: PLAIN_R }));
  assert.match(plain.props.describe(plain.props.dots[0], 0), /^[^:]+: answered in \d+[ms]/);
  assert.doesNotMatch(plain.props.describe(plain.props.dots[0], 0), /no hold|past the hold/);
});

test("over a longer window the slots are still days: thirty of them, never the five weeks the speed line is read in", () => {
  const days = Array.from({ length: 60 }, (_, i) => shiftKey("2026-09-04", i - 59));
  const series = days.map((d, i) =>
    rday(d, { messages_in: 2, conversations: 1, answered_ai: 2, calls: i % 9 === 0 ? 1 : 0 }),
  );
  const replies = days.slice(30).flatMap((d, i) => [{ day: d, s: 61 + (i % 7), hold: 60 }]);
  const R = surface({
    report: { days: 30, span_days: 60, series, replies, reply_seconds: replies.map((r) => r.s) },
  });
  const long = { ...R, range: "30d", key: "30d", period: "30d", days: 30 };
  assert.equal(long.vm.speed.unit, "week", "the speed read is by the week past two weeks");
  const plot = plotOf(draw({ R: long, period: "30d", own: ownHeld(dtoWith(), "30d") }));
  assert.equal(plot.props.days.length, 30);
  assert.deepEqual(
    plot.props.days.map((d) => d.day),
    long.vm.answered.points.map((p) => p.day),
  );
  assert.ok(
    plot.props.dots.every((d) => plot.props.days.some((s) => s.day === d.day)),
    "every dot has a day to stand on",
  );
  assert.equal(plot.props.dots.length, replies.length);
});

test("a spread wears the ordinal ramp by place, and a sixth or seventh value stays on the ramp's last step", () => {
  const { rptSpread } = SERIES;
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, label: `Row ${i}`, value: 1, share: 1 }));
  const colors = (n) => Object.values(rptSpread(rows(n))).map((c) => c.color);
  assert.deepEqual(
    colors(5),
    [5, 4, 3, 2, 1].map((n) => `var(--chart-ramp-${n})`),
    "fastest first and darkest",
  );
  const seven = colors(7);
  assert.equal(seven.length, 7);
  const defined = new Set([...CHARTS_CSS.matchAll(/--chart-ramp-(\d+):/g)].map((m) => `var(--chart-ramp-${m[1]})`));
  assert.ok(defined.size >= 5, "the ramp's steps are the stylesheet's");
  for (const color of seven) assert.ok(defined.has(color), `${color} is a token the ramp defines`);
  assert.deepEqual(seven.slice(4), Array(3).fill("var(--chart-ramp-1)"), "past its last step it stays on it");
});

test("the caller's mood wears the ramp, not red and green", () => {
  const tree = draw();
  const mood = find(byTestId(tree, "chart-calls"), (n) => n.type === SegmentBar);
  const colors = Object.values(mood.props.config).map((c) => c.color);
  assert.ok(colors.length >= 2);
  assert.ok(
    colors.every((c) => /^var\(--chart-ramp-\d\)$/.test(c)),
    colors.join(" "),
  );
});

test("a figure with too few is greyed and says so", () => {
  const few = dtoWith({
    handover: {
      ...FACTS.handover,
      now: { n: 4, replied: { n: 3, median_s: 120 }, settled: { n: 9, median_s: 3900 } },
    },
  });
  const tree = draw({ own: ownHeld(few) });
  const figure = find(tree, (n) => n.type === Figure && n.props.id === "handover_first_reply");
  assert.deepEqual([figure.props.n, figure.props.minN], [3, 5]);
  const drawn = figureOf(tree, "handover_first_reply");
  assert.ok(classes(drawn).includes("is-thin"), "the kit greys it");
  assert.equal(textOf(find(drawn, (n) => classes(n).includes("figure-n"))), "only 3, too few to read");
  assert.equal(
    textOf(find(drawn, (n) => classes(n).includes("figure-value"))).startsWith("2m"),
    true,
    "the number is still said",
  );
  assert.equal(classes(figureOf(tree, "handover_settled")).includes("is-thin"), false, "nine is read");
});

test("no hours: the closed figure says so and holds the door to set them; no profile: no figure", () => {
  const unset = draw({ own: ownHeld(dtoWith({}, { hours: {} })) });
  const closed = figureOf(unset, "answered_while_closed");
  assert.ok(closed, "the figure is there, asking");
  assert.equal(textOf(find(closed, (n) => classes(n).includes("figure-meta"))), "set your opening hours to see this");
  assert.equal(textOf(find(closed, (n) => classes(n).includes("figure-value"))), "—", "a dash, never a zero");
  assert.equal(find(closed, (n) => n.type === "a").props.href, "#/admin/workspace", "the door to set them");
  assert.equal(classes(closed).includes("is-thin"), false);

  const unread = draw({ own: ownHeld(dtoWith({}, null)) });
  assert.equal(figureOf(unread, "answered_while_closed"), null, "hours that could not be read say nothing of them");
  assert.deepEqual(metricsOf(byTestId(unread, "receptionist-figures")), [
    "handover_first_reply",
    "handover_settled",
    "missed_calls_answered",
  ]);
  assert.ok(classes(byTestId(unread, "receptionist-figures")).includes("trio"), "three across, not four with a gap");
});

test("an email-only workspace: no languages card, and topics say what they cover", () => {
  const email = dtoWith({
    topics: { of: 6, stamped: 0, by_intent: {} },
    languages: { of: 0, stamped: 0, by_language: {} },
  });
  const tree = draw({ own: ownHeld(email) });
  assert.equal(byTestId(tree, "chart-languages"), null, "one language is no mix");
  const topics = byTestId(tree, "chart-topics");
  assert.ok(textOf(topics).includes("No topic is recorded for the 6 messages that came by text or WhatsApp."));
  assert.equal(
    find(topics, (n) => n.type === BarList),
    null,
    "no bar of nothing",
  );
  // One language is no card either.
  const one = draw({ own: ownHeld(dtoWith({ languages: { of: 9, stamped: 9, by_language: { en: 9 } } })) });
  assert.equal(byTestId(one, "chart-languages"), null);
  assert.ok(byTestId(one, "chart-topics"), "the others stand");
});

test("a quiet period: no card draws a bar of zeros, a 0% or a NaN, and every part says why it is empty", () => {
  const tree = draw({ own: ownHeld(dtoWith(QUIET)) });
  const v = foldOf(dtoWith(QUIET));
  for (const id of ["chart-hold", "chart-topics", "chart-call-endings"]) {
    const card = byTestId(tree, id);
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
  }
  assert.ok(textOf(byTestId(tree, "chart-hold")).includes(v.hold.empty));
  assert.ok(textOf(byTestId(tree, "chart-topics")).includes(v.topics.empty));
  assert.ok(textOf(byTestId(tree, "chart-call-endings")).includes(v.callEndings.empty));
  assert.equal(byTestId(tree, "chart-languages"), null);
  assert.equal(textOf(byTestId(tree, "receptionist-link")), v.link.line);
  for (const metric of ["handover_first_reply", "handover_settled", "missed_calls_answered"]) {
    const drawn = figureOf(tree, metric);
    assert.equal(textOf(find(drawn, (n) => classes(n).includes("figure-value"))), "—", `${metric}: a dash`);
    assert.equal(classes(drawn).includes("is-thin"), false, `${metric}: of none there is no ratio to grey`);
  }
  const lensText = ["chart-hold", "chart-topics", "chart-call-endings", "receptionist-figures", "receptionist-stuck"]
    .map((id) => textOf(byTestId(tree, id)))
    .join(" | ");
  assert.doesNotMatch(lensText, /\b0%|NaN|Infinity/, lensText);
});

test("a period nobody wrote or called in draws the Overview's empty and none of the lens's cards, whatever its own read holds", () => {
  const tree = draw({ R: surface({ report: quiet() }) });
  assert.ok(byTestId(tree, "reports-empty"));
  assert.deepEqual(
    present(tree, [...KEPT_IDS, ...NEW_IDS]),
    [...KEPT_IDS, ...NEW_IDS].map(() => false),
  );
});

test("its own read still out: the kept cards stand and the new ones are absent, and the page dims until it lands", () => {
  const tree = draw({ own: undefined });
  assert.deepEqual(
    present(tree, KEPT_IDS),
    KEPT_IDS.map(() => true),
    "the frame's cards stand on the frame's read",
  );
  assert.deepEqual(
    present(tree, NEW_IDS),
    NEW_IDS.map(() => false),
    "nothing of the lens's own",
  );
  assert.equal(byTestId(tree, "receptionist-failed"), null, "a read still out is not a failed one");
  assert.deepEqual(
    dimmed(tree),
    [byTestId(tree, "reports-real")],
    "the page says a period is on its way, by the one rule every page uses",
  );
  assert.equal(all(tree, (n) => n.props?.["data-dims"] === true)[0].props["aria-busy"], "true");
  // The read held is of another period than the one shown: it is not drawn under this one's name.
  const left = draw({ own: ownHeld(dtoWith(), "30d") });
  assert.deepEqual(
    present(left, NEW_IDS),
    NEW_IDS.map(() => false),
    "a period left is not drawn",
  );
  assert.deepEqual(
    present(left, KEPT_IDS),
    KEPT_IDS.map(() => true),
  );
  assert.equal(dimmed(left).length, 1);
  // And it lands: nothing is on its way any more.
  const landed = draw();
  assert.deepEqual(dimmed(landed), []);
  assert.deepEqual(
    present(landed, NEW_IDS),
    NEW_IDS.map(() => true),
  );
});

test("its own read failed: one failed read with its Retry stands in place of the new cards, and the kept cards stand", () => {
  setStatus("reports_receptionist", "seeded");
  try {
    const tree = draw({ own: undefined });
    const failed = all(tree, (n) => n.props?.["data-testid"] === "receptionist-failed");
    assert.equal(failed.length, 1, "one, not one a card");
    assert.ok(textOf(failed[0]).includes("Couldn't read the receptionist's other numbers"), textOf(failed[0]));
    const read = find(tree, (n) => n.props?.surface === "reports_receptionist");
    assert.ok(read, "its Retry reads the lens's own surface again");
    assert.equal(read.props.kind, "card");
    assert.deepEqual(
      present(tree, NEW_IDS),
      NEW_IDS.map(() => false),
    );
    assert.deepEqual(
      present(tree, KEPT_IDS),
      KEPT_IDS.map(() => true),
      "the frame's read is current and stands",
    );
    assert.deepEqual(dimmed(tree), [], "nothing is dimmed: a dimmed card takes no press, and the Retry is on it");
  } finally {
    setStatus("reports_receptionist", "live");
  }
});

test("a pick whose own read could not be made says so with its Retry, and never holds the period it left under the new one's name", () => {
  setStatus("reports_receptionist", "degraded");
  try {
    const tree = draw({ own: ownHeld(dtoWith(), "30d") });
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "receptionist-failed").length, 1);
    assert.deepEqual(
      present(tree, NEW_IDS),
      NEW_IDS.map(() => false),
      "the period left is not drawn",
    );
    assert.deepEqual(dimmed(tree), []);
    // The same failed read, with what is held of the period shown: the figures are current and stand.
    const current = draw();
    assert.equal(byTestId(current, "receptionist-failed"), null);
    assert.deepEqual(
      present(current, NEW_IDS),
      NEW_IDS.map(() => true),
    );
  } finally {
    setStatus("reports_receptionist", "live");
  }
});

test("a database with no function yet draws none of the new parts and no failure; the kept cards stand", () => {
  const tree = draw({ own: ownHeld(NO_FUNCTION) });
  assert.deepEqual(
    present(tree, NEW_IDS),
    NEW_IDS.map(() => false),
  );
  assert.equal(byTestId(tree, "receptionist-failed"), null, "a missing function is not a failed read");
  assert.deepEqual(
    present(tree, KEPT_IDS),
    KEPT_IDS.map(() => true),
  );
  assert.deepEqual(dimmed(tree), []);
});
