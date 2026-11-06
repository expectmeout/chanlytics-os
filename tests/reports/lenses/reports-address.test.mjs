/**
 * Reports' addresses and what the frame draws around each (surfaces/routes.ts, surfaces/reports/chrome.ts): one page that takes
 * the Overview's address and each lens's, a move between two of them a pushed or replaced entry on that page, and a strip of views
 * that is the lens registry's, decided from the workspace list the shell already holds. An address says the days a member
 * picked too, after the lens in the shell's own grammar (`reports/people:2026-09-01~2026-09-20`, the Overview's the days
 * alone): the same page takes it, and every tab of the strip keeps the days.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact();
const { SURFACE_ROUTES, routeHasPage, onOnePage } = await importSrc("apps/dashboard/src/surfaces/routes.ts");

/** The workspace list the shell holds, with the active one: every workspace has the Pipeline (0008, amended 18 Oct 2026). */
const hold = (role = "owner") => {
  globalThis.__WORKSPACES = [
    {
      id: "w1",
      slug: "harbor",
      name: "Harbor Studio",
      status: "active",
      timezone: "America/New_York",
      role,
    },
  ];
  globalThis.__ACTIVE_WORKSPACE = "w1";
};
const chromeAt = (param) => SURFACE_ROUTES.reports.chrome({ param, backToPeople: null });

test("the page takes the Overview's address and each lens's, and no other address under reports", () => {
  for (const route of [
    "reports",
    "reports/receptionist",
    "reports/people",
    "reports/pipeline",
    "reports/campaigns",
    "reports/ads",
    "reports/reviews",
  ])
    assert.ok(routeHasPage(route), route);
  for (const no of ["reports/overview", "reports/usage", "reports/leads", "reports/anything"])
    assert.ok(!routeHasPage(no), `${no} is the frame table's: not found`);
});

/** Twenty days a member picked, by their one name (contracts reportRangeKey). */
const DAYS = "2026-09-01~2026-09-20";

test("the page takes the days a member picked: alone for the Overview, after its colon for any other lens, and nothing that only looks like them", () => {
  for (const route of [
    `reports/${DAYS}`,
    `reports/people:${DAYS}`,
    `reports/reviews:${DAYS}`,
    "reports/2026-09-15~2026-09-15",
    // Ads alone says what it is narrowed to, after the days (or without them, on the period kept).
    `reports/ads:${DAYS}`,
    `reports/ads:${DAYS}:platform:meta`,
    `reports/ads:${DAYS}:ad:5b0e8c1a-3f2d-4c1e-9a7b-1d2e3f4a5b6c`,
    "reports/ads:platform:google",
  ])
    assert.ok(routeHasPage(route), route);
  for (const no of [
    "reports/people:", // a lens with nothing after its colon
    `reports/overview:${DAYS}`, // the Overview has no word of its own
    "reports/people:30d", // a period by name is never in the address: it is the device's
    "reports/30d",
    "reports/2026-09-20~2026-09-01", // out of order
    "reports/2026-02-30~2026-03-01", // a day no month has
    "reports/2026-09-01", // half a window
    `reports/usage:${DAYS}`,
    `reports/people:${DAYS}:more`,
    `reports/people:${DAYS}:ad:x`, // only Ads has a scope
    `reports/ads:${DAYS}:platform:bing`, // a platform we do not run on
    `reports/ads:${DAYS}:more`,
    "reports/ads:",
  ])
    assert.ok(!routeHasPage(no), `${no} is the frame table's: not found`);
  // A pick, another lens over the same days, and back to the period are all the one page's own moves.
  assert.ok(onOnePage("reports", `reports/${DAYS}`));
  assert.ok(onOnePage(`reports/${DAYS}`, `reports/people:${DAYS}`));
  assert.ok(onOnePage(`reports/people:${DAYS}`, "reports/people"));
  assert.ok(!onOnePage(`reports/people:${DAYS}`, "clients"));
});

test("on days a member picked every tab keeps them, so another lens is the same days there; the lens picked, the crumbs and the mount are the lens's own", () => {
  hold();
  const overview = chromeAt(DAYS);
  assert.equal(overview.views.picked, "overview", "days alone are the Overview over them");
  assert.deepEqual(overview.crumbs, ["Reports"]);
  assert.deepEqual(
    overview.views.tabs.map((t) => [t.id, t.to]),
    [
      ["overview", `reports/${DAYS}`],
      ["receptionist", `reports/receptionist:${DAYS}`],
      ["people", `reports/people:${DAYS}`],
      ["pipeline", `reports/pipeline:${DAYS}`],
      ["campaigns", `reports/campaigns:${DAYS}`],
      ["reviews", `reports/reviews:${DAYS}`],
    ],
    "REGRESSION: a move to another lens went back to the period, and the week picked was lost",
  );
  const people = chromeAt(`people:${DAYS}`);
  assert.equal(people.views.picked, "people");
  assert.deepEqual(people.crumbs, [{ label: "Reports", to: "reports" }, "People"]);
  assert.equal(people.views.tabs[0].to, `reports/${DAYS}`, "the Overview's tab is the days alone");
  assert.equal(people.mount, "reports", "one mount, days or none: a pick never remounts the page");
  assert.deepEqual(
    chromeAt("people").views.tabs.map((t) => t.to),
    ["reports", "reports/receptionist", "reports/people", "reports/pipeline", "reports/campaigns", "reports/reviews"],
    "and with no days in the address, none in a tab's",
  );
});

test("Ads is a tab in a demo session and nowhere else, between Campaigns and Reviews; its scope is its own and the days ride every tab", () => {
  hold();
  const demo = globalThis.__DEMO_MODE;
  try {
    globalThis.__DEMO_MODE = false;
    assert.ok(!chromeAt(null).views.tabs.some((t) => t.id === "ads"), "a workspace without ads has no tab");
    globalThis.__DEMO_MODE = true;
    assert.deepEqual(
      chromeAt(null).views.tabs.map((t) => t.id),
      ["overview", "receptionist", "people", "pipeline", "campaigns", "ads", "reviews"],
    );
    const ads = chromeAt(`ads:${DAYS}:platform:google`);
    assert.equal(ads.views.picked, "ads");
    assert.deepEqual(ads.crumbs, [{ label: "Reports", to: "reports" }, "Ads"]);
    assert.deepEqual(
      ads.views.tabs.map((t) => [t.id, t.to]),
      [
        ["overview", `reports/${DAYS}`],
        ["receptionist", `reports/receptionist:${DAYS}`],
        ["people", `reports/people:${DAYS}`],
        ["pipeline", `reports/pipeline:${DAYS}`],
        ["campaigns", `reports/campaigns:${DAYS}`],
        ["ads", `reports/ads:${DAYS}`],
        ["reviews", `reports/reviews:${DAYS}`],
      ],
      "the days stay on every tab, and the scope stays on none: a tab is the lens over those days",
    );
    // Ads' own tab, with no days in the address, is the lens on the period kept.
    assert.equal(chromeAt("ads").views.tabs.find((t) => t.id === "ads")?.to, "reports/ads");
  } finally {
    globalThis.__DEMO_MODE = demo;
  }
});

test("a move between two lenses is a pushed or replaced entry on the one page, never a request for a page", () => {
  assert.ok(onOnePage("reports", "reports/people"));
  assert.ok(onOnePage("reports/people", "reports/campaigns"));
  assert.ok(onOnePage("reports/campaigns", "reports"));
  assert.ok(!onOnePage("reports/people", "today"), "away from Reports is the router's");
  assert.ok(!onOnePage("reports/people", "clients/pipeline"));
});

test("the strip is the frame's: the lens registry's tabs as links to each lens's route, the page mounted once across them", () => {
  hold();
  const overview = chromeAt(null);
  assert.deepEqual(overview.crumbs, ["Reports"]);
  assert.equal(overview.mount, "reports", "one mount across every lens, so a move never remounts the page");
  assert.deepEqual(overview.views, {
    name: "reports",
    label: "Which report",
    testid: "reports-lenses",
    picked: "overview",
    tabs: [
      { id: "overview", label: "Overview", to: "reports", testid: "lens-overview" },
      { id: "receptionist", label: "Receptionist", to: "reports/receptionist", testid: "lens-receptionist" },
      { id: "people", label: "People", to: "reports/people", testid: "lens-people" },
      { id: "pipeline", label: "Pipeline", to: "reports/pipeline", testid: "lens-pipeline" },
      { id: "campaigns", label: "Campaigns", to: "reports/campaigns", testid: "lens-campaigns" },
      { id: "reviews", label: "Reviews", to: "reports/reviews", testid: "lens-reviews" },
    ],
  });
  const people = chromeAt("people");
  assert.deepEqual(people.crumbs, [{ label: "Reports", to: "reports" }, "People"]);
  assert.equal(people.views.picked, "people");
});

test("the strip is the kit's, wearing whose views it holds, and says nothing of how the page changes: a lens's body is a view that moves as any does", async () => {
  // The strip wore `data-stays` for Reports, so a swipe knew to wait for the lens to land and bring the page back in
  // (7 Oct 2026): a third way for a view to change, beside a page mounted afresh and Settings' own. The lens's body is a
  // view of the deck's now (reports-page.tsx, kit/motion/view-deck.ts), and the strip is every page's.
  hold();
  const win = globalThis.window;
  win.CHANLY = { address: { href: (r) => `/w/harbor/${r}`, warm() {}, warmSoon() {} } };
  // The strip (surfaces/frame/surface-tabs.tsx), under the names the frame draws and asks it by.
  const surfaceTabs = await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");
  Object.assign(win, {
    SurfaceTabs: surfaceTabs.SurfaceTabs,
    stripPlace: surfaceTabs.stripPlace,
    stripSlide: surfaceTabs.stripSlide,
    stripSwipe: surfaceTabs.stripSwipe,
  });
  const views = chromeAt(null).views;
  assert.equal("stays" in views, false);
  const strip = win.SurfaceTabs({ page: "reports", param: null, views, onNavigate() {} }).rendered;
  assert.equal(strip.type, "nav");
  assert.match(strip.props.className, /\bstabs-reports\b/);
  assert.equal(strip.props["data-testid"], "reports-lenses");
  assert.equal(strip.props["data-stays"], undefined);
  const tabs = strip.props.children.flat().filter((n) => n && n.type === "a");
  assert.deepEqual(
    tabs.map((t) => [t.props["data-testid"], t.props.href, t.props["aria-current"]]),
    [
      ["lens-overview", "/w/harbor/reports", "page"],
      ["lens-receptionist", "/w/harbor/reports/receptionist", undefined],
      ["lens-people", "/w/harbor/reports/people", undefined],
      ["lens-pipeline", "/w/harbor/reports/pipeline", undefined],
      ["lens-campaigns", "/w/harbor/reports/campaigns", undefined],
      ["lens-reviews", "/w/harbor/reports/reviews", undefined],
    ],
  );
});

test("Pipeline is a tab in every workspace, in its place (0008, amended 18 Oct 2026), before the workspace list is held too", () => {
  hold();
  assert.deepEqual(
    chromeAt(null).views.tabs.map((t) => t.id),
    ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"],
  );
  assert.equal(chromeAt("pipeline").views.picked, "pipeline");
  delete globalThis.__WORKSPACES;
  delete globalThis.__ACTIVE_WORKSPACE;
  assert.ok(
    chromeAt(null).views.tabs.some((t) => t.id === "pipeline"),
    "no workspace list yet: the tab is there",
  );
});
