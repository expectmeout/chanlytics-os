/**
 * Ads' first reads beside Content (bridge/surfaces/ads-first-reads.ts readAdsBesideContent), run through the gate the shell
 * asks before a page's first draw (surface-registry installRouteGate over surface-status), and whose the answer is.
 *
 * What must hold. Content's first draw waits for the two reads the Ads tab's figure is said from, half a second at most:
 * a slow read never holds Content's first screen (the review of 28 Nov 2026, R2.9; it was held for as long as any first
 * draw is, three seconds). Reads that land after it are still kept, for the read ahead and the Ads page to start from. And
 * the answer is one workspace's: said for the workspace it was asked in, and for no other, with nothing loaded again.
 *
 * Its own file: the statuses and the first answer are module state. The reads are a stand-in a test lands by hand, and the
 * half second is a mocked clock's, so nothing here waits.
 */
import { after, mock, test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { provided } from "../_bridge-holds.mjs";

const HARBOR = "harbor-studio";
const win = { location: { pathname: `/w/${HARBOR}/campaigns/content`, hash: "" } };
globalThis.window = win;

const reg = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
const status = await importSrc("apps/dashboard/src/bridge/surface-status.ts");
const first = await importSrc("apps/dashboard/src/bridge/surfaces/ads-first-reads.ts");
reg.installRouteGate();
const gate = () => provided("surfaceGate")("campaigns", "content");

mock.timers.enable({ apis: ["setTimeout"] });
after(() => mock.timers.reset());

const ACCOUNT = { offered: true, can_connect: true, meta: { id: "acc-1", status: "connected" } };
const pageOf = (name) => ({ account: { status: "connected", name }, ads: [{ id: `${name}-ad`, needs: null }] });

/** The two routes Ads opens on, each answered when the test lands it; `asked` is what was asked of them. */
function reads() {
  const asked = [];
  const landing = {};
  const read = (route) => {
    asked.push(route);
    return new Promise((land, fail) => (landing[route] = { land, fail }));
  };
  return {
    read,
    asked,
    land: (page) => {
      landing["GET ads/account"].land(ACCOUNT);
      landing["GET ads/page"].land(page);
    },
    fail: () => landing["GET ads/account"].fail(new Error("no")),
  };
}

/** Content's own reads are in: the settings read, which says whether Ads is drawn, and what was made. */
function contentIsIn() {
  status.setStatus("settings", "live");
  status.setStatus("content", "live");
}

/** What the first draw's wait hears as a promise settles: its own hop, and the status listeners' after it. */
const heard = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("Content's first draw waits for Ads' two reads half a second at most, and reads that land later are still kept", async () => {
  contentIsIn();
  assert.equal(gate(), true, "Content's own reads are in, and nothing else is asked for");
  const ads = reads();
  const landed = first.readAdsBesideContent({ read: ads.read, route: "campaigns/content", workspace: HARBOR });
  assert.deepEqual(ads.asked, ["GET ads/account", "GET ads/page"]);
  assert.equal(gate(), false, "held for the Ads tab's figure, as Ruben asked on 26 Nov 2026");

  mock.timers.tick(499);
  await heard();
  assert.equal(gate(), false, "still inside the half second");
  mock.timers.tick(1);
  await heard();
  assert.equal(gate(), true, "REGRESSION: reads slower than half a second held Content's first screen");
  assert.equal(first.adsFirstPage(), null, "drawn without the figure, which is on its way");

  // The reads land a moment later: kept, for the read ahead and the Ads page to start from, with nothing asked again.
  const page = pageOf("Harbor ads");
  ads.land(page);
  await landed;
  assert.deepEqual(first.adsFirstPage(), page, "the figure follows");
  const ahead = reads();
  const held = await first.readAdsAhead({ read: ahead.read, workspace: HARBOR });
  assert.deepEqual(held?.page, page);
  assert.deepEqual(ahead.asked, [], "what landed late is the read ahead's answer");
  assert.equal(gate(), true);
});

test("reads that are in before the half second end the wait as they land, and one that failed ends it too", async () => {
  contentIsIn();
  const ads = reads();
  const landed = first.readAdsBesideContent({ read: ads.read, route: "campaigns/content", workspace: HARBOR });
  assert.equal(gate(), false);
  ads.land(pageOf("Harbor ads"));
  await landed;
  await heard();
  assert.equal(gate(), true, "drawn as the reads land, with no half second waited out");

  const failing = reads();
  const over = first.readAdsBesideContent({ read: failing.read, route: "campaigns/content", workspace: HARBOR });
  assert.equal(gate(), false);
  failing.fail();
  await over;
  await heard();
  assert.equal(gate(), true, "a read that failed is over: Content draws, and its page reads for itself");
});

test("elsewhere than Content nothing is asked, and no first draw is held", () => {
  const ads = reads();
  assert.equal(first.readAdsBesideContent({ read: ads.read, route: "inbox", workspace: HARBOR }), null);
  assert.deepEqual(ads.asked, []);
  assert.equal(gate(), true);
});

test("the first answer is its workspace's: under another workspace's address nothing of it is said", async () => {
  const ads = reads();
  const landed = first.readAdsBesideContent({ read: ads.read, route: "campaigns/content", workspace: HARBOR });
  const page = pageOf("Harbor ads");
  ads.land(page);
  await landed;
  assert.deepEqual(first.adsFirstPage(), page);

  // The address names another workspace, and nothing was loaded again (a switch loads the page today: this holds if one
  // ever does not).
  win.location.pathname = "/w/another-studio/campaigns/content";
  try {
    assert.equal(first.adsFirstPage(), null, "REGRESSION: one workspace's ads said under another's address");
    assert.equal(first.adsFirstAnswer("another-studio"), null);
    assert.deepEqual(first.adsFirstAnswer(HARBOR)?.page, page, "kept for its own workspace");
  } finally {
    win.location.pathname = `/w/${HARBOR}/campaigns/content`;
  }
  assert.deepEqual(first.adsFirstPage(), page, "and said again where the address names it");
});

test("a read asked in one workspace that lands once the address names another is never the other's", async () => {
  const ads = reads();
  const landed = first.readAdsBesideContent({ read: ads.read, route: "campaigns/content", workspace: HARBOR });
  win.location.pathname = "/w/another-studio/campaigns/content";
  try {
    ads.land(pageOf("Harbor ads, read again"));
    await landed;
    assert.equal(first.adsFirstPage(), null, "REGRESSION: an answer of the workspace left drawn in the one arrived at");
    assert.equal(first.adsFirstAnswer("another-studio"), null);
  } finally {
    win.location.pathname = `/w/${HARBOR}/campaigns/content`;
  }
});
