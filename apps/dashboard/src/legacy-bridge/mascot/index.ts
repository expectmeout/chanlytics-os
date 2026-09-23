/**
 * The three, published to the legacy pages the way Today's helpers are (today.ts): one object on window, installed
 * at boot by LegacyApp.tsx. The page draws the band and calls these; it never reaches into the bridge's modules.
 */
import { createCharacter, STATES, UNITS } from "./character";
import { mountCharacter } from "./driver";
import { initialTurn, turnReducer } from "./turn";

export const MASCOT = {
  mount: mountCharacter,
  create: createCharacter,
  turn: { initial: initialTurn, reduce: turnReducer },
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
