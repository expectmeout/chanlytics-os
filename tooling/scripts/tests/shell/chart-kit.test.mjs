/**
 * The chart kit, EXECUTED on a stub React: clean axes, a curve that never overshoots its data, gaps where a day has
 * nothing, one rule for the x labels, and the parts every chart shares: the card that owns its series
 * (colours, legend, table twin, a CSV spelled by contracts' csvCell), a tooltip that stays inside the card at any
 * width, one keyboard stop per chart, and each chart drawn and read back. Run against the kit's own modules
 * (surfaces/kit/charts), which the app imports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { durationWords, reportHourWords } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../_legacy-react.mjs";

installLegacyReact();
// The kit's charts are TSX (surfaces/kit/charts, decision 0015): imported, and drawn on the same stub React.
const K = "../../../../apps/dashboard/src/surfaces/kit/charts";
const { ckNice, ckNiceSeconds, ckSecondsLabel, ckMonotone, ckRuns, ckEvery, ckHeight, ckTip, ckDescribe, ckTipSide } =
  await import(`${K}/geometry.ts`);
const { CkXLabels, ChartLegend, ChartTooltip } = await import(`${K}/parts.tsx`);
const { ChartCard, SegmentBar } = await import(`${K}/card.tsx`);
const { BarChart, BarList } = await import(`${K}/bar.tsx`);
const { LineChart } = await import(`${K}/line.tsx`);
const { DotPlot } = await import(`${K}/dot.tsx`);
const { RadarChart } = await import(`${K}/radar.tsx`);
const { RadialChart } = await import(`${K}/radial.tsx`);
const { HeatStrip } = await import(`${K}/heat.tsx`);

const ANSWERED = {
  ai: { label: "Receptionist", color: "var(--chart-1)" },
  you: { label: "You", color: "var(--chart-1-soft)" },
  none: { label: "Unanswered", color: "var(--warn)", icon: "alert" },
};
const DAYS2 = [
  { day: "2026-09-03", label: "Sep 3", short: "3", ai: 3, you: 1, none: 0 },
  { day: "2026-09-04", label: "Sep 4", short: "4", ai: 2, you: 0, none: 1 },
];
const DAYS3 = [...DAYS2, { day: "2026-09-05", label: "Sep 5", short: "5", ai: 1, you: 0, none: 0 }];
const plotOf = (tree) => find(tree, (n) => classes(n).includes("ck-plot"));
const liveOf = (tree) => textOf(find(tree, (n) => n.props?.["aria-live"] === "polite"));
/** Stand in for the browser's file save; returns what was saved and clicked. */
const saving = async (fn) => {
  const saved = [];
  const clicked = [];
  const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, el: globalThis.document.createElement };
  URL.createObjectURL = (blob) => {
    saved.push(blob);
    return "blob:card";
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
    await fn();
    return { saved, clicked };
  } finally {
    URL.createObjectURL = real.create;
    URL.revokeObjectURL = real.revoke;
    globalThis.document.createElement = real.el;
  }
};

/* ------------------------------------------ numbers and geometry ------------------------------------------ */

test("an axis is 0 to a clean top in steps of 1, 2, 5 or 10 x 10^n, and counts never step below 1", () => {
  assert.deepEqual(ckNice(7).ticks, [0, 5, 10]);
  assert.deepEqual(ckNice(38).ticks, [0, 20, 40]);
  assert.deepEqual(ckNice(85, 4).ticks, [0, 50, 100]);
  assert.deepEqual(ckNice(2).ticks, [0, 1, 2]);
  assert.deepEqual(ckNice(1).ticks, [0, 1]);
  assert.deepEqual(ckNice(0).ticks, [0, 1], "an empty chart still has an axis");
});

test("seconds step the way people count them, and say themselves in minutes when they are minutes", () => {
  assert.deepEqual(ckNiceSeconds(47).ticks, [0, 30, 60]);
  assert.deepEqual(ckNiceSeconds(400).ticks, [0, 300, 600]);
  assert.deepEqual([30, 60, 90, 120, 3600].map(ckSecondsLabel), ["30s", "1m", "1m 30s", "2m", "1h"]);
});

test("an axis tick says a duration in contracts' words, at every step the axis takes from 5 seconds to 4 hours", () => {
  assert.equal(ckSecondsLabel(0), "0s", "the axis's baseline still reads 0s");
  assert.equal(ckSecondsLabel(0), durationWords(0));
  assert.deepEqual([5, 75, 600, 2700, 5400, 14400].map(ckSecondsLabel), ["5s", "1m 15s", "10m", "45m", "1h 30m", "4h"]);
  // Off the ticks the axis's old words parted from contracts' ("10m 30s" against "11m"): this pin is what proves the
  // axis says contracts' words; the sweep below proves they agree at every tick it draws.
  assert.equal(ckSecondsLabel(630), "11m");
  const steps = new Set();
  let ticks = 0;
  // Every maximum from 5 s to 4 h, so every step in the axis's list, and every top it makes of them, is drawn once.
  for (let max = 5; max <= 4 * 3600; max += max < 600 ? 1 : 37) {
    const { step, ticks: axis } = ckNiceSeconds(max);
    steps.add(step);
    for (const tick of axis) {
      assert.equal(ckSecondsLabel(tick), durationWords(tick), `${tick} s on an axis of ${max} s`);
      ticks += 1;
    }
  }
  assert.ok(steps.size >= 11, `the range reaches every step of the axis's list (${[...steps].join(", ")})`);
  assert.ok(ticks > 1000, "and draws many ticks");
});

test("the curve never leaves its data's range: a count of 0 is never drawn below the baseline", () => {
  const d = ckMonotone([
    [0, 10],
    [10, 0],
    [20, 10],
    [30, 10],
    [40, 2],
  ]);
  const nums = d
    .replace(/[MC]/g, " ")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);
  assert.ok(
    ys.every((y) => y >= 0 && y <= 10),
    `every control point inside 0..10: ${ys.join(" ")}`,
  );
  assert.equal(ckMonotone([]), "");
  assert.equal(ckMonotone([[1, 2]]), "M1,2");
});

test("a day with nothing is a gap in the line, never a dive to zero", () => {
  assert.deepEqual(ckRuns([[0, 1], null, [2, 3], [4, 5], null]), [
    [[0, 1]],
    [
      [2, 3],
      [4, 5],
    ],
  ]);
});

test("one rule for the x labels: every so many days, always the newest, never one crowding it, whole dates at the ends", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ day: `d${i}`, label: `Day ${i}`, short: String(i) }));
  const said = (n, every, gap = 10) =>
    all(CkXLabels({ data: rows(n), x: (i) => i * gap, every, height: 100 }), (t) => t.type === "text").map(textOf);
  assert.deepEqual(said(30, 7), ["Day 0", "7", "14", "21", "Day 29"], "28 is dropped: one day from the newest");
  assert.deepEqual(said(90, 13).slice(-2), ["78", "Day 89"], "the newest of 90 is labelled");
  assert.deepEqual(
    said(30, 5),
    ["Day 0", "5", "10", "15", "20", "Day 29"],
    "REGRESSION: 25 stood inside the newest's whole date ('25Day 29'; Ruben's screenshot, 18 Oct 2026): dropped",
  );
  assert.deepEqual(
    said(7, 1, 60),
    ["Day 0", "Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"],
    "a week says every date",
  );
  assert.equal(ckEvery(90, 450, 46), 10, "450px of axis holds nine labels of 46px");
});

test("the words a chart says of a point when the page gives none come from the card's config", () => {
  const row = { label: "Sep 1", sent: 4, replied: null };
  const config = { sent: { label: "Sent" }, replied: { label: "Wrote back" } };
  assert.deepEqual(ckTip(row, ["sent", "replied"], config), {
    title: "Sep 1",
    rows: [
      { key: "sent", label: "Sent", value: 4 },
      { key: "replied", label: "Wrote back", value: "—" },
    ],
    note: null,
  });
  assert.equal(ckDescribe(row, ["sent", "replied"], config), "Sep 1: Sent 4, Wrote back nothing");
});

/* ------------------------------------------ the card ------------------------------------------ */

test("the card owns the series: it publishes each colour on its section and draws the legend for two or more", () => {
  fresh();
  const tree = ChartCard({
    title: "Who answered",
    testid: "c",
    config: ANSWERED,
    legend: { values: { ai: 107, you: 3, none: 0 } },
    children: "x",
  });
  const section = byTestId(tree, "c");
  assert.equal(section.props.style["--color-ai"], "var(--chart-1)");
  assert.equal(section.props.style["--color-none"], "var(--warn)");
  const legend = find(tree, (n) => classes(n).includes("ck-legend"));
  assert.equal(textOf(legend), "Receptionist107You3Unanswered0", "values in ink beside their names");
  assert.deepEqual(
    all(legend, (n) => classes(n).includes("ck-key")).map((k) => k.props.style["--k"]),
    ["var(--color-ai)", "var(--color-you)", "var(--color-none)"],
  );
  assert.ok(
    find(legend, (n) => n.type?.name === "Icon" && n.props.name === "alert"),
    "a status series carries its icon",
  );
  fresh();
  assert.equal(
    find(
      ChartCard({ title: "Calls", config: { calls: { label: "Calls", color: "var(--chart-1)" } }, children: "x" }),
      (n) => classes(n).includes("ck-legend"),
    ),
    null,
    "one series: the title already names it",
  );
  fresh();
  assert.equal(
    find(ChartCard({ title: "Where", config: ANSWERED, legend: false, children: "x" }), (n) =>
      classes(n).includes("ck-legend"),
    ),
    null,
    "a chart with its own legend asks for none",
  );
  fresh();
  assert.equal(
    textOf(ChartLegend({ config: ANSWERED, keys: ["ai"], values: { ai: 4 }, min: 1 })),
    "Receptionist4",
    "a legend may be asked of one, where one is the point",
  );
});

test("a card switches to its table twin and back; a twin can be made from the chart's own rows, a missing value its dash", () => {
  fresh();
  const draw = () =>
    ChartCard({
      title: "Calls",
      testid: "c",
      config: { calls: { label: "Calls", color: "var(--chart-1)" } },
      twin: {
        data: [
          { label: "Sep 1", calls: 2 },
          { label: "Sep 2", calls: null },
        ],
        keys: ["calls"],
        first: "Day",
      },
      children: "the chart",
    });
  let tree = draw();
  assert.ok(textOf(byTestId(tree, "c")).includes("the chart"));
  press(byTestId(tree, "card-table"));
  tree = again(draw);
  assert.ok(classes(byTestId(tree, "c")).includes("is-table"), "the card says so, so its switch stays in sight");
  assert.deepEqual(
    all(tree, (n) => n.type === "th").map(textOf),
    ["Day", "Calls"],
    "the columns are the series' names",
  );
  const cells = all(tree, (n) => n.type === "td");
  assert.deepEqual(cells.map(textOf), ["Sep 1", "2", "Sep 2", "—"]);
  assert.deepEqual(
    cells.map((c) => c.props.className),
    ["", "num", "", ""],
    "a number sits right; a label and a dash do not",
  );
  press(byTestId(tree, "card-chart"));
  tree = again(draw);
  assert.equal(
    find(tree, (n) => n.type === "table"),
    null,
  );
  fresh();
  assert.equal(
    byTestId(ChartCard({ title: "Asked, then booked", testid: "b", children: "x" }), "card-csv"),
    null,
    "no CSV without a table",
  );
  fresh();
  const listed = ChartCard({
    title: "By playbook",
    table: { columns: ["Source"], rows: [["Win-back"]] },
    switchable: false,
    testid: "s",
    children: "a table already",
  });
  assert.ok(
    byTestId(listed, "card-csv") && !byTestId(listed, "card-table"),
    "a table's card keeps the CSV and drops the switch",
  );
});

test("a card's CSV is spelled by contracts' csvCell: a spreadsheet reads it as UTF-8 and never runs a name as a formula", async () => {
  fresh();
  const table = {
    columns: ["Source", "Sent"],
    rows: [
      ['=HYPERLINK("x")', 4],
      ["Win-back, again", null],
    ],
  };
  const tree = ChartCard({ title: "By campaign and one-off send", table, testid: "c", children: "x" });
  const { saved, clicked } = await saving(() => press(byTestId(tree, "card-csv")));
  assert.deepEqual(clicked, [{ href: "blob:card", download: "by-campaign-and-one-off-send.csv" }]);
  const bytes = new Uint8Array(await saved[0].arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.deepEqual(
    (await saved[0].text()).replace(String.fromCharCode(0xfeff), "").split("\r\n"),
    ["Source,Sent", '"\'=HYPERLINK(""x"")",4', '"Win-back, again",'],
    "a formula made text, a comma quoted, a missing value an empty cell (#679's rule, not a second one)",
  );
  // Inside the phone app a WebView cannot save a file made in the page: the same words go to the app's share sheet.
  const handed = [];
  // The app's bridge, as installed in the phone's WebView: it takes the file and cancels the ask.
  globalThis.window.dispatchEvent = (e) => {
    if (e.type === "app:file") (handed.push(e.detail), e.preventDefault());
    return !e.defaultPrevented;
  };
  try {
    const inApp = await saving(() => press(byTestId(tree, "card-csv")));
    assert.deepEqual(inApp.clicked, [], "REGRESSION: a blob download the phone's WebView drops without a word");
    assert.equal(handed.length, 1);
    assert.equal(handed[0].name, "by-campaign-and-one-off-send.csv");
    assert.equal(handed[0].type, "text/csv");
    // The same words the browser saves, with its byte-order mark (Blob.text() drops it as it decodes).
    assert.equal(handed[0].text, String.fromCharCode(0xfeff) + (await saved[0].text()), "the same file, mark and all");
  } finally {
    delete globalThis.window.dispatchEvent;
  }
});

/* ------------------------------------------ the tooltip and the keyboard ------------------------------------------ */

test("a tooltip takes whichever side of the point holds it, or the whole plot, so it never leaves the card at any width", () => {
  const span = (x, w) => {
    const side = ckTipSide(x, w);
    return side === "start" ? [x + 14, x + 14 + 260] : side === "end" ? [x - 14 - 260, x - 14] : [0, w];
  };
  for (const w of [320, 449, 600, 1000]) {
    for (let x = 0; x <= w; x += 7) {
      const [l, r] = span(x, w);
      assert.ok(l >= 0 && r <= w, `width ${w}, point at ${x}: the tip spans ${l}..${r}`);
    }
  }
  fresh();
  assert.deepEqual(
    [20, 160, 300].map((x) => classes(ChartTooltip({ x, width: 320, children: "t" }))[1]),
    ["start", "pin", "end"],
    "a phone's card",
  );
  assert.equal(
    ChartTooltip({ x: 160, width: 320, children: "t" }).props.style,
    undefined,
    "pinned across the plot, not at the point",
  );
  assert.equal(ChartTooltip({ x: null, width: 600, children: "t" }), null);
});

test("columns: one tab stop, a group named for what it shows; focus reads the newest day, the arrows walk", () => {
  fresh();
  const draw = () =>
    BarChart({ data: DAYS2, keys: ["ai", "you", "none"], config: ANSWERED, ariaLabel: "Messages per day" });
  let tree = draw();
  assert.equal(plotOf(tree).props.tabIndex, 0);
  assert.equal(plotOf(tree).props.role, "group", "a named div with no role is named for nobody");
  assert.equal(plotOf(tree).props["aria-roledescription"], "chart");
  assert.equal(all(tree, (n) => n.props && "tabIndex" in n.props).length, 1, "and no stop per day");
  plotOf(tree).props.onFocus();
  tree = again(draw);
  assert.equal(
    liveOf(tree),
    "Sep 4: Receptionist 2, You 0, Unanswered 1",
    "said in the config's words when the page gives none",
  );
  plotOf(tree).props.onKeyDown({ key: "ArrowLeft", preventDefault() {} });
  tree = again(draw);
  assert.equal(liveOf(tree), "Sep 3: Receptionist 3, You 1, Unanswered 0");
  assert.equal(all(tree, (n) => classes(n).includes("dim")).length, 1, "the other day steps back");
  assert.equal(textOf(find(tree, (n) => classes(n).includes("ck-tip"))), "Sep 33Receptionist1You0Unanswered");
});

test("a point held across a new period that no longer exists reads as none, not as a column out of range", () => {
  fresh();
  let tree = BarChart({ data: DAYS3, keys: ["ai"], config: ANSWERED });
  plotOf(tree).props.onFocus();
  tree = again(() => BarChart({ data: DAYS3, keys: ["ai"], config: ANSWERED }));
  assert.equal(liveOf(tree), "Sep 5: Receptionist 1");
  tree = again(() => BarChart({ data: DAYS2, keys: ["ai"], config: ANSWERED }));
  assert.equal(liveOf(tree), "", "the third day is gone");
  assert.equal(
    all(tree, (n) => /\b(hot|dim)\b/.test(String(n.props?.className || ""))).length,
    0,
    "and no column stepped back for it",
  );
});

/* ------------------------------------------ bars ------------------------------------------ */

test("columns: one a day, stacked bottom-up with a 2px gap of card, only the top segment rounded, never wider than 24px", () => {
  fresh();
  const tree = BarChart({ data: DAYS2, keys: ["ai", "you", "none"], config: ANSWERED, height: 200 });
  const cols = all(tree, (n) => classes(n).includes("ck-col"));
  assert.equal(cols.length, 2);
  const marks = all(cols[0], (n) => classes(n).includes("ck-bar"));
  assert.deepEqual(
    marks.map((m) => [m.type, m.props.fill]),
    [
      ["rect", "var(--color-ai)"],
      ["path", "var(--color-you)"],
    ],
  );
  const youBottom = Number(marks[1].props.d.match(/^M[\d.]+,([\d.]+)/)[1]);
  assert.ok(
    Math.abs(marks[0].props.y - 2 - youBottom) < 0.01,
    `a 2px gap between receptionist and you: ${marks[0].props.y} vs ${youBottom}`,
  );
  assert.ok(marks[0].props.width <= 24);
  assert.ok(
    typeof plotOf(tree).props.onPointerMove === "function" && typeof plotOf(tree).props.onPointerDown === "function",
    "a finger reads a day as a mouse does",
  );
});

test("a chart told to fill takes the room its card has left, and never less than its floor", () => {
  // A row is as tall as the card with most to say. A chart given a number keeps it; a chart given "fill" spends the
  // surplus on itself, so the card has no hole under it -- and keeps a floor, so a row whose cards all fill is
  // exactly as tall as it was before any of them did.
  assert.equal(ckHeight(150, 400, 128), 150, "a number is the height, whatever the room");
  assert.equal(ckHeight("fill", 400, 128), 400, "the room, when there is room");
  assert.equal(ckHeight("fill", 0, 128), 128, "the floor, before the first measure");
  assert.equal(ckHeight("fill", 90, 128), 128, "and the floor when the room is less than it");
  // Drawn: the plot says it fills, carries the floor as its minimum, and the svg is painted over the box (charts.css
  // takes it out of the flow) so the box's height never comes from the svg.
  const filled = plotOf(BarChart({ data: DAYS2, keys: ["ai"], config: ANSWERED, height: "fill", floor: 128 }));
  assert.ok(classes(filled).includes("fill"));
  assert.deepEqual(filled.props.style, { minHeight: 128 });
  assert.equal(find(filled, (n) => n.type === "svg").props.height, 128, "the floor until the box is measured");
  const fixed = plotOf(BarChart({ data: DAYS2, keys: ["ai"], config: ANSWERED, height: 150 }));
  assert.ok(!classes(fixed).includes("fill"));
  assert.deepEqual(fixed.props.style, { height: 150 }, "a fixed chart still sets its own height and nothing else");
  // The line reads the same prop the same way.
  const line = plotOf(LineChart({ data: WEEK, keys: [{ key: "total" }], config: PERIODS, height: "fill", floor: 176 }));
  assert.deepEqual(line.props.style, { minHeight: 176 });
});

test("a bar list: label and value on one line, the bar under them sized against the largest, a row with a door is a button", () => {
  fresh();
  const picked = [];
  const tree = BarList({
    rows: [
      { id: "a", label: "Asked for a person", value: 6 },
      { id: "b", label: "Needs a call back", value: 3 },
    ],
    onPick: (r) => picked.push(r.id),
  });
  assert.deepEqual(
    all(tree, (n) => classes(n).includes("ck-barlist-bar")).map((b) => b.props.style.width),
    ["100%", "50%"],
  );
  const rows = all(tree, (n) => n.type === "button");
  assert.equal(rows.length, 2);
  press(rows[1]);
  assert.deepEqual(picked, ["b"]);
  assert.equal(textOf(tree), "Asked for a person6Needs a call back3");
});

/* ------------------------------------------ lines and areas ------------------------------------------ */

const WEEK = ["Sep 1", "Sep 2", "Sep 3", "Sep 4"].map((label, i) => ({
  day: `2026-09-0${i + 1}`,
  label,
  short: String(i + 1),
  total: [1, 1, 3, 4][i],
  p50: [20, null, 40, 30][i],
}));
const PERIODS = {
  total: { label: "Last 7 days", color: "var(--chart-1)", shape: "line" },
  prior: { label: "The 7 days before", color: "var(--chart-prior)", shape: "line" },
};

test("an area is a line with a filled series: the wash, the period before as a quiet solid line, a crosshair that finds the day", () => {
  fresh();
  const draw = () =>
    LineChart({ data: WEEK, keys: [{ key: "total", fill: true }], config: PERIODS, prior: [2, 3, 3, 5, 9] });
  let tree = draw();
  assert.ok(
    find(tree, (n) => classes(n).includes("ck-area")),
    "the wash",
  );
  assert.equal(find(tree, (n) => classes(n).includes("ck-line")).props.pathLength, 1, "the line draws in once");
  const prior = find(tree, (n) => classes(n).includes("ck-prior"));
  assert.ok(prior && !prior.props.strokeDasharray, "the period before is solid, never dashed");
  assert.equal(prior.props.d.split("C").length - 1, 3, "four days of the period before, not the fifth it was given");
  assert.ok(
    find(tree, (n) => classes(n).includes("end")),
    "the newest point is marked",
  );
  plotOf(tree).props.onFocus();
  tree = again(draw);
  assert.ok(find(tree, (n) => classes(n).includes("ck-crosshair")));
  assert.equal(
    textOf(find(tree, (n) => classes(n).includes("ck-tip"))),
    "Sep 44Last 7 days5The 7 days before",
    "both periods in the config's words",
  );
});

test("a line: a day with nothing is a gap, a lone day a ringed dot, and a reference line is labelled once with no tick beside it", () => {
  fresh();
  const tree = LineChart({
    data: WEEK,
    keys: [{ key: "p50" }],
    config: { p50: { label: "Median reply" } },
    scale: "seconds",
    yFormat: ckSecondsLabel,
    reference: { value: 60, label: "1 min" },
  });
  assert.equal(all(tree, (n) => classes(n).includes("ck-line")).length, 1, "one line, for the run after the gap");
  const dots = all(tree, (n) => n.type === "circle");
  assert.deepEqual(
    dots.map((c) => [c.props.r, classes(c).includes("ck-dot")]),
    [["4", true]],
    "the lone day: 8px across with the card's ring",
  );
  assert.equal(textOf(find(tree, (n) => classes(n).includes("ck-ref"))), "1 min");
  const ticks = all(
    find(tree, (n) => classes(n).includes("ck-y")),
    (n) => n.type === "text",
  ).map(textOf);
  assert.deepEqual(ticks, ["0s", "30s"], "no tick says what the reference line says");
});

/* ------------------------------------------ dots ------------------------------------------ */

// The card's days are the slots (one a calendar day, never a week); each reply is a dot on its day's slot.
const DOT_DAYS = DAYS3.map(({ day, label, short }) => ({ day, label, short }));
const DOT_CONFIG = { dot: { label: "Reply", color: "var(--chart-1)" } };
const drawDots = (dots, extra = {}) =>
  DotPlot({
    days: DOT_DAYS,
    dots,
    config: DOT_CONFIG,
    scale: "seconds",
    reference: { value: 0, label: "your 1-minute hold ends" },
    ariaLabel: "Each reply, past its hold",
    describe: (d) => `${d.day}: ${d.value}s past its hold`,
    ...extra,
  });
const dotsOf = (tree) => all(tree, (n) => classes(n).includes("ck-dotplot-dot"));
const DOTS3 = [
  { day: "2026-09-03", value: 0 },
  { day: "2026-09-03", value: 40 },
  { day: "2026-09-05", value: 300 },
];

test("a dot plot: one dot per event on its day's slot, 0 on the baseline, a reference labelled once, one tab stop the arrows walk", () => {
  fresh();
  const draw = (extra = {}) => drawDots(DOTS3, extra);
  const tree = draw();
  const circles = dotsOf(tree);
  assert.equal(circles.length, 3, "a dot for each event, none for a day with none");
  const base = Number(find(tree, (n) => classes(n).includes("ck-base"))?.props.y1 ?? NaN);
  assert.equal(Number(circles[0].props.cy), base, "a reply sent as the hold ended sits on the baseline");
  assert.ok(Number(circles[2].props.cy) < Number(circles[1].props.cy), "later is higher");
  assert.ok(Number(circles[1].props.cx) > Number(circles[0].props.cx), "two on one day are spread inside its slot");
  assert.deepEqual(
    circles.map((c) => [c.type, c.props.r, c.props.fill]),
    Array(3).fill(["circle", 3, "var(--color-dot)"]),
    "r 3, painted with the card's own --color-dot",
  );
  assert.equal(all(tree, (n) => classes(n).includes("ck-ref")).length, 1, "the reference line is drawn once");
  // Its label is a caption above the svg, not text on the line: replies sent as the hold ended land on the baseline, where
  // the line is, and the words under them were overprinted by the dots (seen on the real page at 390 and 1440 px).
  const captions = all(tree, (n) => classes(n).includes("ck-dotplot-ref"));
  assert.equal(captions.length, 1, "the label is drawn once");
  assert.equal(captions[0].type, "div", "as HTML, in the plot's wrapper");
  assert.equal(textOf(captions[0]), "your 1-minute hold ends");
  const svg = find(tree, (n) => n.type === "svg");
  assert.ok(svg, "the plot's svg");
  assert.equal(
    find(svg, (n) => n === captions[0]),
    null,
    "outside the svg",
  );
  assert.equal(textOf(svg).includes("your 1-minute hold ends"), false, "and no svg text carries it");
  assert.equal(
    all(svg, (n) => classes(n).includes("ck-ref")).length,
    1,
    "the line stays in the svg: one group, with no text in it",
  );
  assert.equal(textOf(find(svg, (n) => classes(n).includes("ck-ref"))), "");
  const kids = tree.props.children.flat();
  assert.ok(kids.indexOf(captions[0]) >= 0 && kids.indexOf(captions[0]) < kids.indexOf(svg), "before the svg");
  const plot = plotOf(tree);
  assert.equal(plot.props.role, "group");
  assert.equal(plot.props["aria-roledescription"], "chart");
  assert.equal(plot.props.tabIndex, 0, "one tab stop for the whole plot");
  assert.equal(all(tree, (n) => n.props && "tabIndex" in n.props).length, 1, "and no stop per dot");
  assert.equal(plot.props.style, undefined, "no style prop: the plot is as tall as its svg (the inline-styles measure)");
  plot.props.onFocus();
  let next = again(draw);
  assert.equal(liveOf(next), "2026-09-05: 300s past its hold", "focus reads the newest dot");
  assert.equal(all(next, (n) => classes(n).includes("hot")).length, 1, "the held dot stays");
  assert.equal(all(next, (n) => classes(n).includes("dim")).length, 2, "and the others step back");
  plotOf(next).props.onKeyDown({ key: "ArrowLeft", preventDefault() {} });
  next = again(draw);
  assert.equal(liveOf(next), "2026-09-03: 40s past its hold", "the arrows walk the dots");
  assert.equal(
    textOf(find(next, (n) => classes(n).includes("ck-tip"))),
    "Sep 340Reply",
    "the tooltip says the day, then the value under the series' name, when the page gives no tip",
  );
  assert.equal(dotsOf(again(() => draw({ dots: [] }))).length, 0, "no events, no dots, no crash");
});

test("a dot plot: the pointer finds the nearest dot inside its day's slot, and a day with no dots finds none", () => {
  fresh();
  const draw = () => drawDots(DOTS3);
  let tree = draw();
  const [first, second, third] = dotsOf(tree).map((c) => Number(c.props.cx));
  const point = (x) =>
    plotOf(tree).props.onPointerMove({
      clientX: x,
      pointerType: "mouse",
      currentTarget: { getBoundingClientRect: () => ({ left: 0 }) },
    });
  point(second + 2);
  tree = again(draw);
  assert.equal(liveOf(tree), "2026-09-03: 40s past its hold");
  point(first - 2);
  tree = again(draw);
  assert.equal(liveOf(tree), "2026-09-03: 0s past its hold", "the nearer of the two on that day");
  point((second + third) / 2);
  tree = again(draw);
  assert.equal(liveOf(tree), "", "the middle day had no reply: nothing to read");
  point(third);
  tree = again(draw);
  assert.equal(liveOf(tree), "2026-09-05: 300s past its hold");
  point(0);
  tree = again(draw);
  assert.equal(liveOf(tree), "", "left of the plot reads as none");
});

test("a dot plot: a dot whose day is no slot is skipped, never drawn at NaN, read, or let stretch the axis", () => {
  const known = { day: "2026-09-04", value: 12 };
  const stray = { day: "2026-09-30", value: 9000 };
  // Each plot is its own tree: two drawn on one set of hook cells would share a plot's held dot.
  const drawn = (dots) => {
    fresh();
    return drawDots(dots);
  };
  const ticksOf = (tree) =>
    all(
      find(tree, (n) => classes(n).includes("ck-y")),
      (n) => n.type === "text",
    ).map(textOf);
  const tree = drawn([known, stray]);
  const circles = dotsOf(tree);
  assert.equal(circles.length, 1, "the stray draws nothing");
  assert.ok(
    circles.every((c) => Number.isFinite(Number(c.props.cx)) && Number.isFinite(Number(c.props.cy))),
    "and nothing is placed at NaN",
  );
  assert.deepEqual(ticksOf(tree), ticksOf(drawn([known])), "a dot that is not drawn does not stretch the axis");
  assert.equal(dotsOf(drawn([stray])).length, 0, "a plot of strays draws no dots and does not crash");
  assert.equal(dotsOf(drawn([stray, known])).length, 1, "wherever in the order the stray stands");
  const draw = () => drawDots([known, stray]);
  fresh();
  plotOf(draw()).props.onFocus();
  assert.equal(liveOf(again(draw)), "2026-09-04: 12s past its hold", "focus skips it too");
  fresh();
  const strays = () => drawDots([stray]);
  plotOf(strays()).props.onFocus();
  assert.equal(liveOf(again(strays)), "", "and with only strays, focus has nothing to read");
});

test("a dot plot: every reply on the line and no reference still draws, on a real axis, every dot on the baseline", () => {
  // A period in which every reply went out as its hold ended, for a workspace that set none (the page passes no reference):
  // the axis has no value above 0 to reach for, and the plot is still a plot.
  fresh();
  const tree = drawDots(
    DOTS3.map((d) => ({ ...d, value: 0 })),
    { reference: null },
  );
  const ticks = all(
    find(tree, (n) => classes(n).includes("ck-y")),
    (n) => n.type === "text",
  ).map(textOf);
  assert.ok(ticks.length > 0, "an axis with ticks, not an empty one");
  assert.equal(all(tree, (n) => classes(n).includes("ck-ref")).length, 0, "no reference to draw");
  assert.equal(all(tree, (n) => classes(n).includes("ck-dotplot-ref")).length, 0, "and no caption for it");
  const base = Number(find(tree, (n) => classes(n).includes("ck-base"))?.props.y1 ?? NaN);
  assert.ok(Number.isFinite(base), "a baseline");
  const circles = dotsOf(tree);
  assert.equal(circles.length, 3, "a dot for each reply");
  for (const c of circles) {
    assert.ok(Number.isFinite(Number(c.props.cy)) && Number.isFinite(Number(c.props.cx)), "placed, never at NaN");
    assert.equal(Number(c.props.cy), base, "on the baseline");
  }
});

/* ------------------------------------------ radar, radial, heat, segments ------------------------------------------ */

test("a radar: hairline rings and spokes, the period washed and the one before a gray line, a day read in the config's words", () => {
  fresh();
  const draw = () =>
    RadarChart({
      axes: ["Mon", "Tue", "Wed"],
      names: ["Monday", "Tuesday", "Wednesday"],
      series: [
        { key: "now", values: [2, 7, 1] },
        { key: "prior", values: [1, 1, 1], fill: false },
      ],
      config: { now: { label: "Last 7 days" }, prior: { label: "The 7 days before" } },
    });
  let tree = draw();
  assert.equal(all(tree, (n) => classes(n).includes("ck-ring")).length, 4);
  assert.deepEqual(
    all(tree, (n) => classes(n).includes("ck-radar-line")).map((s) => classes(s).includes("prior")),
    [true, false],
    "the period before is drawn under this one",
  );
  assert.equal(plotOf(tree).props.role, "group");
  plotOf(tree).props.onFocus();
  tree = again(draw);
  plotOf(tree).props.onKeyDown({ key: "ArrowLeft", preventDefault() {} });
  tree = again(draw);
  assert.equal(liveOf(tree), "Tuesday: Last 7 days 7, The 7 days before 1");
});

test("a radial meter: the share on a track of the same ink, the period before a tick, nothing drawn for a share of nothing", () => {
  fresh();
  const tree = RadialChart({ value: 0.76, marker: 1, ariaLabel: "76%", children: "76%" });
  assert.ok(find(tree, (n) => classes(n).includes("ck-radial-value")));
  assert.ok(find(tree, (n) => classes(n).includes("ck-radial-marker")));
  assert.equal(tree.props.role, "img");
  fresh();
  assert.equal(
    find(RadialChart({ value: 0 }), (n) => classes(n).includes("ck-radial-value")),
    null,
  );
});

test("a heat strip: one hue light to dark, the empty step for an hour with nobody, the view model's hour names every sixth hour", () => {
  fresh();
  const values = Array(24).fill(0);
  values[10] = 5;
  values[11] = 1;
  const labels = values.map((_, h) => reportHourWords(h));
  const draw = () => HeatStrip({ values, labels, unit: "messages and calls" });
  let tree = draw();
  const cells = all(tree, (n) => classes(n).includes("ck-cell"));
  assert.equal(cells.length, 24);
  assert.deepEqual(
    [cells[0].props.fill, cells[10].props.fill, cells[11].props.fill],
    ["var(--chart-empty)", "var(--chart-ramp-5)", "var(--chart-ramp-1)"],
  );
  assert.deepEqual(all(tree, (n) => n.type === "text").map(textOf), ["12am", "6am", "12pm", "6pm"]);
  plotOf(tree).props.onFocus();
  tree = again(draw);
  assert.equal(liveOf(tree), "10am to 11am: 5 messages and calls", "focus starts on the busiest hour");
});

test("a segment bar: the parts in the order given, only the ones with something drawn, every one named with its count", () => {
  fresh();
  const config = {
    pos: { label: "Positive", color: "var(--ok)" },
    neu: { label: "Neutral", color: "var(--chart-prior)" },
    neg: { label: "Negative", color: "var(--danger)" },
  };
  const tree = SegmentBar({
    title: "Caller mood",
    rows: [
      { key: "pos", value: 2 },
      { key: "neu", value: 0 },
      { key: "neg", value: 1 },
    ],
    config,
    testid: "mood",
  });
  assert.equal(
    tree.props.style["--color-neg"],
    "var(--danger)",
    "it publishes its own colours, so it works inside any card",
  );
  const bar = find(tree, (n) => classes(n).includes("ck-segbar-bar"));
  assert.deepEqual(
    all(bar, (n) => n.type === "i").map((i) => [i.props.style.flexGrow, i.props.style.background]),
    [
      [2, "var(--color-pos)"],
      [1, "var(--color-neg)"],
    ],
  );
  assert.equal(bar.props["aria-label"], "2 Positive, 0 Neutral, 1 Negative");
  assert.equal(textOf(find(tree, (n) => classes(n).includes("ck-legend"))), "Positive2Neutral0Negative1");
  fresh();
  assert.equal(
    SegmentBar({ title: "Caller mood", rows: [{ key: "pos", value: 0 }], config }),
    null,
    "nothing to split",
  );
});
