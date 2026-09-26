/**
 * The three's record: everything the character knows, as one value, with the mark's geometry and the little verbs
 * every reducer uses.
 *
 * createCharacter (character.ts) holds one `Core` and hands it to the reducers: the frame (character-tick.ts), what
 * each state does (character-states.ts) and the gestures (character-moves.ts). Each is `(record, input) → record`,
 * changing the record in place and returning it, so a tick never allocates a second copy of the three. Nothing here
 * reads a clock, the DOM or Math.random: the one roll is seeded and its state is a field of the record, so a record
 * and a script of inputs give the same frames every time (the tests under tests/shell/mascot rely on it).
 */
import type { CharacterEvent, CharacterOptions, CharacterState, SquareFrame } from "./character";
import { clamp, smooth } from "./math";

export const STATES: readonly CharacterState[] = ["idle", "listening", "thinking", "speaking"];
/** the agency mark: a step of 0.52 of a side on both axes (45°), corners 0.26 of a side */
export const STEP = 0.52;
export const CORNER = 0.26;

/** the position spring's frequency by place in the stack: the back settles first, the top a touch behind it */
export const FOLLOW = [15, 13, 11.5] as const;
export const Z_POS = 0.86;
export const SIZE = { w: 18, z: 0.9 };
export const TURN = { w: 14, z: 0.9 };
export const LIFT = { w: 16, z: 1 };
/**
 * The orbit: a ring tilted toward you (tilt), its long axis a little down to the right like the mark's own diagonal
 * (axis), both swaying slowly (sway, nod) so the three trace a sphere; a lap in `period` seconds, the pace breathing
 * ±12%, a read that lands surging it. `depth` is how much larger the nearest tile is drawn.
 */
export const ORBIT = {
  period: 2,
  R: 1.05,
  tilt: (65 * Math.PI) / 180,
  axis: (18 * Math.PI) / 180,
  sway: (8 * Math.PI) / 180,
  nod: (6 * Math.PI) / 180,
  depth: 0.14,
};
/** The three points where the tiles join the ring, a third of a lap apart: the near point, the left, the far right. */
export const JOIN = [Math.PI / 3, Math.PI, (5 * Math.PI) / 3];
export const PAIRINGS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
/** the ring's elevation by depth: the farthest tile a little below the page, the nearest well toward you */
export const RING_LIFT = { far: 0.3, near: 0.45 };
/**
 * Draw order per tile of the pose's elevation, over its place in the stack (0 to 2). Large enough that the tile
 * listening holds toward you (lift 0.35 and up) is over the whole stack, and that two tiles on the ring that can
 * overlap (a lap apart by a third, so at least 0.2 of elevation between them) are drawn nearest on top.
 */
export const LAYER_PER_LIFT = 12;

/** A point on the ring at phase `th`, the ring as it sways at time `at`: x and y in tiles, and depth z, -0.9 far to 0.9 near. */
export function ring(th: number, at: number): [number, number, number] {
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
export const slot = (k: number, spread: number): [number, number] => [(k - 1) * STEP * spread, (k - 1) * STEP * spread];
/** Where tile k wants to be in a state: position, lean, size and how far it is held toward you. */
export function pose(state: CharacterState, k: number, level: number, spread: number): Pose {
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

export interface Body {
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
export type MoveKind =
  "turn" | "rise" | "push" | "nod" | "shake" | "stretch" | "look" | "sweep" | "wave" | "lap" | "swap" | "peek" | "sway";
export interface Move {
  kind: MoveKind;
  t0: number;
  delay: number;
  dur: number;
  amp: number;
  v: number;
  dir: number;
  spin: number;
  who: Body | null;
  /** the other tile of a pair (a swap) */
  who2: Body | null;
  /** a step to the side while it turns, in tiles: a tile behind shows its turn beyond the others */
  out: number;
  whoStep: number | null;
  order: Map<number, number> | null;
  glance: number;
}

/** Everything the three know: the record every reducer takes and returns. */
export interface Core {
  // what it was made with
  readonly fidgets: boolean;
  readonly ownRhythm: boolean;
  readonly calm: boolean;
  readonly light: boolean;
  readonly quietAfter: number;
  /** the roll's state (mulberry32): the seed at birth, then wherever the rolls have taken it */
  seed: number;
  // where it is
  state: CharacterState;
  stateAt: number;
  prevLive: number;
  clock: number;
  /** how far into each state it is, eased: the weights the poses blend by */
  W: Record<CharacterState, number>;
  // the voice: yours, its own, and the level drawn
  heard: number;
  voiced: number;
  voiceLive: boolean;
  level: number;
  hist: { t: number; v: number }[];
  // the pose
  corner: number;
  spreadAdd: number;
  perk: number;
  pressed: number;
  pressDown: boolean;
  gaze: [number, number];
  gazeV: [number, number];
  fidgetGaze: [number, number];
  pointer: { g: [number, number]; near: boolean } | null;
  pointerAge: number;
  // the ring
  orb: number;
  orbPhase: number;
  orbBoost: number;
  // the fidgets and the beats
  nextFidgetAt: number;
  autoNextAt: number;
  autoPhraseEnd: number;
  onsetArmed: boolean;
  loud: boolean;
  quietFor: number;
  lastWordAt: number;
  wordAt: number;
  // size: one tile in CSS px, and how far a gesture moves at that size (45% at 6px, the whole move from 36px)
  px: number;
  g: number;
  // attention: 1 while someone is near; quiet after quietAfter seconds alone
  attention: number;
  unattended: number;
  awake: number;
  wasQuiet: boolean;
  settleArmed: boolean;
  liquid: number;
  // lit at rest (glow): the colour the tiles hold while idle, eased
  lit: number;
  litTarget: number;
  moves: Move[];
  events: CharacterEvent[];
  bodies: Body[];
}

export const gainOf = (side: number): number => smooth((side - 6) / 30);
/** how far a gesture moves at the size drawn */
export const gain = (st: Core): number => 0.45 + 0.55 * st.g;
// what comes in from outside is a number or nothing
export const unit = (v: unknown): number => clamp(Number(v) || 0, 0, 1);
export const signed = (v: unknown): number => clamp(Number(v) || 0, -1, 1);

function tileAt(i: number, entering: boolean): Body {
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
}

/** The record at birth: at rest, the exact mark (or grown in from nothing when entering), its first fidget rolled. */
export function createCore(options: CharacterOptions): Core {
  const { seed = 7, enter = true, fidgets = true, ownRhythm = true, calm = false, light = true } = options;
  const entering = enter && !calm;
  const px = options.detail ?? 16;
  const st: Core = {
    fidgets,
    ownRhythm,
    calm,
    light,
    quietAfter: options.quietAfter ?? Infinity,
    seed: seed >>> 0,
    state: "idle",
    stateAt: 0,
    prevLive: 0,
    clock: 0,
    W: { idle: 1, listening: 0, thinking: 0, speaking: 0 },
    heard: 0,
    voiced: 0,
    voiceLive: false,
    level: 0,
    hist: [],
    corner: CORNER,
    spreadAdd: 0,
    perk: 0,
    pressed: 0,
    pressDown: false,
    gaze: [0, 0],
    gazeV: [0, 0],
    fidgetGaze: [0, 0],
    pointer: null,
    pointerAge: 1e9,
    orb: 0,
    orbPhase: 0,
    orbBoost: 0,
    nextFidgetAt: 0,
    autoNextAt: 0,
    autoPhraseEnd: 0,
    onsetArmed: true,
    loud: false,
    quietFor: 0,
    lastWordAt: -1e9,
    wordAt: 0,
    px,
    g: gainOf(px),
    attention: 1,
    unattended: 0,
    awake: 1,
    wasQuiet: false,
    settleArmed: true,
    liquid: 0,
    lit: 0,
    litTarget: 0,
    moves: [],
    events: [],
    bodies: [0, 1, 2].map((i) => tileAt(i, entering)),
  };
  st.nextFidgetAt = 3 + roll(st) * 3;
  return st;
}

/** The seeded roll, 0 to 1: mulberry32 over the record's `seed`, so the same seed turns the same way every time. */
export function roll(st: Core): number {
  st.seed = (st.seed + 0x6d2b79f5) >>> 0;
  let t = st.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function note(st: Core, kind: string): void {
  st.events.push({ kind, at: st.clock });
  if (st.events.length > 40) st.events.shift();
}
export function move(st: Core, kind: MoveKind, over: Partial<Move> = {}): void {
  st.moves.push({
    kind,
    t0: st.clock,
    delay: 0,
    dur: 0.6,
    amp: 1,
    v: 1,
    dir: 1,
    spin: 0,
    who: null,
    who2: null,
    out: 0,
    whoStep: null,
    order: null,
    glance: 0,
    ...over,
  });
}
export const byStep = (st: Core): Map<number, number> => new Map(st.bodies.map((b) => [b.i, b.step]));
export const atStep = (st: Core, k: number): Body | null => st.bodies.find((b) => b.step === k) ?? null;
/** the one tile a move is for: named, or the tile at a step when the move began */
export const tileOf = (st: Core, a: Move): Body | null => (a.who ??= a.whoStep != null ? atStep(st, a.whoStep) : null);
/** light running down the stack, where the tiles carry a charge */
export function sweep(st: Core, amp: number): void {
  if (st.light) move(st, "sweep", { amp });
}
/** a beat: while answering, the next tile along the row lifts and lights; otherwise a lift runs down the stack */
export function beatWave(st: Core, v: number): void {
  if (st.state === "speaking") {
    const k = st.wordAt++ % 3;
    move(st, "push", { who: atStep(st, k), v: 0.5 + 0.5 * v, spin: (k - 1) * 0.7 });
  } else move(st, "wave", { amp: 0.3 + 0.5 * v, dur: 0.34 });
}
/** the level a moment ago, read off the history: what a tile further down the stack lifts to */
export function levelAt(st: Core, t: number): number {
  for (let n = st.hist.length - 1; n >= 0; n--) {
    const a = st.hist[n];
    if (a.t <= t) {
      const b = st.hist[n + 1];
      return b && b.t > a.t ? a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t)) : a.v;
    }
  }
  return st.hist.length ? st.hist[0].v : 0;
}
