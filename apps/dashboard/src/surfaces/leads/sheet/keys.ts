/**
 * The rail's keys while a pile is on (canvas B: A adds, L puts it off, N is not a fit, C calls; with Not a fit's reasons
 * open, 1 to 5 pick one): the page's one listener
 * (people/hooks/keyboard.ts) hands a key here, and the sheet on screen says what its rail does with it, so a key does
 * exactly what the press in that place does, whatever the lead's state put there. One sheet is drawn at a time.
 */
/** A key the sheet on screen takes in a pile. */
export type SheetKey = "a" | "l" | "n" | "c" | "1" | "2" | "3" | "4" | "5";

let current: ((key: SheetKey) => void) | null = null;

/** The sheet on screen takes the keys; it lets them go as it leaves. */
export function holdSheetKeys(press: ((key: SheetKey) => void) | null): void {
  current = press;
}

/** A key of the rail, pressed: the sheet on screen's, else nothing. */
export function pressSheetKey(key: SheetKey): void {
  if (current) current(key);
}
