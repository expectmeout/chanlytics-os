/**
 * The driver on a fake canvas with a recording 2D context and an injected frame clock: mounting draws three tiles,
 * each over its shadow; a state changes what is drawn; hidden stops the loop; destroy lets go of everything; reduced
 * motion draws once per change; a word heard pushes the level up and lets it fall; an icon (a face in a button) goes
 * quiet alone and draws nothing it has already drawn, wakes when the pointer comes near its button, and gathers under
 * a press; any face looks at a pointer near it, never one across the page; at rest the mark is drawn in 2D, while the
 * tiles may fuse the page's liquid drawing is copied into the face's own canvas (its share given back at the end),
 * and where it cannot draw, the 2D drawing stands in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mountCharacter } from "../../../apps/dashboard/src/legacy-bridge/mascot/driver.ts";

function fakeButton(rect = { left: 0, top: 0, width: 260, height: 30 }) {
  const on = new Map();
  return {
    on,
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    addEventListener: (n, fn) => on.set(n, fn),
    removeEventListener: (n) => on.delete(n),
    fire: (n) => on.get(n)?.(),
  };
}
function fakeCanvas({ w = 358, h = 232, button = null, gl = null } = {}) {
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
    clientWidth: w,
    clientHeight: h,
    getContext: (kind) => (kind === "2d" ? ctx : kind === "webgl2" ? gl : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    closest: () => button,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const since = () => calls.slice(calls.map((c) => c[0]).lastIndexOf("clearRect"));
  return {
    canvas,
    calls,
    draws: () => calls.filter((c) => c[0] === "clearRect").length,
    /** the tiles of the last drawing, back to top: a tile's translate follows a plain save (a shadow's, a setTransform) */
    tiles: () => {
      const last = since();
      return last.flatMap((c, i) => (c[0] === "translate" && last[i - 1]?.[0] === "save" ? [[c[1], c[2]]] : []));
    },
    /** the colours the tiles were filled with in the last drawing (a shadow's shape is filled black, off the canvas) */
    fills: () =>
      since()
        .filter((c) => c[0] === "set" && c[1] === "fillStyle" && c[2] !== "#000")
        .map((c) => c[2]),
    shadows: () => since().filter((c) => c[0] === "set" && c[1] === "shadowColor").length,
  };
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
      liquid: () => null,
    },
    /** run the oldest queued frame at time t */
    frame(ms) {
      t = ms;
      const next = frames.entries().next().value;
      if (!next) return;
      frames.delete(next[0]);
      next[1](ms);
    },
    /** run frames for `seconds` at 60 a second, from `from` ms */
    run(seconds, from = t) {
      for (let i = 1; i <= Math.round(seconds * 60); i++) this.frame(from + i * (1000 / 60));
    },
    hide(v) {
      hidden = v;
      for (const fn of listeners.vis) fn();
    },
    point: (e) => listeners.pointer.forEach((fn) => fn(e)),
    pending: () => frames.size,
    listeners,
  };
}
const spread = (tiles) => Math.hypot(tiles[2][0] - tiles[0][0], tiles[2][1] - tiles[0][1]);

test("mounting draws three tiles, each over its shadow, and the three have grown in within a second", () => {
  const C = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(C.canvas, { env: F.env });
  assert.ok(m);
  assert.equal(C.canvas.width, 716); // 358 * dpr 2
  assert.equal(m.role, "open", "a face in no button is open");
  assert.equal(C.draws(), 1, "drawn once at mount");
  F.run(1);
  assert.ok(C.draws() > 50, `a face that is moving draws every frame: ${C.draws()}`);
  assert.equal(C.fills().length, 3, "three tiles");
  assert.equal(C.shadows(), 3, "each with its shadow");
  const [back, , top] = C.tiles();
  assert.ok(top[0] > back[0] && top[1] > back[1], "the top tile, down to the right, is drawn last, over the others");
  m.destroy();
});

test("a state changes what is drawn; hidden stops the loop; destroy stops it for good", () => {
  const C = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(C.canvas, { env: F.env });
  F.run(1);
  const rest = C.fills().join();
  m.set("listening");
  F.run(1);
  assert.notEqual(C.fills().join(), rest, "coral once addressed");
  assert.equal(m.state, "listening");
  F.hide(true);
  assert.equal(F.pending(), 0, "no frame queued while hidden");
  F.hide(false);
  assert.equal(F.pending(), 1);
  m.destroy();
  F.frame(99999);
  assert.equal(F.pending(), 0);
});

test("reduced motion: no loop, one drawing per change, reading a still ring", () => {
  const C = fakeCanvas();
  const F = fakeEnv();
  F.env.reduced = true;
  const m = mountCharacter(C.canvas, { env: F.env });
  assert.equal(F.pending(), 0);
  assert.equal(C.draws(), 1);
  assert.equal(C.fills().length, 3);
  m.set("thinking");
  assert.equal(C.draws(), 2);
  const [a, b, c] = C.tiles();
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  assert.ok(Math.abs(cross) > 100, "three on a ring, not on the stack's line");
  m.react("shake");
  m.pulse(1);
  assert.equal(C.draws(), 2, "a reaction or a read draws nothing when calm");
  m.destroy();
});

test("a word heard lifts the level, and it falls on its own", () => {
  const C = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(C.canvas, { env: F.env });
  m.set("listening");
  m.hear(0.8);
  assert.ok(m.level() >= 0.8);
  F.run(0.5);
  assert.ok(m.level() < 0.8 && m.level() > 0);
  F.run(1.5);
  assert.equal(m.level(), 0);
  m.destroy();
});

test("a new size is followed, not jumped to; under reduced motion it is drawn at once", () => {
  const C = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(C.canvas, { side: 18, env: F.env });
  assert.equal(m.side(), 18);
  m.setSide(52);
  assert.equal(m.side(), 18, "nothing moves until a frame");
  F.run(4 / 60);
  assert.ok(m.side() > 18 && m.side() < 52, `on its way: ${m.side()}`);
  F.run(1);
  assert.ok(Math.abs(m.side() - 52) < 0.5, `there within a second: ${m.side()}`);
  m.destroy();
  const R = fakeCanvas();
  const G = fakeEnv();
  G.env.reduced = true;
  const r = mountCharacter(R.canvas, { side: 18, env: G.env });
  const before = R.draws();
  r.setSide(52);
  assert.equal(r.side(), 52);
  assert.equal(R.draws(), before + 1, "drawn once at the new size");
  r.destroy();
});

test("an icon left alone goes quiet and draws nothing it has already drawn; the pointer near its button wakes it", () => {
  const button = fakeButton();
  const C = fakeCanvas({ w: 30, h: 24, button });
  const F = fakeEnv();
  const m = mountCharacter(C.canvas, { env: F.env });
  assert.equal(m.role, "icon", "a face in a button is an icon");
  F.run(25);
  const quiet = C.draws();
  F.run(10);
  const inTen = C.draws() - quiet;
  assert.ok(inTen < 200, `quiet: ${inTen} drawings in ten seconds, of 600 frames`);
  F.point({ clientX: 150, clientY: 60 }); // 30px under the button
  F.run(2);
  const awake = C.draws();
  F.run(3);
  assert.ok(C.draws() - awake > 150, `awake, it breathes again: ${C.draws() - awake} drawings in three seconds`);
  m.destroy();
  assert.equal(button.on.size, 0, "the button's listeners let go");
});

test("a face looks at a pointer near it, never at one across the page", () => {
  const drawnWith = (point) => {
    const C = fakeCanvas({ w: 84, h: 68 });
    const F = fakeEnv();
    const m = mountCharacter(C.canvas, { env: F.env, seed: 3 });
    F.run(1);
    if (point) F.point(point);
    F.run(1);
    const t = C.tiles();
    m.destroy();
    return t;
  };
  const alone = drawnWith(null);
  const far = drawnWith({ clientX: 1500, clientY: 900 });
  const near = drawnWith({ clientX: 150, clientY: 34 });
  const moved = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
  assert.ok(moved(alone, far) < 0.01, `across the page: moved ${moved(alone, far)}`);
  assert.ok(moved(alone, near) > 0.5, `near: moved ${moved(alone, near)}`);
});

test("a press on an icon's button gathers the stack; the release lets it go", () => {
  const button = fakeButton();
  const C = fakeCanvas({ w: 30, h: 24, button });
  const F = fakeEnv();
  const m = mountCharacter(C.canvas, { env: F.env });
  F.run(1);
  const open = spread(C.tiles());
  button.fire("pointerdown");
  F.run(0.4);
  const pressed = spread(C.tiles());
  button.fire("pointerup");
  F.run(0.6);
  assert.ok(pressed < open * 0.97, `gathered: ${pressed} from ${open}`);
  assert.ok(Math.abs(spread(C.tiles()) - open) < open * 0.02, "and let go");
  m.destroy();
});

test("at rest the mark is drawn in 2D; while the tiles may fuse the page's liquid drawing is copied in, and where it cannot draw the 2D drawing stands in", () => {
  let copied = 0;
  let released = 0;
  let can = true;
  const drawing = {
    draw: (into) => {
      if (!can) return false;
      into.drawImage("the liquid three");
      copied++;
      return true;
    },
    release: () => released++,
  };
  const C = fakeCanvas();
  const F = fakeEnv();
  F.env.liquid = () => drawing;
  const m = mountCharacter(C.canvas, { env: F.env });
  F.run(0.5);
  assert.equal(copied, 0, "at rest nothing fuses: the GPU is not asked");
  const atRest = C.draws();
  assert.ok(atRest > 20, `the mark in 2D: ${atRest}`);
  m.set("listening");
  F.run(0.5);
  assert.ok(copied > 20, `listening, copied into the face's own canvas: ${copied}`);
  assert.equal(C.draws(), atRest, "and no 2D drawing of its own meanwhile");
  can = false;
  F.run(0.5);
  assert.ok(C.draws() > atRest + 20, `the layered mark in 2D instead: ${C.draws() - atRest}`);
  assert.equal(C.fills().length, 3);
  m.destroy();
  assert.equal(released, 1, "its share of the context given back");
  // under reduced motion the still frames are drawn in 2D, and no share is taken
  const R = fakeCanvas();
  const G = fakeEnv();
  G.env.reduced = true;
  let asked = 0;
  G.env.liquid = () => (asked++, drawing);
  const r = mountCharacter(R.canvas, { env: G.env });
  assert.equal(asked, 0);
  assert.equal(R.draws(), 1);
  r.destroy();
});

test("no 2D context, no driver", () => {
  const F = fakeEnv();
  assert.equal(mountCharacter({ getContext: () => null, clientWidth: 10, clientHeight: 10 }, { env: F.env }), null);
  assert.equal(mountCharacter({ clientWidth: 10, clientHeight: 10 }, { env: F.env }), null);
});
