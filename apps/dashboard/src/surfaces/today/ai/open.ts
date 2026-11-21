/**
 * Whether AI's sheet is open over Today (Working for you, W1): its press stands in the frame's head, under the sentence, and
 * the sheet is drawn in the page, so the two share this one fact. Nothing is kept past the page: Today left, it is shut.
 */
import { useSyncExternalStore } from "react";

let open = false;
const sheetHearers = new Set<() => void>();

function tellSheet(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const fn of [...sheetHearers]) fn();
}

/** Open AI's sheet over Today. */
export const openAiSheet = (): void => tellSheet(true);

/** Shut it. */
export const closeAiSheet = (): void => tellSheet(false);

function hearSheet(fn: () => void): () => void {
  sheetHearers.add(fn);
  return () => void sheetHearers.delete(fn);
}

const isOpen = (): boolean => open;
const shutOnTheServer = (): boolean => false;

/** Whether AI's sheet is open, drawn again as it opens and shuts. */
export function useAiSheetOpen(): boolean {
  return useSyncExternalStore(hearSheet, isOpen, shutOnTheServer);
}
