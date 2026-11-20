/**
 * AI's dock on a phone (Today, calm, 19 Nov 2026, D8): the tab bar and AI's field are one capsule. With AI open the
 * frame's tab bar folds into the place on screen and keeps a room for a field (the kit's TabBar, `fold`), and the circle
 * beside it keeps one for AI's one press (the mic, Send, Stop). The frame says each room as it draws it; AI's Line draws
 * its field and its press into them, so there is one bar on the screen, the frame's own, and no second one of AI's.
 * Held here, in the bridge, since the frame and AI are two surfaces and neither imports the other.
 *
 * The frame folds its bar only once AI's Line says it is drawn there (`sayAskDocked`): the Line's code may still be on
 * its way when AI is first pressed, and a bar folded round a field that is not there yet stood empty for a moment, the
 * circle beside it too. So the Line is drawn, says so, the frame folds and hands over the rooms, and the Line draws
 * into them, all before the screen is painted once.
 */
import { useSyncExternalStore } from "react";

/** The two rooms: the field's, in the tab bar, and the one press's, in the circle. */
export interface AskDock {
  field: HTMLElement | null;
  press: HTMLElement | null;
}

const NO_DOCK: AskDock = { field: null, press: null };
let dockHeld: AskDock = NO_DOCK;
/** AI's Line is drawn on a phone where the frame's bar stands. */
let stands = false;
const dockHearers = new Set<() => void>();

const hearDock = (say: () => void) => {
  dockHearers.add(say);
  return () => {
    dockHearers.delete(say);
  };
};

const take = (part: keyof AskDock) => (el: HTMLElement | null) => {
  if (dockHeld[part] === el) return;
  dockHeld = { ...dockHeld, [part]: el };
  for (const say of dockHearers) say();
};

/** The frame's refs, one a room and the same on every draw: the room as it is drawn, null as it goes. */
export const askDockRef = { field: take("field"), press: take("press") } as const;

/** AI's Line says it is drawn where the frame's bar stands, and that it has gone. */
export function sayAskDocked(on: boolean): void {
  if (stands === on) return;
  stands = on;
  for (const say of dockHearers) say();
}

/** Whether AI's Line stands on the frame's bar: the frame folds its bar and gives its circle over while it does. */
export function useAskDocked(): boolean {
  return useSyncExternalStore(
    hearDock,
    () => stands,
    () => false,
  );
}

/** The rooms the frame holds now, each null until it is drawn. */
export function useAskDock(): AskDock {
  return useSyncExternalStore(
    hearDock,
    () => dockHeld,
    () => NO_DOCK,
  );
}
