/**
 * The three, run on node: every state for seconds with no NaN; at rest the agency mark; reading is an orbit the three
 * circle, nearest largest, lifted, lightest and on top, a read that lands surges it and leaving it never jumps; the
 * draw order follows elevation, so on and off the ring no two overlapping tiles trade places; at rest the tiles turn
 * in place, in every way; an icon left alone goes quiet and wakes when someone comes near; gestures scale with the
 * drawn size; nothing squashes; calm draws still poses; and everything, shadows included, stays inside the box a
 * canvas sizes its tiles by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCharacter,
  STATES,
  STEP,
  FIT,
  CENTRE_Y,
  fitSide,
} from "../../../apps/dashboard/src/legacy-bridge/mascot/character.ts";
import { tilesOf } from "../../../apps/dashboard/src/legacy-bridge/mascot/draw.ts";
import { palette } from "../../../apps/dashboard/src/legacy-bridge/mascot/colour.ts";

const DT = 1 / 120;
const run = (ch, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    ch.tick(DT);
    if (each) each(ch.frame());
  }
};
const KEYS = ["x", "y", "size", "rot", "shade", "live", "charge", "lift", "layer"];
const finite = (f) => f.squares.every((s) => KEYS.every((k) => Number.isFinite(s[k])));
const TURNS = ["turn", "cascade", "gears", "half turn"];
/** what the three do while they wait, listening */
const WAITS = ["turn", "gears", "rise", "look", "peek", "sway", "swap", "lap", "spin"];

test("every state and every reaction for seconds, no NaN anywhere", () => {
  const ch = createCharacter({ seed: 7, detail: 21 });
  run(ch, 2, (f) => assert.ok(finite(f)));
  for (const s of STATES) {
    ch.set(s);
    ch.hear(0.7);
    ch.pulse(0.8);
    run(ch, 3, (f) => assert.ok(finite(f), s));
  }
  ch.set("idle");
  for (const k of ["nod", "hop", "shake", "flip", "yawn", "look"]) {
    assert.equal(ch.react(k), true);
    run(ch, 3, (f) => assert.ok(finite(f), k));
  }
});

test("at rest it is the agency mark: three tiles on a 45° diagonal, each over the last, the last on top", () => {
  const ch = createCharacter({ seed: 1, enter: false, fidgets: false });
  run(ch, 2);
  const [a, b, c] = ch.frame().squares;
  for (const [p, q] of [
    [a, b],
    [b, c],
  ]) {
    assert.ok(Math.abs(q.x - p.x - STEP) < 0.01 && Math.abs(q.y - p.y - STEP) < 0.01, "a step of 0.52 each way");
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 1, "each over the one before");
  }
  assert.deepEqual([a.step, b.step, c.step], [0, 1, 2]);
  assert.ok(a.layer < b.layer && b.layer < c.layer, "drawn back to top");
  assert.ok(a.live < 0.01 && c.live < 0.01);
});

test("reading is an orbit: on a ring, spread round it, lap after lap, the nearest largest, lifted, lightest, on top", () => {
  const ch = createCharacter({ seed: 3, enter: false, fidgets: false, detail: 21 });
  ch.set("thinking");
  run(ch, 1.2);
  const turned = [0, 0, 0];
  let prev = ch.frame().squares.map((s) => Math.atan2(s.y, s.x));
  let ordered = 0;
  let frames = 0;
  run(ch, 6, (f) => {
    frames++;
    f.squares.forEach((s, i) => {
      const r = Math.hypot(s.x, s.y);
      assert.ok(r > 0.3 && r < 1.2, `tile ${i} on the ring: ${r}`);
      const a = Math.atan2(s.y, s.x);
      let d = a - prev[i];
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      turned[i] += d;
      prev[i] = a;
    });
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) {
        const [p, q] = [f.squares[i], f.squares[j]];
        assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > 0.55, "spread round the ring, never bunched");
      }
    const near = f.squares.reduce((m, s) => (s.size > m.size ? s : m));
    const far = f.squares.reduce((m, s) => (s.size < m.size ? s : m));
    if (near.layer > far.layer && near.lift > far.lift && near.shade > far.shade) ordered++;
  });
  for (const t of turned) assert.ok(Math.abs(t) > 4 * Math.PI, `at least two laps in six seconds: ${t}`);
  assert.ok(ordered / frames > 0.97, `the nearest is drawn on top, lifted and lightest: ${ordered} of ${frames}`);
});

test("a read that lands surges the orbit", () => {
  const speed = (surge) => {
    const ch = createCharacter({ seed: 3, enter: false, fidgets: false });
    ch.set("thinking");
    run(ch, 1.5);
    if (surge) ch.pulse(1);
    let prev = ch.frame().squares[0];
    let path = 0;
    run(ch, 0.4, (f) => {
      const s = f.squares[0];
      path += Math.hypot(s.x - prev.x, s.y - prev.y);
      prev = { x: s.x, y: s.y };
    });
    return path;
  };
  assert.ok(speed(true) > speed(false) * 1.2, "faster round the ring just after a read");
});

test("leaving the ring keeps each tile's speed: nothing jumps into the answer or back to rest", () => {
  for (const next of ["speaking", "idle", "listening"]) {
    const ch = createCharacter({ seed: 4, enter: false, fidgets: false });
    ch.set("thinking");
    let prev = null;
    let orbitMax = 0;
    run(ch, 3, (f) => {
      const now = f.squares.map((s) => [s.x, s.y]);
      if (prev) orbitMax = Math.max(orbitMax, ...now.map(([x, y], i) => Math.hypot(x - prev[i][0], y - prev[i][1])));
      prev = now;
    });
    ch.set(next);
    let after = 0;
    run(ch, 0.5, (f) => {
      const now = f.squares.map((s) => [s.x, s.y]);
      after = Math.max(after, ...now.map(([x, y], i) => Math.hypot(x - prev[i][0], y - prev[i][1])));
      prev = now;
    });
    // a spring taking a tile to its place moves it at most a little faster than the ring did; a jump is many times that
    assert.ok(after <= orbitMax * 2, `${next}: ${after} a frame, the ring's own ${orbitMax}`);
    run(ch, 2);
    if (next === "idle")
      assert.deepEqual(
        ch
          .frame()
          .squares.map((s) => s.step)
          .sort(),
        [0, 1, 2],
        "back in the stack",
      );
  }
});

test("draw order follows elevation: a tile held toward you is over what it overlaps; on and off the ring no two overlapping tiles trade places", () => {
  // two tiles' overlap, in tiles squared, by their bounds
  const reach = (s) => (s.size / 2) * (Math.abs(Math.cos(s.rot)) + Math.abs(Math.sin(s.rot)));
  const overlap = (p, q) => {
    const e = reach(p) + reach(q);
    const ox = e - Math.abs(p.x - q.x);
    const oy = e - Math.abs(p.y - q.y);
    return ox > 0 && oy > 0 ? ox * oy : 0;
  };
  const ch = createCharacter({ seed: 5, enter: false, fidgets: false, detail: 21 });
  for (const s of ["listening", "idle", "listening", "speaking"]) {
    ch.set(s);
    ch.hear(0.9);
    run(ch, 1.5, (f) => {
      for (const p of f.squares)
        for (const q of f.squares)
          if (p.lift > q.lift + 0.25 && overlap(p, q) > 0.02)
            assert.ok(p.layer > q.layer, `${s}: the tile held toward you is drawn over the one it overlaps`);
    });
  }
  // two tiles that overlap at the moment of a change trade places, if at all, only once they are nearly apart: the
  // worst overlap at which such a pair traded, through the change
  const trade = (from, to, dwell) => {
    const c = createCharacter({ seed: 11, enter: false, fidgets: false, detail: 21 });
    c.set(from);
    c.hear(0.6);
    run(c, dwell);
    let prev = c.frame().squares;
    const pairs = [];
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) if (overlap(prev[i], prev[j]) > 0.02) pairs.push([i, j]);
    let worst = 0;
    c.set(to);
    run(c, 0.8, (f) => {
      const now = f.squares;
      for (const [i, j] of pairs)
        if (Math.sign(prev[i].layer - prev[j].layer) !== Math.sign(now[i].layer - now[j].layer))
          worst = Math.max(worst, Math.min(overlap(prev[i], prev[j]), overlap(now[i], now[j])));
      prev = now;
    });
    return worst;
  };
  for (const from of ["idle", "listening", "speaking"])
    for (const to of ["idle", "listening", "speaking"])
      for (let k = 0; k < 8; k++) {
        const onto = trade(from, "thinking", 0.8 + k * 0.23);
        assert.ok(onto < 0.06, `${from} onto the ring: two tiles traded places over ${onto} of a tile`);
        const off = trade("thinking", to, 1 + k * 0.23);
        assert.ok(off < 0.06, `off the ring into ${to}: two tiles traded places over ${off} of a tile`);
      }
});

test("listening: the middle tile comes forward and rises with the voice; a bow follows a phrase", () => {
  const ch = createCharacter({ seed: 5, enter: false, fidgets: false });
  ch.set("listening");
  run(ch, 1.5);
  const quiet = { ...ch.frame().squares.find((s) => s.step === 1) };
  ch.hear(0.9);
  run(ch, 1.5);
  const now = ch.frame().squares;
  const loud = now.find((s) => s.step === 1);
  assert.ok(loud.size > quiet.size + 0.1, `${loud.size} > ${quiet.size}`);
  assert.ok(loud.lift > quiet.lift + 0.3, "it rises toward you with your voice");
  assert.ok(
    now.every((s) => s.step === 1 || s.layer < loud.layer),
    "held toward you, it is drawn over the other two",
  );
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

test("answering: the row, and a word lifts one tile toward you", () => {
  const ch = createCharacter({ seed: 9, enter: false, fidgets: false, ownRhythm: false });
  ch.set("speaking");
  run(ch, 2);
  const before = ch.frame().squares.map((s) => ({ y: s.y, lift: s.lift }));
  const first = ch.frame().squares.findIndex((s) => s.step === 0);
  assert.ok(Math.abs(before[0].y - before[2].y) < 0.05, "the row is level");
  ch.beat(0.9);
  let up = 0;
  let lifted = 0;
  run(ch, 0.2, (f) => {
    up = Math.max(up, before[first].y - f.squares[first].y);
    lifted = Math.max(lifted, f.squares[first].lift - before[first].lift);
  });
  assert.ok(up > 0.05 && lifted > 0.3, `up ${up}, lifted ${lifted}`);
});

test("done: rest after answering bows on its own; a failure's shake is a reaction", () => {
  const ch = createCharacter({ seed: 2, enter: false, fidgets: false });
  ch.set("speaking");
  run(ch, 1);
  ch.set("idle");
  assert.equal(ch.events().at(-1).kind, "nod");
  ch.react("shake");
  assert.equal(ch.events().at(-1).kind, "shake");
});

test("at rest the tiles turn in place, every way: one, a cascade, gears, a half turn", () => {
  const kinds = new Set();
  let moments = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const ch = createCharacter({ seed, enter: false, detail: 21 });
    const home = ch.frame().squares.map((s) => [s.x, s.y]);
    let drift = 0;
    let turned = 0;
    run(ch, 60, (f) =>
      f.squares.forEach((s, i) => {
        // a turn and a lift stay on the tile's own spot; only a glance or a stretch moves it, and little
        drift = Math.max(drift, Math.hypot(s.x - home[i][0], s.y - home[i][1]));
        turned = Math.max(turned, Math.abs(s.rot));
      }),
    );
    assert.ok(turned > 1.2, `seed ${seed}: a tile turned as far as ${turned} rad`);
    const said = ch.events().map((e) => e.kind);
    moments += said.length;
    for (const k of said) kinds.add(k);
    assert.ok(
      said.length >= 4 && said.length <= 12,
      `seed ${seed}: ${said.length} moments a minute: ${said.join(",")}`,
    );
    assert.ok(drift < 0.2, `seed ${seed}: in place, ${drift}`);
  }
  for (const k of TURNS) assert.ok(kinds.has(k), `${k} happens: ${[...kinds].join(",")}`);
  assert.ok(moments >= 30);
});

test("listening with nothing heard, the three wait alive: the tiles behind turn, as gears too, or trade places, one takes a lap, the one held forward rises, peeks or spins, the three sway, a glance -- never while the voice is up", () => {
  const kinds = new Set();
  let moments = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const ch = createCharacter({ seed, enter: false, detail: 60 });
    ch.set("listening");
    run(ch, 2);
    const settled = ch.events().length;
    run(ch, 60);
    const said = ch
      .events()
      .slice(settled)
      .map((e) => e.kind);
    moments += said.length;
    for (const k of said) kinds.add(k);
    assert.ok(
      said.length >= 9 && said.length <= 26,
      `seed ${seed}: ${said.length} moments a minute: ${said.join(",")}`,
    );
    for (const k of said) assert.ok(WAITS.includes(k), `${k} fits listening`);
    assert.ok(finite(ch.frame()), "and every number is a number");
    // after any swaps the three still hold one tile per step
    assert.deepEqual(
      ch
        .frame()
        .squares.map((s) => s.step)
        .sort(),
      [0, 1, 2],
    );
    // the voice up: nothing moves on its own
    const heard = ch.events().length;
    ch.hear(0.8);
    run(ch, 12);
    assert.deepEqual(
      ch
        .events()
        .slice(heard)
        .map((e) => e.kind),
      [],
      "none while heard",
    );
  }
  for (const k of WAITS) assert.ok(kinds.has(k), `${k} happens: ${[...kinds].join(",")}`);
  assert.ok(moments >= 60);
});

test("lit at rest (a page arriving): the three take the AI's colour where they stand, a turn comes with it, and the colour and its turns go as the light does", () => {
  const ch = createCharacter({ seed: 3, enter: false, detail: 60 });
  run(ch, 8);
  const home = ch.frame().squares.map((s) => [s.x, s.y]);
  const before = ch.events().length;
  ch.glow(1);
  run(ch, 0.6);
  const lit = ch.frame().squares;
  assert.ok(
    lit.every((s) => s.live > 0.8),
    `coloured: ${lit.map((s) => s.live.toFixed(2)).join(",")}`,
  );
  assert.ok(
    lit.every((s, i) => Math.hypot(s.x - home[i][0], s.y - home[i][1]) < 0.2),
    "where they stood",
  );
  assert.equal(ch.state, "idle", "still at rest");
  run(ch, 1.6);
  const moved = ch
    .events()
    .slice(before)
    .map((e) => e.kind);
  assert.ok(moved.length >= 1, `a move came with the light: ${moved.join(",")}`);
  for (const k of moved)
    assert.ok(TURNS.includes(k) || ["look", "rise", "stretch", "nod"].includes(k), `${k} is a rest move`);
  ch.glow(0);
  const dark = ch.events().length;
  run(ch, 0.45);
  assert.ok(
    ch.frame().squares.every((s) => s.live < 0.1),
    `the ink is back within half a second: ${ch
      .frame()
      .squares.map((s) => s.live.toFixed(2))
      .join(",")}`,
  );
  run(ch, 5.3);
  assert.equal(
    ch.events().length,
    dark,
    "and the light's quicker turns went with it: nothing within the ink's own pace",
  );
  const calm = createCharacter({ seed: 3, enter: false, calm: true });
  calm.glow(1);
  run(calm, 1);
  assert.ok(
    calm.frame().squares.every((s) => s.live > 0.8),
    "calm takes the colour",
  );
  assert.equal(calm.events().length, 0, "and makes no move");
});

test("the page light's quick fade is its own: an answer's end after it still cools slowly, down the stack", () => {
  const ch = createCharacter({ seed: 3, enter: false, detail: 60 });
  run(ch, 8);
  ch.glow(1);
  run(ch, 0.5);
  ch.glow(0);
  run(ch, 0.5);
  ch.set("speaking");
  run(ch, 1);
  ch.set("idle");
  run(ch, 0.8);
  assert.ok(
    ch.frame().squares.every((s) => s.live > 0.3),
    `still warm 0.8 s after the answer: ${ch
      .frame()
      .squares.map((s) => s.live.toFixed(2))
      .join(",")}`,
  );
});

test("an icon left alone goes quiet (no breath, turns only) and wakes when someone comes near", () => {
  const ch = createCharacter({ seed: 8, enter: false, detail: 7.5, quietAfter: 18 });
  ch.attend(0);
  run(ch, 22);
  assert.ok(ch.frame().awake < 0.1, "quiet after 18 seconds alone");
  assert.ok(
    ch.events().some((e) => e.kind === "settle"),
    "with a stretch as it settles",
  );
  let still = 0;
  let frames = 0;
  let last = null;
  run(ch, 60, (f) => {
    const now = f.squares.map((s) => [s.x, s.y, s.rot, s.lift].map((v) => v.toFixed(5)).join()).join("|");
    frames++;
    if (now === last) still++;
    last = now;
  });
  assert.ok(still / frames > 0.85, `quiet: ${Math.round((100 * still) / frames)}% of frames still`);
  const quietKinds = ch
    .events()
    .filter((e) => e.at > 22)
    .map((e) => e.kind);
  assert.ok(
    quietKinds.length >= 2 && quietKinds.every((k) => TURNS.includes(k)),
    `turns only: ${quietKinds.join(",")}`,
  );
  ch.attend(1);
  run(ch, 1);
  assert.equal(ch.events().at(-1).kind, "wake");
  assert.ok(ch.frame().awake > 0.9);
});

test("gestures scale with the size drawn: a 7px tile moves less than a 60px one", () => {
  const reach = (px) => {
    const ch = createCharacter({ seed: 2, enter: false, fidgets: false, detail: px });
    run(ch, 1);
    const y0 = ch.frame().squares.find((s) => s.step === 2).y;
    ch.react("hop");
    let up = 0;
    run(ch, 0.7, (f) => (up = Math.max(up, y0 - f.squares.find((s) => s.step === 2).y)));
    return up;
  };
  assert.ok(reach(7.5) < reach(60) * 0.6, `${reach(7.5)} against ${reach(60)}`);
});

test("calm: one still pose per state, reading's a still ring, the reactions and reads ignored", () => {
  const ch = createCharacter({ calm: true });
  ch.set("listening");
  ch.still();
  const f = ch.frame();
  const held = f.squares.find((s) => s.step === 1);
  assert.ok(
    f.squares.every((s) => s === held || s.layer < held.layer),
    "the middle tile held forward, on top",
  );
  assert.ok(f.squares.every((s) => s.live === 1));
  assert.equal(ch.react("hop"), false);
  ch.set("thinking");
  ch.still();
  const ring = ch.frame().squares.map((s) => [s.x, s.y]);
  const cross =
    (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]);
  assert.ok(Math.abs(cross) > 0.2, "a triangle on the ring, not the stack's line");
  ch.pulse(1);
  assert.equal(ch.events().length, 0, "a read draws nothing when calm");
  ch.set("idle");
  ch.still();
  assert.ok(ch.frame().squares.every((s) => s.live === 0));
});

test("everything the three do, shadows included, stays inside the box a canvas sizes its tiles by", () => {
  const pal = palette("light");
  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;
  const watch = (f) => {
    for (const t of tilesOf(f, pal, 1)) {
      const reach = (t.size / 2) * (Math.abs(Math.cos(t.rot)) + Math.abs(Math.sin(t.rot)));
      const shade =
        Math.max(0, t.size / 2 + t.shadow.spread) * (Math.abs(Math.cos(t.rot)) + Math.abs(Math.sin(t.rot))) +
        t.shadow.sigma;
      const y = t.y + CENTRE_Y;
      top = Math.min(top, y - reach, y + t.shadow.y - shade);
      bottom = Math.max(bottom, y + reach, y + t.shadow.y + shade);
      left = Math.min(left, t.x - reach, t.x + t.shadow.x - shade);
      right = Math.max(right, t.x + reach, t.x + t.shadow.x + shade);
    }
  };
  for (const seed of [5, 6, 7]) {
    const ch = createCharacter({ seed, enter: false, detail: 60 });
    run(ch, 30, watch);
    ch.set("listening");
    ch.hear(0.9);
    run(ch, 3, watch);
    // and waiting, its own moves
    ch.hear(0);
    run(ch, 40, watch);
    ch.set("thinking");
    ch.pulse(1);
    run(ch, 8, watch);
    ch.set("speaking");
    for (let i = 0; i < 20; i++) {
      ch.beat(1);
      run(ch, 0.15, watch);
    }
    ch.set("idle");
    run(ch, 30, watch);
  }
  assert.ok(-top <= FIT.h / 2 && bottom <= FIT.h / 2, `up ${-top}, down ${bottom}, of ${FIT.h / 2}`);
  assert.ok(-left <= FIT.w / 2 && right <= FIT.w / 2, `left ${-left}, right ${right}, of ${FIT.w / 2}`);
  // the button's icon, 30 by 24, is sized by its height; a narrower one by its width
  assert.ok(Math.abs(fitSide(30, 24) - 24 / FIT.h) < 1e-9);
  assert.equal(fitSide(28, 24), 28 / FIT.w);
});
