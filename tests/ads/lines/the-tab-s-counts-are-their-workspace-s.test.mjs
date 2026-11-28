/**
 * What the Ads tab keeps for a visit is one workspace's (the review of 28 Nov 2026, R2.10; the whole-system plan's lane 6,
 * item 6): how many things in Ads need the owner and how many ads its list holds (surfaces/campaigns/ads/needs-you.ts), and
 * how its list is looked through, the filter and the words found (live/ad-list.ts). Each is kept with the workspace the
 * address named as it was noted, and said only while the address still names it.
 *
 * A switch of workspace loads the page again today, which starts each again. These hold if one ever does not: another
 * workspace's counts are never this one's, and its list starts at All with nothing found. Run on the real modules over
 * the stub React, with the address moved by hand and nothing loaded again.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installStubReact, fresh, again } from "../../_stub-react.mjs";

installStubReact({});
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const ADS = "apps/dashboard/src/surfaces/campaigns/ads";
const { adsNeedingNow, adsWorkspaceNow, hearAdsNeeding, noteAdsListed, noteAdsNeeding, useAdsListed, useAdsNeeding } =
  await import(at(`${ADS}/needs-you.ts`));
const { useAdsLooked } = await import(at(`${ADS}/live/ad-list.ts`));

/** The tab's address moved to a page of a workspace, as a move with no load would leave it. */
const openIn = (slug, route = "campaigns/ads") => {
  globalThis.window ??= globalThis;
  globalThis.location ??= {};
  globalThis.location.pathname = `/w/${slug}/${route}`;
  if (globalThis.window.location !== globalThis.location) globalThis.window.location = globalThis.location;
};
/** A hook's answer as a component drawn now reads it. */
const drawn = (hook) => {
  fresh();
  let out;
  again(() => {
    out = hook();
    return null;
  });
  return out;
};

beforeEach(() => openIn("harbor"));

test("the workspace is the one the address names, read as the bridge reads it", () => {
  assert.equal(adsWorkspaceNow(), "harbor");
  openIn("harbor%20studio", "campaigns/content/made");
  assert.equal(adsWorkspaceNow(), "harbor studio");
  globalThis.location.pathname = "/signin";
  assert.equal(adsWorkspaceNow(), null, "off a workspace page there is none");
});

test("what needs the owner in Ads, and how many ads its list holds, are said only in the workspace they were noted in", () => {
  noteAdsNeeding(2);
  noteAdsListed(7);
  assert.deepEqual([adsNeedingNow(), drawn(useAdsNeeding), drawn(useAdsListed)], [2, 2, 7]);
  // The address names another workspace, and no page was loaded: Harbor's counts are not Pier's.
  openIn("pier", "campaigns/content/made");
  assert.deepEqual(
    [adsNeedingNow(), drawn(useAdsNeeding), drawn(useAdsListed)],
    [0, 0, null],
    "nothing is said of another workspace's ads",
  );
  // Pier's own, once its page reads them, are Pier's; and Harbor's are not said again from before.
  noteAdsListed(1);
  assert.deepEqual([adsNeedingNow(), drawn(useAdsListed)], [0, 1]);
  openIn("harbor");
  assert.deepEqual([adsNeedingNow(), drawn(useAdsListed)], [0, null], "read again before anything is said");
});

test("a count noted tells whoever hears it, and the same count again tells nobody", () => {
  let told = 0;
  const stop = hearAdsNeeding(() => {
    told += 1;
  });
  noteAdsNeeding(3);
  noteAdsNeeding(3);
  noteAdsListed(4);
  assert.equal(told, 2);
  // The same number in another workspace is news there: it was never noted in it.
  openIn("pier");
  noteAdsNeeding(3);
  assert.equal(told, 3);
  stop();
});

test("how the list is looked through is its workspace's: another's starts at All with nothing found", () => {
  const looked = drawn(useAdsLooked);
  looked.choose("paused");
  looked.find("spring");
  assert.deepEqual(
    (({ filter, about }) => [filter, about])(drawn(useAdsLooked)),
    ["paused", "spring"],
    "kept for the visit, between the bar and the page",
  );
  openIn("pier");
  assert.deepEqual(
    (({ filter, about }) => [filter, about])(drawn(useAdsLooked)),
    ["all", null],
    "Harbor's filter and find are not Pier's",
  );
  // What is chosen in Pier is Pier's, and starts from Pier's own first state, never from Harbor's words.
  drawn(useAdsLooked).choose("ended");
  assert.deepEqual((({ filter, about }) => [filter, about])(drawn(useAdsLooked)), ["ended", null]);
  openIn("harbor");
  assert.deepEqual((({ filter, about }) => [filter, about])(drawn(useAdsLooked)), ["all", null]);
});
