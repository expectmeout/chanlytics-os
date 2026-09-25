/**
 * The three: the Chanlytics mark as a character. Pure: no DOM, no clock of its own.
 *
 * Three tiles on a 45° diagonal, each over the one before by 48% and the last on top, as the agency site draws the
 * mark (Chanlytics Agency `components/primitives.jsx` `Logo`, `assets/favicon.svg`). Feed the character what happens
 * (a state, a voice level, a word, a reaction, where the pointer is, whether anyone is near), step it with tick(dt),
 * and frame() says where each tile is, in tiles from the centre, how far it is lifted toward you and how lit it is.
 *
 * Seen from above, the tiles move in depth instead of bouncing: a tile lifts toward you (a touch larger, its shadow
 * lower and softer) and sets back down. Nothing squashes and nothing wobbles: every spring is at platform grade
 * (movement ζ 0.86, size and turn ζ 0.9, elevation ζ 1).
 * - At rest: the exact mark. Now and then a tile turns a quarter in place, lifted a little as it turns: any of the
 *   three, a cascade down the stack, two turning opposite ways like gears, or the top tile half round.
 * - Listening: the middle tile comes forward and rises toward you with your voice, the other two tucked behind it.
 * - Reading: an orbit. The three circle a ring tilted toward you, the nearest the largest, lifted and lightest, the
 *   farthest small and deep; the ring's axis sways, so the path traces a sphere. Leaving it, each tile keeps its speed.
 * - Answering: the tiles side by side, each word lifting one toward you and lighting it.
 * Gestures scale with the drawn size (`detail`): a 7px tile in the top bar moves less than a 60px one on a phone.
 * A face nobody is near (the top bar's icon) stops breathing after `quietAfter` seconds and only turns, less often.
 * Each tile carries a charge, drawn as colour, never as motion (`light`).
 * Draw order follows elevation: the tile a state holds toward you and the nearest on the ring are the lifted ones, and
 * since elevation is a spring, the order never jumps; in the stack, where nothing is lifted, the later tile is on top.
 *
 * Spec: docs/superpowers/specs/2026-09-25-the-three-in-motion-design.md.
 */
import { TAU, clamp, ease, inOut, smooth } from "./math";

export type CharacterState = "idle" | "listening" | "thinking" | "speaking";
export type Reaction = "nod" | "hop" | "shake" | "flip" | "yawn" | "look";
export interface SquareFrame {
  /** its place in the stack: 0 the back, 2 the top */
  step: number;
  /** its colour step, continuous while it moves between steps */
  shade: number;
  /** 0 at rest, 1 at work */
  live: number;
  x: number;
  y: number;
  size: number;
  rot: number;
  /** light, 0 to 1: how far its colour moves toward its strongest */
  charge: number;
  /** elevation, from pressed (-0.5) through the page (0) to lifted toward you (about 1) */
  lift: number;
  /** draw order, its place in the stack plus LAYER_PER_LIFT per tile of the pose's elevation: higher is drawn on top */
  layer: number;
}
export interface CharacterFrame {
  corner: number;
  squares: SquareFrame[];
  /** 0 at rest (the exact mark), up to 1 while the tiles may fuse (listening, reading) */
  liquid: number;
  /** 1 breathing, 0 quiet (a face alone for a while) */
  awake: number;
  /** where the tiles look, -1 to 1 each way: their shadows lean the other way */
  gaze: [number, number];
}
export interface CharacterEvent {
  kind: string;
  at: number;
}
export interface CharacterOptions {
  seed?: number;
  /** grow in from the page at birth */
  enter?: boolean;
  /** turns and small moves at rest */
  fidgets?: boolean;
  /** a rhythm of its own while speaking with no beats */
  ownRhythm?: boolean;
  /** reduced motion: still poses, no moves, no rhythm */
  calm?: boolean;
  /** one tile in CSS px, as drawn; the gestures scale with it */
  detail?: number;
  /** each tile carries a charge (colour toward its strongest) */
  light?: boolean;
  /** seconds at rest, unattended, before it goes quiet (turns only, less often); Infinity never */
  quietAfter?: number;
}
export interface Character {
  readonly state: CharacterState;
  readonly clock: number;
  set(next: CharacterState): boolean;
  hear(level: number): void;
  voice(level: number, live?: boolean): void;
  beat(strength?: number): void;
  react(kind: Reaction): boolean;
  look(gx: number, gy: number, near: boolean): void;
  away(): void;
  /** one tile in CSS px, as drawn */
  detail(px: number): void;
  /** 1 while someone is near (a pointer by the button, its focus), 0 otherwise */
  attend(v: number): void;
  press(down: boolean): void;
  /** a read that landed: the orbit surges and a light runs down the stack */
  pulse(strength?: number): void;
  tick(dt: number): void;
  /** where every tile is now: a snapshot, untouched by later ticks */
  frame(): CharacterFrame;
  still(): void;
  events(): CharacterEvent[];
}

export const STATES: readonly CharacterState[] = ["idle", "listening", "thinking", "speaking"];
/** the agency mark: a step of 0.52 of a side on both axes (45°), corners 0.26 of a side */
export const STEP = 0.52;
export const CORNER = 0.26;
/**
 * The box everything the tiles do stays inside, in tiles, their shadows included (measured over every state, move and
 * fidget at full size, 25 Sep): 3.78 wide (the row) and from 1.38 above to 1.83 below the centre, since shadows fall.
 * The tiles are drawn CENTRE_Y above the canvas's middle, so the ink and its shadow sit centred in 3.2.
 */
export const FIT = { w: 3.8, h: 3.2 } as const;
export const CENTRE_Y = -0.225;
export const fitSide = (w: number, h: number): number => Math.min(w / FIT.w, h / FIT.h);

/** the position spring's frequency by place in the stack: the back settles first, the top a touch behind it */
const FOLLOW = [15, 13, 11.5] as const;
const Z_POS = 0.86;
const SIZE = { w: 18, z: 0.9 };
const TURN = { w: 14, z: 0.9 };
const LIFT = { w: 16, z: 1 };
/**
 * The orbit: a ring tilted toward you (tilt), its long axis a little down to the right like the mark's own diagonal
 * (axis), both swaying slowly (sway, nod) so the three trace a sphere; a lap in `period` seconds, the pace breathing
 * ±12%, a read that lands surging it. `depth` is how much larger the nearest tile is drawn.
 */
const ORBIT = {
  period: 2,
  R: 1.05,
  tilt: (65 * Math.PI) / 180,
  axis: (18 * Math.PI) / 180,
  sway: (8 * Math.PI) / 180,
  nod: (6 * Math.PI) / 180,
  depth: 0.14,
};
/** The three points where the tiles join the ring, a third of a lap apart: the near point, the left, the far right. */
const JOIN = [Math.PI / 3, Math.PI, (5 * Math.PI) / 3];
const PAIRINGS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
/** the ring's elevation by depth: the farthest tile a little below the page, the nearest well toward you */
const RING_LIFT = { far: 0.3, near: 0.45 };
/**
 * Draw order per tile of the pose's elevation, over its place in the stack (0 to 2). Large enough that the tile
 * listening holds toward you (lift 0.35 and up) is over the whole stack, and that two tiles on the ring that can
 * overlap (a lap apart by a third, so at least 0.2 of elevation between them) are drawn nearest on top.
 */
const LAYER_PER_LIFT = 12;

/** A point on the ring at phase `th`, the ring as it sways at time `at`: x and y in tiles, and depth z, -0.9 far to 0.9 near. */
function ring(th: number, at: number): [number, number, number] {
  const axis = ORBIT.axis + ORBIT.sway * Math.sin(at * 0.6);
  const tilt = ORBIT.tilt + ORBIT.nod * Math.sin(at * 0.45 + 1);
  const R = ORBIT.R * (1 + 0.03 * Math.sin(at * 1.3));
  const r = R * Math.cos(tilt);
  const u = Math.cos(th);
  const v = Math.sin(th);
  // the near side is down (+v)
  return [
    R * u * Math.cos(axis) - r * v * Math.sin(axis),
    R * u * Math.sin(axis) + r * v * Math.cos(axis),
    v * Math.sin(tilt),
  ];
}

interface Pose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  lift: number;
}
const slot = (k: number, spread: number): [number, number] => [(k - 1) * STEP * spread, (k - 1) * STEP * spread];
/** Where tile k wants to be in a state: position, lean, size and how far it is held toward you. */
function pose(state: CharacterState, k: number, level: number, spread: number): Pose {
  if (state === "listening") {
    if (k === 1) return { x: 0, y: -0.3 - 0.06 * level, rot: 0, scale: 1 + 0.16 * level, lift: 0.35 + 0.65 * level };
    const side = k - 1;
    return {
      x: side * (0.66 - 0.06 * level),
      y: 0.3 - 0.04 * level,
      rot: -side * 0.14,
      scale: 0.88 + 0.03 * level,
      lift: 0,
    };
  }
  if (state === "speaking") {
    return { x: (k - 1) * 1.06, y: 0.06 - 0.14 * (k - 1) * (k - 1), rot: (k - 1) * 0.05, scale: 1, lift: 0.08 };
  }
  const [x, y] = slot(k, spread);
  return { x, y, rot: 0, scale: 1, lift: 0 };
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
  rot: number;
  vrot: number;
  lf: number;
  vlf: number;
  shade: number;
  live: number;
  ox: number;
  oy: number;
  osc: number;
  orot: number;
  olift: number;
  obreath: number;
  ch: number;
  /** where it joins the ring, in radians */
  phase: number;
  /** light carried off the ring, fading */
  ech: number;
  /** where it was last drawn and how fast it was going there, so it leaves the ring at its own speed */
  pox: number;
  poy: number;
  vox: number;
  voy: number;
  out: SquareFrame;
}
type MoveKind = "turn" | "rise" | "push" | "nod" | "shake" | "stretch" | "look" | "sweep" | "wave";
interface Move {
  kind: MoveKind;
  t0: number;
  delay: number;
  dur: number;
  amp: number;
  v: number;
  dir: number;
  spin: number;
  who: Body | null;
  whoStep: number | null;
  order: Map<number, number> | null;
  glance: number;
}

export function createCharacter(options: CharacterOptions = {}): Character {
  const { seed = 7, enter = true, fidgets = true, ownRhythm = true, calm = false, light = true } = options;
  const quietAfter = options.quietAfter ?? Infinity;
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
  let corner = CORNER;
  let spreadAdd = 0;
  let perk = 0;
  let pressed = 0;
  let pressDown = false;
  const gaze: [number, number] = [0, 0];
  const gazeV = [0, 0];
  let fidgetGaze: [number, number] = [0, 0];
  let pointer: { g: [number, number]; near: boolean } | null = null;
  let pointerAge = 1e9;
  let orb = 0;
  let orbPhase = 0;
  let orbBoost = 0;
  let nextFidgetAt = 3 + rand() * 3;
  let autoNextAt = 0;
  let autoPhraseEnd = 0;
  let onsetArmed = true;
  let loud = false;
  let quietFor = 0;
  let lastWordAt = -1e9;
  let wordAt = 0;
  // size: one tile in CSS px, and how far a gesture moves at that size (45% at 6px, the whole move from 36px)
  const gainOf = (side: number) => smooth((side - 6) / 30);
  let px = options.detail ?? 16;
  let g = gainOf(px);
  const G = () => 0.45 + 0.55 * g;
  // what comes in from outside is a number or nothing
  const unit = (v: unknown) => clamp(Number(v) || 0, 0, 1);
  const signed = (v: unknown) => clamp(Number(v) || 0, -1, 1);
  let attention = 1;
  let unattended = 0;
  let awake = 1;
  let wasQuiet = false;
  let settleArmed = true;
  let liquid = 0;
  const moves: Move[] = [];
  const events: CharacterEvent[] = [];
  const entering = enter && !calm;

  const bodies: Body[] = [0, 1, 2].map((i) => {
    const [x, y] = slot(i, 1);
    return {
      i,
      step: i,
      x,
      y,
      vx: 0,
      vy: 0,
      sc: entering ? 0 : 1,
      vsc: 0,
      rot: 0,
      vrot: 0,
      lf: entering ? 0.6 : 0,
      vlf: 0,
      shade: i,
      live: 0,
      ox: 0,
      oy: 0,
      osc: 0,
      orot: 0,
      olift: 0,
      obreath: 0,
      ch: 0,
      phase: 0,
      ech: 0,
      pox: x,
      poy: y,
      vox: 0,
      voy: 0,
      out: { step: i, shade: i, live: 0, x, y, size: entering ? 0 : 1, rot: 0, charge: 0, lift: 0, layer: i },
    };
  });

  const note = (kind: string) => {
    events.push({ kind, at: clock });
    if (events.length > 40) events.shift();
  };
  const move = (kind: MoveKind, over: Partial<Move> = {}): void => {
    moves.push({
      kind,
      t0: clock,
      delay: 0,
      dur: 0.6,
      amp: 1,
      v: 1,
      dir: 1,
      spin: 0,
      who: null,
      whoStep: null,
      order: null,
      glance: 0,
      ...over,
    });
  };
  const byStep = () => new Map(bodies.map((b) => [b.i, b.step]));
  const atStep = (k: number) => bodies.find((b) => b.step === k) ?? null;
  /** the one tile a move is for: named, or the tile at a step when the move began */
  const tileOf = (a: Move) => (a.who ??= a.whoStep != null ? atStep(a.whoStep) : null);
  const sweep = (amp: number) => {
    if (light) move("sweep", { amp });
  };
  function beatWave(v: number): void {
    if (state === "speaking") {
      const k = wordAt++ % 3;
      move("push", { who: atStep(k), v: 0.5 + 0.5 * v, spin: (k - 1) * 0.7 });
    } else move("wave", { amp: 0.3 + 0.5 * v, dur: 0.34 });
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

  // Each move adds to the tiles' offsets for this frame, and says when it is finished.
  const MOVES: Record<MoveKind, (a: Move, t: number) => boolean> = {
    // a quarter turn (or a half) in place, lifted a little while it turns
    turn(a, t) {
      const b = tileOf(a);
      if (!b) return true;
      const p = (t - a.delay) / a.dur;
      if (p < 0) return false;
      if (p >= 1) return true;
      b.orot += a.dir * a.amp * (Math.PI / 2) * inOut(p);
      b.olift += 0.5 * Math.sin(Math.PI * p);
      b.ch += 0.22 * Math.sin(Math.PI * p);
      return false;
    },
    // a tile rises toward you and sets back down
    rise(a, t) {
      const b = tileOf(a);
      if (!b) return true;
      const p = (t - a.delay) / a.dur;
      if (p < 0) return false;
      if (p >= 1) return true;
      const s = Math.sin(Math.PI * p);
      b.olift += 0.9 * a.amp * s;
      b.oy -= 0.05 * a.amp * s * G();
      return false;
    },
    // a word: its tile lifts toward you and lights
    push(a, t) {
      const b = a.who;
      if (!b) return true;
      const p = t / 0.36;
      if (p >= 1) return true;
      const s = Math.sin(Math.PI * p);
      b.olift += 0.6 * a.v * s;
      b.oy -= 0.14 * a.v * s * G();
      b.orot += a.spin * 0.12 * a.v * s;
      b.ch += 0.7 * a.v * s;
      return false;
    },
    // a lift running down the stack: a word heard, a perk, a wake
    wave(a, t) {
      a.order ??= byStep();
      let busy = false;
      for (const b of bodies) {
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
    nod(a, t) {
      a.order ??= byStep();
      let busy = false;
      for (const b of bodies) {
        const k = a.order.get(b.i) ?? 0;
        const p = (t - k * 0.07) / 0.42;
        if (p >= 1) continue;
        busy = true;
        if (p < 0) continue;
        const s = Math.sin(Math.PI * p);
        b.olift -= 0.35 * a.amp * s;
        b.oy += 0.05 * a.amp * s * G();
        b.orot += 0.06 * a.amp * s;
      }
      return !busy;
    },
    // no: one short shiver
    shake(a, t) {
      a.order ??= byStep();
      if (t > 0.75) return true;
      for (const b of bodies) {
        const tt = t - (a.order.get(b.i) ?? 0) * 0.045;
        if (tt < 0) continue;
        const e = Math.exp(-tt * 6.5) * Math.sin(tt * TAU * 3.2);
        b.ox += 0.05 * e * G();
        b.orot += 0.04 * e;
      }
      return false;
    },
    // the stack fans out a little and closes
    stretch(a, t) {
      const dur = 1.2;
      if (t >= dur) return true;
      const s = Math.sin((Math.PI * t) / dur);
      spreadAdd += 0.14 * G() * s;
      for (const b of bodies) b.olift += 0.2 * s;
      return false;
    },
    // a glance one way, then the other
    look(a, t) {
      if (!a.glance) a.glance = rand() < 0.5 ? -1 : 1;
      if (t >= 2.6) {
        fidgetGaze = [0, 0];
        return true;
      }
      fidgetGaze = t < 1.1 ? [0.7 * a.glance, -0.2] : t < 2.0 ? [-0.45 * a.glance, 0.12] : [0, 0];
      return false;
    },
    // light running down the stack: a read landed, an answer done, a wake
    sweep(a, t) {
      a.order ??= byStep();
      let busy = false;
      for (const b of bodies) {
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

  const turnOne = (k: number, dir: number, amp = 1, delay = 0) =>
    move("turn", { whoStep: k, dir, amp, delay, dur: amp > 1 ? 0.85 : 0.62 });
  /** One of the turns at rest: any tile, a cascade down the stack, a pair like gears, or the top tile half round. */
  function turns(weights: [number, number, number]): string {
    const r = rand();
    const dir = rand() < 0.5 ? 1 : -1;
    if (r < weights[0]) {
      turnOne(Math.floor(rand() * 3), dir);
      return "turn";
    }
    if (r < weights[1]) {
      [0, 1, 2].forEach((k) => turnOne(k, dir, 1, k * 0.13));
      return "cascade";
    }
    if (r < weights[2]) {
      const k = rand() < 0.5 ? 0 : 1;
      turnOne(k, dir);
      turnOne(k + 1, -dir);
      return "gears";
    }
    turnOne(2, dir, 2);
    return "half turn";
  }
  // At rest: mostly turns, across all three; a quiet face only turns.
  function fidget(quiet: boolean): void {
    if (quiet) {
      note(turns([0.6, 0.85, 1]));
      return;
    }
    const r = rand();
    if (r < 0.7) note(turns([0.46, 0.71, 0.89]));
    else if (r < 0.8) {
      move("look");
      note("look");
    } else if (r < 0.88) {
      move("rise", { whoStep: 2, dur: 0.55 });
      note("rise");
    } else if (r < 0.95) {
      move("stretch");
      note("stretch");
    } else {
      move("nod", { amp: 0.6 });
      note("nod");
    }
  }

  // The beats: a lift at each onset of a real voice, a rhythm of its own when there is none, a bow after a phrase.
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
          move("nod", { amp: 0.45 });
          note("nod");
          loud = false;
        }
      }
    }
  }

  function schedule(): void {
    if (fidgets && state === "idle" && clock >= nextFidgetAt && !moves.length && W.idle > 0.95) {
      const quiet = awake < 0.5;
      fidget(quiet);
      nextFidgetAt = clock + (quiet ? 14 + rand() * 10 : 6 + rand() * 5);
    }
  }

  function tick(dtIn: number): void {
    const dt = dtIn > 0 ? dtIn : 0;
    clock += dt;
    for (const s of STATES) W[s] = ease(W[s], s === state ? 1 : 0, dt, 0.16);

    // attention: at rest and unattended for quietAfter seconds it stops breathing, with a stretch as it settles
    if (state !== "idle" || attention > 0.5) {
      unattended = 0;
      settleArmed = true;
    } else unattended += dt;
    if (settleArmed && !calm && Number.isFinite(quietAfter) && unattended > quietAfter - 1.25 && !moves.length) {
      settleArmed = false;
      move("stretch");
      note("settle");
    }
    const wantAwake = unattended < quietAfter ? 1 : 0;
    if (awake < 0.2) wasQuiet = true;
    awake = ease(awake, wantAwake, dt, wantAwake > awake ? 0.2 : 1.1);
    if (wasQuiet && awake > 0.6 && !calm) {
      // woken: the stack rises toward you and a light runs down it
      wasQuiet = false;
      move("wave", { amp: 0.7, dur: 0.42 });
      sweep(0.45);
      note("wake");
      nextFidgetAt = clock + 2.5 + rand() * 2;
    }

    // the voice: yours while it listens, its own while it answers, kept a moment so a wave can run down the stack
    const raw = state === "listening" ? heard : state === "speaking" && voiceLive ? voiced : 0;
    level = ease(level, raw, dt, raw > level ? 0.035 : 0.14);
    hist.push({ t: clock, v: level });
    if (hist.length > 120) hist.shift();

    if (!calm) {
      rhythm(dt);
      schedule();
    }

    // where it looks: at you, when you are near, or wherever a glance takes it
    pointerAge += dt;
    const seen = pointer !== null && pointerAge < 2.5;
    const gt = seen && pointer ? pointer.g : fidgetGaze;
    for (let c = 0; c < 2; c++) {
      gazeV[c] += (36 * (gt[c] - gaze[c]) - 12 * gazeV[c]) * dt;
      gaze[c] += gazeV[c] * dt;
    }
    perk = ease(perk, seen && pointer?.near ? 1 : 0, dt, 0.15);
    pressed = ease(pressed, pressDown ? 1 : 0, dt, pressDown ? 0.05 : 0.12);

    for (const b of bodies) {
      b.ox = 0;
      b.oy = 0;
      b.osc = 0;
      b.orot = 0;
      b.olift = 0;
      b.obreath = 0;
      b.ch = 0;
    }
    spreadAdd = 0;
    for (let n = moves.length - 1; n >= 0; n--) {
      const a = moves[n];
      if (MOVES[a.kind](a, clock - a.t0)) moves.splice(n, 1);
    }

    // springs toward where the state wants each tile
    const spread = 1 + spreadAdd + (0.04 * perk - 0.06 * pressed) * W.idle;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (const b of bodies) {
      const want = pose(state, b.step, level, spread);
      const tl = want.lift + (0.25 * perk - 0.4 * pressed) * W.idle;
      const w = FOLLOW[clamp(b.step, 0, 2)];
      for (let k = 0; k < steps && h > 0; k++) {
        b.vx += (w * w * (want.x - b.x) - 2 * Z_POS * w * b.vx) * h;
        b.x += b.vx * h;
        b.vy += (w * w * (want.y - b.y) - 2 * Z_POS * w * b.vy) * h;
        b.y += b.vy * h;
        b.vsc += (SIZE.w * SIZE.w * (want.scale - b.sc) - 2 * SIZE.z * SIZE.w * b.vsc) * h;
        b.sc += b.vsc * h;
        b.vrot += (TURN.w * TURN.w * (want.rot - b.rot) - 2 * TURN.z * TURN.w * b.vrot) * h;
        b.rot += b.vrot * h;
        b.vlf += (LIFT.w * LIFT.w * (tl - b.lf) - 2 * LIFT.z * LIFT.w * b.vlf) * h;
        b.lf += b.vlf * h;
      }
    }

    // what never stops while it is awake: a breath of elevation, the voice, the glance
    if (!calm) {
      const glance = (W.idle + 0.4 * W.listening + 0.2 * W.speaking) * (0.55 + 0.3 * g);
      for (const b of bodies) {
        const k = clamp(b.step, 0, 2);
        // the shadows rise and settle down the stack; the tiles themselves stay put
        const br = 0.5 + 0.5 * (0.65 * Math.sin(clock * 1.43 - k * 0.7) + 0.35 * Math.sin(clock * 0.83 + k * 1.1));
        b.obreath += W.idle * awake * 0.16 * br;
        if (light) {
          // the standby light: every 6.5 s a little charge runs down the stack
          const p = (((clock / 6.5 - k * 0.1) % 1) + 1) % 1;
          b.ch += W.idle * awake * 0.22 * (p < 0.34 ? Math.sin((Math.PI * p) / 0.34) ** 2 : 0);
        }
        const Ld = levelAt(clock - k * 0.085);
        b.oy -= W.speaking * Ld * 0.1 * G();
        b.olift += W.speaking * Ld * 0.3;
        if (light) b.ch += W.speaking * Ld * 0.3 + W.listening * level * (k === 1 ? 0.6 : 0.25);
        const sway = 0.65 * Math.sin(clock * 1.6) + 0.35 * Math.sin(clock * 0.97 + 2);
        b.ox += W.listening * (k - 1) * 0.02 * sway;
        // parallax: the top of the stack moves most toward where it looks
        b.ox += gaze[0] * [0.03, 0.05, 0.07][k] * glance;
        b.oy += gaze[1] * [0.025, 0.04, 0.055][k] * glance;
        b.orot += gaze[0] * 0.03 * glance;
      }
    }
    corner = ease(corner, state === "listening" ? 0.28 : CORNER, dt, 0.25);
    liquid = ease(liquid, clamp(W.listening * 0.75 + W.thinking + W.speaking * 0.2, 0, 1), dt, 0.2);

    // colour: its step, and whether it is at work. Addressed, it lights at once; done, it keeps its colour through
    // its bow and cools slowly, down the stack
    const liveNow = state === "idle" ? 0 : 1;
    const warming = liveNow > prevLive;
    for (const b of bodies) {
      const k = clamp(b.step, 0, 2);
      const hold = warming ? k * 0.05 : 0.5 + k * 0.09;
      const target = clock - stateAt >= hold ? liveNow : prevLive;
      b.live = ease(b.live, target, dt, target > b.live ? 0.08 : 0.45);
      b.shade = ease(b.shade, k, dt, 0.16);
    }

    // the orbit: joined over a quarter second and spinning up as the tiles arrive, then a lap in ORBIT.period, the
    // pace breathing and surging
    if (state === "thinking" && !calm) orb = ease(orb, 1, dt, 0.26);
    if (orb > 0) {
      orbBoost = ease(orbBoost, 0, dt, 0.4);
      orbPhase += dt * (TAU / ORBIT.period) * (1 + 0.12 * Math.sin(clock * 0.9)) * (1 + orbBoost) * orb;
    }

    for (const b of bodies) {
      const o = b.out;
      // the pose's elevation (what the draw order follows), and with the gestures on it
      let held = b.lf;
      let lift = Math.max(-0.5, b.lf + b.olift);
      let x = b.x + b.ox;
      let y = b.y + b.oy;
      let size = b.sc + b.osc + 0.05 * Math.max(0, lift);
      let shade = b.shade;
      let charge = b.ch + b.ech;
      if (orb > 0) {
        const [rx, ry, z] = ring(b.phase + orbPhase, clock);
        const near = RING_LIFT.far + RING_LIFT.near * z;
        x += (rx - x) * orb;
        y += (ry - y) * orb;
        size *= 1 + ORBIT.depth * z * orb;
        held += (near - held) * orb;
        lift += (near - lift) * orb;
        shade += (1 + z - shade) * orb;
        charge += orb * (0.12 + 0.35 * Math.max(0, z));
      }
      b.ech = ease(b.ech, 0, dt, 0.35);
      if (dt > 0) {
        const f = 1 - Math.exp(-dt / 0.03);
        b.vox += ((x - b.pox) / dt - b.vox) * f;
        b.voy += ((y - b.poy) / dt - b.voy) * f;
      }
      b.pox = x;
      b.poy = y;
      o.step = b.step;
      o.x = x;
      o.y = y;
      o.size = Math.max(0, size);
      o.rot = b.rot + b.orot;
      o.shade = clamp(shade, 0, 2);
      o.live = b.live;
      o.charge = light ? clamp(charge, 0, 1) : 0;
      o.lift = Math.max(-0.5, lift + b.obreath);
      o.layer = b.step + LAYER_PER_LIFT * held;
    }
  }

  /** The tiles by how far toward you each is held, nearest first (its place in the stack breaks a tie). */
  const byDepth = () => bodies.slice().sort((a, b) => b.lf - a.lf || b.step - a.step);

  // Joining the ring: each tile takes the point nearest it, in depth as well as on the page, except that two tiles
  // that overlap now never trade depths on the way (the stack's top stays nearest, its back goes farthest), so the
  // order they are drawn in holds while they can be seen over each other.
  function join(): void {
    const points = JOIN.map((th) => ring(th, clock));
    const apart = (b: Body, [px, py, z]: [number, number, number]) =>
      (b.x - px) ** 2 + (b.y - py) ** 2 + (2 * (b.lf - (RING_LIFT.far + RING_LIFT.near * z))) ** 2;
    const overlapping = (a: Body, b: Body) => Math.abs(a.out.x - b.out.x) < 0.9 && Math.abs(a.out.y - b.out.y) < 0.9;
    const cost = (pairing: number[]) => {
      let sum = 0;
      for (let i = 0; i < 3; i++) {
        sum += apart(bodies[i], points[pairing[i]]);
        for (let j = i + 1; j < 3; j++) {
          const traded =
            (bodies[i].out.layer - bodies[j].out.layer) * (points[pairing[i]][2] - points[pairing[j]][2]) < 0;
          if (traded && overlapping(bodies[i], bodies[j])) sum += 10;
        }
      }
      return sum;
    };
    let best = PAIRINGS[0];
    for (const pairing of PAIRINGS) if (cost(pairing) < cost(best)) best = pairing;
    bodies.forEach((b, i) => (b.phase = JOIN[best[i]]));
    orbPhase = 0;
    orbBoost = 0;
  }

  // Leaving the ring: each tile keeps where it is, how fast it is going and how far it is toward you, and the springs
  // take it into the next formation. Each takes the place that fits its depth, so the order they are drawn in never
  // has to change while they overlap: the nearest becomes the top of the stack, or the tile held forward while
  // listening; the row is taken left to right.
  function release(next: CharacterState): void {
    for (const b of bodies) {
      const o = b.out;
      b.lf = o.lift - b.obreath;
      b.x = o.x - b.ox;
    }
    const near = byDepth();
    if (next === "speaking") {
      bodies
        .slice()
        .sort((a, b) => a.x - b.x)
        .forEach((b, k) => (b.step = k));
    } else if (next === "listening") {
      near[0].step = 1;
      const sides = near.slice(1).sort((a, b) => a.x - b.x);
      sides[0].step = 0;
      sides[1].step = 2;
    } else near.forEach((b, k) => (b.step = 2 - k));
    for (const b of bodies) {
      const o = b.out;
      b.y = o.y - b.oy;
      b.vx = b.vox;
      b.vy = b.voy;
      b.vlf = 0;
      b.sc = Math.max(0, o.size - 0.05 * Math.max(0, b.lf));
      b.vsc = 0;
      b.shade = o.shade;
      b.ech = Math.max(0, o.charge - clamp(b.ch, 0, 1));
    }
    orb = 0;
  }

  function set(next: CharacterState): boolean {
    if (!STATES.includes(next) || next === state) return false;
    const prev = state;
    if (prev === "thinking" && orb > 0) release(next);
    prevLive = state === "idle" ? 0 : 1;
    state = next;
    stateAt = clock;
    unattended = 0;
    if (!calm) {
      if (next === "listening") {
        move("wave", { amp: 0.6, dur: 0.36 });
        note("perk");
        loud = false;
        quietFor = 0;
      }
      if (next === "thinking") join();
      if (next === "speaking") {
        autoNextAt = clock + 0.2;
        autoPhraseEnd = clock + 1.6 + rand() * 0.8;
        onsetArmed = true;
        wordAt = 0;
      }
      if (next === "idle") {
        nextFidgetAt = clock + 3 + rand() * 3;
        if (prev === "speaking") {
          move("nod", { amp: 0.8 });
          sweep(0.55);
          note("nod");
        }
      }
    }
    return true;
  }

  // Reduced motion: the state's pose, drawn once, nothing moving; reading's is the ring, still.
  function still(): void {
    moves.length = 0;
    hist.length = 0;
    spreadAdd = 0;
    perk = 0;
    pressed = 0;
    level = 0;
    liquid = 0;
    fidgetGaze = [0, 0];
    gaze[0] = gaze[1] = gazeV[0] = gazeV[1] = 0;
    for (const s of STATES) W[s] = s === state ? 1 : 0;
    corner = state === "listening" ? 0.28 : CORNER;
    orb = state === "thinking" ? 1 : 0;
    bodies
      .slice()
      .sort((a, b) => a.step - b.step)
      .forEach((b, k) => {
        b.step = k;
        b.ech = 0;
        const want = pose(state, k, 0, 1);
        Object.assign(b, {
          x: want.x,
          y: want.y,
          vx: 0,
          vy: 0,
          sc: want.scale,
          vsc: 0,
          rot: want.rot,
          vrot: 0,
          lf: want.lift,
          vlf: 0,
          shade: k,
          live: state === "idle" ? 0 : 1,
        });
      });
    join();
    prevLive = state === "idle" ? 0 : 1;
    stateAt = clock - 1;
    tick(0);
    for (const b of bodies) {
      b.pox = b.out.x;
      b.poy = b.out.y;
      b.vox = 0;
      b.voy = 0;
    }
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
      heard = unit(v);
    },
    voice(v, live = true) {
      voiced = unit(v);
      voiceLive = !!live;
    },
    beat(v = 0.6) {
      if (calm) return;
      lastWordAt = clock;
      beatWave(unit(v));
    },
    react(kind) {
      if (calm) return false;
      if (kind === "flip") note(turns([0.4, 0.65, 0.85]));
      else if (kind === "hop") move("rise", { whoStep: 2, dur: 0.55 });
      else if (kind === "yawn") move("stretch");
      else if (kind === "nod") move("nod");
      else if (kind === "shake") move("shake");
      else if (kind === "look") move("look");
      else return false;
      if (kind !== "flip") note(kind);
      return true;
    },
    look(gx, gy, near) {
      if (calm) return;
      pointer = { g: [signed(gx), signed(gy)], near: !!near };
      pointerAge = 0;
    },
    away() {
      pointer = null;
    },
    detail(v) {
      const side = Number(v);
      if (side > 0 && Math.abs(side - px) > 0.01) {
        px = side;
        g = gainOf(px);
      }
    },
    attend(v) {
      attention = unit(v);
    },
    press(down) {
      pressDown = !!down && !calm;
    },
    pulse(v = 0.7) {
      if (calm) return;
      const strength = unit(v);
      if (state === "thinking") orbBoost = Math.max(orbBoost, 0.7 * strength);
      sweep(strength);
      note("pulse");
    },
    frame() {
      return { corner, squares: bodies.map((b) => ({ ...b.out })), liquid, awake, gaze: [gaze[0], gaze[1]] };
    },
    events() {
      return events.slice();
    },
  };
}
