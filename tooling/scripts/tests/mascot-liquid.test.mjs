/**
 * The liquid three on a fake WebGL2: one context serves every face on the page; a face's picture is copied into its
 * own 2D canvas from the corner it was drawn in; a lost context draws nothing (the face falls back to 2D) until it is
 * restored, one lost in the middle of a draw copies nothing, and a context lost three times is given up for the page; the last face to go gives the context back;
 * and where there is no WebGL2 at all there is no liquid drawing.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { liquid, resetLiquid } from "../../../apps/dashboard/src/legacy-bridge/mascot/liquid.ts";
import { createCharacter } from "../../../apps/dashboard/src/legacy-bridge/mascot/character.ts";
import { palette } from "../../../apps/dashboard/src/legacy-bridge/mascot/colour.ts";

function fakeGl() {
  const state = { lost: false, loseContext: 0, drawArrays: 0, compiled: true, loseOnDraw: false };
  const gl = new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === "getShaderParameter" || name === "getProgramParameter") return () => state.compiled;
        if (name === "isContextLost") return () => state.lost;
        if (name === "getAttribLocation") return () => 0;
        if (name === "getExtension")
          return (n) => (n === "WEBGL_lose_context" ? { loseContext: () => state.loseContext++ } : null);
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
function page(glCtx) {
  const on = {};
  let made = 0;
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind) => (kind === "webgl2" ? glCtx : null),
    addEventListener: (n, fn) => (on[n] = fn),
  };
  return { canvas, on, made: () => made, make: () => (made++, canvas) };
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

beforeEach(() => resetLiquid());

test("one context for every face; a face's picture is copied into its own canvas from where it was drawn", () => {
  const { gl, state } = fakeGl();
  const P = page(gl);
  const a = liquid(P.make);
  const b = liquid(P.make);
  assert.ok(a && b);
  assert.equal(P.made(), 1, "the page made one offscreen canvas");
  const T = target();
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), true);
  assert.equal(state.drawArrays, 1);
  assert.ok(P.canvas.width >= 60 && P.canvas.height >= 48, "the offscreen canvas grew to the face");
  const copy = T.calls.find((c) => c[0] === "drawImage");
  assert.deepEqual(copy.slice(2), [0, P.canvas.height - 48, 60, 48, 0, 0, 60, 48], "from its bottom-left corner");
  // a larger face grows it; a smaller one still draws from its own corner
  const U = target();
  assert.equal(b.draw(U.ctx, frame, pal, 60, 248, 190), true);
  assert.equal(P.canvas.height, 190);
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), true);
  assert.deepEqual(
    T.calls
      .filter((c) => c[0] === "drawImage")
      .at(-1)
      .slice(2),
    [0, 190 - 48, 60, 48, 0, 0, 60, 48],
  );
});

test("a lost context draws nothing until it is restored; lost three times, the page gives it up", () => {
  const { gl, state } = fakeGl();
  const P = page(gl);
  const a = liquid(P.make);
  const T = target();
  const lose = () => P.on.webglcontextlost({ preventDefault: () => {} });
  lose();
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), false, "the face draws in 2D meanwhile");
  P.on.webglcontextrestored();
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), true, "and liquid again once it is back");
  state.lost = true;
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), false, "a context that says it is lost draws nothing");
  state.lost = false;
  lose();
  P.on.webglcontextrestored();
  lose();
  P.on.webglcontextrestored();
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), false, "given up after three");
  assert.equal(liquid(P.make), null, "and not offered to a new face on this page");
});

test("a context lost in the middle of a draw copies nothing: the face draws in 2D for that frame", () => {
  const { gl, state } = fakeGl();
  const a = liquid(page(gl).make);
  const T = target();
  state.loseOnDraw = true;
  assert.equal(a.draw(T.ctx, frame, pal, 15, 60, 48), false);
  assert.equal(state.drawArrays, 1, "it did draw");
  assert.equal(
    T.calls.some((c) => c[0] === "drawImage"),
    false,
    "and copied nothing from the lost context",
  );
});

test("the last face to go gives the context back; a new face opens a new one", () => {
  const { gl, state } = fakeGl();
  const P = page(gl);
  const a = liquid(P.make);
  const b = liquid(P.make);
  a.release();
  a.release();
  assert.equal(state.loseContext, 0, "one face still draws");
  b.release();
  assert.equal(state.loseContext, 1, "the last one gone, the context given back");
  assert.ok(liquid(P.make));
  assert.equal(P.made(), 2);
});

test("no WebGL2, or a program that does not compile: no liquid drawing", () => {
  assert.equal(
    liquid(() => ({ width: 0, height: 0, getContext: () => null })),
    null,
  );
  assert.equal(
    liquid(() => null),
    null,
  );
  const { gl, state } = fakeGl();
  state.compiled = false;
  assert.equal(liquid(page(gl).make), null);
});
