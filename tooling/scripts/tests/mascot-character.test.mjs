/**
 * The three, run on node: every state for seconds with no NaN; the leapfrog cycles the three through every order and
 * never passes one square through another; a nod follows a phrase heard; the moves leave events; calm draws still
 * poses; and every corner stays inside the band on Today at the one size.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCharacter, UNITS, STATES } from "../../../apps/dashboard/src/legacy-bridge/mascot/character.ts";

const DT = 1 / 120;
const run = (ch, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    ch.tick(DT);
    if (each) each(ch.frame());
  }
};
const finite = (f) =>
  f.squares.every((s) =>
    ["x", "y", "size", "squash", "rot", "stretch", "shade", "live"].every((k) => Number.isFinite(s[k])),
  );

test("every state and every reaction for seconds, no NaN anywhere", () => {
  const ch = createCharacter({ seed: 7 });
  run(ch, 2, (f) => assert.ok(finite(f)));
  for (const s of STATES) {
    ch.set(s);
    ch.hear(0.7);
    run(ch, 3, (f) => assert.ok(finite(f), s));
  }
  ch.set("idle");
  for (const k of ["nod", "hop", "shake", "flip", "yawn", "look"]) {
    assert.equal(ch.react(k), true);
    run(ch, 3, (f) => assert.ok(finite(f), k));
  }
});

test("at rest it is the mark: three steps down a diagonal, first to last", () => {
  const ch = createCharacter({ seed: 1, enter: false, fidgets: false });
  run(ch, 2);
  const [a, b, c] = ch.frame().squares;
  assert.ok(a.x < b.x && b.x < c.x);
  assert.ok(a.y < b.y && b.y < c.y);
  assert.deepEqual([a.step, b.step, c.step], [0, 1, 2]);
  assert.ok(a.live < 0.01 && c.live < 0.01);
});

test("reading is the leapfrog: the order cycles, every square leads once, and none passes through another", () => {
  const ch = createCharacter({ seed: 3, enter: false, fidgets: false });
  ch.set("thinking");
  const orders = new Set();
  let flights = 0,
    overlaps = 0;
  const corners = (s) => {
    const h = s.size / 2,
      c = Math.cos(s.rot),
      sn = Math.sin(s.rot);
    return [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ].map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
  };
  const apart = (A, B) => {
    const pa = corners(A),
      pb = corners(B);
    for (const poly of [pa, pb])
      for (let i = 0; i < 4; i++) {
        const [x1, y1] = poly[i],
          [x2, y2] = poly[(i + 1) % 4];
        const nx = -(y2 - y1),
          ny = x2 - x1,
          len = Math.hypot(nx, ny);
        const pr = (p) => p.map(([x, y]) => (x * nx + y * ny) / len);
        const a = pr(pa),
          b = pr(pb);
        if (Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) <= 0) return true;
      }
    return false;
  };
  run(ch, 12, (f) => {
    orders.add(f.squares.map((s) => s.step).join(""));
    const j = f.squares.find((s) => s.front === 1);
    if (!j) return;
    flights++;
    for (const s of f.squares) if (s !== j && !apart(j, s)) overlaps++;
  });
  assert.equal(overlaps, 0, `${overlaps} overlapping frames of ${flights} in flight`);
  assert.ok(flights > 100, `it flew for ${flights} frames`);
  assert.deepEqual([...orders].sort(), ["012", "120", "201"]);
  assert.ok(ch.events().filter((e) => e.kind === "leap").length >= 10);
});

test("listening: the middle square comes forward and grows with the voice; a nod follows a phrase", () => {
  const ch = createCharacter({ seed: 5, enter: false, fidgets: false });
  ch.set("listening");
  run(ch, 1.5);
  const quiet = ch.frame().squares[1].size; // a number: frame() hands back the live objects
  ch.hear(0.9);
  run(ch, 1.5);
  const loud = ch.frame().squares[1];
  assert.ok(loud.size > quiet + 0.1, `${loud.size} > ${quiet}`);
  assert.equal(loud.front, 1);
  ch.hear(0);
  run(ch, 1.5);
  assert.ok(
    ch.events().some((e) => e.kind === "nod"),
    ch
      .events()
      .map((e) => e.kind)
      .join(","),
  );
});

test("answering: the row, and a beat lifts one square", () => {
  const ch = createCharacter({ seed: 9, enter: false, fidgets: false, ownRhythm: false });
  ch.set("speaking");
  run(ch, 2);
  const before = ch.frame().squares.map((s) => s.y);
  assert.ok(Math.abs(before[0] - before[2]) < 0.05, "the row is level");
  ch.beat(0.9);
  let lifted = 0;
  run(ch, 0.2, (f) => {
    lifted = Math.max(lifted, before[0] - f.squares[0].y);
  });
  assert.ok(lifted > 0.15, `lifted ${lifted}`);
});

test("done: idle after speaking nods on its own; a failure's shake is a reaction", () => {
  const ch = createCharacter({ seed: 2, enter: false, fidgets: false });
  ch.set("speaking");
  run(ch, 1);
  ch.set("idle");
  assert.equal(ch.events().at(-1).kind, "nod");
  ch.react("shake");
  assert.equal(ch.events().at(-1).kind, "shake");
});

test("left alone it fidgets, rarely", () => {
  const ch = createCharacter({ seed: 11, enter: false });
  run(ch, 40);
  const fidgets = ch.events().map((e) => e.kind);
  assert.ok(fidgets.length >= 2 && fidgets.length <= 6, fidgets.join(","));
});

test("calm: one still pose per state, the reactions ignored", () => {
  const ch = createCharacter({ calm: true });
  ch.set("listening");
  ch.still();
  const f = ch.frame();
  assert.equal(f.squares[1].front, 1);
  assert.ok(f.squares.every((s) => s.live === 1));
  assert.equal(ch.react("hop"), false);
  ch.set("idle");
  ch.still();
  assert.ok(ch.frame().squares.every((s) => s.live === 0));
});

test("everything stays inside the band on Today: 358 by 232, squares sized for 200", () => {
  const ch = createCharacter({ seed: 5, enter: false, fidgets: true });
  const halfW = 358 / (200 / UNITS) / 2,
    halfH = 232 / (200 / UNITS) / 2;
  let worstX = 0,
    worstY = 0;
  const watch = (f) => {
    for (const s of f.squares) {
      const h = (s.size / 2) * (1 + s.stretch);
      const e = h * (Math.abs(Math.cos(s.rot)) + Math.abs(Math.sin(s.rot)));
      worstX = Math.max(worstX, Math.abs(s.x) + e);
      worstY = Math.max(worstY, Math.abs(s.y) + e);
    }
  };
  run(ch, 12, watch);
  ch.set("listening");
  ch.hear(0.9);
  run(ch, 3, watch);
  ch.set("thinking");
  run(ch, 8, watch);
  ch.set("speaking");
  run(ch, 4, watch);
  ch.set("idle");
  run(ch, 30, watch);
  assert.ok(worstX <= halfW, `${worstX} across of ${halfW}`);
  assert.ok(worstY <= halfH, `${worstY} up or down of ${halfH}`);
});
