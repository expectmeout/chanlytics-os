/**
 * The driver on a fake canvas with a recording 2D context and an injected frame clock: mounting draws three squares,
 * a state changes what is drawn, hidden stops the loop, destroy lets go of everything, reduced motion draws once per
 * change, and a word heard pushes the level up and lets it fall.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mountCharacter } from "../../../apps/dashboard/src/legacy-bridge/mascot/driver.ts";

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (_, name) =>
        name === "fillStyle"
          ? undefined
          : (...args) => {
              calls.push([name, ...args]);
            },
      set: (_, name, value) => {
        calls.push(["set", name, value]);
        return true;
      },
    },
  );
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 358,
    clientHeight: 232,
    getContext: (kind) => (kind === "2d" ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 358, height: 232 }),
    closest: () => null,
  };
  return { canvas, calls, fills: () => calls.filter((c) => c[0] === "fill").length };
}
function fakeEnv() {
  const frames = new Map();
  let nextId = 1,
    t = 0,
    hidden = false;
  const listeners = { vis: [], theme: [], pointer: [] };
  return {
    env: {
      raf: (cb) => {
        const id = nextId++;
        frames.set(id, cb);
        return id;
      },
      caf: (id) => {
        frames.delete(id);
      },
      now: () => t,
      dpr: () => 2,
      reduced: false,
      hidden: () => hidden,
      onVisibility: (fn) => {
        listeners.vis.push(fn);
        return () => listeners.vis.splice(listeners.vis.indexOf(fn), 1);
      },
      onScreen: (_el, fn) => {
        fn(true);
        return () => {};
      },
      onResize: () => () => {},
      onPointer: (fn) => {
        listeners.pointer.push(fn);
        return () => {};
      },
      theme: () => "light",
      tokens: () => ({}),
      onTheme: (fn) => {
        listeners.theme.push(fn);
        return () => {};
      },
    },
    /** run the oldest queued frame at time t */
    frame(ms) {
      t = ms;
      const next = frames.entries().next().value;
      if (!next) return;
      frames.delete(next[0]);
      next[1](ms);
    },
    hide(v) {
      hidden = v;
      for (const fn of listeners.vis) fn();
    },
    pending: () => frames.size,
    listeners,
  };
}

test("mounting draws at the band's size, every frame draws again, and the three have dropped in within a second", () => {
  const { canvas, calls } = fakeCanvas();
  const F = fakeEnv();
  const draws = () => calls.filter((c) => c[0] === "clearRect").length;
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  assert.ok(m);
  assert.equal(canvas.width, 716); // 358 * dpr 2
  assert.equal(draws(), 1, "drawn once at mount");
  F.frame(16);
  assert.equal(draws(), 2);
  for (let i = 2; i <= 60; i++) F.frame(i * 16);
  assert.equal(draws(), 61);
  // at birth they grow in from nothing; a second on, the last frame drew all three
  const lastClear = calls.map((c) => c[0]).lastIndexOf("clearRect");
  assert.equal(calls.slice(lastClear).filter((c) => c[0] === "fill").length, 3);
  m.destroy();
});

test("a state changes what is drawn; hidden stops the loop; destroy stops it for good", () => {
  const { canvas, calls } = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  for (let i = 1; i <= 60; i++) F.frame(i * 16);
  const restFill = calls.filter((c) => c[0] === "set" && c[1] === "fillStyle").at(-1)[2];
  m.set("listening");
  for (let i = 61; i <= 120; i++) F.frame(i * 16);
  const liveFill = calls.filter((c) => c[0] === "set" && c[1] === "fillStyle").at(-1)[2];
  assert.notEqual(liveFill, restFill, "coral once addressed");
  assert.equal(m.state, "listening");
  F.hide(true);
  assert.equal(F.pending(), 0, "no frame queued while hidden");
  F.hide(false);
  assert.equal(F.pending(), 1);
  m.destroy();
  F.frame(2000);
  assert.equal(F.pending(), 0);
});

test("reduced motion: no loop, one drawing per change", () => {
  const { canvas, fills } = fakeCanvas();
  const F = fakeEnv();
  F.env.reduced = true;
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  assert.equal(F.pending(), 0);
  assert.equal(fills(), 3);
  m.set("thinking");
  assert.equal(fills(), 6);
  m.react("shake");
  assert.equal(fills(), 6, "a reaction draws nothing when calm");
  m.destroy();
});

test("a word heard lifts the level, and it falls on its own", () => {
  const { canvas } = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  m.set("listening");
  m.hear(0.8);
  assert.ok(m.level() >= 0.8);
  for (let i = 1; i <= 30; i++) F.frame(i * 16);
  assert.ok(m.level() < 0.8 && m.level() > 0);
  for (let i = 31; i <= 120; i++) F.frame(i * 16);
  assert.equal(m.level(), 0);
  m.destroy();
});

test("no 2D context, no driver", () => {
  const F = fakeEnv();
  assert.equal(mountCharacter({ getContext: () => null, clientWidth: 10, clientHeight: 10 }, { env: F.env }), null);
  assert.equal(mountCharacter({ clientWidth: 10, clientHeight: 10 }, { env: F.env }), null);
});
