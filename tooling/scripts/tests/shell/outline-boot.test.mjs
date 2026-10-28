/**
 * What the frame's outline is drawn by, before first paint (surfaces/frame/outline.tsx, the cold-load review of 28 Oct
 * 2026). The outline is prerendered once for every address, so a script inline in the document's head stamps on <html>
 * the two facts it cannot know: the sidebar this device keeps, and whether the address is the first run, which the app
 * draws full screen. It is contracts' own text, and this runs it against the app's own reading of the same things: the
 * preferences as legacy-bridge/device-prefs.ts loads them, for everything a device could hold, and the route as contracts
 * reads an address (routeOfAddress, the path's route, else the hash's), for every shape a first run's address takes and the
 * addresses beside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineBootScript, DEVICE_PREFS_STORAGE } from "../../../../packages/contracts/src/shell/chrome.ts";
import { routeOfAddress, routeOfPath } from "../../../../packages/contracts/src/shell/address.ts";
import { FIRST_RUN_ROUTE } from "../../../../packages/contracts/src/setup/first-run-route.ts";
import { loadPrefs } from "../../../../apps/dashboard/src/legacy-bridge/device-prefs.ts";

/** The two attributes the outline's stylesheet reads (surfaces/frame/outline.css), as it spells them. */
const SIDEBAR_ATTR = "data-sidebar";
const BARE_ATTR = "data-outline-bare";

/** The script run in a window holding `stored` at `pathname` and `hash`: what it stamped on <html>, or what it threw. */
const boot = ({ stored = null, storageThrows = false, pathname = "/w/acme/today", hash = "" }) => {
  const attrs = {};
  const document = { documentElement: { setAttribute: (k, v) => void (attrs[k] = String(v)) } };
  const localStorage = {
    getItem: (k) => {
      if (storageThrows) throw new Error("blocked");
      return k === DEVICE_PREFS_STORAGE ? stored : null;
    },
  };
  let threw = null;
  try {
    new Function("document", "localStorage", "location", outlineBootScript())(document, localStorage, {
      pathname,
      hash,
    });
  } catch (e) {
    threw = e;
  }
  return { sidebar: attrs[SIDEBAR_ATTR] ?? null, bare: BARE_ATTR in attrs, threw };
};

/** The sidebar the app keeps for the same bytes (device-prefs.ts loadPrefs). */
const appSidebar = (stored, storageThrows = false) =>
  loadPrefs(() => ({
    getItem: (k) => {
      if (storageThrows) throw new Error("blocked");
      return k === DEVICE_PREFS_STORAGE ? stored : null;
    },
    setItem: () => {},
  })).sidebar;

/**
 * Whether the app draws the address full screen: a workspace's address whose route's page is the first run
 * (surfaces/frame/app-shell.tsx). The home draws no frame at all: it sends the tab on to its workspace (LegacyHost).
 */
const appFullScreen = (pathname, hash) =>
  routeOfPath(pathname) !== null && routeOfAddress({ pathname, hash }).split(/[/?]/)[0] === FIRST_RUN_ROUTE;

const SIDEBARS_HELD = ['"open"', '"rail"', '"Rail"', '"junk"', "null", "1", '["rail"]', undefined];
const HELD = [
  ...SIDEBARS_HELD.map((s) => (s === undefined ? '{"theme":"light"}' : `{"theme":"dark","sidebar":${s}}`)),
  null,
  "",
  "not json",
  "[]",
  '"rail"',
];

test("the sidebar it stamps is the one the app keeps, for everything a device could hold", () => {
  for (const stored of HELD) {
    const got = boot({ stored });
    assert.equal(got.threw, null, `threw for ${stored}`);
    assert.equal(got.sidebar, appSidebar(stored), `for ${JSON.stringify(stored)}`);
  }
});

test("a storage that refuses stamps the app's own default, as the app falls back to it", () => {
  const got = boot({ stored: '{"sidebar":"rail"}', storageThrows: true });
  assert.equal(got.threw, null);
  assert.equal(got.sidebar, appSidebar('{"sidebar":"rail"}', true));
});

test("it marks the first run, and only the first run, as the app draws it full screen", () => {
  const ADDRESSES = [
    ["/w/acme/start", ""],
    ["/w/acme/start/", ""],
    ["/w/acme/start/business", ""],
    ["/w/acme/start/find", ""],
    ["/w/acme", "#/start"],
    ["/w/acme/", "#/start"],
    ["/w/acme", "#/start/channels"],
    ["/w/acme", "#/start?from=signup"],
    ["/w/acme/today", "#/start"],
    ["/w/acme/startup", ""],
    ["/w/acme/settings/start", ""],
    ["/w/acme/today", ""],
    ["/w/acme", ""],
    ["/w/acme", "#/inbox"],
    ["/w/acme", "#access_token=x"],
    ["/", "#/start"],
    ["/login", ""],
  ];
  for (const [pathname, hash] of ADDRESSES) {
    const got = boot({ pathname, hash });
    assert.equal(got.threw, null, `threw at ${pathname}${hash}`);
    assert.equal(got.bare, appFullScreen(pathname, hash), `at ${pathname}${hash}`);
  }
  assert.equal(boot({ pathname: "/w/acme/start" }).bare, true, "the first run is one of them");
});
