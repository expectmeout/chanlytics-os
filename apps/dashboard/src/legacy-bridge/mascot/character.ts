/**
 * The three: the Chanlytics mark as a character. Pure: no DOM, no clock of its own.
 *
 * Three rounded squares step down a diagonal, as they do in the logo. Feed the character what happens (a state, a
 * voice level, a word, a reaction, where the pointer is), step it with tick(dt), and frame() says where each square
 * is, in squares, from the centre. Each square follows a spring toward where the state wants it, so a change of
 * state is a morph with follow-through, never a cut; hops, nods, leaps and tumbles are keyframed on top of the
 * springs.
 *
 * Spec: docs/superpowers/specs/2026-09-23-the-three-on-today-design.md, section 5.
 */
export type CharacterState = "idle" | "listening" | "thinking" | "speaking";
export type Reaction = "nod" | "hop" | "shake" | "flip" | "yawn" | "look";
export interface ReactionParams {
  amp?: number;
  h?: number;
  dur?: number;
  only?: number;
}
export interface SquareFrame {
  /** which step of the stair it stands on: 0 first, 2 last */
  step: number;
  /** its colour step, continuous while it moves between steps */
  shade: number;
  /** 0 at rest, 1 at work */
  live: number;
  x: number;
  y: number;
  size: number;
  squash: number;
  rot: number;
  stretch: number;
  angle: number;
  /** 1 while it is drawn over the others */
  front: 0 | 1;
}
export interface CharacterFrame {
  corner: number;
  squares: SquareFrame[];
}
export interface CharacterEvent {
  kind: string;
  at: number;
}
export interface CharacterOptions {
  seed?: number;
  /** drop in from above at birth */
  enter?: boolean;
  /** a small move every 7 to 14 seconds at rest */
  fidgets?: boolean;
  /** a rhythm of its own while speaking with no beats */
  ownRhythm?: boolean;
  /** reduced motion: still poses, no moves, no rhythm */
  calm?: boolean;
}
export interface Character {
  readonly state: CharacterState;
  readonly clock: number;
  set(next: CharacterState): boolean;
  hear(level: number): void;
  voice(level: number, live?: boolean): void;
  beat(strength?: number): void;
  react(kind: Reaction, params?: ReactionParams): boolean;
  look(gx: number, gy: number, near: boolean): void;
  away(): void;
  tick(dt: number): void;
  frame(): CharacterFrame;
  still(): void;
  events(): CharacterEvent[];
}

export const STATES: readonly CharacterState[] = ["idle", "listening", "thinking", "speaking"];
/**
 * A band of height H holds UNITS squares: one square is H / UNITS. The stair needs 2.3 squares of height, the leap
 * 3.6 up and down and 4.3 across, so the canvas is wider than tall and a little taller than the band that sets the
 * size (232px for squares sized to 200).
 */
export const UNITS = 3.8;

const TAU = Math.PI * 2;
const STEP: readonly [number, number] = [1.08, 0.64];
interface Layout {
  corner: number;
  spread: number;
  centre: number;
  dy: number;
  scale: number;
}
const LAYOUT: Record<CharacterState, Layout> = {
  idle: { corner: 0.24, spread: 1, centre: 1, dy: 0, scale: 1 },
  listening: { corner: 0.28, spread: 1, centre: 1, dy: 0, scale: 1 },
  thinking: { corner: 0.22, spread: 0.97, centre: 1.6, dy: 0.3, scale: 0.98 },
  speaking: { corner: 0.26, spread: 1, centre: 1, dy: 0, scale: 1 },
};
const FOLLOW = [15, 13, 11.5] as const;
const LEAP = { dur: 0.64, crouch: 0.2, land: 0.88, height: 1.4, reach: 3.25, across: [0.1, 0.85] as const };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (cur: number, tgt: number, dt: number, tau: number) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
const inOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function slotPos(state: CharacterState, k: number, extra: number): [number, number] {
  const L = LAYOUT[state];
  const f = (k - L.centre) * L.spread * extra;
  return [STEP[0] * f, STEP[1] * f + L.dy];
}
interface Pose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  front: 0 | 1;
}
/** Where square k wants to be in a state: position, lean, size, and whether it is in front. */
function pose(state: CharacterState, k: number, level: number, extra: number): Pose {
  if (state === "listening") {
    // the huddle: the middle square comes forward and grows with your voice; the other two tuck in behind it,
    // tilted toward it, and draw in closer the louder you are
    if (k === 1) return { x: 0, y: -0.42 - 0.06 * level, rot: 0, scale: 1 + 0.2 * level, front: 1 };
    const side = k - 1;
    return {
      x: side * (0.72 - 0.08 * level),
      y: 0.4 - 0.05 * level,
      rot: -side * 0.16,
      scale: 0.86 + 0.04 * level,
      front: 0,
    };
  }
  if (state === "speaking") {
    // the row: side by side, a shallow smile, each word lifting one of them in turn
    return { x: (k - 1) * 1.24, y: 0.1 - 0.2 * (k - 1) * (k - 1), rot: (k - 1) * 0.06, scale: 1, front: 0 };
  }
  const [x, y] = slotPos(state, k, extra);
  return { x, y, rot: 0, scale: LAYOUT[state].scale, front: 0 };
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Body {
  i: number;
  step: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sc: number;
  vsc: number;
  q: number;
  vq: number;
  rot: number;
  vrot: number;
  shade: number;
  shadeO: number | null;
  live: number;
  ox: number;
  oy: number;
  osc: number;
  oq: number;
  orot: number;
  z: 0 | 1;
  front: 0 | 1;
  abs: [number, number] | null;
  px: number | null;
  py: number | null;
  svx: number;
  svy: number;
  out: SquareFrame;
}
type MoveKind = "leap" | "hop" | "push" | "nod" | "shake" | "flip" | "yawn" | "look";
interface Move {
  kind: MoveKind;
  t0: number;
  h: number;
  dur: number;
  delay: number;
  falloff: number;
  crouch: number;
  only: number | null;
  amp: number;
  v: number;
  spin: number;
  dir: [number, number];
  jumper: Body | null;
  who: Body | null;
  from: [number, number] | null;
  landed: boolean;
  landedSet: Set<number>;
  order: Map<number, number> | null;
  group: Body[] | null;
  glance: number;
}

export function createCharacter(options: CharacterOptions = {}): Character {
  const { seed = 7, enter = true, fidgets = true, ownRhythm = true, calm = false } = options;
  const rand = seeded(seed);
  let state: CharacterState = "idle";
  let stateAt = 0;
  let prevLive = 0;
  let clock = 0;
  const W: Record<CharacterState, number> = { idle: 1, listening: 0, thinking: 0, speaking: 0 };
  let heard = 0;
  let voiced = 0;
  let voiceLive = false;
  let level = 0;
  const hist: { t: number; v: number }[] = [];
  let corner = LAYOUT.idle.corner;
  let spreadAdd = 0;
  let perk = 0;
  const gaze = [0, 0];
  const gazeV = [0, 0];
  let fidgetGaze: [number, number] = [0, 0];
  let pointer: { g: [number, number]; near: boolean } | null = null;
  let pointerAge = 1e9;
  let nextLeapAt = 0;
  let leaps = 0;
  let nextFidgetAt = 6 + rand() * 3;
  let autoNextAt = 0;
  let autoPhraseEnd = 0;
  let onsetArmed = true;
  let loud = false;
  let quietFor = 0;
  let lastWordAt = -1e9;
  let wordAt = 0;
  const moves: Move[] = [];
  const events: CharacterEvent[] = [];
  const entering = enter && !calm;

  const bodies: Body[] = [0, 1, 2].map((i) => {
    const [x, y] = slotPos("idle", i, 1);
    return {
      i,
      step: i,
      x,
      y: entering ? y - 0.45 : y,
      vx: 0,
      vy: 0,
      sc: entering ? 0 : 1,
      vsc: 0,
      q: 0,
      vq: 0,
      rot: 0,
      vrot: 0,
      shade: i,
      shadeO: null,
      live: 0,
      ox: 0,
      oy: 0,
      osc: 0,
      oq: 0,
      orot: 0,
      z: 0,
      front: 0,
      abs: null,
      px: null,
      py: null,
      svx: 0,
      svy: 0,
      out: {
        step: i,
        shade: i,
        live: 0,
        x,
        y,
        size: entering ? 0 : 1,
        squash: 0,
        rot: 0,
        stretch: 0,
        angle: 0,
        front: 0,
      },
    };
  });

  const note = (kind: string) => {
    events.push({ kind, at: clock });
    if (events.length > 20) events.shift();
  };
  const move = (kind: MoveKind, over: Partial<Move> = {}): void => {
    moves.push({
      kind,
      t0: clock,
      h: 0.3,
      dur: 0.42,
      delay: 0.075,
      falloff: 1,
      crouch: 0.22,
      only: null,
      amp: 1,
      v: 1,
      spin: 0,
      dir: [0, -1],
      jumper: null,
      who: null,
      from: null,
      landed: false,
      landedSet: new Set(),
      order: null,
      group: null,
      glance: 0,
      ...over,
    });
  };
  const byStep = () => new Map(bodies.map((b) => [b.i, b.step]));
  const atStep = (k: number) => bodies.find((b) => b.step === k) ?? null;
  /** A word: in the row, the next square along lifts and tips outward; anywhere else, a small wave of hops. */
  function beatWave(v: number): void {
    if (state === "speaking") {
      const k = wordAt++ % 3;
      move("push", { who: atStep(k), v: 0.5 + 0.5 * v, dir: [0, -1], spin: (k - 1) * 0.7 });
    } else move("hop", { h: 0.08 + 0.2 * v, dur: 0.3, delay: 0.065, falloff: 0.82, crouch: 0.16 });
  }
  function levelAt(t: number): number {
    for (let n = hist.length - 1; n >= 0; n--) {
      const a = hist[n];
      if (a.t <= t) {
        const b = hist[n + 1];
        return b && b.t > a.t ? a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t)) : a.v;
      }
    }
    return hist.length ? hist[0].v : 0;
  }

  // Each move adds to the squares' offsets for this frame, and says when it is finished.
  const MOVES: Record<MoveKind, (a: Move, t: number) => boolean> = {
    // the first square tumbles over the other two to the far end of the stair
    leap(a, t) {
      const j = a.jumper;
      if (!j) return true;
      const p = t / LEAP.dur;
      if (p < LEAP.crouch) {
        const c = Math.sin((Math.PI * p) / LEAP.crouch);
        j.oy += 0.05 * c;
        j.oq += 0.2 * c;
        return false;
      }
      if (!a.from) a.from = [j.x, j.y];
      // it rises before it moves across and drops straight onto the step, a little past the next one, so it never
      // grazes the square it leaves or the one it lands beside
      const to = slotPos("thinking", LEAP.reach, 1 + spreadAdd);
      const u = Math.min(1, (p - LEAP.crouch) / (LEAP.land - LEAP.crouch));
      const k = clamp((u - LEAP.across[0]) / (LEAP.across[1] - LEAP.across[0]), 0, 1);
      const across = k * k * (3 - 2 * k);
      j.abs = [
        a.from[0] + (to[0] - a.from[0]) * across,
        a.from[1] + (to[1] - a.from[1]) * u - LEAP.height * 4 * u * (1 - u),
      ];
      j.orot += (Math.PI / 2) * inOut(u);
      j.z = 1;
      j.shadeO = Math.min(2, 3 * across);
      if (u < 1) {
        for (const b of bodies) {
          if (b === j) continue;
          const d = Math.exp(-(((j.abs[0] - b.x) / 0.6) ** 2)); // the other two duck as it passes over them
          b.oy += 0.08 * d;
          b.oq += 0.14 * d;
        }
      } else if (!a.landed) {
        a.landed = true;
        j.vq += 4.2;
        for (const b of bodies) if (b !== j) b.vq += 0.8;
      }
      if (p < 1) return false;
      // it stays where it landed, one step past the end; the stair shifts, and the springs bring it back
      j.x = to[0];
      j.y = to[1];
      j.vx = 0;
      j.vy = 0;
      j.shade = 2;
      for (const b of bodies) b.step = b === j ? 2 : b.step - 1;
      return true;
    },
    // a hop in place; with a delay per step, a wave of hops down the stair
    hop(a, t) {
      a.order ??= byStep();
      a.group ??= a.only != null ? bodies.filter((b) => b.step === a.only) : bodies.slice();
      let busy = false;
      for (const b of a.group) {
        const k = a.only != null ? 0 : (a.order.get(b.i) ?? 0);
        const amp = Math.pow(a.falloff, k);
        const p = (t - k * a.delay) / a.dur;
        if (p >= 1) {
          if (!a.landedSet.has(b.i)) {
            a.landedSet.add(b.i);
            b.vq += 3 * (a.h / 0.3) * amp;
          }
          continue;
        }
        busy = true;
        if (p < 0) continue;
        if (p < a.crouch) {
          const c = Math.sin((Math.PI * p) / a.crouch);
          b.oy += 0.035 * c * amp;
          b.oq += 0.16 * c * amp;
        } else {
          const u = (p - a.crouch) / (1 - a.crouch);
          b.oy -= a.h * amp * 4 * u * (1 - u);
        }
      }
      return !busy;
    },
    // a word: one square lifts, tips a little, and lands with a squash
    push(a, t) {
      const b = a.who;
      if (!b) return true;
      const dur = 0.34;
      const p = t / dur;
      if (p >= 1) {
        if (!a.landed) {
          a.landed = true;
          b.vq += 2.2 * a.v;
        }
        return true;
      }
      const s = Math.sin(Math.PI * p);
      b.ox += a.dir[0] * 0.3 * a.v * s;
      b.oy += a.dir[1] * 0.3 * a.v * s;
      b.orot += a.spin * 0.22 * a.v * s;
      b.osc += 0.08 * a.v * s;
      b.z = 1;
      return false;
    },
    // a dip and a small bow, running down the stair
    nod(a, t) {
      a.order ??= byStep();
      let busy = false;
      for (const b of bodies) {
        const k = a.order.get(b.i) ?? 0;
        const p = (t - k * 0.07) / 0.4;
        if (p >= 1) continue;
        busy = true;
        if (p < 0) continue;
        const s = Math.sin(Math.PI * p);
        b.oy += 0.12 * a.amp * s * (1 - 0.15 * k);
        b.oq += 0.1 * a.amp * s;
        b.orot += 0.12 * a.amp * s;
      }
      return !busy;
    },
    // no: a quick shake that dies away
    shake(a, t) {
      a.order ??= byStep();
      if (t > 0.9) return true;
      for (const b of bodies) {
        const tt = t - (a.order.get(b.i) ?? 0) * 0.045;
        if (tt < 0) continue;
        const e = Math.exp(-tt * 5) * Math.sin(tt * TAU * 5);
        b.ox += 0.1 * e;
        b.orot += 0.1 * e;
      }
      return false;
    },
    // the first square tumbles backwards, in place
    flip(a, t) {
      a.who ??= atStep(0);
      const b = a.who;
      if (!b) return true;
      const dur = 0.62,
        crouch = 0.22;
      const p = t / dur;
      if (p >= 1) {
        if (!a.landed) {
          a.landed = true;
          b.vq += 3.4;
        }
        return true;
      }
      if (p < crouch) {
        const c = Math.sin((Math.PI * p) / crouch);
        b.oy += 0.04 * c;
        b.oq += 0.2 * c;
        return false;
      }
      const u = (p - crouch) / (1 - crouch);
      b.oy -= 0.5 * 4 * u * (1 - u);
      b.orot -= (Math.PI / 2) * inOut(u);
      b.z = 1;
      return false;
    },
    // a stretch: the stair opens out and springs back
    yawn(a, t) {
      const dur = 1.1;
      if (t >= dur) return true;
      const s = Math.sin((Math.PI * t) / dur);
      spreadAdd += 0.22 * s;
      for (const b of bodies) b.oq -= 0.07 * s;
      return false;
    },
    // a glance one way, then the other
    look(a, t) {
      if (!a.glance) a.glance = rand() < 0.5 ? -1 : 1;
      if (t >= 2.8) {
        fidgetGaze = [0, 0];
        return true;
      }
      fidgetGaze = t < 1.2 ? [0.85 * a.glance, -0.2] : t < 2.2 ? [-0.55 * a.glance, 0.12] : [0, 0];
      return false;
    },
  };

  // At rest it is never frozen: every so often, one small thing.
  function fidget(): void {
    const r = rand();
    if (r < 0.3) {
      move("look");
      note("look");
    } else if (r < 0.55) {
      move("hop", { only: 2, h: 0.24, dur: 0.4 });
      note("hop");
    } else if (r < 0.75) {
      move("yawn");
      note("yawn");
    } else if (r < 0.9) {
      move("flip");
      note("flip");
    } else {
      move("nod", { amp: 0.6 });
      note("nod");
    }
  }

  // The beats: a hop at each onset of a real voice, a rhythm of its own when there is none, and a small nod each
  // time you stop talking.
  function rhythm(dt: number): void {
    if (state === "speaking") {
      if (voiceLive) {
        if (level < 0.16) onsetArmed = true;
        else if (onsetArmed && level > 0.3) {
          beatWave(Math.min(1, level * 1.2));
          onsetArmed = false;
        }
      } else if (ownRhythm && clock - lastWordAt > 1 && clock - stateAt > 0.12 && clock >= autoNextAt) {
        if (clock < autoPhraseEnd) {
          beatWave(0.35 + rand() * 0.45);
          autoNextAt = clock + 0.2 + rand() * 0.2;
        } else {
          autoPhraseEnd = clock + 0.45 + 1.4 + rand();
          autoNextAt = clock + 0.45;
        }
      }
    }
    if (state === "listening") {
      if (level > 0.26) {
        loud = true;
        quietFor = 0;
      } else if (level < 0.08) {
        quietFor += dt;
        if (loud && quietFor > 0.3) {
          move("nod", { amp: 0.55 });
          note("nod");
          loud = false;
        }
      }
    }
  }

  function schedule(): void {
    if (state === "thinking" && clock >= nextLeapAt && !moves.some((a) => a.kind === "leap")) {
      move("leap", { jumper: atStep(0) });
      note("leap");
      leaps += 1;
      nextLeapAt = clock + LEAP.dur + (leaps % 3 === 0 ? 0.55 : 0.2); // a breath after every third leap
    }
    if (fidgets && state === "idle" && clock >= nextFidgetAt && !moves.length && W.idle > 0.95) {
      fidget();
      nextFidgetAt = clock + 7 + rand() * 7;
    }
  }

  function tick(dtIn: number): void {
    const dt = dtIn > 0 ? dtIn : 0;
    clock += dt;
    for (const s of STATES) W[s] = ease(W[s], s === state ? 1 : 0, dt, 0.16);

    // the voice: yours while it listens, its own while it answers, kept for a moment so a wave can run down the stair
    const raw = state === "listening" ? heard : state === "speaking" && voiceLive ? voiced : 0;
    level = ease(level, raw, dt, raw > level ? 0.035 : 0.14);
    hist.push({ t: clock, v: level });
    if (hist.length > 120) hist.shift();

    if (!calm) {
      rhythm(dt);
      schedule();
    }

    // where it looks: at you, or wherever a glance takes it
    pointerAge += dt;
    const seen = pointer !== null && pointerAge < 2.5;
    const gt = seen && pointer ? pointer.g : fidgetGaze;
    for (let c = 0; c < 2; c++) {
      gazeV[c] += (25 * (gt[c] - gaze[c]) - 9 * gazeV[c]) * dt;
      gaze[c] += gazeV[c] * dt;
    }
    perk = ease(perk, seen && pointer?.near ? 1 : 0, dt, 0.15);

    // what the moves add this frame
    for (const b of bodies) {
      b.ox = 0;
      b.oy = 0;
      b.osc = 0;
      b.oq = 0;
      b.orot = 0;
      b.z = 0;
      b.abs = null;
      b.shadeO = null;
    }
    spreadAdd = 0;
    for (let n = moves.length - 1; n >= 0; n--) {
      const a = moves[n];
      if (MOVES[a.kind](a, clock - a.t0)) moves.splice(n, 1);
    }

    // springs toward where the state wants each square
    const spread = 1 + spreadAdd + 0.05 * perk * W.idle;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (const b of bodies) {
      const want = pose(state, b.step, level, spread);
      const ts = want.scale * (1 + 0.05 * perk * W.idle);
      const w = FOLLOW[b.step];
      b.front = want.front;
      for (let k = 0; k < steps && h > 0; k++) {
        b.vx += (w * w * (want.x - b.x) - 2 * 0.62 * w * b.vx) * h;
        b.x += b.vx * h;
        b.vy += (w * w * (want.y - b.y) - 2 * 0.62 * w * b.vy) * h;
        b.y += b.vy * h;
        b.vsc += (256 * (ts - b.sc) - 16 * b.vsc) * h;
        b.sc += b.vsc * h;
        b.vq += (576 * (0 - b.q) - 14.4 * b.vq) * h;
        b.q += b.vq * h;
        b.vrot += (144 * (want.rot - b.rot) - 16.8 * b.vrot) * h;
        b.rot += b.vrot * h;
      }
    }

    // what never stops: a breath at rest, the voice, the glance
    if (!calm) {
      const glance = W.idle + 0.4 * W.listening + 0.2 * W.speaking;
      for (const b of bodies) {
        const k = b.step;
        const br = 0.5 + 0.5 * Math.sin(clock * (TAU / 4.2) - k * 0.6);
        b.oy -= W.idle * 0.035 * br;
        b.osc += W.idle * 0.018 * br;
        const Ld = levelAt(clock - k * 0.085);
        b.oy -= W.speaking * Ld * 0.16;
        b.osc += W.speaking * Ld * 0.04;
        // the huddle sways a little, so listening never looks held
        b.ox += W.listening * (k - 1) * 0.03 * Math.sin(clock * 1.6);
        b.oy += W.listening * (k === 1 ? 0.02 : -0.015) * Math.sin(clock * 1.6 + 1);
        b.ox += gaze[0] * [0.1, 0.075, 0.05][k] * glance;
        b.oy += gaze[1] * [0.07, 0.05, 0.035][k] * glance;
        b.orot += gaze[0] * 0.07 * glance;
      }
    }
    corner = ease(corner, LAYOUT[state].corner, dt, 0.25);

    // colour: which step it stands on, and whether it is at work. Addressed, it lights up at once; done, it keeps
    // its colour through its nod and cools slowly, down the stair
    const liveNow = state === "idle" ? 0 : 1;
    const warming = liveNow > prevLive;
    for (const b of bodies) {
      const hold = warming ? b.step * 0.05 : 0.5 + b.step * 0.09;
      const target = clock - stateAt >= hold ? liveNow : prevLive;
      b.live = ease(b.live, target, dt, target > b.live ? 0.08 : 0.45);
      b.shade = b.shadeO != null ? b.shadeO : ease(b.shade, b.step, dt, 0.16);
    }

    // where each square is drawn, and how fast it is going: it stretches the way it moves
    for (const b of bodies) {
      const x = (b.abs ? b.abs[0] : b.x) + b.ox;
      const y = (b.abs ? b.abs[1] : b.y) + b.oy;
      if (b.px != null && b.py != null && dt > 0) {
        const f = 1 - Math.exp(-dt / 0.035);
        b.svx += ((x - b.px) / dt - b.svx) * f;
        b.svy += ((y - b.py) / dt - b.svy) * f;
      }
      b.px = x;
      b.py = y;
      const o = b.out;
      o.step = b.step;
      o.x = x;
      o.y = y;
      o.size = Math.max(0, b.sc + b.osc);
      o.squash = clamp(b.q + b.oq, -0.3, 0.45);
      o.rot = b.rot + b.orot;
      o.stretch = Math.min(0.2, Math.hypot(b.svx, b.svy) * 0.018);
      o.angle = Math.atan2(b.svy, b.svx);
      o.front = b.z || b.front;
      o.shade = b.shade;
      o.live = b.live;
    }
  }

  function set(next: CharacterState): boolean {
    if (!STATES.includes(next) || next === state) return false;
    const prev = state;
    prevLive = state === "idle" ? 0 : 1;
    state = next;
    stateAt = clock;
    if (!calm) {
      if (next === "listening") {
        move("hop", { h: 0.16, dur: 0.36, delay: 0.06 });
        note("perk");
        loud = false;
        quietFor = 0;
      }
      if (next === "thinking") {
        nextLeapAt = clock + 0.34;
        leaps = 0;
      }
      if (next === "speaking") {
        autoNextAt = clock + 0.2;
        autoPhraseEnd = clock + 1.6 + rand() * 0.8;
        onsetArmed = true;
        wordAt = 0;
      }
      if (next === "idle") {
        nextFidgetAt = clock + 5 + rand() * 4;
        if (prev === "speaking") {
          move("nod");
          note("nod");
        }
      }
    }
    return true;
  }

  // Reduced motion: the state's resting pose, drawn once, nothing moving.
  function still(): void {
    moves.length = 0;
    hist.length = 0;
    spreadAdd = 0;
    perk = 0;
    level = 0;
    fidgetGaze = [0, 0];
    gaze[0] = gaze[1] = gazeV[0] = gazeV[1] = 0;
    for (const s of STATES) W[s] = s === state ? 1 : 0;
    corner = LAYOUT[state].corner;
    for (const b of bodies) {
      const want = pose(state, b.step, 0, 1);
      Object.assign(b, {
        x: want.x,
        y: want.y,
        vx: 0,
        vy: 0,
        sc: want.scale,
        vsc: 0,
        q: 0,
        vq: 0,
        rot: want.rot,
        vrot: 0,
        front: want.front,
        shade: b.step,
        live: state === "idle" ? 0 : 1,
        px: null,
        py: null,
        svx: 0,
        svy: 0,
      });
    }
    prevLive = state === "idle" ? 0 : 1;
    stateAt = clock - 1;
    tick(0);
  }

  return {
    get state() {
      return state;
    },
    get clock() {
      return clock;
    },
    set,
    tick,
    still,
    hear(v) {
      heard = clamp(Number(v) || 0, 0, 1);
    },
    voice(v, live = true) {
      voiced = clamp(Number(v) || 0, 0, 1);
      voiceLive = !!live;
    },
    beat(v = 0.6) {
      if (calm) return;
      lastWordAt = clock;
      beatWave(clamp(Number(v) || 0, 0, 1));
    },
    react(kind, params = {}) {
      if (calm || !(kind in MOVES) || (kind as string) === "leap") return false;
      move(kind, params as Partial<Move>);
      note(kind);
      return true;
    },
    look(gx, gy, near) {
      if (calm) return;
      pointer = { g: [clamp(gx, -1, 1), clamp(gy, -1, 1)], near: !!near };
      pointerAge = 0;
    },
    away() {
      pointer = null;
    },
    frame() {
      return { corner, squares: bodies.map((b) => b.out) };
    },
    events() {
      return events.slice();
    },
  };
}
