/**
 * The three, published to the legacy pages the way Today's helpers are (today.ts): one object on window, installed
 * at boot by LegacyApp.tsx. The pages draw the faces and call these; they never reach into the bridge's modules.
 * `mood` is the one mood of Ask for the whole app: the palette says it, every face follows it (mood.ts).
 */
import { createCharacter, fitSide, STATES, UNITS } from "./character";
import { mountCharacter } from "./driver";
import { createMood, follow } from "./mood";

export const MASCOT = {
  mount: mountCharacter,
  create: createCharacter,
  mood: createMood(),
  follow,
  fitSide,
  UNITS,
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
