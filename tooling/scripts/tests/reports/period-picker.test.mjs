/**
 * Reports' period button (apps/dashboard/src/surfaces/reports/period-picker.tsx), EXECUTED on the stub React: the page draws
 * the round button alone, and what it opens (period-popover.tsx: Base UI's popover, the four periods, the month) loads on
 * demand, as a pointer or focus reaches the button, so it stays off the page's first load. A press before it has loaded
 * opens it as it lands; once loaded, the button is the popover's own and opens it, closed until pressed. The page's own
 * tests (reports-page.test.mjs) read it loaded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, byTestId, find, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const S = "../../../../apps/dashboard/src";
const { PeriodPicker, loadPeriodPopover } = await import(`${S}/surfaces/reports/period-picker.tsx`);
const { Popover } = await import(`${S}/surfaces/kit/popover/popover.tsx`);

const props = { chosen: "30d", today: "2026-10-06", timezone: "America/New_York", pick: async () => undefined };
const draw = (desk = true) => globalThis.React.createElement(PeriodPicker, { ...props, desk });

test("the page draws the button alone, named by the period and its days, with the days beside it on a desk", () => {
  fresh();
  const tree = again(() => draw(true));
  const open = byTestId(tree, "reports-period-open");
  assert.equal(open.props["aria-label"], "Period: Last 30 days, Sep 7 – Oct 6");
  assert.equal(
    find(tree, (n) => n.type === Popover),
    null,
    "what it opens is not loaded with the page",
  );
  assert.ok(
    find(tree, (n) => n.props?.className === "rpt-dates"),
    "the days beside it on a desk",
  );
  fresh();
  assert.equal(
    find(
      again(() => draw(false)),
      (n) => n.props?.className === "rpt-dates",
    ),
    null,
    "a phone has room for the button alone",
  );
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
