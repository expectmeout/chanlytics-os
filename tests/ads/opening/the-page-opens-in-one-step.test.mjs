/**
 * Campaigns › Ads opening (the Ads plan's 4.1 and 4.4): the real page and its hooks on the stub React, over a fetch where
 * the routes would be, with the view's first reads (bridge/surfaces/ads-first-reads.ts) as the boot leaves them. A made-up
 * business.
 *
 * What must hold. Ads opens on the ad account and its ads, which the boot reads as it asks for the settings read and the
 * first draw waits for: with those in, the page is the one it is from its first draw (the ads, or the page with nothing
 * connected) and its hooks ask for neither again. Until it is known whether an account is held, nothing stands under the
 * head: never the page with nothing connected, which an account would then replace, and never People's report, the
 * dearest read a workspace has, which only that page draws. A read of the account that failed says so, with the way to
 * ask again. An answer that has aged is drawn at once and read again behind it, and one read in another workspace
 * is never drawn.
 *
 * The first answer is the tab's, kept once read, so the tests with none come first. The stub runs a component's effects
 * as it draws, and a read reaches the fetch as it is asked, so what a draw asks has been asked once it returns: what was
 * not asked is read off then, with nothing waited for.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";

installStubReact({ CHANLY: { nav() {} } });
const S = "../../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { api } = await import(`${S}/bridge/api.ts`);
const { readAdsOpening } = await import(`${S}/bridge/surfaces/ads-first-reads.ts`);
const { read } = await import(`${S}/bridge/api.ts`);
const { getActiveWorkspace } = await import(`${S}/bridge/workspace.ts`);
const { AdsPage } = await import(`${S}/surfaces/campaigns/ads/ads-page.tsx`);
const { LIVE } = await import(`${S}/surfaces/campaigns/ads/live/words.ts`);

const TZ = "America/New_York";
const CARD = {
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
    checks: ["account-active", "payment", "page-linked"].map((id) => ({ id, ok: true })),
    whatsapp_link: "unsaid",
    can_pause: true,
    reads_instagram: true,
    choices: [],
  },
};
const NOTHING_HELD = { offered: true, can_connect: true, meta: null };
const PAGE = {
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
  ads: [],
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
};

/** What the routes answer, and what was asked of them, by path. */
const route = { account: CARD, accountFails: false, accountHangs: false, asked: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input instanceof Request ? input.url : input), "https://app.example.org");
  route.asked.push(url.pathname);
  const json = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  if (url.pathname === "/api/v1/ads/account") {
    if (route.accountHangs) return new Promise(() => {});
    if (route.accountFails)
      return new Response(JSON.stringify({ ok: false, error: { message: "no" } }), { status: 500 });
    return json(route.account);
  }
  if (url.pathname === "/api/v1/ads/page") return json(route.account.meta ? PAGE : null);
  return json({ series: { first_came: { by_via: {} }, today: "2026-11-20", days: 30 }, now: null });
};
const realNow = Date.now;
after(() => {
  globalThis.fetch = realFetch;
  Date.now = realNow;
});

/** What the routes answer from here, a clean count of what is asked, and a fresh page. */
function opening({ account = CARD, fails = false, hangs = false } = {}) {
  api().forget();
  Object.assign(route, { account, accountFails: fails, accountHangs: hangs, asked: [] });
  fresh();
  return () => AdsPage({ param: "ads" });
}

/** The boot's first reads, as the settings read asks for them, over what the routes answer for `account`. */
async function firstReads(account) {
  api().forget();
  Object.assign(route, { account, accountFails: false, accountHangs: false });
  // As the settings read asks them where the tab opened on Ads (bridge/surfaces/settings.ts).
  await readAdsOpening({ read, route: "campaigns/ads", workspace: getActiveWorkspace() });
}

const ASKED_BY_THE_PAGE = ["/api/v1/ads/account", "/api/v1/ads/page", "/api/v1/reports/people"];
const pageAsked = () => route.asked.filter((path) => ASKED_BY_THE_PAGE.includes(path));

test("until it is known whether an account is held, nothing stands under the head, and People's report is not read", async () => {
  const draw = opening({ hangs: true });
  const first = draw();
  assert.ok(byTestId(first, "campaigns-ads"), "the page and its head");
  for (const id of ["ads-live", "ads-v0", "ads-window", "ads-lead", "ads-held", "ads-account-failed"])
    assert.equal(byTestId(again(draw), id), null, id);
  assert.deepEqual(pageAsked(), ["/api/v1/ads/account"], "the account alone, and nothing of People's report");
});

test("a read of the account that failed says so, with the way to ask again, and never the page with nothing connected", async () => {
  const draw = opening({ fails: true });
  draw();
  await until(() => byTestId(again(draw), "ads-account-failed") !== null, "the account's read refused");
  const tree = again(draw);
  assert.equal(textOf(byTestId(tree, "ads-account-failed")), `${LIVE.loadFailed} Try again`);
  assert.equal(byTestId(tree, "ads-window"), null);
  assert.ok(!pageAsked().includes("/api/v1/reports/people"));
});

test("with the first reads in, the connected page is drawn at its first draw, and nothing is asked again", async () => {
  await firstReads(CARD);
  const draw = opening();
  const first = draw();
  assert.ok(byTestId(first, "ads-live"), "the ads, at once");
  assert.equal(byTestId(first, "ads-v0"), null);
  assert.equal(byTestId(first, "ads-held-loading"), null, "no line that loads");
  assert.ok(byTestId(again(draw), "ads-live"));
  assert.deepEqual(pageAsked(), [], "the boot's reads are the page's first answer");
});

test("with no account held, the page with nothing connected is drawn, and People's report is its read", async () => {
  await firstReads(NOTHING_HELD);
  const draw = opening({ account: NOTHING_HELD });
  const first = draw();
  assert.equal(byTestId(first, "ads-live"), null);
  assert.ok(byTestId(first, "ads-window"), "the page with nothing connected");
  await until(() => pageAsked().includes("/api/v1/reports/people"), "People's report");
  assert.deepEqual(pageAsked(), ["/api/v1/reports/people"]);
});

test("an answer that has aged is drawn at once, and read again behind it", async () => {
  await firstReads(CARD);
  const later = realNow() + 5 * 60_000;
  Date.now = () => later;
  try {
    const draw = opening();
    assert.ok(byTestId(draw(), "ads-live"), "drawn from what is held");
    await until(
      () => pageAsked().includes("/api/v1/ads/account") && pageAsked().includes("/api/v1/ads/page"),
      "both read again",
    );
    assert.ok(byTestId(again(draw), "ads-live"));
  } finally {
    Date.now = realNow;
  }
});

test("an answer read in another workspace is never drawn: the page reads its own", async () => {
  await firstReads(CARD);
  const where = globalThis.location.pathname;
  globalThis.location.pathname = "/w/another-studio";
  try {
    const draw = opening({ hangs: true });
    assert.equal(byTestId(draw(), "ads-live"), null, "nothing of the other workspace's ads");
    assert.deepEqual(pageAsked(), ["/api/v1/ads/account"], "its own account, read");
  } finally {
    globalThis.location.pathname = where;
  }
});
