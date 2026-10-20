/**
 * The Results sheet and Reports › Ads, DRAWN (11 Oct 2026) on the stub React over the Ads fixtures: the real components run, so a
 * part that throws, a card that is missing and a word that is not the fold's are caught here and not in a browser. What each
 * says is the fold's (ads-results.test.mjs); what is proved here is that they draw it: the lens's cards and doors, the sheet's
 * scope list and its foot, and the empty cards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, all, find, byTestId, textOf, classes } from "../_legacy-react.mjs";

const opened = [];
installLegacyReact({ __DEMO_MODE: true, CHANLY: { nav: (to) => opened.push(to) } });
const S = "../../../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const ads = await import("@chanlytics/contracts");
const page = await import("@chanlytics/contracts/ads-page");
const { EXAMPLE_READS } = await import(`${S}/surfaces/campaigns/ads/examples.ts`);
const { CONFIG, SPRING } = await import(`${S}/surfaces/campaigns/ads/sample.ts`);
const { AdsLens } = await import(`${S}/surfaces/reports/lenses/ads.tsx`);
const { ScopePicker } = await import(`${S}/surfaces/campaigns/ads/results/results-parts.tsx`);
const { ResultsSheet } = await import(`${S}/surfaces/campaigns/ads/results/results-sheet.tsx`);

const read = EXAMPLE_READS.running();
const fold = (scope = ads.ADS_SCOPE_ALL, over = {}, r = read) =>
  page.adsResultsOf(r, CONFIG, { from: r.window.from, to: r.window.to, scope, ...over });
const lens = (vm, onScope = () => {}) => {
  fresh();
  return AdsLens({ fold: vm, onScope });
};
const has = (tree, ids) => ids.map((id) => !!byTestId(tree, id));
const ALL_CARDS = [
  "ads-lens",
  "ads-res-figures",
  "ads-res-days",
  "ads-res-funnel",
  "ads-res-came-back",
  "ads-res-platforms",
  "ads-res-doors",
  "ads-res-ads",
  "ads-res-theirs-section",
];

test("every ad: the lens draws the scope, the four figures, the days, the funnel, what came of the appointments, the three tables and what each platform says", () => {
  const tree = lens(fold());
  assert.deepEqual(
    has(tree, ALL_CARDS),
    ALL_CARDS.map(() => true),
  );
  assert.equal(all(tree, (n) => n.props?.["data-figure"] !== undefined).length, 4, "the page's four figures");
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-figure"] !== undefined).map((n) => n.props["data-figure"]),
    ["spent", "touch", "booked", "each"],
  );
  assert.equal(textOf(byTestId(tree, "ads-res-pane")), fold().pane, "and the days it covers, beside the scope");
  assert.equal(
    all(tree, (n) => n.props?.["data-testid"]?.startsWith("ads-res-theirs-") && n.props?.className?.includes("ck-card"))
      .length,
    3,
  );
  assert.equal(
    all(tree, (n) => n.props?.["data-testid"] === "ads-res-ad").length,
    read.ads.length,
    "a row for each ad",
  );
});

test("the lens's picker offers every ad, each platform and each ad; the sheet's offers no single ad", () => {
  const vm = fold();
  fresh();
  const lensPicker = find(
    ScopePicker({ vm, variant: "lens", onScope() {} }),
    (n) => n.props?.["data-testid"] === "ads-res-scope",
  );
  const values = (picker) => picker.props.groups.flatMap((g) => g.options.map((o) => o.value));
  assert.deepEqual(
    values(lensPicker),
    vm.scopes.map((s) => s.key),
  );
  assert.deepEqual(
    lensPicker.props.groups.map((g) => g.label ?? null),
    [null, "Where they run", "One ad"],
  );
  assert.equal(lensPicker.props.value, "all");
  fresh();
  const sheetPicker = find(
    ScopePicker({ vm, variant: "sheet", onScope() {} }),
    (n) => n.props?.["data-testid"] === "ads-res-scope",
  );
  assert.deepEqual(values(sheetPicker), ["all", "platform:meta", "platform:google", "platform:tiktok"]);
  // Choosing hands back the scope the word names, and nothing for a word that names none.
  const chosen = [];
  fresh();
  const wired = find(
    ScopePicker({ vm, variant: "lens", onScope: (s) => chosen.push(s) }),
    (n) => n.props?.["data-testid"] === "ads-res-scope",
  );
  wired.props.onValueChange(`ad:${SPRING}`);
  wired.props.onValueChange("platform:google");
  wired.props.onValueChange("platform:bing");
  assert.deepEqual(chosen, [
    { kind: "ad", id: SPRING },
    { kind: "platform", platform: "google" },
  ]);
});

test("narrowed to a platform the lens draws the door table and not the platform one; to one ad, neither nor the ad table", () => {
  const meta = lens(fold({ kind: "platform", platform: "meta" }));
  assert.deepEqual(has(meta, ["ads-res-platforms", "ads-res-doors", "ads-res-ads"]), [false, true, true]);
  assert.equal(
    byTestId(meta, "ads-res-doors").props.className.includes("rpt-span-12"),
    true,
    "alone, it takes the row",
  );
  const spring = lens(fold({ kind: "ad", id: SPRING }));
  assert.deepEqual(has(spring, ["ads-res-platforms", "ads-res-doors", "ads-res-ads"]), [false, false, false]);
  assert.deepEqual(has(spring, ["ads-res-figures", "ads-res-days", "ads-res-funnel", "ads-res-came-back"]), [
    true,
    true,
    true,
    true,
  ]);
  // What came of the appointments is not split by ad: the card says why, in place of rows.
  assert.equal(textOf(byTestId(spring, "ads-res-came-back-why")), page.RESULTS.cameBack.forAll);
  // A platform of calls alone has no people, so no funnel; its numbers are Google's.
  const google = lens(fold({ kind: "platform", platform: "google" }));
  assert.equal(byTestId(google, "ads-res-funnel"), null);
  assert.ok(byTestId(google, "ads-res-theirs-google"));
  assert.equal(byTestId(google, "ads-res-theirs-meta"), null);
});

test("days with nothing in them are the lens's own empty card with the door to Ads; days other than the page's 30 say why a number is not there", () => {
  const quiet = lens(fold(ads.ADS_SCOPE_ALL, { from: "2026-01-01", to: "2026-01-10" }));
  const empty = byTestId(quiet, "ads-lens-empty");
  assert.equal(textOf(find(empty, (n) => classes(n).includes("empty-title"))), "No ads in this period");
  assert.ok(textOf(empty).includes("Open Ads"));
  assert.deepEqual(has(quiet, ["ads-res-figures", "ads-res-days", "ads-res-ads"]), [false, false, false]);
  assert.ok(
    byTestId(quiet, "ads-res-scope") || all(quiet, (n) => n.props?.["data-testid"] === "ads-res-scope").length > 0,
    "the scope stays, to widen it",
  );
  const week = lens(fold(ads.ADS_SCOPE_ALL, { from: ads.addDays(read.window.from, 23) }));
  assert.equal(textOf(byTestId(week, "ads-res-theirs-why")), page.RESULTS.theirs.window);
  assert.equal(textOf(byTestId(week, "ads-res-came-back-why")), page.RESULTS.cameBack.forThirty);
  assert.equal(byTestId(week, "ads-res-theirs"), null, "no card of the platforms' own numbers");
});

test("no calendar: the lens draws the page's dash and its words for it, and no appointment numbers", () => {
  const noCalendar = EXAMPLE_READS["no-calendar"]();
  const tree = lens(fold(ads.ADS_SCOPE_ALL, {}, noCalendar), () => {});
  const booked = find(tree, (n) => n.props?.["data-figure"] === "booked");
  assert.match(textOf(booked), /^—/, "a dash, not a zero nobody counted");
  assert.ok(textOf(booked).includes(page.FIGURES.needsLink), "and the words that say what to do");
  assert.equal(textOf(byTestId(tree, "ads-res-came-back-why")), page.FIGURES.needsLink);
});

test("the sheet draws only while it is open and its foot opens the full report over the same days", () => {
  fresh();
  const closed = ResultsSheet({ open: false, read, config: CONFIG, onClose() {} });
  assert.equal(
    all(closed, (n) => n.props?.["data-testid"] === "ads-res-full").length,
    0,
    "nothing is folded while it is shut",
  );
  fresh();
  const open = ResultsSheet({ open: true, read, config: CONFIG, onClose() {} });
  const full = find(open, (n) => n.props?.["data-testid"] === "ads-res-full");
  assert.ok(full, "the foot has its door");
  assert.equal(full.props.href, "#/reports/ads:2026-09-11~2026-10-10", "the same days, every ad");
  assert.match(textOf(full), /Full report/);
  assert.ok(
    find(open, (n) => n.props?.["data-testid"] === "ads-res-head"),
    "the head",
  );
  assert.ok(
    find(open, (n) => n.props?.["data-testid"] === "ads-res-days"),
    "the days",
  );
  assert.ok(
    find(open, (n) => n.props?.["data-testid"] === "ads-res-platforms"),
    "the platforms",
  );
  assert.ok(
    find(open, (n) => n.props?.["data-testid"] === "ads-res-came-back"),
    "and what came of the appointments",
  );
  assert.equal(
    find(open, (n) => n.props?.["data-testid"] === "ads-res-funnel"),
    null,
    "the funnel is the full report's",
  );
});
