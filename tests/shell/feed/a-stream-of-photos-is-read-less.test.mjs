/**
 * A stream of photos is read less (00551, decision 0099), and a photo's own look still shows.
 *
 * An import keeps a photo every second or two and each is looked at, so an open Files page hears about two notices for each
 * photo, for minutes. Each gap beats the usual 400 ms of quiet, so the page would read its whole list again about once a second
 * while tiles moved under a thumb: the shape of the 5 Nov erasures (a-stream-of-erasures-is-read-less.test.mjs). Waiting for two
 * seconds of quiet, and at most the dear read's longest wait, the same stream is a few reads.
 *
 * Run on the real runner over Files' own surface, each read recorded and the clock by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { historyOf, legacyAddress } from "../address/_address.mjs";

const listening = new Map();
const win = {
  __afterTheMoveMs: 0,
  __ACTIVE_WORKSPACE: "ws-1",
  location: {
    pathname: "/w/acme/admin/files",
    search: "",
    hash: "#/admin/files",
    assign() {},
    replace() {},
    reload() {},
  },
  addEventListener(type, fn) {
    if (!listening.has(type)) listening.set(type, new Set());
    listening.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    listening.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(listening.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};
globalThis.window = win;
historyOf(win);
globalThis.document = { visibilityState: "visible", title: "", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
win.__shell = (await importSrc("apps/dashboard/src/bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const { startSurfaces } = await importSrc("apps/dashboard/src/bridge/surface-runner.ts");
const { filesOverride } = await importSrc("apps/dashboard/src/surfaces/files/surface.ts");

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const TICK = 25;

const settled = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

/** The real runner over Files' surface alone, each read recorded rather than made, the feed held here. */
async function page(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const reads = [];
  let feed = null;
  const stop = startSurfaces(
    [{ ...filesOverride, isStale: () => false, apply: async () => void reads.push(Date.now()) }],
    (onChange) => {
      feed = onChange;
      return () => {};
    },
  );
  for (let i = 0; i < 40; i += 1) await settled();
  t.mock.timers.tick(MINUTE);
  await settled();
  assert.ok(feed, "the feed is joined once the boot is in");
  reads.length = 0;
  return {
    reads,
    advance: async (ms) => {
      for (let left = ms; left > 0; left -= TICK) {
        t.mock.timers.tick(Math.min(left, TICK));
        await settled();
      }
    },
    tell: (event) => feed({ tenant_id: "ws-1" }, "files", event, new Date(Date.now()).toISOString()),
    done: () => {
      t.mock.timers.reset();
      stop();
    },
  };
}

test("two hundred photos, two notices each: the page reads a few times, never once a second", async (t) => {
  const p = await page(t);
  // An import's pace: a photo every 2.5 s, its look's answer a second after it came in. Long enough to read 1 s and 1.5 s gaps.
  const ms = { photo: 2_500, look: 1_000 };
  for (let i = 0; i < 200; i += 1) {
    p.tell("INSERT");
    await p.advance(ms.look);
    p.tell("UPDATE");
    await p.advance(ms.photo - ms.look);
  }
  await p.advance(MINUTE);
  const reads = p.reads.length;
  const lasted = 200 * ms.photo;
  p.done();
  t.diagnostic(`200 photos over ${lasted / SECOND} s: ${reads} reads`);
  assert.ok(reads <= Math.ceil(lasted / (10 * SECOND)) + 2, `${reads} reads, at most one each ten seconds or so`);
  assert.ok(reads >= 3, "and what arrived does show, a stream is not read only at its end");
});

test("one photo's look shows by itself a couple of seconds after it answers", async (t) => {
  const p = await page(t);
  p.tell("UPDATE");
  await p.advance(1_500);
  assert.equal(p.reads.length, 0, "not yet");
  await p.advance(1_000);
  assert.equal(p.reads.length, 1);
  p.done();
});
