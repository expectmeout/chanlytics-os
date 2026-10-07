/**
 * The liquid three on a fake WebGL2: one context serves every face on the page; a face's picture is copied into its
 * own 2D canvas from the corner it was drawn in; a lost context draws nothing (the face falls back to 2D) until it is
 * restored, one lost in the middle of a draw copies nothing, and a context lost three times is given up for the page;
 * the last face to go gives the context back, and that is not a loss; a program that will not link is given up with
 * its context, and one that links in the background is waited for; and where there is no WebGL2 at all there is no
 * liquid drawing.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { liquid, resetLiquid } from "../../../../../apps/dashboard/src/legacy-bridge/mascot/liquid.ts";
import { createCharacter } from "../../../../../apps/dashboard/src/legacy-bridge/mascot/character.ts";
import { palette } from "../../../../../apps/dashboard/src/legacy-bridge/mascot/colour.ts";

const COMPLETION_STATUS_KHR = 0x91b1;
function fakeGl() {
  const state = {
    lost: false,
    loseContext: 0,
    drawArrays: 0,
    linked: true,
    parallel: false,
    linking: false,
    loseOnDraw: false,
    onLose: null,
  };
  const gl = new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "getProgramParameter")
          return (_p, pname) => (pname === COMPLETION_STATUS_KHR ? !state.linking : state.linked);
        if (name === "isContextLost") return () => state.lost;
        if (name === "getAttribLocation") return () => 0;
        if (name === "getExtension")
          return (n) => {
            if (n === "WEBGL_lose_context")
              return {
                loseContext: () => {
                  state.loseContext++;
                  state.lost = true;
                  state.onLose?.();
                },
              };
            if (n === "KHR_parallel_shader_compile") return state.parallel ? { COMPLETION_STATUS_KHR } : null;
            return null;
          };
        if (name === "drawArrays")
          return () => {
            state.drawArrays++;
            if (state.loseOnDraw) state.lost = true;
          };
        return typeof name === "string" && /^[A-Z_]+$/.test(name) ? 1 : () => ({});
      },
    },
  );
  return { gl, state };
}
/** A page: its one offscreen canvas, with the browser's context events (a hand-back fires `webglcontextlost`). */
function page({ gl, state }) {
  const on = {};
  let made = 0;
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind) => (kind === "webgl2" ? gl : null),
    addEventListener: (n, fn) => (on[n] = fn),
  };
  state.onLose = () => on.webglcontextlost?.({ preventDefault: () => {} });
  const lose = () => {
    state.lost = true;
    on.webglcontextlost({ preventDefault: () => {} });
  };
  const restore = () => {
    state.lost = false;
    on.webglcontextrestored();
  };
  return { canvas, lose, restore, made: () => made, make: () => (made++, canvas) };
}
function target() {
  const calls = [];
  return {
    calls,
    ctx: new Proxy(
      {},
      {
        get:
          (_, n) =>
          (...a) =>
            calls.push([n, ...a]),
        set: () => true,
      },
    ),
  };
}
const frame = createCharacter({ enter: false }).frame();
const pal = palette("light");
const draw = (l, into, w = 60, h = 48) => l.draw(into.ctx, frame, pal, 15, w, h);

beforeEach(() => resetLiquid());

test("one context for every face; a face's picture is copied into its own canvas from where it was drawn", () => {
  const G = fakeGl();
  const P = page(G);
  const a = liquid(P.make);
  const b = liquid(P.make);
  assert.ok(a && b);
  assert.equal(P.made(), 1, "the page made one offscreen canvas");
  const T = target();
  assert.equal(draw(a, T), true);
  assert.equal(G.state.drawArrays, 1);
  assert.ok(P.canvas.width >= 60 && P.canvas.height >= 48, "the offscreen canvas grew to the face");
  const copy = T.calls.find((c) => c[0] === "drawImage");
  assert.deepEqual(copy.slice(2), [0, P.canvas.height - 48, 60, 48, 0, 0, 60, 48], "from its bottom-left corner");
  // a larger face grows it; a smaller one still draws from its own corner
  assert.equal(draw(b, target(), 248, 190), true);
  assert.equal(P.canvas.height, 190);
  assert.equal(draw(a, T), true);
  assert.deepEqual(
    T.calls
      .filter((c) => c[0] === "drawImage")
      .at(-1)
      .slice(2),
    [0, 190 - 48, 60, 48, 0, 0, 60, 48],
  );
});

test("a lost context draws nothing until it is restored; lost three times, the page gives it up", () => {
  const G = fakeGl();
  const P = page(G);
  const a = liquid(P.make);
  const T = target();
  P.lose();
  assert.equal(draw(a, T), false, "the face draws in 2D meanwhile");
  P.restore();
  assert.equal(draw(a, T), true, "and liquid again once it is back");
  P.lose();
  P.restore();
  P.lose();
  P.restore();
  assert.equal(draw(a, T), false, "given up after three");
  assert.equal(liquid(P.make), null, "and not offered to a new face on this page");
});

test("a context lost in the middle of a draw copies nothing: the face draws in 2D for that frame", () => {
  const G = fakeGl();
  const a = liquid(page(G).make);
  const T = target();
  G.state.loseOnDraw = true;
  assert.equal(draw(a, T), false);
  assert.equal(G.state.drawArrays, 1, "it did draw");
  assert.equal(
    T.calls.some((c) => c[0] === "drawImage"),
    false,
    "and copied nothing from the lost context",
  );
});

test("the last face to go gives the context back, which is not a loss; a new face opens a new one", () => {
  const G = fakeGl();
  const P = page(G);
  const a = liquid(P.make);
  const b = liquid(P.make);
  // two real losses first: a hand-back must not be the third
  P.lose();
  P.restore();
  P.lose();
  P.restore();
  a.release();
  a.release();
  assert.equal(G.state.loseContext, 0, "one face still draws");
  b.release();
  assert.equal(G.state.loseContext, 1, "the last one gone, the context given back");
  G.state.lost = false;
  assert.ok(liquid(P.make), "the page has not given up: a new face opens a new context");
  assert.equal(P.made(), 2);
});

test("a program that will not link is given up with its context; one linking in the background is waited for", () => {
  const G = fakeGl();
  G.state.linked = false;
  const P = page(G);
  const a = liquid(P.make);
  assert.ok(a, "the link is not waited for at mount");
  assert.equal(draw(a, target()), false, "the failed link is found at the first draw");
  assert.equal(G.state.loseContext, 1, "the context let go");
  assert.equal(liquid(P.make), null, "and liquid given up for the page");
  resetLiquid();
  const H = fakeGl();
  H.state.parallel = true;
  H.state.linking = true;
  const b = liquid(page(H).make);
  const T = target();
  assert.equal(draw(b, T), false, "not drawn while the program links");
  assert.equal(H.state.drawArrays, 0);
  H.state.linking = false;
  assert.equal(draw(b, T), true, "drawn once it has linked");
  assert.equal(H.state.drawArrays, 1);
});

test("no WebGL2: no liquid drawing", () => {
  assert.equal(
    liquid(() => ({ width: 0, height: 0, getContext: () => null })),
    null,
  );
  assert.equal(
    liquid(() => null),
    null,
  );
});
