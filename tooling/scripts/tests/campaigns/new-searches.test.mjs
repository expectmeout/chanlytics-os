/**
 * New's searches whose leads are ready (surfaces/campaigns/reach-out/sources.ts), one of its starts: kept in the tab by
 * workspace, so New paints its starts from the last answer and reads again behind; and where the tab opens on New, its first
 * draw waits for them as it waits for its own surface, once a tab. Read afresh as New opened, its starts drew a panel of what
 * to set up first and swapped it 200 ms later for the row the search gave, on every open (the Campaigns load review, 28 Oct
 * 2026). Run over the real client and gate, the network answered here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, importSrc } from "../_source.mjs";

const SOURCES = [{ id: "s-1", name: "Salons nearby", ready: 4, with_unconfirmed: 4 }];
const asked = [];
let answerNow = null;
const stored = new Map();
globalThis.window = {
  location: { pathname: "/w/harbor/campaigns/sequences/new", search: "", hash: "", assign() {}, replace() {} },
  // Each read is recorded, and answered when the test says so.
  fetch: (url) => {
    asked.push(String(url));
    return new Promise((answer) => {
      answerNow = () =>
        answer(
          new Response(JSON.stringify({ ok: true, data: { sources: SOURCES } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
    });
  },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, v),
    removeItem: (k) => stored.delete(k),
  },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
};
globalThis.sessionStorage = globalThis.window.sessionStorage;
globalThis.localStorage = globalThis.window.localStorage;

const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const SOURCES_MODULE = "apps/dashboard/src/surfaces/campaigns/reach-out/sources.ts";
const sources = await importSrc(SOURCES_MODULE);
const settle = () => new Promise((r) => setTimeout(r, 0));

test("where the tab opens on New, its first draw waits for the searches, once a tab, and the answer is New's to paint", async () => {
  assert.equal(sources.peekSources(), null, "nothing held before the read");
  sources.searchesBeforeNew();
  assert.equal(
    status.codeOutFor("campaigns"),
    true,
    "REGRESSION: New drawn before the searches, its starts swapped a moment later",
  );
  assert.deepEqual(
    asked.map((u) => new URL(u, "https://x.test").pathname),
    ["/api/v1/reach-outs/sources"],
    "the one read, as the head spells it",
  );
  sources.searchesBeforeNew();
  assert.equal(asked.length, 1, "said once a tab: Sequences' next read asks for nothing");
  answerNow();
  await settle();
  await settle();
  assert.equal(status.codeOutFor("campaigns"), false, "the read in: the page draws");
  assert.deepEqual(sources.peekSources(), SOURCES, "held for New's first paint");
});

test("held, the searches are New's to paint at once, and a door to New reached for reads nothing more until a write", async () => {
  const before = asked.length;
  sources.warmSources();
  await settle();
  assert.equal(asked.length, before, "one held and current reads nothing");
  assert.deepEqual(sources.peekSources(), SOURCES);
});

test("kept by workspace: another workspace's tab holds none of these", async () => {
  const was = globalThis.window.location.pathname;
  globalThis.window.location.pathname = "/w/other/campaigns/sequences/new";
  try {
    assert.equal(sources.peekSources(), null, "REGRESSION: one workspace's searches offered as another's start");
  } finally {
    globalThis.window.location.pathname = was;
  }
});

test("off New, the frame waits for nothing of them", async () => {
  // A module of its own (its once a tab is module state), on a tab that opened on Sequences' list.
  globalThis.window.location.pathname = "/w/harbor/campaigns/sequences";
  const before = asked.length;
  const elsewhere = await import(`${pathToFileURL(path.join(ROOT, SOURCES_MODULE)).href}?elsewhere`);
  elsewhere.searchesBeforeNew();
  assert.equal(status.codeOutFor("campaigns"), false, "the list draws as its own surface says");
  assert.equal(asked.length, before, "and reads no search");
});
