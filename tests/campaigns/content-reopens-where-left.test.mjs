/**
 * Content's tab reopens where Content was left (Campaigns in three tabs, 23 Nov 2026, call 6; home/left-at.ts): from another
 * view it goes to the place last shown in this visit, Ads among Made's views and what was open with it; on a phone the list
 * and view are kept on the device, so the next visit's first press opens there. A link names its own place, and the tab
 * pressed on Content or Ads goes to Content as it opens.
 *
 * The tests run in order: the first is a visit's start, before anything was shown, which nothing in this process can undo.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../apps/dashboard/src/surfaces";
const { campaignsChrome } = await import(`${S}/campaigns/routes.ts`);
const { noteContentLeft } = await import(`${S}/campaigns/home/left-at.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);

const KEY = "chanlytics.content.left";
const PIECE = "5b0c6d2e-1f3a-4c5b-9d6e-7f8091a2b3c4";
const AD = "6c1d7e3f-2a4b-4d6c-8e7f-8091a2b3c4d5";

/** A phone's window or a desk's, and the device's storage; `refused` is a private window's, which throws. */
function deviceOf(phone, kept = new Map(), refused = false) {
  globalThis.window = { matchMedia: () => ({ matches: phone }), location: { pathname: "/w/acme/campaigns/sequences" } };
  const no = () => {
    throw new Error("storage refused");
  };
  globalThis.localStorage = {
    getItem: refused ? no : (k) => kept.get(k) ?? null,
    setItem: refused ? no : (k, v) => void kept.set(k, String(v)),
    removeItem: (k) => void kept.delete(k),
  };
  return kept;
}

const adsOn = (on) => setSurfaceValue("settings", { settings: { ads: on } });
/** Where Content's tab goes from the view this address is (null is Sequences' list). */
const contentTabFrom = (param) => campaignsChrome({ param }).views.tabs.find((t) => t.id === "content").to;

afterEach(() => {
  setSurfaceValue("settings", undefined);
  delete globalThis.window;
  delete globalThis.localStorage;
});

test("a visit's first press: a phone opens the list and view its device kept, a desk opens Content as it opens", () => {
  deviceOf(true, new Map([[KEY, "campaigns/content:needs"]]));
  assert.equal(contentTabFrom(null), "campaigns/content:needs", "a phone opens the view it was left on");
  assert.equal(contentTabFrom("forms"), "campaigns/content:needs", "from Forms too");
  deviceOf(false, new Map([[KEY, "campaigns/content:needs"]]));
  assert.equal(contentTabFrom(null), "campaigns/content", "a desk keeps nothing on the device");
  // A kept piece is not opened again: a later visit may not hold it. Nor is a word the address does not know.
  deviceOf(true, new Map([[KEY, `campaigns/content:posted:${PIECE}`]]));
  assert.equal(contentTabFrom(null), "campaigns/content:posted");
  deviceOf(true, new Map([[KEY, "campaigns/sequences"]]));
  assert.equal(contentTabFrom(null), "campaigns/content", "another view's address is no place of Content's");
  // Ads kept: its list where Ads is drawn, Content as it opens where it is not.
  deviceOf(true, new Map([[KEY, "campaigns/ads"]]));
  adsOn(true);
  assert.equal(contentTabFrom(null), "campaigns/ads");
  adsOn(false);
  assert.equal(contentTabFrom(null), "campaigns/content");
  // A private window's storage, refused: Content as it opens, and nothing thrown.
  deviceOf(true, new Map(), true);
  assert.equal(contentTabFrom(null), "campaigns/content");
});

test("in a visit the tab goes back to the place left, with what was open; a phone keeps its list and view for the next", () => {
  const kept = deviceOf(true);
  noteContentLeft(`campaigns/content:scheduled:${PIECE}`);
  assert.equal(contentTabFrom(null), `campaigns/content:scheduled:${PIECE}`, "the piece left open, as Back would");
  assert.equal(kept.get(KEY), "campaigns/content:scheduled", "the device keeps the view, not the piece");
  // Another view's address is not Content's place, and leaves it as it was.
  noteContentLeft("campaigns/sequences/q-1");
  assert.equal(contentTabFrom(null), `campaigns/content:scheduled:${PIECE}`);
  // Ads, the last of Made's views, with the ad open.
  adsOn(true);
  noteContentLeft(`campaigns/ads:${AD}`);
  assert.equal(contentTabFrom("forms"), `campaigns/ads:${AD}`);
  assert.equal(kept.get(KEY), "campaigns/ads");
  adsOn(false);
  assert.equal(contentTabFrom("forms"), "campaigns/content", "Ads not drawn: Content as it opens");
  // On a desk the visit's place still holds, and nothing is written to the device.
  const desk = deviceOf(false);
  noteContentLeft("campaigns/content:library");
  assert.equal(contentTabFrom(null), "campaigns/content:library");
  assert.equal(desk.size, 0);
});

test("the tab pressed on Content or on Ads goes to Content as it opens: the way out of Ads to Made's other views", () => {
  deviceOf(true);
  adsOn(true);
  noteContentLeft("campaigns/content:needs");
  assert.equal(contentTabFrom("content:needs"), "campaigns/content");
  assert.equal(contentTabFrom("ads"), "campaigns/content");
  assert.equal(contentTabFrom(`ads:${AD}`), "campaigns/content");
});
