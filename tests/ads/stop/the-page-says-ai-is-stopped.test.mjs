/**
 * AI stopped with ads still on, as the page and the card say it (the Ads plan's G17), and the page of an account with
 * no ad in it (4.4). The models run on reads as the server answers them; the real page and its hooks run on the stub
 * React, over a fetch where the routes would be. A made-up business throughout.
 *
 * What must hold. While AI is stopped, the page says so at its top: the ads made here the stop paused itself (the content
 * loop PRD's 14.1, call 21), and how many ads are still on (made in Meta, which the stop never pauses: running, or on
 * while Meta checks them), and the owner's one press pauses every one of them in one request, each with the version
 * it was drawn from; then one toast says what came of it and what Meta still bills: on its way, part of it refused,
 * none of it taken, or no answer, which says that whether they were kept is not known. A
 * member who may not press is told who can. An ad already being paused is not counted again. Nothing is said while AI
 * runs, with nothing on, or where Meta signed Chanlytics out (that notice is the page's own). A paused ad's drawer offers
 * no turning back on while AI is stopped. In Settings the card says it, with the same press; on the page the card does
 * not say it twice. And an account with no ad says what will be here, with New ad. Once AI runs again, the ads the stop
 * paused stay paused, and the page names them with the owner's own press that turns them back on.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, all, byTestId, textOf, press } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { bridgeHolds, holdFrameParts, provided } from "../../shell/_bridge-holds.mjs";

installStubReact({});
const S = "../../../apps/dashboard/src";
holdFrameParts();
const { api } = await import(`${S}/bridge/api.ts`);
const { aiStopOf: stopOf } = await import(`${S}/surfaces/campaigns/ads/live/stop.ts`);
const { liveModel } = await import(`${S}/surfaces/campaigns/ads/live/model.ts`);
const { sheetModel } = await import(`${S}/surfaces/campaigns/ads/live/model/sheet.ts`);
const { AI_LINE, LIVE, SHEET, STOP, STOPPED_ADS } = await import(`${S}/surfaces/campaigns/ads/live/words.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { useAdsConnection } = await import(`${S}/surfaces/campaigns/ads/connect/use-card.tsx`);

const TZ = "America/New_York";
const SAID = { timezone: TZ, nowMs: Date.parse("2026-11-20T15:00:00Z") };
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
  paused_by: null,
  way_in: null,
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
    ready: true,
  },
  window: { from: "2026-10-22", to: "2026-11-20" },
  today: "2026-11-20",
  ads: [ad(1), ad(2, { state: "review" }), ad(3, { state: "paused" })],
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: STOPPED_AT,
  needs_you: { count: 0, people: [] },
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// What is said

test("while AI is stopped the page says how many ads made in Meta are still on, with the owner's one press", () => {
  assert.deepEqual(stopOf(page()), {
    title: STOP.title,
    body: "2 ads made in Meta are still on, and Meta keeps charging for them while they run.",
    press: "Pause 2 ads",
    act: "pause",
    ownerOnly: null,
  });
  assert.equal(
    stopOf(page({ ads: [ad(1)] })).body,
    "1 ad made in Meta is still on, and Meta keeps charging for it while it runs.",
  );
  assert.equal(stopOf(page({ ads: [ad(1)] })).press, "Pause 1 ad");
  assert.deepEqual(
    stopOf(page({ can_press: false })),
    {
      title: STOP.title,
      body: STOP.on(2, true),
      press: null,
      act: "pause",
      ownerOnly: "Only the owner can pause them.",
    },
    "a member who may not press is told who can",
  );
});

test("the ads made here the stop paused itself are said first; one whose pause didn't hold is still on, with the press", () => {
  const held = (n) => ad(n, { made_in_platform: false, state: "paused", paused_by: "stop", pending: "pausing" });
  assert.deepEqual(stopOf(page({ ads: [held(1), held(2)] })), {
    title: STOP.title,
    body: "Chanlytics paused 2 ads made here, so nothing is spent while nobody answers.",
    press: null,
    act: "pause",
    ownerOnly: null,
  });
  const both = stopOf(page({ ads: [held(1), ad(2)] }));
  assert.equal(
    both.body,
    "Chanlytics paused 1 ad made here, so nothing is spent while nobody answers. 1 ad made in Meta is still on, and Meta keeps charging for it while it runs.",
  );
  assert.equal(both.press, "Pause 1 ad");
  const unheld = stopOf(page({ ads: [ad(1, { made_in_platform: false })] }));
  assert.equal(unheld.body, STOP.on(1, false), "an ad made here still on: its pause did not hold");
});

test("once AI runs again the ads the stop paused stay paused, and the owner's own press turns them back on", () => {
  const held = (n) => ad(n, { made_in_platform: false, state: "paused", paused_by: "stop" });
  const after = page({ stopped_at: null, ads: [held(1), held(2), ad(3, { state: "paused" })] });
  assert.deepEqual(stopOf(after), {
    title: STOPPED_ADS.title,
    body: "2 ads were paused when AI was stopped, and stay paused until you turn them back on.",
    press: "Turn 2 ads back on",
    act: "resume",
    ownerOnly: null,
  });
  assert.deepEqual(stopOf({ ...after, can_press: false }).ownerOnly, STOPPED_ADS.ownerOnly);
  assert.equal(stopOf(page({ stopped_at: null, ads: [ad(3, { state: "paused" })] })), null, "none the stop paused");
});

test("an ad already being paused is not counted again, and once every one is on its way it says so with no press", () => {
  const one = page({ ads: [ad(1, { pending: "pausing" }), ad(2)] });
  assert.equal(stopOf(one).press, "Pause 1 ad");
  const all = page({ ads: [ad(1, { pending: "pausing" }), ad(2, { pending: "pausing" })] });
  assert.deepEqual(stopOf(all), {
    title: STOP.title,
    body: "Pausing 2 ads…",
    press: null,
    act: "pause",
    ownerOnly: null,
  });
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
const realToast = provided("toast");
bridgeHolds({ parts: { toast: () => [null, (flash) => flashes.push(flash)] } });
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
  bridgeHolds({ parts: { toast: realToast } });
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
  assert.equal(textOf(stop), `${STOP.title}${STOP.on(2, true)}${STOP.press(2)}`);
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
  // On a ready account AI's line proposes the first ad and opens New ad, so the empty line says only what is true.
  assert.equal(textOf(byTestId(empty, "ads-ai-line")), AI_LINE.first(false));
  assert.equal(byTestId(empty, "ads-live-empty-new"), null);
  const notReady = page({ ads: [], stopped_at: null, account: { ...page().account, ready: false } });
  const waits = (await heldPage(notReady))();
  assert.equal(byTestId(waits, "ads-ai-line"), null, "AI proposes nothing on a card with a check not met");
  assert.ok(byTestId(waits, "ads-live-empty-new"), "and the empty line keeps New ad beside it");
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
  assert.equal(textOf(byTestId(card, "ads-stop")), `${STOP.title}${STOP.on(2, true)}${STOP.press(2)}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// The list, on the same page: every ad of the account can be found (the review of 28 Nov 2026, R2.7)

test("the page keeps an ended ad with nothing to show under Ended, behind a fold of its own that a press opens", async () => {
  const draw = await heldPage(
    page({
      stopped_at: null,
      ads: [
        ad(1, { spend_minor: 9000 }),
        ad(2, { state: "ended", ends_at: "2026-11-10T22:00:00Z", spend_minor: 500 }),
        // Over, and nothing in the page's thirty days: nobody came from it and it spent nothing.
        ad(3, { name: "Never ran", state: "ended", ends_at: "2026-11-12T22:00:00Z" }),
      ],
    }),
  );
  const rowsOf = (tree) =>
    all(tree, (node) => node.props?.["data-testid"] === "ads-live-row").map((node) => node.props["data-row-id"]);
  // As the list was: what runs, and Ended folded under it. No ended ad is drawn before a press.
  assert.deepEqual(rowsOf(draw()), [ID(1)]);
  assert.equal(byTestId(draw(), "ads-quiet-fold"), null, "its fold is inside Ended's");
  press(byTestId(draw(), "ads-ended-fold"));
  assert.deepEqual(rowsOf(draw()), [ID(1), ID(2)], "Ended opens on what it held before");
  // Under them, one line: how many more are over with nothing to show, and a press that shows them.
  const fold = byTestId(draw(), "ads-quiet-fold");
  assert.ok(fold, "the quiet ones' own fold");
  assert.match(textOf(byTestId(draw(), "ads-group-ended")), /Nothing in the last 30 days\s*1/);
  press(fold);
  assert.deepEqual(rowsOf(draw()), [ID(1), ID(2), ID(3)], "and the ad that never ran is there, with its drawer's door");
});
