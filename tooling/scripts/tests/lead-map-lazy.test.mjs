/**
 * The streets load when they are drawn, not at boot (lead-map.ts, lead-map-draw.ts; 25 Sep 2026).
 *
 * MapLibre rode in the shell's boot chunk on every page, a person's included: 364 references in 2.65 MB, about a
 * quarter of a megabyte compressed, parsed for a map nobody had opened. The door the page walks through is published
 * at boot as before; the streets' own module is asked for on the first mount, once, and a handle the page can use at
 * once keeps what it asked for until they land. Run against lead-map.ts with a loader that records, and no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

globalThis.window = { location: { origin: "https://app.example.com" } };
// The archive's header is read over fetch; here there is no archive and no network, and the page keeps its square.
globalThis.fetch = async () => {
  throw new Error("no network in a test");
};
const { installLeadMap, deferredHandle } = await importSrc("apps/dashboard/src/legacy-bridge/lead-map.ts");

const tick = () => new Promise((r) => setTimeout(r, 0));
/** A streets module that records: how often it was asked for, whether it was prepared, and every call on its handle. */
const fakeStreets = () => {
  const calls = [];
  let loads = 0;
  let prepared = 0;
  const handle = {
    setPins: (pins, picked) => calls.push(["setPins", pins.map((p) => p.id), picked]),
    setPicked: (picked) => calls.push(["setPicked", picked]),
    setRing: (ring) => calls.push(["setRing", ring]),
    fit: (c, span) => calls.push(["fit", c, span]),
    destroy: () => calls.push(["destroy"]),
  };
  let land = () => {};
  const module = {
    prepare: () => {
      prepared += 1;
    },
    mountStreets: (base, el, opts) => {
      calls.push(["mount", base, el.id, typeof opts.onPick]);
      return handle;
    },
  };
  const load = () => {
    loads += 1;
    return new Promise((r) => {
      land = () => r(module);
    });
  };
  return { calls, load, land: () => land(), loads: () => loads, prepared: () => prepared };
};

test("the door is published at boot and the streets' module is asked for on the first mount, once, prepared once", async () => {
  const s = fakeStreets();
  installLeadMap("/maps/", s.load);
  assert.ok(window.__LEAD_MAP, "the page's door");
  assert.equal(s.loads(), 0, "nothing loaded at boot");
  const a = window.__LEAD_MAP.mount({ id: "box-a" }, { onPick() {}, onOpen() {} });
  const b = window.__LEAD_MAP.mount({ id: "box-b" }, { onPick() {}, onOpen() {} });
  assert.equal(typeof a.setPins, "function", "a handle at once");
  assert.equal(s.loads(), 1, "asked for once for both");
  a.setPins([{ id: "l1", lat: 1, lng: 2, tone: "ok", label: "L1" }], null);
  a.setRing({ lat: 1, lng: 2, radiusM: 500 });
  a.fit({ lat: 1, lng: 2 }, 3000);
  assert.deepEqual(s.calls, [], "kept until the streets land");
  s.land();
  await tick();
  await tick();
  assert.equal(s.prepared(), 1, "the worker and the protocol, once");
  // Both mounts are made as the module lands, then each handle's kept calls, in the order they were asked.
  assert.deepEqual(s.calls.slice(0, 5), [
    ["mount", "https://app.example.com/maps", "box-a", "function"],
    ["mount", "https://app.example.com/maps", "box-b", "function"],
    ["setPins", ["l1"], null],
    ["setRing", { lat: 1, lng: 2, radiusM: 500 }],
    ["fit", { lat: 1, lng: 2 }, 3000],
  ]);
  a.setPicked("l1");
  assert.deepEqual(s.calls.at(-1), ["setPicked", "l1"], "landed: straight through");
  void b;
});

test("a handle destroyed before the streets land destroys them on arrival and replays nothing", async () => {
  const s = fakeStreets();
  installLeadMap("/maps", s.load);
  const h = window.__LEAD_MAP.mount({ id: "box" }, { onPick() {}, onOpen() {} });
  h.setPins([], null);
  h.destroy();
  h.setPins([{ id: "late", lat: 0, lng: 0, tone: "ok", label: "" }], null);
  s.land();
  await tick();
  await tick();
  assert.deepEqual(s.calls, [["mount", "https://app.example.com/maps", "box", "function"], ["destroy"]]);
});

test("streets that never come leave the page on its square: every call is nothing, and nothing throws", async () => {
  const h = deferredHandle(Promise.reject(new Error("chunk failed to load")));
  h.setPins([], null);
  h.fit({ lat: 0, lng: 0 }, 1);
  await tick();
  await tick();
  h.setRing(null);
  h.destroy();
  assert.ok(true);
});

test("with no basemap nothing is published and nothing is asked for", () => {
  delete window.__LEAD_MAP;
  const s = fakeStreets();
  installLeadMap("", s.load);
  installLeadMap(undefined, s.load);
  assert.equal(window.__LEAD_MAP, undefined);
  assert.equal(s.loads(), 0);
});
