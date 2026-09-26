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
 *   While nothing is heard for a moment (the person thinking, or typing slowly) it waits alive: now and then a tile
 *   behind turns, the two turn like gears or trade places, one of them takes a lap round the others, the one held
 *   forward rises, peeks down at the field or spins, the three sway, or it glances aside.
 * - Reading: an orbit. The three circle a ring tilted toward you, the nearest the largest, lifted and lightest, the
 *   farthest small and deep; the ring's axis sways, so the path traces a sphere. Leaving it, each tile keeps its speed.
 * - Answering: the tiles side by side, each word lifting one toward you and lighting it.
 * - Lit (glow): at rest, the mark where it stands in the AI's colour, with a turn or two: a page arriving on a phone.
 * Gestures scale with the drawn size (`detail`): a 7px tile in the top bar moves less than a 60px one on a phone.
 * A face nobody is near (the top bar's icon) stops breathing after `quietAfter` seconds and only turns, less often.
 * Each tile carries a charge, drawn as colour, never as motion (`light`).
 * Draw order follows elevation: the tile a state holds toward you and the nearest on the ring are the lifted ones, and
 * since elevation is a spring, the order never jumps; in the stack, where nothing is lifted, the later tile is on top.
 *
 * The character is a record over reducers. character-core.ts holds everything it knows as one value (`Core`) and
 * builds it; character-tick.ts is the frame, phase by phase; character-states.ts is what each state does, as tables
 * keyed by state; character-moves.ts is the gestures. createCharacter holds the one record and hands each call to
 * its reducer, so the API below is the whole of what a page can do to the three.
 *
 * Spec: docs/superpowers/specs/2026-09-25-the-three-in-motion-design.md.
 */
import { createCore, gainOf, signed, unit } from "./character-core";
import { enter, glowTo, landed, reaction, wordBeat } from "./character-states";
import { advance, stillPose } from "./character-tick";

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
  /** lit at rest: the mark keeps its place and takes the AI's colour, with a turn now and another soon; 0 is the ink again */
  glow(v: number): void;
  tick(dt: number): void;
  /** where every tile is now: a snapshot, untouched by later ticks */
  frame(): CharacterFrame;
  still(): void;
  events(): CharacterEvent[];
}

// the states and the mark's own measures live with the record, where the reducers read them
export { STATES, STEP, CORNER } from "./character-core";
/**
 * The box everything the tiles do stays inside, in tiles, their shadows included (measured over every state, move and
 * fidget at full size, 25 Sep): 3.78 wide (the row) and from 1.38 above to 1.83 below the centre, since shadows fall.
 * The tiles are drawn CENTRE_Y above the canvas's middle, so the ink and its shadow sit centred in 3.2.
 */
export const FIT = { w: 3.8, h: 3.2 } as const;
export const CENTRE_Y = -0.225;
export const fitSide = (w: number, h: number): number => Math.min(w / FIT.w, h / FIT.h);

/** The three: one record, and each call handed to its reducer. */
export function createCharacter(options: CharacterOptions = {}): Character {
  const st = createCore(options);
  return {
    get state() {
      return st.state;
    },
    get clock() {
      return st.clock;
    },
    set: (next) => enter(st, next),
    tick(dt) {
      advance(st, dt);
    },
    still() {
      stillPose(st);
    },
    hear(v) {
      st.heard = unit(v);
    },
    voice(v, live = true) {
      st.voiced = unit(v);
      st.voiceLive = !!live;
    },
    beat(v = 0.6) {
      wordBeat(st, v);
    },
    react: (kind) => reaction(st, kind),
    look(gx, gy, near) {
      if (st.calm) return;
      st.pointer = { g: [signed(gx), signed(gy)], near: !!near };
      st.pointerAge = 0;
    },
    away() {
      st.pointer = null;
    },
    detail(v) {
      const side = Number(v);
      if (side > 0 && Math.abs(side - st.px) > 0.01) {
        st.px = side;
        st.g = gainOf(st.px);
      }
    },
    attend(v) {
      st.attention = unit(v);
    },
    press(down) {
      st.pressDown = !!down && !st.calm;
    },
    pulse(v = 0.7) {
      landed(st, v);
    },
    glow(v) {
      glowTo(st, v);
    },
    frame() {
      return {
        corner: st.corner,
        squares: st.bodies.map((b) => ({ ...b.out })),
        liquid: st.liquid,
        awake: st.awake,
        gaze: [st.gaze[0], st.gaze[1]],
      };
    },
    events() {
      return st.events.slice();
    },
  };
}
