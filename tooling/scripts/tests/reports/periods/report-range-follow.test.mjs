/**
 * Reports follows its address (surfaces/reports: reports-page.tsx, surface.ts, period.ts), EXECUTED on the real modules
 * over a fetch this test holds, in a document of its own: the first test is a document whose first read of the report
 * has not come back, which no other test's document still is.
 *
 * What the page shows is a range: a period by name, kept in this browser, or the days a member picked, which the
 * address says and nothing else does. So a link to days opens on them, Back and Forward walk them, and an address that
 * says none shows the period kept. The page asks for nothing while the document's first read is out (it is of what the
 * address says, and asking again would only read it twice); after that a move the address makes by itself is read. Days
 * the report refuses (days to come, more than a report reads, a database that cannot read picked days yet) are answered
 * by the period kept, read in their place: the page says which days it could not read, and the address takes the
 * period's place, so Back never returns to days that fail. A pick that fails puts back the period kept before it.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { reportDaysCount, reportRangeOfKey, shiftKey } from "@chanlytics/contracts";
import { again, classes, find, fresh, installLegacyReact, settle, textOf } from "../../_legacy-react.mjs";
import { CALENDAR, quiet, rday, reportDto, surface } from "../_report-world.mjs";

const moves = [];
installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
globalThis.__WORKSPACES = [
  { id: "w1", slug: "harbor", name: "Harbor Studio", status: "active", timezone: "America/New_York", role: "owner" },
];
globalThis.__ACTIVE_WORKSPACE = "w1";
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const S = "../../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue, surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { keepReportPeriod, paintHeldReports, reportsOverride, shownReportPeriod } = await import(
  `${S}/surfaces/reports/surface.ts`
);
const { setReportRange } = await import(`${S}/surfaces/reports/period.ts`);
const { refreshSurfaces, startSurfaces } = await import(`${S}/legacy-bridge/surface-runner.ts`);
const { getSurfaceStatuses } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { standingSaid } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { Popover } = await import(`${S}/surfaces/kit/popover/popover.tsx`);
const { Segmented } = await import(`${S}/surfaces/kit/segmented/segmented.tsx`);
// What the date range's button opens loads on demand in the app; the page is read with it loaded.
const { loadPeriodPopover } = await import("../../../../../apps/dashboard/src/surfaces/reports/period-picker.tsx");
await loadPeriodPopover();

/* ------------------------------ the address, and the shell's way of moving it ------------------------------ */

/** The route on screen, set as the browser sets it: by a link, by Back, or by the shell's own move. */
const at = (route) => {
  globalThis.location.hash = `#/${route}`;
};
const route = () => globalThis.location.hash.slice(2);
Object.assign(globalThis, {
  CHANLY: {
    nav: (to, opts) => {
      moves.push([to, opts?.replace === true]);
      at(to);
    },
    R: { admin: (pane) => `admin/${pane}` },
  },
  usePPToast: () => [null, () => undefined],
  canDo: () => true,
});
const stopRunner = startSurfaces([], () => () => {});
after(() => stopRunner());
const realConsoleError = console.error;
console.error = () => {};
after(() => {
  console.error = realConsoleError;
});

/* ------------------------------ the report's reads, answered or refused ------------------------------ */

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const DAYS_OF = { "7d": 7, "30d": 30, "90d": 90, month: 4 };
/** Each range read, by its one name, in the order it was asked for; and what a range is answered with (default: its report). */
const asked = [];
/** The ranges the Receptionist lens's own read was asked for, by their one name (it follows what Reports shows, when its lens is on screen). */
const lensAsked = [];
const answers = new Map();
/** The route's own refusal of days it will not read, and a read that could not be made at all. */
const REFUSED = () =>
  json(400, { ok: false, error: { code: "validation", message: "A report ends today at the latest." } });
const DOWN = () => json(500, { ok: false, error: { code: "internal", message: "down" } });
const report = (key) => {
  const range = reportRangeOfKey(key);
  if (typeof range === "string")
    return json(200, {
      ok: true,
      data: { report: reportDto({ days: DAYS_OF[key] }), booking: { ...CALENDAR, days: DAYS_OF[key] }, deals: null },
    });
  // Days a member picked: as many to their last day and as many before, the last day named, the booking line not counted.
  const days = reportDaysCount(range);
  const series = Array.from({ length: days * 2 }, (_, i) =>
    rday(shiftKey(range.to, -(days * 2 - 1 - i)), i < days ? {} : { messages_in: 1, conversations: 1, answered_ai: 1 }),
  );
  return json(200, {
    ok: true,
    data: {
      report: reportDto({ ...quiet(), days, span_days: days * 2, end: range.to, series }),
      booking: { calendar: "ended", days, asked: 0, booked: 0 },
      deals: null,
    },
  });
};
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.test");
  const key = u.searchParams.has("from")
    ? `${u.searchParams.get("from")}~${u.searchParams.get("to")}`
    : u.searchParams.get("period");
  if (u.pathname.endsWith("/reports/receptionist")) lensAsked.push(key);
  if (/\/reports\/(campaigns|reach-outs|headline|reviews|receptionist)$/.test(u.pathname)) return DOWN();
  if (!u.pathname.endsWith("/reports")) return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  asked.push(key);
  return (answers.get(key) ?? (() => report(key)))();
};
const landed = async () => {
  for (let i = 0; i < 12; i++) await settle();
};

/* ------------------------------ the page, as a person at the address sees it ------------------------------ */

const draw = () => ReportsPage({ pathname: `/w/harbor/${route()}` });
/** The page drawn again until what an effect changed is on it. */
const redraw = () => {
  again(draw);
  return again(draw);
};
const seen = (tree) => ({ type: "Fragment", props: { children: [tree, standingSaid()?.act ?? null] } });
const cls = (tree, c) => find(seen(tree), (n) => classes(n).includes(c));
/** What the page says of its range: the word on the date range's button, the period chosen of the four, whether the body is dimmed, and the row over it. */
const says = (tree) => {
  const control = find(seen(tree), (n) => n.type === Segmented);
  const button = find(seen(tree), (n) => n.type === Popover).props.trigger;
  const failed = cls(tree, "rpt-failed");
  return {
    range: textOf(find(button, (n) => n.props?.className === "rpt-when-word")),
    period: control.props.options.find((o) => o.value === control.props.value)?.label ?? null,
    dimmed: find(tree, (n) => n.props?.["data-testid"] === "reports-real").props["data-loading"] === "",
    failed: failed ? textOf(failed) : null,
  };
};

const AUGUST = "2026-08-22~2026-08-28";
const TO_COME = "2030-01-01~2030-01-05";

test("a link to days, opened cold over what the cache kept: the page asks for nothing while the document's first read is out, says the days on their way, and that one read is of the address's days", async () => {
  // The last visit's numbers, restored before React mounted: seven days, the period this browser keeps.
  keepReportPeriod("7d");
  setSurfaceValue("reports", surface());
  at(`reports/people:${AUGUST}`);
  assert.equal(getSurfaceStatuses().has("reports"), false, "no read of the report has come back in this document");
  fresh();
  let tree = redraw();
  assert.deepEqual(asked, [], "REGRESSION: the page read the address beside the document's own first read");
  assert.deepEqual(
    says(tree),
    { range: "Aug 22 – 28", period: null, dimmed: true, failed: null },
    "the numbers of the last visit, dimmed under the days on their way: never undimmed under the name of another range",
  );
  // The document's first read lands: it was of the days the address says, read once.
  await refreshSurfaces([reportsOverride]);
  await landed();
  tree = redraw();
  await landed();
  assert.deepEqual(asked, [AUGUST], "one read of the days, by their first and last day, and none beside it");
  assert.deepEqual(
    says(tree),
    { range: "Aug 22 – 28", period: null, dimmed: false, failed: null },
    "REGRESSION: a link to days said they could not be loaded, while showing them",
  );
  assert.deepEqual(moves, [], "the page moved nothing: the address was right");
  const held = surfaceValue("reports");
  assert.deepEqual(
    [held.key, held.range, held.period, held.days, held.vm.live, held.refused],
    [AUGUST, { from: "2026-08-22", to: "2026-08-28" }, null, 7, false, undefined],
    "what is published is of the days: no period by name, and not live",
  );
  assert.equal(shownReportPeriod(), "7d", "the period kept in this browser is not touched by a link to days");
});

test("Back to an address that says no days is read as the period kept; Forward to the days paints what this tab holds", async () => {
  asked.length = 0;
  // Back: the address moved by itself, and says no days.
  at("reports/people");
  redraw();
  await landed();
  assert.deepEqual(asked, ["7d"], "the period kept is read: nothing held it in this document");
  let tree = redraw();
  assert.deepEqual(says(tree), { range: "7 days", period: "7 days", dimmed: false, failed: null });
  // Forward: the days again, which this tab read a moment ago.
  asked.length = 0;
  at(`reports/people:${AUGUST}`);
  tree = redraw();
  assert.deepEqual(
    says(tree),
    { range: "Aug 22 – 28", period: null, dimmed: false, failed: null },
    "painted at once from what is held",
  );
  await landed();
  assert.deepEqual(asked, [AUGUST], "and read once behind it, to keep it current");
  assert.deepEqual(moves, [], "following the address moves nothing");
});

test("an address whose days the report refuses opens on the period kept: the page says which days it could not read, and the address takes the period's place", async () => {
  asked.length = 0;
  answers.set(TO_COME, REFUSED);
  at(`reports/${TO_COME}`);
  // The read a document opens on (the boot's), of what the address says.
  await refreshSurfaces([reportsOverride]);
  await landed();
  assert.deepEqual(asked, [TO_COME, "7d"], "the days are refused, and the period kept is read in their place");
  const held = surfaceValue("reports");
  assert.deepEqual(
    [held.key, held.period, held.refused],
    ["7d", "7d", { from: "2030-01-01", to: "2030-01-05" }],
    "published as the period it is, with the days it stands in for",
  );
  assert.equal(
    getSurfaceStatuses().get("reports"),
    "live",
    "REGRESSION: the page said the workspace could not be reached",
  );
  fresh();
  redraw();
  await landed();
  assert.deepEqual(says(redraw()), {
    range: "7 days",
    period: "7 days",
    dimmed: false,
    failed: "Couldn't load Jan 1 – Jan 5. Still showing 7 days.",
  });
  assert.deepEqual(moves, [["reports", true]], "in the entry's own place: Back never returns to days that fail");
  assert.deepEqual(asked, [TO_COME, "7d"], "and nothing is asked again of days already refused");
  // A view held is held without the mark: thirty seconds on, seven days picked again says nothing of days refused.
  assert.equal(paintHeldReports(), true);
  assert.equal(surfaceValue("reports").refused, undefined);
});

test("a pick of days the report refuses is taken back: the period is read in their place, the page keeps it, and the address goes back", async () => {
  asked.length = 0;
  lensAsked.length = 0;
  moves.length = 0;
  at("reports/receptionist");
  const ok = await setReportRange({ from: "2030-01-01", to: "2030-01-05" });
  await landed();
  assert.equal(ok, false, "the pick failed");
  assert.deepEqual(asked, [TO_COME, "7d"]);
  assert.deepEqual(
    lensAsked,
    [TO_COME, "7d"],
    "the Receptionist lens, on screen, follows the pick and is read again for the range kept; its own failed reads fail alone and move nothing",
  );
  assert.deepEqual(
    moves,
    [
      [`reports/receptionist:${TO_COME}`, false],
      ["reports/receptionist", true],
    ],
    "the pick's entry says what the page shows, on the lens it was made on",
  );
  assert.equal(surfaceValue("reports").key, "7d");
  assert.equal(shownReportPeriod(), "7d");
});

test("a period that fails to load from days a member is on leaves the period kept as it was, and the address on the days", async () => {
  // On the days, as the page shows them.
  at(`reports/${AUGUST}`);
  await refreshSurfaces([reportsOverride]);
  await landed();
  assert.equal(surfaceValue("reports").key, AUGUST);
  asked.length = 0;
  moves.length = 0;
  answers.set("90d", DOWN);
  const ok = await setReportRange("90d");
  await landed();
  assert.equal(ok, false, "the pick failed");
  assert.equal(
    shownReportPeriod(),
    "7d",
    "REGRESSION: the period that failed stayed kept, and the next visit opened on it",
  );
  assert.deepEqual(
    moves,
    [
      ["reports", false],
      [`reports/${AUGUST}`, true],
    ],
    "the address goes back to the days the page still shows",
  );
  assert.equal(surfaceValue("reports").key, AUGUST, "and the page still shows them");
});

test("days that could not be read at all are a failure, never the period in their place: only the report's own refusal is answered by the period", async () => {
  const before = surfaceValue("reports");
  asked.length = 0;
  answers.set("2026-08-01~2026-08-07", DOWN);
  at("reports/2026-08-01~2026-08-07");
  await assert.rejects(
    () => reportsOverride.apply(),
    (e) => e && e.code === "internal",
  );
  assert.deepEqual(asked, ["2026-08-01~2026-08-07"], "no second read: nothing says the period would be right");
  assert.equal(surfaceValue("reports"), before, "and what the page shows is left as it is");
});
