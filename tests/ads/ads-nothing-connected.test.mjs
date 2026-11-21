/**
 * Campaigns › Ads with nothing connected (the Ads plan's 4.1): what is true of the workspace today, how new people first
 * reached it over the last 30 days in the numbers Reports › People says, beside the ad account's card. The real
 * components and models run on the stub React, over a fetch where the route would be. A made-up business throughout.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, redrawWanted, textOf, press } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";
import { SERIES, dtoWith } from "../reports/people/_people-world.mjs";
import { firstTouchOf, nothingConnectedOf } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/page-v0.ts";
import { V0, HEAD } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words-page.ts";

installStubReact({ CHANLY: { nav() {} } });
const S = "../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { toPeopleReportVM } = await import("@chanlytics/contracts/report-lens");
const { api } = await import(`${S}/bridge/api.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { readAdsOpening } = await import(`${S}/bridge/surfaces/ads-first-reads.ts`);
const { read } = await import(`${S}/bridge/api.ts`);
const { askOnScreenOf } = await import(`${S}/bridge/ask/on-screen.ts`);

const seriesOf = (byVia, over = {}) => ({ first_came: { by_via: byVia }, today: "2031-03-15", days: 30, ...over });
const rowsOf = (byVia) => firstTouchOf(seriesOf(byVia)).rows;
/** The page's nothing-connected half, from the counts as read (or null while unread). */
const pageV0Of = (firstTouch) => nothingConnectedOf(firstTouch).v0;
const v0Of = (byVia) => pageV0Of(firstTouchOf(seriesOf(byVia)));

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
  assert.equal(pageV0Of(null).nobodyNew, null, "not while the counts are unread: that would be a claim about nobody");
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

test("the people an ad brought are said by the ad: its name, or whose account it runs in where it has none (0049)", () => {
  const withAds = (byVia, byAd) =>
    pageV0Of(firstTouchOf(seriesOf(byVia, { first_came: { by_via: byVia, by_ad: byAd } })));
  const spring = { platform: "meta", name: "Spring colour offer", n: 5 };
  const unnamed = { platform: "meta", name: null, n: 2 };
  assert.equal(
    withAds({ ad: 7, whatsapp: 3 }, [spring, unnamed]).ads,
    "5 people from Spring colour offer and 2 people from an ad you run in Meta.",
  );
  assert.equal(withAds({ ad: 5, whatsapp: 3 }, [spring]).ads, "5 people from Spring colour offer.");
  assert.equal(
    withAds({ ad: 3 }, [{ platform: null, name: null, n: 3 }]).ads,
    "3 people from an ad you run.",
    "an ad no reference names, on no platform Chanlytics can say",
  );
  // The report says the most first; the page keeps that order whatever order it was sent in.
  assert.equal(
    withAds({ ad: 7 }, [unnamed, spring]).ads,
    "5 people from Spring colour offer and 2 people from an ad you run in Meta.",
  );
  assert.equal(withAds({ ad: 1 }, [{ ...spring, n: 1 }]).ads, "1 person from Spring colour offer.");
  // The first three by name, the rest together.
  const many = [6, 5, 4, 2, 1].map((n, i) => ({ platform: "meta", name: `Offer ${i + 1}`, n }));
  assert.equal(
    withAds({ ad: 18 }, many).ads,
    "6 people from Offer 1, 5 people from Offer 2, 4 people from Offer 3 and 3 people from 2 other ads.",
  );
  assert.match(withAds({ ad: 17 }, many.slice(0, 4)).ads, / and 2 people from 1 other ad\.$/);
});

test("the page names no ad it cannot account for: a database that does not say, rows that do not add up, nobody from an ad", () => {
  assert.equal(v0Of({ ad: 2, whatsapp: 3 }).ads, null, "a database before the report says which ad");
  assert.deepEqual(firstTouchOf(seriesOf({ ad: 2 })).ads, []);
  const short = seriesOf(
    { ad: 7 },
    { first_came: { by_via: { ad: 7 }, by_ad: [{ platform: "meta", name: "Spring", n: 5 }] } },
  );
  assert.equal(pageV0Of(firstTouchOf(short)).ads, null, "5 named of 7 counted: the page says the 7 alone");
  const none = seriesOf(NO_AD, { first_came: { by_via: NO_AD, by_ad: [] } });
  assert.equal(pageV0Of(firstTouchOf(none)).ads, null);
  // A row the page cannot read is dropped, and a platform it does not know is no platform.
  const odd = [
    { platform: "billboard", name: "  ", n: 2 },
    { platform: "meta", name: "Spring", n: 0 },
    { platform: "meta", name: "Spring", n: Number.NaN },
  ];
  assert.deepEqual(firstTouchOf(seriesOf({ ad: 2 }, { first_came: { by_via: { ad: 2 }, by_ad: odd } })).ads, [
    { platform: null, name: null, n: 2 },
  ]);
});

test("the lead does not name one wire, since an ad on Instagram stamps the same way in", () => {
  assert.doesNotMatch(V0.lead(1, 2).rest, /WhatsApp/);
});

test("the line above the page gives the counts' first day once read, and no time it cannot back", () => {
  assert.equal(nothingConnectedOf(firstTouchOf(seriesOf(NO_AD))).pane, HEAD.v0Read("14 Feb"));
  assert.equal(nothingConnectedOf(null).pane, "Last 30 days");
  assert.deepEqual(nothingConnectedOf(null).head, { strong: HEAD.v0Strong, rest: HEAD.v0Rest });
});

// ---------------------------------------------------------------------------------------------------------------------
// What it opens on, and what it reads

/** The workspace's ad account as its card reads it: none, and Connect not offered here, unless a case says otherwise. */
const NO_ACCOUNT = { offered: false, can_connect: false, meta: null };
const route = { asked: [], answer: () => ({ series: seriesOf(NO_AD), now: null }), account: NO_ACCOUNT };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input instanceof Request ? input.url : input), "https://app.example.org");
  // What the view opens on, the ad account and its ads (the boot's first reads, bridge/surfaces/ads-first-reads.ts), and the card
  // beside the counts: answered apart, and none of them the report's reads. No account was ever connected: no ads.
  const opensOn = url.pathname === "/api/v1/ads/account" || url.pathname === "/api/v1/ads/page";
  if (url.pathname === "/api/v1/ads/page")
    return new Response(JSON.stringify({ ok: true, data: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  if (!opensOn) route.asked.push(url);
  const data = opensOn ? route.account : route.answer(url);
  if (data === null) return new Response(JSON.stringify({ ok: false, error: { message: "no" } }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

/**
 * Draw the page as a cold load does, its read answered as asked, and hand back what redraws it: the boot reads what the view
 * opens on first, so its first draw knows no account is held.
 */
async function drawPage(answer, param = "ads") {
  // An identical read shares an answer the client holds: each page here is its own visit.
  api().forget();
  await readAdsOpening({ read, route: "campaigns/ads", workspace: "studio" });
  route.asked.length = 0;
  route.answer = answer;
  fresh();
  const draw = () => AdsPage({ param });
  return { tree: draw(), draw: () => again(draw) };
}
const landed = (what) => until(redrawWanted, what);
const barLabels = (tree) => textOf(byTestId(tree, "ads-v0"));

test("the page says which ads under its lead, once the counts land, and nothing there when no ad is named", async () => {
  const byVia = { ad: 7, whatsapp: 3 };
  const byAd = [
    { platform: "meta", name: "Spring colour offer", n: 5 },
    { platform: "meta", name: null, n: 2 },
  ];
  const p = await drawPage(() => ({
    series: seriesOf(byVia, { first_came: { by_via: byVia, by_ad: byAd } }),
    now: null,
  }));
  assert.equal(byTestId(p.tree, "ads-v0-ads"), null, "not while it reads");
  await landed("the counts");
  const tree = p.draw();
  assert.equal(
    textOf(byTestId(tree, "ads-v0-lead")),
    "7 of the 10 new people with a recorded way in first wrote from an ad.",
  );
  assert.equal(
    textOf(byTestId(tree, "ads-v0-ads")),
    "5 people from Spring colour offer and 2 people from an ad you run in Meta.",
  );
  const plain = await drawPage(() => ({ series: seriesOf(byVia), now: null }));
  await landed("the counts again");
  assert.equal(byTestId(plain.draw(), "ads-v0-ads"), null);
});

test("the page reads its own counts once, says it is counting, then says them, and draws nothing of an example", async () => {
  const p = await drawPage(() => ({ series: seriesOf(NO_AD), now: null }));
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
  assert.equal(byTestId(tree, "ads-preview-note"), null, "no note says it is a preview: it is the page");
  assert.equal(byTestId(tree, "ads-example"), null, "and no menu walks to an example");
  assert.ok(byTestId(tree, "ads-conn"), "the ad account's card stands beside the counts");
  assert.equal(route.asked.length, 1, "and it is not asked again by drawing");
});

test("a workspace nobody new reached says that, as it has no rows to draw", async () => {
  const p = await drawPage(() => ({ series: seriesOf({}), now: null }));
  await landed("the counts");
  const tree = p.draw();
  assert.equal(textOf(byTestId(tree, "ads-v0-nobody")), V0.nobodyNew);
  assert.match(textOf(byTestId(tree, "ads-v0-door")), new RegExp(V0.doorNobody));
});

test("a read that fails says so and offers again, and never says nobody came", async () => {
  const p = await drawPage(() => null);
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
  // The ad account's card reads beside the counts and redraws the page as it lands: wait for the counts themselves.
  await until(() => /An ad/.test(textOf(byTestId(p.draw(), "ads-v0"))), "the counts read again");
  assert.equal(route.asked.length, 2);
});

test("a database with no series yet is said as a read that did not come, not as nobody", async () => {
  const p = await drawPage(() => ({ series: null, now: null }));
  await landed("the empty answer");
  const tree = p.draw();
  assert.ok(byTestId(tree, "ads-v0-failed"), textOf(byTestId(tree, "ads-v0")));
});

test("an address that names an ad, with nothing connected, is the page with nothing connected: no example's ad", async () => {
  const p = await drawPage(() => ({ series: seriesOf(NO_AD), now: null }), "ads:ad:spring");
  assert.ok(byTestId(p.tree, "ads-v0"));
  assert.equal(byTestId(p.tree, "ads-detail"), null);
  assert.equal(route.asked.length, 1, "the counts are read, as on the page");
});

test("the page tells Ask what it shows, in a word and no row: what is true", async () => {
  const said = () => {
    const s = askOnScreenOf(globalThis.window);
    return s && [s.key, s.view, s.ids];
  };
  await drawPage(() => ({ series: seriesOf(NO_AD), now: null }));
  assert.deepEqual(said(), ["ads", "ads", []]);
});
