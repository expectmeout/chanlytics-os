/**
 * The three on a phone take a page in as it arrives, and notice what comes for you (legacy-bridge/mascot/arrival.ts).
 * Run against the pure module with the real mood and a clock of its own: a page arriving on a phone is read
 * (thinking) for READ_MS, or as long as the boot takes up to READ_MAX_MS, then rest; the same page again within
 * AGAIN_MS is not read, a walk within a page is the same page, another page is read; nothing on a desk, nothing while
 * Ask is open or the mood is busy, and a read whose end finds Ask open leaves the mood alone; the needs-you count
 * rising makes the three hop once, its first word and a fall do not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMood } from "../../../apps/dashboard/src/legacy-bridge/mascot/mood.ts";
import {
  AGAIN_MS,
  pageOf,
  READ_MAX_MS,
  READ_MS,
  watchArrival,
} from "../../../apps/dashboard/src/legacy-bridge/mascot/arrival.ts";

/** A clock, and timers that fire as it is moved. */
const clock = () => {
  let t = 0;
  const timers = [];
  const tick = async (ms) => {
    const until = t + ms;
    for (;;) {
      const next = timers.filter((x) => x.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers.splice(timers.indexOf(next), 1);
      t = next.at;
      next.fn();
      await Promise.resolve();
    }
    t = until;
    await Promise.resolve();
  };
  return {
    now: () => t,
    later: (fn, ms) => {
      const h = { at: t + ms, fn };
      timers.push(h);
      return h;
    },
    cancel: (h) => {
      const i = timers.indexOf(h);
      if (i >= 0) timers.splice(i, 1);
    },
    tick,
  };
};

/** A world: a phone by default, Ask closed, the boot settled at once unless held. */
const world = (over = {}) => {
  const c = clock();
  const mood = createMood();
  const said = [];
  mood.subscribe((ev) => said.push(ev.t === "state" ? ev.state : ev.t === "react" ? `react:${ev.kind}` : ev.t));
  const w = {
    route: "#/today",
    phone: true,
    askOpen: false,
    boot: null,
    said,
    mood,
    c,
    ...over,
  };
  w.arrival = watchArrival({
    mood,
    route: () => w.route,
    phone: () => w.phone,
    askOpen: () => w.askOpen,
    afterBoot: () => (w.boot ? w.boot.promise : Promise.resolve()),
    now: c.now,
    later: c.later,
    cancel: c.cancel,
  });
  return w;
};
const held = () => {
  let settle;
  const promise = new Promise((r) => {
    settle = r;
  });
  return { promise, settle };
};

test("a page names itself without the walk within it", () => {
  assert.equal(pageOf("#/today"), "today");
  assert.equal(pageOf(""), "today");
  assert.equal(pageOf("#/inbox/th-1"), "inbox/th-1");
  assert.equal(pageOf("#/clients/leads:s-1:p-7"), "clients/leads");
  assert.equal(pageOf("#/clients/pipeline:v-board"), "clients/pipeline");
});

test("a page arriving on a phone is read for READ_MS, then rest; the same page again is not read, another is", async () => {
  const w = world();
  w.arrival.arrived();
  assert.deepEqual(w.said, ["thinking"]);
  await w.c.tick(READ_MS - 1);
  assert.deepEqual(w.said, ["thinking"], "still reading");
  await w.c.tick(1);
  assert.deepEqual(w.said, ["thinking", "idle"], "then rest");
  w.arrival.arrived();
  assert.deepEqual(w.said, ["thinking", "idle"], "the same page again within AGAIN_MS: nothing");
  w.route = "#/clients/leads:s-1";
  w.arrival.arrived();
  assert.deepEqual(w.said, ["thinking", "idle", "thinking"], "another page: read");
  await w.c.tick(READ_MS);
  w.route = "#/clients/leads:s-1:p-3";
  w.arrival.arrived();
  assert.deepEqual(w.said, ["thinking", "idle", "thinking", "idle"], "a walk within the page: the same page");
  await w.c.tick(AGAIN_MS);
  w.route = "#/today";
  w.arrival.arrived();
  assert.equal(w.said.at(-1), "thinking", "the first page again, AGAIN_MS later: read");
});

test("the first read is as long as the boot, past READ_MS and up to READ_MAX_MS", async () => {
  const slow = world({ boot: held() });
  slow.arrival.arrived();
  await slow.c.tick(READ_MS);
  assert.deepEqual(slow.said, ["thinking"], "the boot still out at READ_MS: still reading");
  slow.boot.settle();
  await slow.c.tick(0);
  assert.deepEqual(slow.said, ["thinking", "idle"], "the boot in: rest");
  const stuck = world({ boot: held() });
  stuck.arrival.arrived();
  await stuck.c.tick(READ_MAX_MS - 1);
  assert.deepEqual(stuck.said, ["thinking"]);
  await stuck.c.tick(1);
  assert.deepEqual(stuck.said, ["thinking", "idle"], "a boot that never lands: rest at READ_MAX_MS");
  const quick = world({ boot: held() });
  quick.arrival.arrived();
  quick.boot.settle();
  await quick.c.tick(READ_MS - 1);
  assert.deepEqual(quick.said, ["thinking"], "a boot in before READ_MS: the read is still READ_MS");
  await quick.c.tick(1);
  assert.deepEqual(quick.said, ["thinking", "idle"]);
});

test("nothing on a desk, nothing while Ask is open or the mood is busy, and a read's end leaves an opened Ask alone", async () => {
  const desk = world({ phone: false });
  desk.arrival.arrived();
  desk.arrival.noticed(1);
  desk.arrival.noticed(2);
  assert.deepEqual(desk.said, []);
  const open = world({ askOpen: true });
  open.arrival.arrived();
  open.arrival.noticed(1);
  open.arrival.noticed(2);
  assert.deepEqual(open.said, []);
  const busy = world();
  busy.mood.set("speaking");
  busy.arrival.arrived();
  assert.deepEqual(busy.said, ["speaking"], "a turn left running is not read over");
  const w = world();
  w.arrival.arrived();
  w.askOpen = true;
  w.mood.set("listening"); // the Line took the mood
  await w.c.tick(READ_MS);
  assert.deepEqual(w.said, ["thinking", "listening"], "the read's end says nothing over the Line");
  w.askOpen = false;
  w.mood.set("idle");
  w.route = "#/inbox";
  w.arrival.arrived();
  await w.c.tick(READ_MS);
  assert.deepEqual(w.said.slice(-2), ["thinking", "idle"], "and reads again once Ask has closed");
});

test("the needs-you count rising makes the three hop once; its first word, a fall, and a rise while busy do not", () => {
  const w = world();
  w.arrival.noticed(2);
  assert.deepEqual(w.said, [], "the first count is just remembered");
  w.arrival.noticed(2);
  w.arrival.noticed(1);
  assert.deepEqual(w.said, [], "the same, or fewer: nothing");
  w.arrival.noticed(3);
  assert.deepEqual(w.said, ["react:hop"], "more: a hop");
  w.arrival.noticed(NaN);
  w.arrival.noticed(4);
  assert.deepEqual(w.said, ["react:hop"], "after a count that was no number, the next is the first again");
  w.mood.set("thinking");
  w.arrival.noticed(5);
  assert.deepEqual(w.said, ["react:hop", "thinking"], "not while the three are busy");
});

test("stopped, a read on is let go without a word", async () => {
  const w = world();
  w.arrival.arrived();
  w.arrival.stop();
  await w.c.tick(READ_MAX_MS);
  assert.deepEqual(w.said, ["thinking"], "nothing more is said; whoever owns the mood next sets it");
});
