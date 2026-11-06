/**
 * The gestures: each move adds to the tiles' offsets for this frame and says when it is finished, as
 * `(record, move, seconds since it began) → done`. A move never touches a tile's place or spring, only the offsets
 * the frame clears before it runs them (runMoves), so two moves at once simply add; a swap is the one exception,
 * trading two tiles' places and steps as it ends.
 */
import { TAU, clamp, inOut } from "./math";
import { atStep, byStep, gain, roll, tileOf, type Core, type Move, type MoveKind } from "./character-core";

export const MOVES: Record<MoveKind, (st: Core, a: Move, t: number) => boolean> = {
  // a quarter turn (or a half) in place, lifted a little while it turns
  turn(st, a, t) {
    const b = tileOf(st, a);
    if (!b) return true;
    const p = (t - a.delay) / a.dur;
    if (p < 0) return false;
    if (p >= 1) return true;
    b.orot += a.dir * a.amp * (Math.PI / 2) * inOut(p);
    b.olift += 0.5 * Math.sin(Math.PI * p);
    b.ch += 0.22 * Math.sin(Math.PI * p);
    if (a.out) b.ox += a.out * Math.sin(Math.PI * p) * gain(st);
    return false;
  },
  // a tile rises toward you and sets back down
  rise(st, a, t) {
    const b = tileOf(st, a);
    if (!b) return true;
    const p = (t - a.delay) / a.dur;
    if (p < 0) return false;
    if (p >= 1) return true;
    const s = Math.sin(Math.PI * p);
    b.olift += 0.9 * a.amp * s;
    b.oy -= 0.05 * a.amp * s * gain(st);
    return false;
  },
  // a word: its tile lifts toward you and lights
  push(st, a, t) {
    const b = a.who;
    if (!b) return true;
    const p = t / 0.36;
    if (p >= 1) return true;
    const s = Math.sin(Math.PI * p);
    b.olift += 0.6 * a.v * s;
    b.oy -= 0.14 * a.v * s * gain(st);
    b.orot += a.spin * 0.12 * a.v * s;
    b.ch += 0.7 * a.v * s;
    return false;
  },
  // a lift running down the stack: a word heard, a perk, a wake
  wave(st, a, t) {
    a.order ??= byStep(st);
    let busy = false;
    for (const b of st.bodies) {
      const k = a.order.get(b.i) ?? 0;
      const p = (t - k * 0.07) / a.dur;
      if (p >= 1) continue;
      busy = true;
      if (p < 0) continue;
      b.olift += a.amp * Math.sin(Math.PI * p);
    }
    return !busy;
  },
  // a bow: each tile pressed into the page a moment, down the stack
  nod(st, a, t) {
    a.order ??= byStep(st);
    let busy = false;
    for (const b of st.bodies) {
      const k = a.order.get(b.i) ?? 0;
      const p = (t - k * 0.07) / 0.42;
      if (p >= 1) continue;
      busy = true;
      if (p < 0) continue;
      const s = Math.sin(Math.PI * p);
      b.olift -= 0.35 * a.amp * s;
      b.oy += 0.05 * a.amp * s * gain(st);
      b.orot += 0.06 * a.amp * s;
    }
    return !busy;
  },
  // no: one short shiver
  shake(st, a, t) {
    a.order ??= byStep(st);
    if (t > 0.75) return true;
    for (const b of st.bodies) {
      const tt = t - (a.order.get(b.i) ?? 0) * 0.045;
      if (tt < 0) continue;
      const e = Math.exp(-tt * 6.5) * Math.sin(tt * TAU * 3.2);
      b.ox += 0.05 * e * gain(st);
      b.orot += 0.04 * e;
    }
    return false;
  },
  // the stack fans out a little and closes
  stretch(st, a, t) {
    const dur = 1.2;
    if (t >= dur) return true;
    const s = Math.sin((Math.PI * t) / dur);
    st.spreadAdd += 0.14 * gain(st) * s;
    for (const b of st.bodies) b.olift += 0.2 * s;
    return false;
  },
  // a glance one way, then the other
  look(st, a, t) {
    if (!a.glance) a.glance = roll(st) < 0.5 ? -1 : 1;
    if (t >= 2.6) {
      st.fidgetGaze = [0, 0];
      return true;
    }
    st.fidgetGaze = t < 1.1 ? [0.7 * a.glance, -0.2] : t < 2.0 ? [-0.45 * a.glance, 0.12] : [0, 0];
    return false;
  },
  // a tile behind leaves to its side and takes a lap round the others, rolling, back to its place
  lap(st, a, t) {
    const b = tileOf(st, a);
    if (!b) return true;
    const p = t / a.dur;
    if (p >= 1) return true;
    const r = Math.hypot(b.x, b.y);
    const th = Math.atan2(b.y, b.x) + a.dir * TAU * inOut(p);
    const s = Math.sin(Math.PI * p);
    b.ox += (r * Math.cos(th) - b.x) * gain(st);
    b.oy += (r * Math.sin(th) - b.y) * gain(st);
    b.orot += a.dir * Math.PI * inOut(p);
    b.olift += 0.5 * s;
    b.ch += 0.2 * s;
    return false;
  },
  // the two behind trade places, one passing over the other; done, each takes the other's step and spot
  swap(st, a, t) {
    a.who ??= atStep(st, 0);
    a.who2 ??= atStep(st, 2);
    const A = a.who;
    const B = a.who2;
    if (!A || !B) return true;
    const p = t / a.dur;
    if (p >= 1) {
      const ax = A.x;
      const ay = A.y;
      A.x = B.x;
      A.y = B.y;
      B.x = ax;
      B.y = ay;
      const step = A.step;
      A.step = B.step;
      B.step = step;
      return true;
    }
    const s = inOut(p);
    const arc = Math.sin(Math.PI * p);
    A.ox += (B.x - A.x) * s;
    A.oy += (B.y - A.y) * s - 0.32 * arc * gain(st);
    A.olift += 0.35 * arc;
    B.ox += (A.x - B.x) * s;
    B.oy += (A.y - B.y) * s + 0.22 * arc * gain(st);
    B.olift -= 0.15 * arc;
    return false;
  },
  // the tile held forward dips toward the field, as if to read what is typed, and comes back up
  peek(st, a, t) {
    const b = tileOf(st, a);
    if (!b) return true;
    const p = t / a.dur;
    if (p >= 1) return true;
    const s = Math.sin(Math.PI * p);
    b.oy += 0.26 * s * gain(st);
    b.orot += 0.1 * a.dir * s;
    b.olift -= 0.15 * s;
    return false;
  },
  // the three lean one way, then the other, and settle
  sway(st, a, t) {
    const p = t / a.dur;
    if (p >= 1) return true;
    const s = Math.sin(TAU * p) * Math.sin(Math.PI * p);
    for (const b of st.bodies) {
      b.ox += 0.12 * a.dir * s * gain(st) * (1 + 0.25 * (clamp(b.step, 0, 2) - 1));
      b.orot += 0.12 * a.dir * s;
    }
    return false;
  },
  // light running down the stack: a read landed, an answer done, a wake
  sweep(st, a, t) {
    a.order ??= byStep(st);
    let busy = false;
    for (const b of st.bodies) {
      const k = a.order.get(b.i) ?? 0;
      const p = (t - k * 0.1) / 0.5;
      if (p >= 1) continue;
      busy = true;
      if (p < 0) continue;
      b.ch += a.amp * Math.sin(Math.PI * p) ** 2;
    }
    return !busy;
  },
};

/** The moves, applied: every offset cleared, then each move in turn, the finished ones dropped. */
export function runMoves(st: Core): Core {
  for (const b of st.bodies) {
    b.ox = 0;
    b.oy = 0;
    b.oscale = 0;
    b.orot = 0;
    b.olift = 0;
    b.obreath = 0;
    b.ch = 0;
  }
  st.spreadAdd = 0;
  for (let n = st.moves.length - 1; n >= 0; n--) {
    const a = st.moves[n];
    if (MOVES[a.kind](st, a, st.clock - a.t0)) st.moves.splice(n, 1);
  }
  return st;
}
