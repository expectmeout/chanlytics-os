/**
 * Reports' date range button (apps/dashboard/src/surfaces/reports/period-picker.tsx), EXECUTED on the stub React: the page
 * draws the capsule alone, saying what it is on, and what it opens (period-popover.tsx: Base UI's popover, the four
 * periods, the days reached in one press, the month days are picked on) loads on demand, as a pointer or focus reaches the
 * button, so it stays off the page's first load. A press before it has loaded opens it as it lands; once loaded, the
 * button is the popover's own and opens it, closed until pressed. The page's own tests (../reports-page.test.mjs) read it
 * loaded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, byTestId, find, press, settle, textOf } from "../../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const S = "../../../../../apps/dashboard/src";
// A path written out, so the dead-exports check (knip) sees what the test reads of the module.
const { PeriodPicker, loadPeriodPopover } =
  await import("../../../../../apps/dashboard/src/surfaces/reports/period-picker.tsx");
const { Popover } = await import(`${S}/surfaces/kit/popover/popover.tsx`);

const props = { chosen: "30d", today: "2026-10-06", timezone: "America/New_York", pick: async () => undefined };
const draw = (desk = true, chosen = props.chosen) =>
  globalThis.React.createElement(PeriodPicker, { ...props, chosen, desk });
/** What the control says: its name to a screen reader, the word on it, and what stands beside it (null: nothing does). */
const says = (tree) => {
  const beside = find(tree, (n) => n.props?.className === "rpt-dates");
  return [
    byTestId(tree, "reports-period-open").props["aria-label"],
    textOf(find(tree, (n) => n.props?.className === "rpt-when-word")),
    beside ? textOf(beside) : null,
  ];
};

test("the page draws the button alone, saying the period it is on, with the days it covers beside it on a desk", () => {
  fresh();
  const tree = again(() => draw(true));
  assert.deepEqual(says(tree), ["Date range: Last 30 days, Sep 7 – Oct 6", "30 days", "Sep 7 – Oct 6"]);
  assert.equal(
    find(tree, (n) => n.type === Popover),
    null,
    "what it opens is not loaded with the page",
  );
  fresh();
  assert.deepEqual(
    says(again(() => draw(false))),
    ["Date range: Last 30 days, Sep 7 – Oct 6", "30 days", null],
    "a phone has room for the button alone, and it still says its word",
  );
});

test("on days a member picked the button says their dates and the count stands beside it; days with a name say the name", () => {
  const on = (chosen) => {
    fresh();
    return says(again(() => draw(true, chosen)));
  };
  assert.deepEqual(on({ from: "2026-09-01", to: "2026-09-20" }), [
    "Date range: 20 days, Sep 1 – Sep 20",
    "Sep 1 – 20",
    "20 days",
  ]);
  assert.deepEqual(on({ from: "2026-09-25", to: "2026-10-02" }), [
    "Date range: 8 days, Sep 25 – Oct 2",
    "Sep 25 – Oct 2",
    "8 days",
  ]);
  assert.deepEqual(on({ from: "2026-10-05", to: "2026-10-05" }), [
    "Date range: Yesterday, Oct 5",
    "Yesterday",
    "Oct 5",
  ]);
  assert.deepEqual(on("month"), ["Date range: This month so far, Oct 1 – Oct 6", "Month", "Oct 1 – Oct 6"]);
});

test("days in two months are the widest word the button says, and it marks itself so: beside a strip on a phone it stands without its glyph (reports.css)", () => {
  const wide = (chosen) => {
    fresh();
    const open = byTestId(
      again(() => draw(false, chosen)),
      "reports-period-open",
    );
    assert.ok(
      find(open, (n) => n.props?.className === "rpt-when-glyph"),
      "the glyph is drawn in a place of the page's own, which the stylesheet can take away",
    );
    return open.props["data-wide"];
  };
  assert.equal(wide({ from: "2026-08-25", to: "2026-09-23" }), "", "Aug 25 – Sep 23");
  assert.equal(wide({ from: "2026-09-25", to: "2026-10-02" }), "", "Sep 25 – Oct 2");
  // One month's days, a day, a period by name, and days with a name of their own are no wider than the button keeps.
  for (const chosen of [
    { from: "2026-09-01", to: "2026-09-20" },
    { from: "2026-09-15", to: "2026-09-15" },
    "30d",
    "month",
    { from: "2026-09-28", to: "2026-10-04" }, // last week, on a Tuesday the 6th: said by its name
  ])
    assert.equal(wide(chosen), undefined, JSON.stringify(chosen));
});

test("a press before it has loaded opens it as it lands; drawn loaded and unpressed, it waits for its button", async () => {
  fresh();
  const tree = again(() => draw(true));
  press(byTestId(tree, "reports-period-open"));
  await loadPeriodPopover();
  for (let i = 0; i < 4; i += 1) await settle();
  const opened = find(
    again(() => draw(true)),
    (n) => n.type === Popover,
  );
  assert.ok(opened, "what it opens, in the button's place");
  assert.equal(opened.props.defaultOpen, true, "open, as the press asked");
  assert.equal(opened.props.trigger.props["data-testid"], "reports-period-open", "on the same button");
  fresh();
  const later = find(
    again(() => draw(true)),
    (n) => n.type === Popover,
  );
  assert.equal(
    later.props.defaultOpen,
    false,
    "loaded before a press (a pointer on the button), it waits to be pressed",
  );
});
