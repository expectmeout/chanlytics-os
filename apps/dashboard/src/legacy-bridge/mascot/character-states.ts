/**
 * What each state does, as tables keyed by state: on entry (ENTER), the beats it keeps each frame (RHYTHM), and what
 * it does once it has been still long enough to look alive (SCHEDULE: the turns at rest, the waits while listening).
 * With them, the two decision tables the rolls pick from (FIDGETS, WAITS), the join and the leave of the reading
 * ring, and what each event a page sends does: a state change, a reaction, a glow, a read that landed, a word.
 *
 * Every function is a reducer over the record (character-core.ts): `(record, input) → record`, or what the API
 * answers. The order of the rolls inside each one is the order the closure rolled them in, so a seed still gives the
 * same turns.
 */
import { clamp } from "./math";
import type { CharacterState, Reaction } from "./character";
import {
  JOIN,
  PAIRINGS,
  RING_LIFT,
  STATES,
  beatWave,
  move,
  note,
  ring,
  roll,
  sweep,
  unit,
  type Body,
  type Core,
} from "./character-core";

/** A choice by a roll: each row is the top of its band of the roll and what happens there; the last row takes the rest. */
type Band<T> = readonly [number, T];
const under = <T>(bands: readonly Band<T>[], r: number): T =>
  (bands.find(([top]) => r < top) ?? bands[bands.length - 1])[1];

const turnOne = (st: Core, k: number, dir: number, amp = 1, delay = 0): void =>
  move(st, "turn", { whoStep: k, dir, amp, delay, dur: amp > 1 ? 0.85 : 0.62 });
/** One of the turns at rest: any tile, a cascade down the stack, a pair like gears, or the top tile half round. */
function turns(st: Core, weights: [number, number, number]): string {
  const r = roll(st);
  const dir = roll(st) < 0.5 ? 1 : -1;
  if (r < weights[0]) {
    turnOne(st, Math.floor(roll(st) * 3), dir);
    return "turn";
  }
  if (r < weights[1]) {
    [0, 1, 2].forEach((k) => turnOne(st, k, dir, 1, k * 0.13));
    return "cascade";
  }
  if (r < weights[2]) {
    const k = roll(st) < 0.5 ? 0 : 1;
    turnOne(st, k, dir);
    turnOne(st, k + 1, -dir);
    return "gears";
  }
  turnOne(st, 2, dir, 2);
  return "half turn";
}

/** At rest: mostly turns, across all three; now and then a glance, the top tile rising, a stretch, a bow. */
const FIDGETS: readonly Band<(st: Core) => void>[] = [
  [0.7, (st) => note(st, turns(st, [0.46, 0.71, 0.89]))],
  [
    0.8,
    (st) => {
      move(st, "look");
      note(st, "look");
    },
  ],
  [
    0.88,
    (st) => {
      move(st, "rise", { whoStep: 2, dur: 0.55 });
      note(st, "rise");
    },
  ],
  [
    0.95,
    (st) => {
      move(st, "stretch");
      note(st, "stretch");
    },
  ],
  [
    1,
    (st) => {
      move(st, "nod", { amp: 0.6 });
      note(st, "nod");
    },
  ],
];
// a quiet face only turns
function fidget(st: Core, quiet: boolean): void {
  if (quiet) {
    note(st, turns(st, [0.6, 0.85, 1]));
    return;
  }
  under(FIDGETS, roll(st))(st);
}

// a tile behind turns stepped out to its side, since in the fused pose it is mostly hidden
const behind = (st: Core, k: number, d: number): void =>
  move(st, "turn", { whoStep: k, dir: d, dur: 0.62, out: (k - 1) * 0.3 });
/**
 * Listening with nothing heard for a while: a move fit for the pose, so the three look alive while they wait
 * (Ruben, 25 Sep: "while typing or thinking what to type", then "other states like the spinning, the old one where
 * the block went to the right to loop"). The tiles tucked behind turn as they do at rest, alone or as gears, or
 * trade places; one of them takes a lap round the others; the one held forward rises a little, peeks down at the
 * field or spins right round; the three sway; or a glance. A lap, a swap or a spin about once in three, the rest the
 * small ones. More often than at rest, since the person is looking at them.
 */
const WAITS: readonly Band<(st: Core, dir: number) => void>[] = [
  [
    0.2,
    (st, dir) => {
      behind(st, roll(st) < 0.5 ? 0 : 2, dir);
      note(st, "turn");
    },
  ],
  [
    0.3,
    (st, dir) => {
      behind(st, 0, dir);
      behind(st, 2, -dir);
      note(st, "gears");
    },
  ],
  [
    0.38,
    (st) => {
      move(st, "rise", { whoStep: 1, amp: 0.9, dur: 0.7 });
      note(st, "rise");
    },
  ],
  [
    0.44,
    (st) => {
      move(st, "look");
      note(st, "look");
    },
  ],
  [
    0.56,
    (st, dir) => {
      move(st, "peek", { whoStep: 1, dir, dur: 0.9 });
      note(st, "peek");
    },
  ],
  [
    0.66,
    (st, dir) => {
      move(st, "sway", { dir, dur: 1.6 });
      note(st, "sway");
    },
  ],
  [
    0.78,
    (st) => {
      move(st, "swap", { dur: 0.9 });
      note(st, "swap");
    },
  ],
  [
    0.92,
    (st) => {
      // out to its own side first, then over the top and round
      const side = roll(st) < 0.5 ? 0 : 2;
      move(st, "lap", { whoStep: side, dir: side === 0 ? 1 : -1, dur: 1.6 });
      note(st, "lap");
    },
  ],
  [
    1,
    (st, dir) => {
      move(st, "turn", { whoStep: 1, dir, amp: 4, dur: 1.1 });
      note(st, "spin");
    },
  ],
];
function waiting(st: Core): void {
  const r = roll(st);
  const dir = roll(st) < 0.5 ? -1 : 1;
  under(WAITS, r)(st, dir);
}

/** The beats a state keeps: a lift at each onset of a real voice, a rhythm of its own when there is none, a bow after a phrase. */
const RHYTHM: Record<CharacterState, (st: Core, dt: number) => void> = {
  idle() {},
  thinking() {},
  speaking(st) {
    if (st.voiceLive) {
      if (st.level < 0.16) st.onsetArmed = true;
      else if (st.onsetArmed && st.level > 0.3) {
        beatWave(st, Math.min(1, st.level * 1.2));
        st.onsetArmed = false;
      }
    } else if (
      st.ownRhythm &&
      st.clock - st.lastWordAt > 1 &&
      st.clock - st.stateAt > 0.12 &&
      st.clock >= st.autoNextAt
    ) {
      if (st.clock < st.autoPhraseEnd) {
        beatWave(st, 0.35 + roll(st) * 0.45);
        st.autoNextAt = st.clock + 0.2 + roll(st) * 0.2;
      } else {
        st.autoPhraseEnd = st.clock + 0.45 + 1.4 + roll(st);
        st.autoNextAt = st.clock + 0.45;
      }
    }
  },
  listening(st, dt) {
    if (st.level > 0.26) {
      st.loud = true;
      st.quietFor = 0;
    } else if (st.level < 0.08) {
      st.quietFor += dt;
      if (st.loud && st.quietFor > 0.3) {
        move(st, "nod", { amp: 0.45 });
        note(st, "nod");
        st.loud = false;
      }
    }
  },
};
export function rhythm(st: Core, dt: number): Core {
  RHYTHM[st.state](st, dt);
  return st;
}

/** What a state does once nothing is moving and its time has come: the fidgets at rest, the waits while listening. */
const SCHEDULE: Record<CharacterState, (st: Core) => void> = {
  idle(st) {
    if (st.W.idle > 0.95) {
      const quiet = st.awake < 0.5;
      fidget(st, quiet);
      st.nextFidgetAt =
        st.clock + (quiet ? 14 + roll(st) * 10 : st.lit > 0.5 ? 1.3 + roll(st) * 0.8 : 6 + roll(st) * 5);
    }
  },
  listening(st) {
    if (st.W.listening > 0.95 && st.quietFor > 1.2) {
      waiting(st);
      st.nextFidgetAt = st.clock + 2.5 + roll(st) * 2.5;
    }
  },
  thinking() {},
  speaking() {},
};
export function schedule(st: Core): Core {
  if (!st.fidgets || st.moves.length || st.clock < st.nextFidgetAt) return st;
  SCHEDULE[st.state](st);
  return st;
}

/** The tiles by how far toward you each is held, nearest first (its place in the stack breaks a tie). */
const byDepth = (st: Core): Body[] => st.bodies.slice().sort((a, b) => b.lf - a.lf || b.step - a.step);

// Joining the ring: each tile takes the point nearest it, in depth as well as on the page, except that two tiles
// that overlap now never trade depths on the way (the stack's top stays nearest, its back goes farthest), so the
// order they are drawn in holds while they can be seen over each other.
export function join(st: Core): Core {
  const { bodies } = st;
  const points = JOIN.map((th) => ring(th, st.clock));
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
  st.orbPhase = 0;
  st.orbBoost = 0;
  return st;
}

// Leaving the ring: each tile keeps where it is, how fast it is going and how far it is toward you, and the springs
// take it into the next formation. Each takes the place that fits its depth, so the order they are drawn in never
// has to change while they overlap: the nearest becomes the top of the stack, or the tile held forward while
// listening; the row is taken left to right.
function release(st: Core, next: CharacterState): void {
  for (const b of st.bodies) {
    const o = b.out;
    b.lf = o.lift - b.obreath;
    b.x = o.x - b.ox;
  }
  const near = byDepth(st);
  if (next === "speaking") {
    st.bodies
      .slice()
      .sort((a, b) => a.x - b.x)
      .forEach((b, k) => (b.step = k));
  } else if (next === "listening") {
    near[0].step = 1;
    const sides = near.slice(1).sort((a, b) => a.x - b.x);
    sides[0].step = 0;
    sides[1].step = 2;
  } else near.forEach((b, k) => (b.step = 2 - k));
  for (const b of st.bodies) {
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
  st.orb = 0;
}

/** What a state does as it is entered, the one before named; nothing when calm. */
const ENTER: Record<CharacterState, (st: Core, prev: CharacterState) => void> = {
  idle(st, prev) {
    st.nextFidgetAt = st.clock + 3 + roll(st) * 3;
    if (prev === "speaking") {
      move(st, "nod", { amp: 0.8 });
      sweep(st, 0.55);
      note(st, "nod");
    }
  },
  listening(st) {
    move(st, "wave", { amp: 0.6, dur: 0.36 });
    note(st, "perk");
    st.loud = false;
    st.quietFor = 0;
    st.nextFidgetAt = st.clock + 2.5 + roll(st) * 2;
  },
  thinking(st) {
    join(st);
  },
  speaking(st) {
    st.autoNextAt = st.clock + 0.2;
    st.autoPhraseEnd = st.clock + 1.6 + roll(st) * 0.8;
    st.onsetArmed = true;
    st.wordAt = 0;
  },
};
/** A state change (set): the ring left if it was on it, then what the next state does on entry; false when nothing changes. */
export function enter(st: Core, next: CharacterState): boolean {
  if (!STATES.includes(next) || next === st.state) return false;
  const prev = st.state;
  if (prev === "thinking" && st.orb > 0) release(st, next);
  st.prevLive = st.state === "idle" ? 0 : 1;
  st.glowOut = false;
  st.state = next;
  st.stateAt = st.clock;
  st.unattended = 0;
  if (!st.calm) ENTER[next](st, prev);
  return true;
}

const REACTIONS: Record<Reaction, (st: Core) => void> = {
  flip: (st) => note(st, turns(st, [0.4, 0.65, 0.85])),
  hop: (st) => move(st, "rise", { whoStep: 2, dur: 0.55 }),
  yawn: (st) => move(st, "stretch"),
  nod: (st) => move(st, "nod"),
  shake: (st) => move(st, "shake"),
  look: (st) => move(st, "look"),
};
/** A reaction (react): false when calm, or when the kind is not one of ours (a page may send anything). */
export function reaction(st: Core, kind: Reaction): boolean {
  if (st.calm || !Object.hasOwn(REACTIONS, kind)) return false;
  REACTIONS[kind](st);
  if (kind !== "flip") note(st, kind);
  return true;
}

/** Lit at rest (glow): the mark keeps its place and takes the AI's colour, with a turn now and more while it stays; 0 is the ink again. */
export function glowTo(st: Core, v: number): Core {
  const on = unit(v);
  // lit from dark, at rest: a turn now, so the colour arrives with a move; the next only if the light stays
  if (on > 0.5 && st.litTarget <= 0.5 && st.state === "idle" && !st.calm) {
    if (!st.moves.length) note(st, turns(st, [0.46, 0.71, 0.89]));
    st.nextFidgetAt = st.clock + 1.3 + roll(st) * 0.8;
  }
  // the light gone, its quicker turns go with it: the ink's own pace again, not a turn left over from the light
  if (on <= 0.5 && st.litTarget > 0.5) st.nextFidgetAt = Math.max(st.nextFidgetAt, st.clock + 6 + roll(st) * 5);
  st.glowOut = on <= 0.5 && st.state === "idle";
  st.litTarget = on;
  return st;
}

/** A read that landed (pulse): the orbit surges and a light runs down the stack. */
export function landed(st: Core, v: number): Core {
  if (st.calm) return st;
  const strength = unit(v);
  if (st.state === "thinking") st.orbBoost = Math.max(st.orbBoost, 0.7 * strength);
  sweep(st, strength);
  note(st, "pulse");
  return st;
}

/** A word (beat): its lift, the moment kept so the rhythm of its own holds off a second. */
export function wordBeat(st: Core, v: number): Core {
  if (st.calm) return st;
  st.lastWordAt = st.clock;
  beatWave(st, unit(v));
  return st;
}
