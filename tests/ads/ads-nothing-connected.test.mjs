/**
 * What a workspace's preview of the Ads says first (6 Nov 2026): what is true of it today, nothing connected, with how new people
 * first reached it over the last 30 days in the numbers Reports › People says, and an example one press away. The real components and
 * models run on the stub React, over a fetch where the route would be. A made-up business throughout.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, find, redrawWanted, textOf, press } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";
import { SERIES, dtoWith } from "../reports/people/_people-world.mjs";
import { firstTouchOf, v0Of as pageV0Of } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/page-parts.ts";
import { V0, HEAD } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words-page.ts";
import { adsModel } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/page.ts";
import { EXAMPLE } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words.ts";

installStubReact({ __DEMO_MODE: false, CHANLY: { nav() {} } });
const S = "../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { toPeopleReportVM } = await import("@chanlytics/contracts/report-lens");
const { api } = await import(`${S}/bridge/api.ts`);
const { CONFIG } = await import(`${S}/surfaces/campaigns/ads/sample.ts`);
const { exampleAt } = await import(`${S}/surfaces/campaigns/ads/examples.ts`);
const { adsOpening, useAdsStore } = await import(`${S}/surfaces/campaigns/ads/store.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { AdAccounts } = await import(`${S}/surfaces/settings/connections/ad-accounts.tsx`);
const { askOnScreenOf } = await import(`${S}/bridge/ask/on-screen.ts`);

const NOW = Date.parse("2031-03-15T14:05:00Z");
const KEPT = "ads-mock-scenario";
const NOTE = "ads-preview-note";

const seriesOf = (byVia, over = {}) => ({ first_came: { by_via: byVia }, today: "2031-03-15", days: 30, ...over });
const rowsOf = (byVia) => firstTouchOf(seriesOf(byVia)).rows;
const readOf = (firstTouch) => ({ ...exampleAt("v0", NOW, null), firstTouch });
const v0Of = (byVia) => pageV0Of(readOf(firstTouchOf(seriesOf(byVia))));

/** A business that has imported its book, found some leads and been written to: nobody by an ad. */
const NO_AD = { import: 330, lead: 27, email: 2, call: 1 };

// ---------------------------------------------------------------------------------------------------------------------
// The counts

test("the counts are People's, ranked with their words, their window ending the day the read is of", () => {
  const touch = firstTouchOf(seriesOf(NO_AD));
  assert.equal(touch.since, "2031-02-14", "30 days, today among them");
  assert.deepEqual(
    touch.rows.map((r) => [r.label, r.n]),
    [
      ["Imported", 330],
      ["A lead you found", 27],
      ["Email", 2],
      ["Phone", 1],
    ],
  );
  assert.equal(firstTouchOf(seriesOf(NO_AD, { end: "2031-03-01" })).since, "2031-01-31");
});

test("the rows say what Reports › People says of the same read", () => {
  const report = toPeopleReportVM(dtoWith());
  assert.deepEqual(
    report.firstCame.rows.map((r) => [r.label, r.value]),
    firstTouchOf(SERIES).rows.map((r) => [r.label, r.n]),
  );
});

test("the way in that is an ad is the one in ink, and those with no way in kept are last and told apart", () => {
  const rows = rowsOf({ whatsapp: 5, unknown: 2, ad: 6 });
  assert.deepEqual(
    rows.map((r) => [r.label, r.own, r.recorded]),
    [
      ["An ad", true, true],
      ["WhatsApp", false, true],
      ["Not recorded", false, false],
    ],
  );
});

test("nobody from an ad still says how new people came: it was the whole of a real workspace's page, hidden", () => {
  const v0 = v0Of(NO_AD);
  assert.equal(v0.lead, null);
  assert.equal(v0.empty.lead, V0.emptyLead);
  assert.equal(v0.rows.length, 4, "REGRESSION: every real count was dropped when no ad had brought anyone");
  assert.deepEqual(v0.notes, V0.emptyNotes);
});

test("read, and nobody new at all: it says so in People's own terms, and its door promises nobody", () => {
  const v0 = v0Of({});
  assert.deepEqual(v0.rows, []);
  assert.equal(v0.nobodyNew, V0.nobodyNew);
  assert.equal(v0.door.words, V0.doorNobody);
  assert.equal(v0Of(NO_AD).nobodyNew, null);
  assert.equal(v0Of(NO_AD).door.words, V0.door);
  assert.equal(
    pageV0Of(readOf(null)).nobodyNew,
    null,
    "not while the counts are unread: that would be a claim about nobody",
  );
});

test("the lead counts those with a way in kept, whichever row comes last", () => {
  assert.deepEqual(
    v0Of({ ad: 2, whatsapp: 3, sms: 1 }).lead,
    V0.lead(2, 6),
    "REGRESSION: the last row was taken for Not recorded",
  );
  assert.equal(v0Of({ ad: 2, whatsapp: 3, sms: 1 }).muted, null);
  const some = v0Of({ ad: 2, whatsapp: 3, unknown: 4 });
  assert.deepEqual(some.lead, V0.lead(2, 5));
  assert.equal(some.muted, V0.more(4));
});

test("the lead does not name one wire, since an ad on Instagram stamps the same way in", () => {
  assert.doesNotMatch(V0.lead(1, 2).rest, /WhatsApp/);
});

test("the line above the page gives the counts' first day once read, and no time it cannot back", () => {
  const counted = adsModel(readOf(firstTouchOf(seriesOf(NO_AD))), CONFIG);
  assert.equal(counted.pane, HEAD.v0Read("14 Feb"));
  assert.equal(adsModel(readOf(null), CONFIG).pane, "Last 30 days");
});

// ---------------------------------------------------------------------------------------------------------------------
// No sample as its own

test("a workspace's nothing connected holds no sample count; a demo's keeps its sample", () => {
  const own = {
    name: "Birch Lane Co",
    address: null,
    street: null,
    hours: null,
    site: null,
    page: null,
    line: null,
    timezone: "America/Chicago",
    appointmentWord: "visit",
    neverQuotePrices: false,
    services: [],
  };
  assert.equal(exampleAt("v0", NOW, own).firstTouch, null);
  assert.ok(exampleAt("v0", NOW, null).firstTouch.rows.length > 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// What it opens on, and what it reads

const route = { asked: [], answer: () => ({ series: seriesOf(NO_AD), now: null }) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input instanceof Request ? input.url : input), "https://app.example.org");
  route.asked.push(url);
  const data = route.answer(url);
  if (data === null) return new Response(JSON.stringify({ ok: false, error: { message: "no" } }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

function underSession(isDemo, kept, run) {
  const was = globalThis.__DEMO_MODE;
  globalThis.__DEMO_MODE = isDemo;
  if (kept) globalThis.sessionStorage.setItem(KEPT, kept);
  else globalThis.sessionStorage.removeItem(KEPT);
  try {
    return run();
  } finally {
    globalThis.__DEMO_MODE = was;
    globalThis.sessionStorage.removeItem(KEPT);
  }
}

test("a preview opens on what is true, or on the example this tab chose; a demo opens on ads running", () => {
  assert.equal(
    underSession(false, null, () => adsOpening()),
    "v0",
  );
  assert.equal(
    underSession(false, "needs-you", () => adsOpening()),
    "needs-you",
  );
  assert.equal(
    underSession(true, null, () => adsOpening()),
    "running",
  );
});

/** Draw the page in a preview, its read answered as asked, and hand back what redraws it. */
function previewPage(answer, param = "ads") {
  // An identical read shares an answer the client holds: each page here is its own visit.
  api().forget();
  route.asked.length = 0;
  route.answer = answer;
  globalThis.__DEMO_MODE = false;
  globalThis.sessionStorage.removeItem(KEPT);
  fresh();
  const draw = () => AdsPage({ param });
  return { tree: draw(), draw: () => again(draw) };
}
const landed = (what) => until(redrawWanted, what);
const barLabels = (tree) => textOf(byTestId(tree, "ads-v0"));

test("the page reads its own counts once, says it is counting, then says them, in a note that calls them its own", async () => {
  const p = previewPage(() => ({ series: seriesOf(NO_AD), now: null }));
  assert.equal(textOf(byTestId(p.tree, "ads-v0-reading")), V0.reading, "no flash of nobody while it reads");
  assert.equal(byTestId(p.tree, "ads-v0-lead"), null);
  await landed("the counts");
  assert.equal(route.asked.length, 1);
  assert.equal(route.asked[0].pathname, "/api/v1/reports/people");
  assert.equal(route.asked[0].searchParams.get("period"), "30d");
  const tree = p.draw();
  assert.equal(byTestId(tree, "ads-v0-reading"), null);
  assert.match(barLabels(tree), /Imported/);
  assert.match(barLabels(tree), /330/);
  assert.match(barLabels(tree), new RegExp(V0.emptyLead));
  assert.equal(
    textOf(byTestId(tree, NOTE)),
    `${EXAMPLE.preview.word} ${EXAMPLE.preview.today}`,
    "the sample's words are false over its own counts",
  );
  assert.equal(route.asked.length, 1, "and it is not asked again by drawing");
});

test("a workspace nobody new reached says that, as it has no rows to draw", async () => {
  const p = previewPage(() => ({ series: seriesOf({}), now: null }));
  await landed("the counts");
  const tree = p.draw();
  assert.equal(textOf(byTestId(tree, "ads-v0-nobody")), V0.nobodyNew);
  assert.match(textOf(byTestId(tree, "ads-v0-door")), new RegExp(V0.doorNobody));
});

test("a read that fails says so and offers again, and never says nobody came", async () => {
  const p = previewPage(() => null);
  await landed("the refusal");
  const tree = p.draw();
  const failed = byTestId(tree, "ads-v0-failed");
  assert.match(textOf(failed), new RegExp(V0.notRead));
  assert.doesNotMatch(textOf(byTestId(tree, "ads-v0")), new RegExp(V0.emptyLead));
  assert.equal(byTestId(tree, "ads-v0-nobody"), null);
  route.answer = () => ({ series: seriesOf({ ad: 1, whatsapp: 1 }), now: null });
  press(byTestId(tree, "ads-v0-again"));
  const reading = p.draw();
  assert.ok(byTestId(reading, "ads-v0-reading"), "reading again");
  await landed("the counts");
  assert.equal(route.asked.length, 2);
  assert.match(textOf(byTestId(p.draw(), "ads-v0")), /An ad/);
});

test("a database with no series yet is said as a read that did not come, not as nobody", async () => {
  const p = previewPage(() => ({ series: null, now: null }));
  await landed("the empty answer");
  const tree = p.draw();
  assert.ok(byTestId(tree, "ads-v0-failed"), textOf(byTestId(tree, "ads-v0")));
});

test("an address that names an ad opens the example's ads and reads nothing of the workspace's", () => {
  const p = previewPage(() => ({ series: seriesOf(NO_AD), now: null }), "ads:ad:spring");
  assert.equal(byTestId(p.tree, "ads-v0"), null);
  assert.equal(route.asked.length, 0);
});

test("the page tells Ask what it shows, in a word and no row: what is true, or an example", () => {
  const said = () => {
    const s = askOnScreenOf(globalThis.window);
    return s && [s.key, s.view, s.ids];
  };
  previewPage(() => ({ series: seriesOf(NO_AD), now: null }));
  assert.deepEqual(said(), ["ads", "ads", []]);
  underSession(false, "running", () => {
    fresh();
    AdsPage({ param: "ads" });
  });
  assert.deepEqual(said(), ["ads", "ads:example", []]);
  underSession(true, "v0", () => {
    fresh();
    AdsPage({ param: "ads" });
  });
  assert.deepEqual(said(), ["ads", "ads:example", []], "a demo's nothing connected is an example too");
});

test("a demo draws its sample and reads nothing", () => {
  route.asked.length = 0;
  const tree = underSession(true, "v0", () => {
    fresh();
    const draw = () => AdsPage({ param: "ads" });
    draw();
    return again(draw);
  });
  assert.ok(byTestId(tree, "ads-v0"));
  assert.equal(route.asked.length, 0);
  assert.equal(byTestId(tree, NOTE), null);
});

// ---------------------------------------------------------------------------------------------------------------------
// Connections

test("Connections says no account is connected, which is true, and asks nothing of the report", () => {
  route.asked.length = 0;
  const tree = underSession(false, null, () => {
    fresh();
    return AdAccounts({ flash() {} });
  });
  for (const platform of ["meta", "google", "tiktok"]) {
    assert.equal(byTestId(tree, `ad-account-${platform}`).props["data-state"], "none");
    assert.ok(byTestId(tree, `ad-connect-${platform}`), "with its Connect press");
  }
  assert.equal(textOf(byTestId(tree, NOTE)), `${EXAMPLE.preview.word} ${EXAMPLE.preview.connectLater}`);
  assert.equal(route.asked.length, 0);
});

test("the store a choice moves keeps it for the tab, and choosing today again keeps nothing", () => {
  underSession(false, null, () => {
    fresh();
    const first = useAdsStore();
    assert.equal(first.example, "v0");
    first.setExample("needs-you");
    assert.equal(globalThis.sessionStorage.getItem(KEPT), "needs-you");
    const next = again(() => useAdsStore());
    assert.equal(next.example, "needs-you");
    next.setExample("v0");
    assert.equal(globalThis.sessionStorage.getItem(KEPT), null);
  });
});

test("the pill asks to see an example on what is true, and is the Example pill once on one", () => {
  const pillIn = (tree) =>
    textOf(find(tree, (n) => n.props?.trigger?.props?.["data-testid"] === "ads-example").props.trigger);
  const today = previewPage(() => ({ series: seriesOf(NO_AD), now: null })).tree;
  assert.match(pillIn(today), new RegExp(EXAMPLE.preview.pill));
  const running = underSession(false, "running", () => {
    fresh();
    return AdsPage({ param: "ads" });
  });
  assert.match(pillIn(running), new RegExp(EXAMPLE.pill));
});
