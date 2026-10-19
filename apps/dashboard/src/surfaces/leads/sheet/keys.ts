/**
 * The dock's keys while a pile is on (A adds, ⇧A opens the picker, L puts it off, N is not a fit, C calls): the page's one
 * listener
 * (people/hooks/keyboard.ts) hands a key here, and the sheet on screen says what its rail does with it, so a key does
 * exactly what the press in that place does, whatever the lead's state put there. One sheet is drawn at a time.
 */
/** A key the sheet on screen takes in a pile. */
export type SheetKey = "a" | "A" | "l" | "n" | "c" | "1" | "2" | "3" | "4" | "5";

let current: ((key: SheetKey) => void) | null = null;

/** The sheet on screen takes the keys; it lets them go as it leaves. */
export function holdSheetKeys(press: ((key: SheetKey) => void) | null): void {
  current = press;
}

/** A key of the rail, pressed: the sheet on screen's, else nothing. */
export function pressSheetKey(key: SheetKey): void {
  if (current) current(key);
}
