/**
 * What a person's deal card asks of the shell that legacy-verbs.ts does not carry: the step sheet
 * (components/step-sheet.jsx `openStepSheet`), which the frame draws once and every surface that shows a step opens.
 * Read at call time, so a test's stand-in window and the standalone mockup (which has no step sheet) answer as the
 * card always found them: the button that would open it is not drawn.
 *
 * A line to delete on the day the step sheet is TSX: its verb is then an import.
 */

/** What the step sheet is asked for: a person, the deal a new step names, or the step to change. */
export interface StepSheetAsk {
  personId: string;
  dealId?: string | null;
  noteId?: string | null;
}

const opener = (): ((ask: StepSheetAsk) => unknown) | null => {
  const fn: unknown = Reflect.get(window, "openStepSheet");
  return typeof fn === "function" ? (fn as (ask: StepSheetAsk) => unknown) : null;
};

/** Whether the shell has a step sheet to open. */
export function stepSheetOffered(): boolean {
  return opener() !== null;
}

/** Ask for the step sheet; nothing where the shell has none. */
export function openStepSheet(ask: StepSheetAsk): void {
  const open = opener();
  if (open) open(ask);
}
