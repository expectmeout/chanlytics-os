/**
 * The three, published to the legacy pages the way Today's helpers are (today.ts): one object on window, installed
 * at boot by LegacyApp.tsx. The pages draw the faces and call these; they never reach into the bridge's modules.
 * `mood` is the one mood of Ask for the whole app: the palette says it, every face follows it (mood.ts).
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

declare global {
  interface Window {
    __mascot?: Mascot;
  }
}

export function installMascot(): void {
  window.__mascot = MASCOT;
}
