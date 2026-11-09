/**
 * The frame's half of the rows a phone last showed (surfaces/frame/first-rows.ts; decision 0101): when the picture the document
 * drew goes, and what the field data is told of it. The document's half is first-rows.test.mjs, beside this; e2e/shell/first-rows.spec.ts
 * holds both in a browser. Run here over a stand-in for the document, on the stub React, with the measures installed as the app
 * installs them and their collector listened to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_ROWS_AT_ATTR,
  FIRST_ROWS_ATTR,
  FIRST_ROWS_END_ATTR,
  FIRST_ROWS_ID,
  FIRST_ROWS_MISS_ATTR,
  FIRST_ROWS_SHEETS_ATTR,
  FIRST_ROWS_SLOT,
} from "@chanlytics/contracts";
import { fresh, installStubReact, textOf } from "../../_stub-react.mjs";

installStubReact({ __surfaceState: () => "live", __DEMO_MODE: false, innerWidth: 393, scrollY: 0 });
const S = "../../../apps/dashboard/src";
const { firstRowsMeetRoute, installFirstRows, useFirstRowsLetGo } = await import(`${S}/surfaces/frame/first-rows.ts`);
const { hearPartReady, installPageSpeed, partReady, speedHost } = await import(`${S}/client/page-speed.ts`);

const h = (type, props, ...kids) => globalThis.React.createElement(type, props, ...kids);

/** What the frame set going, held rather than run: a test runs one by hand. */
const timers = [];
globalThis.setTimeout = (f, ms) => timers.push({ f, ms });
globalThis.clearTimeout = () => {};

/** A screen at rest, as much of one as a copy reads: nothing on it to cut, and the copy of it one element. */
const SCREEN = {
  querySelector: () => null,
  querySelectorAll: () => [],
  cloneNode: () => ({
    querySelectorAll: () => [],
    removeAttribute() {},
    style: {},
    outerHTML: "<div>the screen</div>",
  }),
};
globalThis.getComputedStyle = () => ({ animationName: "none" });

/** The browser's local storage, as much as a slot's walk reads. */
const onDevice = new Map();
globalThis.localStorage = {
  get length() {
    return onDevice.size;
  },
  key: (i) => [...onDevice.keys()][i] ?? null,
  getItem: (k) => onDevice.get(k) ?? null,
  setItem: (k, v) => void onDevice.set(k, String(v)),
  removeItem: (k) => void onDevice.delete(k),
};

let picture = null;

/**
 * The document as firstRowsScript leaves it, at an address and a width: the picture up, of `word` (none where it is null), when
 * it was painted, why none was drawn, and whether the document let its own go.
 */
function stand(
  word,
  { path = `/w/acme/${word ?? "inbox"}`, hash = "", width = 393, at = null, miss = null, end = null } = {},
) {
  const attrs = {
    [FIRST_ROWS_SHEETS_ATTR]: "1",
    ...(word ? { [FIRST_ROWS_ATTR]: word } : {}),
    ...(at ? { [FIRST_ROWS_AT_ATTR]: at } : {}),
    ...(miss ? { [FIRST_ROWS_MISS_ATTR]: miss } : {}),
    ...(end ? { [FIRST_ROWS_END_ATTR]: end } : {}),
  };
  picture = word
    ? {
        removed: false,
        getAttribute: () => null,
        remove() {
          this.removed = true;
        },
      }
    : null;
  globalThis.document = {
    documentElement: {
      getAttribute: (k) => attrs[k] ?? null,
      hasAttribute: (k) => k in attrs,
      removeAttribute: (k) => void delete attrs[k],
      style: { cssText: "" },
    },
    addEventListener() {},
    getElementById: (id) => (id === FIRST_ROWS_ID && picture && !picture.removed ? picture : null),
    querySelector: () => SCREEN,
  };
  globalThis.location = { pathname: path, search: "", hash };
  globalThis.innerWidth = width;
}

stand(null);
installPageSpeed(
  {
    route: () => "inbox",
    hearRoute: () => () => {},
    hearAsked() {},
    surfacesOf: () => [],
    ownSurface: () => undefined,
    isRead: () => true,
    isReady: () => true,
    gateOpen: () => false,
    hearSurfaces: () => () => {},
  },
  { build: "abc123", report: false },
);
/** What the field data has been told of the copy, by the collector the frame reports to. */
const notes = [];
speedHost().fieldData.note = (r) => notes.push(r);
const heard = () => notes.map((n) => [n.page, n.part]);

/** The page put away, as a phone's browser says so. */
const putAway = () => globalThis.dispatchEvent({ type: "pagehide" });
const copiesKept = () => [...onDevice.keys()].filter((k) => k.startsWith(FIRST_ROWS_SLOT));

/** A load over a document as `over` stamps it: the parts the frame reports as it installs. */
const installedOver = (word, over) => {
  notes.length = 0;
  stand(word, over);
  installFirstRows(globalThis);
  return notes.map((n) => n.part);
};

test("the copy goes in the draw that says its page's first part, and for no other", () => {
  stand("inbox");
  installFirstRows(globalThis);
  partReady("inbox", "thread", "");
  partReady("today", "list", "");
  assert.equal(picture.removed, false, "another part, or another page's, leaves it standing");
  partReady("inbox", "list", "");
  assert.equal(picture.removed, true, "in the same call: the same frame");
});

test("a part said with nobody listening throws nothing, and a listener can leave", () => {
  const seen = [];
  const stop = hearPartReady((page, part) => seen.push(`${page}.${part}`));
  partReady("inbox", "list", "");
  stop();
  partReady("inbox", "list", "");
  assert.deepEqual(seen, ["inbox.list"]);
});

test("a screen drawn in the frame's place lets the copy go, and says so", () => {
  notes.length = 0;
  stand("inbox", { at: "300" });
  fresh();
  h(function Screen() {
    useFirstRowsLetGo();
    return null;
  }, {});
  assert.equal(picture.removed, true, "a handover or the create screen: no page will come to take its place");
  assert.deepEqual(heard()[1], ["inbox", "first-rows-end-no-frame"]);
});

test("the frame holds the copy 8 s at most from when the code ran, and says so", () => {
  timers.length = 0;
  installedOver("inbox", { at: "300" });
  const hold = timers.find((t) => t.ms === 8_000);
  assert.ok(hold, "a page that never says it is drawn must still be seen");
  notes.length = 0;
  hold.f();
  assert.equal(picture.removed, true);
  assert.deepEqual(heard()[1], ["inbox", "first-rows-end-held-8s"]);
});

test("a route that is another's lets the copy go, and so does one that cannot be read, each saying which", () => {
  notes.length = 0;
  stand("inbox", { at: "300" });
  firstRowsMeetRoute("inbox", null, false);
  assert.equal(picture.removed, false, "its own route, at its bare address: the page's rows take its place");
  firstRowsMeetRoute("clients", null, false);
  assert.equal(picture.removed, true);
  assert.deepEqual(heard()[1], ["inbox", "first-rows-end-other-route"]);

  notes.length = 0;
  stand("inbox", { at: "300" });
  firstRowsMeetRoute("inbox", "th-1", false);
  assert.deepEqual(heard()[1], ["inbox", "first-rows-end-other-route"], "a thread of its page is another address");

  notes.length = 0;
  stand("people", { at: "300" });
  firstRowsMeetRoute("clients", null, true);
  assert.equal(picture.removed, true);
  assert.deepEqual(heard()[1], ["people", "first-rows-end-unavailable"]);
});

test("a copy drawn reports its paint and how it ended, once, however often it is let go", () => {
  timers.length = 0;
  assert.deepEqual(installedOver("inbox", { at: "300" }), [], "nothing yet: it stands");
  const hold = timers.find((t) => t.ms === 8_000);
  partReady("inbox", "list", "");
  hold.f();
  firstRowsMeetRoute("clients", null, true);
  partReady("inbox", "list", "");
  assert.deepEqual(heard(), [
    ["inbox", "first-rows"],
    ["inbox", "first-rows-end-page"],
  ]);
  assert.equal(notes[0].value, 300, "when it was painted");
  assert.equal(notes[0].name, "READY");
  assert.ok(notes[1].value >= 0, "how long it stood");
  assert.equal(new Set(notes.map((n) => n.id)).size, 2, "a report of its own for each");
});

test("a copy painted only by name says nothing: no paint, no number", () => {
  notes.length = 0;
  stand("inbox");
  firstRowsMeetRoute("clients", null, false);
  assert.equal(picture.removed, true);
  assert.deepEqual(notes, []);
});

test("the frame says why none was drawn, on a phone at a page that keeps one", () => {
  assert.deepEqual(installedOver(null, { path: "/w/acme/inbox", miss: "sheets" }), ["first-rows-sheets"]);
  assert.equal(notes[0].value, 0, "no time to report: a count");
  assert.equal(notes[0].page, "inbox");
  assert.deepEqual(installedOver(null, { path: "/w/acme/people" }), ["first-rows-none"], "no stamp: nothing kept");
  assert.equal(notes[0].page, "people", "by the page the table keeps it under");
  assert.deepEqual(installedOver(null, { path: "/w/acme", miss: "aged" }), ["first-rows-aged"]);
  assert.equal(notes[0].page, "today", "a workspace's own address is Today's");
});

test("a load that could never have had a copy is no miss", () => {
  assert.deepEqual(installedOver(null, { path: "/w/acme/calendar" }), [], "a page that keeps none");
  assert.deepEqual(installedOver(null, { path: "/w/acme/inbox/th-1" }), [], "a thread's address");
  assert.deepEqual(installedOver(null, { path: "/w/acme/inbox", width: 1280 }), [], "a desk");
});

test("a hash address is of the page it says, and a thread's is of none that keeps a copy", () => {
  assert.deepEqual(installedOver(null, { path: "/w/acme", hash: "#/inbox", miss: "address" }), ["first-rows-address"]);
  assert.equal(notes[0].page, "inbox", "the Inbox's line, not Today's, though its path is the workspace's own");
  assert.deepEqual(installedOver(null, { path: "/w/acme", hash: "#/people", miss: "address" }), ["first-rows-address"]);
  assert.equal(notes[0].page, "people");
  assert.deepEqual(installedOver(null, { path: "/w/acme", hash: "#/inbox/th-1", miss: "address" }), [], "a thread's");
  assert.deepEqual(
    installedOver(null, { path: "/w/acme", hash: "#/calendar", miss: "address" }),
    [],
    "a page with none",
  );
  assert.deepEqual(installedOver(null, { path: "/w/acme", hash: "#error=x", miss: "address" }), ["first-rows-address"]);
  assert.equal(notes[0].page, "today", "a hash that names no route leaves the address where it stands");
});

test("a copy the document let go itself is reported when the code comes", () => {
  assert.deepEqual(installedOver(null, { path: "/w/acme/inbox", at: "300", end: "held-20s" }), [
    "first-rows",
    "first-rows-end-held-20s",
  ]);
  assert.equal(notes[0].page, "inbox");
  assert.equal(notes[0].value, 300);
});

test("a document it cannot read costs the frame nothing", () => {
  const was = globalThis.document;
  globalThis.document = { addEventListener() {} };
  assert.doesNotThrow(() => installFirstRows(globalThis));
  globalThis.document = was;
});

test("a phone's screen is kept as the page is put away", () => {
  stand(null);
  fresh();
  installFirstRows(globalThis);
  putAway();
  assert.deepEqual(copiesKept(), [`${FIRST_ROWS_SLOT}acme:inbox`]);
  assert.equal(JSON.parse(localStorage.getItem(`${FIRST_ROWS_SLOT}acme:inbox`)).html, "<div>the screen</div>");
});

test("a screen counting down keeps no copy: a count standing still is untrue at any age", async () => {
  stand(null);
  fresh();
  const { Going } = await import(`${S}/surfaces/today/need-you/parts.tsx`);
  const going = h(Going, { line: "Sends in 38s", sub: "To Ana", share: 0.5, act: { label: "Stop", onPress() {} } });
  assert.match(textOf(going), /Sends in 38s/);
  installFirstRows(globalThis);
  // The row's own class as it draws it; the Inbox's seconds are held to theirs in a-time-says-so.test.mjs.
  for (const counting of [going.rendered.props.className, "ix-sending"]) {
    onDevice.clear();
    const atRest = SCREEN.querySelector;
    SCREEN.querySelector = (selectors) => (selectors.split(",").includes(`.${counting}`) ? {} : null);
    putAway();
    SCREEN.querySelector = atRest;
    assert.deepEqual(copiesKept(), [], `${counting}: "Sends in 38s" over a reply long gone`);
    putAway();
    assert.equal(copiesKept().length, 1, "the same screen at rest keeps one");
  }
});

test("a copy keeps the test ids a stylesheet draws by, and no id the app looks its own elements up by", () => {
  stand(null);
  fresh();
  const taken = new Set();
  const clone = SCREEN.cloneNode;
  SCREEN.cloneNode = () => ({ ...clone(), removeAttribute: (name) => taken.add(name) });
  installFirstRows(globalThis);
  putAway();
  SCREEN.cloneNode = clone;
  assert.ok(taken.has("id"), "a second #pg-act would take a page's act");
  assert.ok(!taken.has("data-testid"), "dashboard-a-v2.css draws Today's setup card by them");
});

// Last in the file: a seal is for the page's life, and each file runs in a process of its own.
test("a device sealed keeps no copy, and what it held goes", async () => {
  const { sealSurfaceCache } = await import(`${S}/bridge/surface-cache.ts`);
  const { deviceSealed } = await import(`${S}/client/kept-on-device.ts`);
  assert.equal(deviceSealed(), false);
  sealSurfaceCache();
  assert.equal(deviceSealed(), true);
  assert.deepEqual(copiesKept(), [], "the copy held went with the rows");
  putAway();
  assert.deepEqual(copiesKept(), [], "and none is kept after");
});
