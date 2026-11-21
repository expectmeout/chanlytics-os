/**
 * AI stopped with ads still on, as the page and the card say it (the Ads plan's G17), and the page of an account with
 * no ad in it (4.4). The models run on reads as the server answers them; the real page and its hooks run on the stub
 * React, over a fetch where the routes would be. A made-up business throughout.
 *
 * What must hold. While AI is stopped, the page says so at its top with how many ads are still on (running, or on
 * while Meta checks them), and the owner's one press pauses every one of them in one request, each with the version
 * it was drawn from; then one toast says what came of it and what Meta still bills: on its way, part of it refused,
 * none of it taken, or no answer, which says that whether they were kept is not known. A
 * member who may not press is told who can. An ad already being paused is not counted again. Nothing is said while AI
 * runs, with nothing on, or where Meta signed Chanlytics out (that notice is the page's own). A paused ad's drawer offers
 * no turning back on while AI is stopped. In Settings the card says it, with the same press; on the page the card does
 * not say it twice. And an account with no ad says what will be here, with New ad.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, textOf, press } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";

installStubReact({ CHANLY: { nav() {} } });
const S = "../../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { api } = await import(`${S}/bridge/api.ts`);
const { aiStopOf: stopOf } = await import(`${S}/surfaces/campaigns/ads/live/stop.ts`);
const { liveModel, sheetModel } = await import(`${S}/surfaces/campaigns/ads/live/model.ts`);
const { LIVE, SHEET, STOP } = await import(`${S}/surfaces/campaigns/ads/live/words.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { useAdsConnection } = await import(`${S}/surfaces/campaigns/ads/connect/use-card.tsx`);

const TZ = "America/New_York";
const SAID = { timezone: TZ };
const STOPPED_AT = "2026-11-20T14:30:00.000Z";
const ID = (n) => `adadadad-8888-4000-8000-00000000000${n}`;

const ad = (n, over = {}) => ({
  id: ID(n),
  name: `Ad ${n}`,
  made_in_platform: true,
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-08T22:00:00Z",
  budget: { kind: "total", minor: 72000, left_minor: 30800, shared: false },
  pending: null,
  version: n + 2,
  resume: { ok: false, why: "not_paused" },
  people: 0,
  booked: 0,
  spend_minor: 0,
  settling: false,
  theirs: { impressions: 0, clicks: 0, results: null },
  ...over,
});
const page = (over = {}) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: TZ,
    read_at: "2026-11-20T14:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
  },
  window: { from: "2026-10-22", to: "2026-11-20" },
  today: "2026-11-20",
  ads: [ad(1), ad(2, { state: "review" }), ad(3, { state: "paused" })],
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: STOPPED_AT,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// What is said

test("while AI is stopped the page says how many ads are still on, with the owner's one press", () => {
  assert.deepEqual(stopOf(page()), {
    title: STOP.title,
    body: "2 ads are still on, and Meta keeps charging for them while they run.",
    press: "Pause 2 ads",
    ownerOnly: null,
  });
  assert.equal(stopOf(page({ ads: [ad(1)] })).body, "1 ad is still on, and Meta keeps charging for it while it runs.");
  assert.equal(stopOf(page({ ads: [ad(1)] })).press, "Pause 1 ad");
  assert.deepEqual(
    stopOf(page({ can_press: false })),
    { title: STOP.title, body: STOP.on(2), press: null, ownerOnly: "Only the owner can pause them." },
    "a member who may not press is told who can",
  );
});

test("an ad already being paused is not counted again, and once every one is on its way it says so with no press", () => {
  const one = page({ ads: [ad(1, { pending: "pausing" }), ad(2)] });
  assert.equal(stopOf(one).press, "Pause 1 ad");
  const all = page({ ads: [ad(1, { pending: "pausing" }), ad(2, { pending: "pausing" })] });
  assert.deepEqual(stopOf(all), { title: STOP.title, body: "Pausing 2 ads…", press: null, ownerOnly: null });
});

test("nothing is said while AI runs, with nothing on, where Meta signed Chanlytics out, or before the page is read", () => {
  assert.equal(stopOf(page({ stopped_at: null })), null);
  assert.equal(stopOf(page({ ads: [ad(3, { state: "paused" })] })), null);
  assert.equal(stopOf(page({ account: { ...page().account, status: "revoked" } })), null);
  assert.equal(stopOf(page({ account: { ...page().account, status: "disconnected" } })), null);
  assert.equal(stopOf(null), null);
  assert.equal(stopOf(undefined), null);
});

test("a paused ad's drawer offers no turning back on while AI is stopped, and does again once AI runs", () => {
  const resumable = ad(3, {
    state: "paused",
    resume: { ok: true, left_minor: 30800, ends_at: "2026-12-08T22:00:00Z" },
  });
  const stopped = sheetModel(page({ ads: [resumable] }), ID(3), SAID);
  assert.deepEqual(stopped.foot, { kind: "none", line: SHEET.stopped });
  const running = sheetModel(page({ ads: [resumable], stopped_at: null }), ID(3), SAID);
  assert.equal(running.foot.kind, "resume");
  // A pause is never held: AI being stopped is the reason to press it.
  assert.equal(sheetModel(page(), ID(1), SAID).foot.kind, "pause");
});

test("an account read with no ad in it says so where the ads would be, beside New ad; not while it is still being read", () => {
  assert.equal(liveModel(page({ ads: [] }), SAID).empty, LIVE.noAds.rest);
  assert.equal(liveModel(page(), SAID).empty, null, "with ads, the ads are the page");
  const reading = page({ ads: [], account: { ...page().account, read_at: null } });
  assert.equal(liveModel(reading, SAID).empty, null, "an account not read yet is said as reading, not as empty");
  const gone = page({ ads: [], account: { ...page().account, status: "disconnected" } });
  assert.equal(liveModel(gone, SAID).empty, null);
});

// ---------------------------------------------------------------------------------------------------------------------
// The page, and the press

const READY = ["account-active", "payment", "page-linked"].map((id) => ({
  id,
  ok: true,
}));
const ACCOUNT = {
  offered: true,
  can_connect: true,
  meta: {
    id: "acc-1",
    external_id: "1200000000000042",
    business_id: null,
    status: "connected",
    standing: "active",
    name: "Harbor ads",
    currency: "USD",
    timezone: TZ,
    page_name: "Harbor Studio",
    connected_at: "2026-11-18T15:00:00Z",
    revoked_at: null,
    disconnected_at: null,
    read_at: "2026-11-20T14:00:00Z",
    read_failed: false,
    spend_limit_minor: null,
    instagram_handle: null,
    ai_number: "+15550100142",
    checks: READY,
    whatsapp_link: "unsaid",
    can_pause: true,
    reads_instagram: true,
    choices: [],
  },
};

/** Each ad of a pause of them all as the route answers it: kept, and Meta told at its pace. */
const KEPT = (one) => ({ id: one.id, outcome: "soon", version: one.version + 1 });
const route = { page: page(), pressed: [], pageFails: false, pauseAll: (set) => ({ ads: set.map(KEPT) }) };
/** What the page said in a toast, where the frame would draw it. */
const flashes = [];
const realToast = globalThis.window.usePPToast;
globalThis.window.usePPToast = () => [null, (flash) => flashes.push(flash)];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input), "https://app.example.org");
  const json = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  if (url.pathname === "/api/v1/ads/pause-all") {
    const body = JSON.parse(String(init?.body ?? (input instanceof Request ? await input.text() : "{}")));
    route.pressed.push(body.ads);
    const answer = route.pauseAll(body.ads);
    return answer instanceof Response ? answer : json(answer);
  }
  if (url.pathname === "/api/v1/ads/account") return json(ACCOUNT);
  if (url.pathname === "/api/v1/ads/page")
    return route.pageFails
      ? new Response(JSON.stringify({ ok: false, error: { message: "no" } }), { status: 500 })
      : json(route.page);
  return json({ series: { first_came: { by_via: {} }, today: "2026-11-20", days: 30 }, now: null });
};
after(() => {
  globalThis.fetch = realFetch;
  globalThis.window.usePPToast = realToast;
});

/** The page with the account held and its read answered as `dto` says, drawn once both reads are in. */
async function heldPage(dto) {
  api().forget();
  route.page = dto;
  route.pressed.length = 0;
  flashes.length = 0;
  fresh();
  const draw = () => AdsPage({ param: "ads" });
  draw();
  const redraw = () => again(draw);
  await until(() => byTestId(redraw(), "ads-live") !== null, "the page's own ads");
  return redraw;
}

test("the page says it at its top, and the one press pauses every ad still on in one request", async () => {
  const draw = await heldPage(page());
  const tree = draw();
  const live = byTestId(tree, "ads-live");
  const stop = byTestId(live, "ads-stop");
  assert.ok(stop, "the stop is drawn on the page");
  assert.equal(textOf(stop), `${STOP.title}${STOP.on(2)}${STOP.press(2)}`);
  // First on the page: before the ads, the notes and the card.
  assert.equal(textOf(live).indexOf(STOP.title), 0);
  // On the page the card does not say it a second time.
  assert.equal(byTestId(byTestId(tree, "ads-conn"), "ads-stop"), null);
  press(byTestId(tree, "ads-stop-pause"));
  await until(() => flashes.length > 0, "the toast");
  assert.deepEqual(
    route.pressed,
    [
      [
        { id: ID(1), version: 3 },
        { id: ID(2), version: 4 },
      ],
    ],
    "one request: each ad still on, with the version it was drawn from, and not the paused one",
  );
  assert.deepEqual(flashes, [{ msg: STOP.pausedSoon(2) }], "one toast: what is on its way, and what Meta still bills");
  assert.equal(
    STOP.pausedSoon(2),
    "2 ads will pause as soon as Meta takes the change. Meta still bills what they already showed.",
  );
});

/** Press the stop on a page whose pause of them all answers as `answer` does, and hand back the one toast. */
async function toastOf(answer) {
  const draw = await heldPage(page());
  route.pauseAll = answer;
  try {
    press(byTestId(draw(), "ads-stop-pause"));
    await until(() => flashes.length > 0, "the toast");
    assert.equal(route.pressed.length, 1, "one request, whatever it came to");
    return flashes;
  } finally {
    route.pauseAll = (set) => ({ ads: set.map(KEPT) });
  }
}

test("a pause of them all says what came of it: part refused, none taken, no answer, or the server's own words", async () => {
  const one = await toastOf((set) => ({ ads: [KEPT(set[0]), { id: set[1].id, outcome: "stale", version: 9 }] }));
  assert.deepEqual(one, [{ tone: "warn", msg: STOP.partly(1, 2) }]);
  const none = await toastOf((set) => ({ ads: set.map((ad) => ({ id: ad.id, outcome: "stale", version: 9 })) }));
  assert.deepEqual(none, [{ tone: "warn", msg: STOP.notTaken }]);
  // The edge gave no answer in time: the server cannot say whether the pauses were kept, and the page reads what stands.
  const unknown = await toastOf((set) => ({
    ads: set.map((ad) => ({ id: ad.id, outcome: "unknown", version: null })),
  }));
  assert.deepEqual(unknown, [{ tone: "warn", msg: STOP.notKnown(2) }]);
  const words = "Only the owner can pause an ad or turn one back on.";
  const refused = await toastOf(
    () => new Response(JSON.stringify({ ok: false, error: { code: "forbidden", message: words } }), { status: 403 }),
  );
  assert.deepEqual(refused, [{ tone: "warn", msg: words }]);
});

test("with AI running the page says nothing of a stop, and an account with no ad says so where the ads would be", async () => {
  const running = (await heldPage(page({ stopped_at: null })))();
  assert.equal(byTestId(running, "ads-stop"), null);
  const empty = (await heldPage(page({ ads: [], stopped_at: null })))();
  assert.match(textOf(byTestId(empty, "ads-live-empty")), new RegExp(LIVE.noAds.rest));
  assert.ok(byTestId(empty, "ads-live-empty-new"), "with New ad beside it");
});

test("an account held whose ads did not load says so, and never says nobody came from an ad", async () => {
  api().forget();
  route.pageFails = true;
  fresh();
  const draw = () => AdsPage({ param: "ads" });
  draw();
  try {
    await until(() => byTestId(again(draw), "ads-held-failed") !== null, "the page's read refused");
    const tree = again(draw);
    assert.equal(textOf(byTestId(tree, "ads-held-failed")), `${LIVE.loadFailed} Try again`);
    assert.equal(byTestId(tree, "ads-v0"), null, "not the page with nothing connected");
    assert.doesNotMatch(textOf(tree), /No one has written from an ad/);
    assert.ok(byTestId(tree, "ads-conn"), "the card stands beside it");
  } finally {
    route.pageFails = false;
  }
});

test("in Settings the card says it, with the same press", async () => {
  api().forget();
  route.page = page();
  fresh();
  const hook = () => useAdsConnection(true, TZ, "Facebook and Instagram ads", "card");
  hook();
  await until(() => byTestId(again(hook).card, "ads-stop") !== null, "the card's read and the page's");
  const card = again(hook).card;
  assert.equal(textOf(byTestId(card, "ads-stop")), `${STOP.title}${STOP.on(2)}${STOP.press(2)}`);
});
