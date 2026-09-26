/**
 * Ask's mood: what the AI is doing right now, said once for every face that shows it. The Line says it as a turn
 * runs (listening, reading, answering, at rest, a nod, a shake, a beat per word, a pulse per read that lands); the
 * top bar's Ask button and the Line's face follow it (components/ask-face.jsx), so there is one AI with one face
 * wherever it is drawn. Pure: a value and its listeners, no DOM and no clock.
 */
import { STATES, type CharacterState, type Reaction } from "./character";

export type MoodEvent =
  | { t: "state"; state: CharacterState }
  | { t: "react"; kind: Reaction }
  | { t: "beat"; strength: number }
  | { t: "hear"; level: number }
  | { t: "pulse"; strength: number }
  | { t: "glow"; on: boolean };

export interface Mood {
  readonly state: CharacterState;
  /** a new state; the same state again, or one that is not a state, says nothing */
  set(next: CharacterState): void;
  react(kind: Reaction): void;
  /** a word: every face lifts a square */
  beat(strength?: number): void;
  /** a word heard: every face leans in */
  hear(level: number): void;
  /** a read that landed: every face's orbit surges and a light runs down its stack */
  pulse(strength?: number): void;
  /** lit at rest (a page arriving): every face takes the AI's colour where it stands; false is the ink again */
  glow(on: boolean): void;
  readonly lit: boolean;
  subscribe(fn: (ev: MoodEvent) => void): () => void;
}

export function createMood(): Mood {
  let state: CharacterState = "idle";
  let lit = false;
  const listeners = new Set<(ev: MoodEvent) => void>();
  const emit = (ev: MoodEvent) => {
    for (const fn of [...listeners]) fn(ev);
  };
  return {
    get state() {
      return state;
    },
    get lit() {
      return lit;
    },
    set(next) {
      if (next === state || !STATES.includes(next)) return;
      state = next;
      emit({ t: "state", state });
    },
    react(kind) {
      emit({ t: "react", kind });
    },
    beat(strength = 0.6) {
      emit({ t: "beat", strength });
    },
    hear(level) {
      emit({ t: "hear", level });
    },
    pulse(strength = 0.7) {
      emit({ t: "pulse", strength });
    },
    glow(on) {
      const next = !!on;
      if (next === lit) return;
      lit = next;
      emit({ t: "glow", on: lit });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** The part of a mounted character a mood moves (driver.ts `Mounted` is one). */
export interface Face {
  set(next: CharacterState): void;
  react(kind: Reaction): void;
  beat(strength?: number): void;
  hear(level: number): void;
  pulse?(strength?: number): void;
  glow?(v: number): void;
}

/** Points a face at a mood: the state it is in now, then every change after. Returns what stops it. */
export function follow(face: Face, mood: Mood): () => void {
  face.set(mood.state);
  if (mood.lit) face.glow?.(1);
  return mood.subscribe((ev) => {
    if (ev.t === "state") face.set(ev.state);
    else if (ev.t === "glow") face.glow?.(ev.on ? 1 : 0);
    else if (ev.t === "react") face.react(ev.kind);
    else if (ev.t === "beat") face.beat(ev.strength);
    else if (ev.t === "pulse") face.pulse?.(ev.strength);
    else face.hear(ev.level);
  });
}
