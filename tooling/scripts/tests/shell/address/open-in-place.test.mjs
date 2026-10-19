/**
 * Open in place (the Campaigns wiring review's rule C, lane 3, 19 Oct 2026): a press on a mention of a run or a message
 * opens the thing as a sheet over the page it was pressed on, `?see=<kind>:<id>` on that page's own address, and Back
 * closes it onto the page as it was left. Campaigns' own pages are the homes, where a press goes to the home itself.
 *
 *  1. The grammar (contracts see-over.ts): the param's value written and read back, a value out of shape naming nothing,
 *     and the homes that open in place, a retired address of one among them.
 *  2. The verbs over a made-up window (surfaces/see/see-over.ts, over the helper the lead sheet's `?lead=` shares,
 *     surfaces/see/over-query.ts): one entry pushed, a second thing moved to in place, a close that is Back where the
 *     opening made the entry and a replace where a link did, the frame's mount told of each, and nothing opened over
 *     Campaigns' own pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRoute,
  messageRoute,
  runRoute,
  seeHomeOf,
  seeRefOf,
  seeRefOfRoute,
  seeValueOf,
  sequenceRoute,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

/* ---------------------------- a browser, kept small ---------------------------- */

const heard = new Map();
const entries = { pushed: [], replaced: [], backs: 0, state: null };
const win = {
  location: { pathname: "/w/acme/inbox", search: "", hash: "" },
  history: {
    get state() {
      return entries.state;
    },
    pushState(data, _unused, url) {
      entries.pushed.push(url);
      entries.state = data;
      at(url);
    },
    replaceState(data, _unused, url) {
      entries.replaced.push(url);
      entries.state = data;
      at(url);
    },
    back() {
      entries.backs += 1;
    },
  },
  addEventListener(type, fn) {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    heard.get(type)?.delete(fn);
  },
};
Object.defineProperty(win.location, "href", {
  get: () => `https://app.example.com${win.location.pathname}${win.location.search}${win.location.hash}`,
});
/** The address a push or a replace leaves: its path and its query. */
function at(url) {
  const q = url.indexOf("?");
  win.location.pathname = q < 0 ? url : url.slice(0, q);
  win.location.search = q < 0 ? "" : url.slice(q);
}
globalThis.window = win;

const see = await importSrc("apps/dashboard/src/surfaces/see/see-over.ts");
const { overQuery } = await importSrc("apps/dashboard/src/surfaces/see/over-query.ts");

/** A fresh tab at a page's address, with nothing over it. */
const openAt = (path, search = "") => {
  win.location.pathname = path;
  win.location.search = search;
  Object.assign(entries, { pushed: [], replaced: [], backs: 0, state: null });
};

/* ---------------------------- the grammar ---------------------------- */

test("the param's value is written and read back: a run with the sequence it is a day of, or without, and a message", () => {
  for (const ref of [
    { kind: "run", id: "b-1", sequenceId: "q-1" },
    { kind: "run", id: "b-1", sequenceId: null },
    { kind: "message", name: "come_back" },
  ])
    assert.deepEqual(seeRefOf(seeValueOf(ref)), ref, seeValueOf(ref));
  assert.equal(
    seeValueOf({ kind: "run", id: "b-1", sequenceId: "b-1" }),
    "run:b-1",
    "a run naming itself as its sequence",
  );
  for (const nope of [
    null,
    "",
    "run:",
    "run:b 1",
    "run:b-1:q 1",
    "run:b-1:q-1:x",
    "message:a:b",
    "sequence:q-1",
    "b-1",
  ])
    assert.equal(seeRefOf(nope), null, String(nope));
});

test("a run's home and a message's drawer open in place, a retired address of a run among them; a sequence and any other page do not", () => {
  assert.deepEqual(seeRefOfRoute(runRoute("b-1", "q-1")), { kind: "run", id: "b-1", sequenceId: "q-1" });
  assert.deepEqual(seeRefOfRoute(runRoute("b-1")), { kind: "run", id: "b-1", sequenceId: null });
  assert.deepEqual(seeRefOfRoute(messageRoute("come_back")), { kind: "message", name: "come_back" });
  // A bell row kept from before names Sent's sheet: the frame moves it first (canonicalRoute), and it is the run.
  assert.deepEqual(seeRefOfRoute(canonicalRoute("broadcasts/run:b-1")), { kind: "run", id: "b-1", sequenceId: null });
  assert.deepEqual(seeRefOfRoute(`${runRoute("b-1", "q-1")}?from=bell`), { kind: "run", id: "b-1", sequenceId: "q-1" });
  for (const route of [
    sequenceRoute("q-1"),
    sequenceRoute("q-1", "history"),
    "campaigns/sequences",
    "inbox",
    "clients",
  ])
    assert.equal(seeRefOfRoute(route), null, route);
  // The sheet's door goes home: the address it was opened from, spelled as its page writes it.
  assert.equal(seeHomeOf({ kind: "run", id: "b-1", sequenceId: "q-1" }), runRoute("b-1", "q-1"));
  assert.equal(seeHomeOf({ kind: "message", name: "come_back" }), messageRoute("come_back"));
});

/* ---------------------------- the verbs ---------------------------- */

test("a press on a run over the Inbox opens it there, one entry; another is moved to in place; Back closes it onto the Inbox", () => {
  openAt("/w/acme/inbox");
  const told = [];
  const off = see.hearSeeOver(() => told.push(see.seeOverNow()));
  try {
    assert.equal(see.inPlace(runRoute("b-1", "q-1")), true, "it opened in place");
    assert.equal(win.location.pathname, "/w/acme/inbox", "the Inbox stays under it");
    assert.deepEqual(see.seeOverNow(), { kind: "run", id: "b-1", sequenceId: "q-1" });
    assert.equal(entries.pushed.length, 1, "one entry, so Back closes it");
    // A second run opened from the sheet moves it, never a second entry for Back to walk through.
    assert.equal(see.inPlace(runRoute("b-2", "q-1")), true);
    assert.deepEqual([entries.pushed.length, entries.replaced.length], [1, 1]);
    assert.deepEqual(see.seeOverNow(), { kind: "run", id: "b-2", sequenceId: "q-1" });
    // The same one again is no move at all.
    see.openSeeOver({ kind: "run", id: "b-2", sequenceId: "q-1" });
    assert.deepEqual([entries.pushed.length, entries.replaced.length], [1, 1]);
    see.closeSeeOver();
    assert.equal(entries.backs, 1, "its close is Back, where opening it made the entry");
    assert.deepEqual(
      told.map((r) => r && r.id),
      ["b-1", "b-2"],
      "the frame's mount was told of each opening (a Back is the window's popstate)",
    );
  } finally {
    off();
  }
});

test("a sheet a link opened closes by writing the address without it, and tells the frame; nothing is open over Campaigns' own pages", () => {
  openAt("/w/acme/today", `?see=${encodeURIComponent("message:come_back")}`);
  assert.deepEqual(see.seeOverNow(), { kind: "message", name: "come_back" }, "the link's sheet");
  let told = 0;
  const off = see.hearSeeOver(() => (told += 1));
  try {
    see.closeSeeOver();
    assert.equal(entries.backs, 0, "never a Back out of the page the link opened");
    assert.deepEqual([win.location.pathname, win.location.search], ["/w/acme/today", ""]);
    assert.equal(told, 1);
    see.closeSeeOver();
    assert.equal(told, 1, "closing what is not open does nothing");
  } finally {
    off();
  }
  for (const path of ["/w/acme/campaigns/sequences", "/w/acme/campaigns/messages"]) {
    openAt(path);
    assert.equal(see.inPlace(runRoute("b-1", "q-1")), false, `${path}: the home, where a press goes to the run's home`);
    assert.equal(entries.pushed.length, 0);
  }
  openAt("/w/acme/inbox");
  assert.equal(see.inPlace("clients"), false, "a page that is no thing is a move");
  assert.equal(see.seeOverNow(), null);
});

test("each sheet over the page keeps to its own word: the lead sheet's ?lead= and a run's ?see= open and close apart", () => {
  openAt("/w/acme/campaigns/sequences/q-1/people");
  const lead = overQuery("lead");
  lead.open("11111111-2222-4333-8444-555555555555");
  openAt(win.location.pathname, win.location.search);
  see.openSeeOver({ kind: "run", id: "b-1", sequenceId: "q-1" });
  const q = new URLSearchParams(win.location.search);
  assert.equal(q.get("lead"), "11111111-2222-4333-8444-555555555555", "the lead stays open under the run");
  assert.equal(q.get("see"), "run:b-1:q-1");
  // The entry the run's opening stood is the run's: the lead's close is no Back over it.
  lead.close();
  assert.equal(entries.backs, 0, "the lead's close writes the address without it");
  assert.equal(new URLSearchParams(win.location.search).get("lead"), null);
  assert.equal(new URLSearchParams(win.location.search).get("see"), "run:b-1:q-1", "and the run stays");
});
