/**
 * The three: one object the Line and the faces import (surfaces/ask/shell.ts, surfaces/kit/face/ask-face.tsx). `mood` is
 * the one mood of Ask for the whole app: the palette says it, every face follows it (mood.ts).
 */
import { createCharacter, fitSide, FIT, STATES } from "./character";
import { mountCharacter, type Mounted } from "./driver";
import { createMood, follow } from "./mood";

// Who is told a face has mounted: the bridge's arrival (../arrival.ts) reads the page in for a phone's first face.
const mounted = new Set<(m: Mounted) => void>();

export const MASCOT = {
  mount: (
    canvas: Parameters<typeof mountCharacter>[0],
    opts?: Parameters<typeof mountCharacter>[1],
  ): Mounted | null => {
    const m = mountCharacter(canvas, opts);
    if (m) for (const fn of [...mounted]) fn(m);
    return m;
  },
  /** told each time a face mounts; returns what stops it */
  onMount: (fn: (m: Mounted) => void): (() => void) => {
    mounted.add(fn);
    return () => {
      mounted.delete(fn);
    };
  },
  create: createCharacter,
  mood: createMood(),
  follow,
  fitSide,
  FIT,
  STATES,
} as const;
export type Mascot = typeof MASCOT;
