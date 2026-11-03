/**
 * AskChart on the kit (surfaces/ask/home.tsx): every chart stands in the ChartCard every chart of the product stands in,
 * with its legend, its Table switch and its CSV, each closed kind on its own part. It drew bare parts outside the card from
 * the day it was written, so an answer's chart had no table and no file (18 Oct 2026). Executed on the stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, find, textOf } from "../../_legacy-react.mjs";

installLegacyReact();
const S = "../../../../../apps/dashboard/src/surfaces";
const { AskChart } = await import(`${S}/ask/home.tsx`);
const { askText } = await import(`${S}/ask/words.ts`);
const { ChartCard } = await import(`${S}/kit/charts/card.tsx`);
const { BarChart, BarList } = await import(`${S}/kit/charts/bar.tsx`);
const { LineChart } = await import(`${S}/kit/charts/line.tsx`);

const REPORTS = { kind: "page", id: "reports", label: "Reports", to: "reports", door: true };
const WHO = {
  kind: "columns",
  label: "messages a day",
  series: ["receptionist", "you", "unanswered"],
  points: [
    { label: "Oct 5", values: [6, 2, 1] },
    { label: "Oct 6", values: [4, 3, 0] },
  ],
  source: REPORTS,
};
const WRITTEN = {
  kind: "line",
  label: "reviews a week",
  series: ["written"],
  points: [
    { label: "Oct 5", values: [2] },
    { label: "Oct 12", values: [3] },
  ],
  source: REPORTS,
};
const CHANNELS = {
  kind: "bars",
  label: "messages by channel",
  series: ["messages"],
  points: [
    { label: "WhatsApp", values: [7] },
    { label: "Email", values: [2] },
  ],
  source: REPORTS,
};

const draw = (c, { lang = "en", onNav = () => {} } = {}) => AskChart({ c, t: askText(lang), onNav });
const cardOf = (tree) => find(tree, (n) => n.type === ChartCard);
const part = (tree, type) => find(tree, (n) => n.type === type);

test("every chart stands in the kit's card, titled by what it counts", () => {
  for (const c of [WHO, WRITTEN, CHANNELS]) {
    const card = cardOf(draw(c));
    assert.ok(card, c.kind);
    assert.equal(card.props.title, c.label);
  }
});

test("each kind is its one part of the kit, and no other", () => {
  assert.ok(part(draw(WRITTEN), LineChart));
  assert.ok(part(draw({ ...WHO, kind: "line" }), LineChart));
  assert.ok(part(draw(WHO), BarChart));
  assert.ok(part(draw(CHANNELS), BarList));
  assert.equal(part(draw(WHO), LineChart), null);
  assert.equal(part(draw(CHANNELS), BarChart), null);
});

test("columns stack each series on its own key, its values row by row", () => {
  const chart = part(draw(WHO), BarChart);
  assert.equal(chart.props.keys.length, 3);
  const [k0, k1, k2] = chart.props.keys;
  assert.deepEqual(
    chart.props.data.map((d) => [d.label, d[k0], d[k1], d[k2]]),
    [
      ["Oct 5", 6, 2, 1],
      ["Oct 6", 4, 3, 0],
    ],
  );
  assert.equal(chart.props.ariaLabel, "messages a day");
});

test("a line washes one series, and draws two or three as lines alone", () => {
  assert.deepEqual(
    part(draw(WRITTEN), LineChart).props.keys.map((k) => k.fill),
    [true],
  );
  assert.deepEqual(
    part(draw({ ...WHO, kind: "line" }), LineChart).props.keys.map((k) => !!k.fill),
    [false, false, false],
  );
});

test("bars list each thing with its count", () => {
  assert.deepEqual(
    part(draw(CHANNELS), BarList).props.rows.map((r) => [r.label, r.value]),
    [
      ["WhatsApp", 7],
      ["Email", 2],
    ],
  );
});

test("the card owns the series: its names and validated tokens, a legend for two or more and none for one", () => {
  const many = cardOf(draw(WHO)).props;
  const colors = Object.values(many.config).map((s) => s.color);
  assert.deepEqual(
    Object.values(many.config).map((s) => s.label),
    WHO.series,
  );
  assert.equal(new Set(colors).size, 3, "each its own colour");
  for (const c of colors) assert.match(c, /^var\(--chart-ramp-\d\)$/);
  assert.notEqual(many.legend, false);
  const single = cardOf(draw(WRITTEN)).props;
  assert.deepEqual(
    Object.values(single.config).map((s) => s.color),
    ["var(--chart-1)"],
    "any single series is the one data hue",
  );
  assert.equal(single.legend, false);
});

test("its table and CSV hold every number, under what each row is", () => {
  assert.deepEqual(cardOf(draw(WHO)).props.table, {
    columns: ["When", "receptionist", "you", "unanswered"],
    rows: [
      ["Oct 5", 6, 2, 1],
      ["Oct 6", 4, 3, 0],
    ],
  });
  assert.deepEqual(cardOf(draw(CHANNELS)).props.table.columns, ["Name", "messages"]);
  assert.equal(cardOf(draw(WRITTEN, { lang: "es" })).props.table.columns[0], "Cuándo");
  assert.equal(cardOf(draw(CHANNELS, { lang: "es" })).props.table.columns[0], "Nombre");
});

test("where it was read from stays under the card, its door the page's", () => {
  const door = (tree) => find(tree, (n) => n.props?.kind === "open");
  const went = [];
  const tree = draw(WHO, { onNav: (to) => went.push(to) });
  assert.match(textOf(tree), /From Reports/);
  door(tree).props.onClick();
  assert.deepEqual(went, ["reports"]);
  assert.equal(door(draw({ ...WHO, source: { ...REPORTS, door: false } })), null);
});
