/**
 * The record kit's memory of a fold a member left open (canvas A, P9.4: "open or closed is remembered"): the tab's
 * memory (legacy-bridge/tab-memory.ts, through shell-verbs.ts tabMemory), a place per fold under the page `folds`, so a
 * fold stays as the member left it across the walk from person to person and a phone's tab switches, for this tab, and
 * is forgotten at sign-out. Only "open" is kept: closed is the default, and a place with nothing in it is forgotten.
 * Read once, as the fold is drawn, so a fold left open is drawn open on the first paint.
 */
import { useState } from "react";
import { tabMemory } from "./shell-verbs";

/** The tab memory's page for what a member left open: one view per fold, by its id. */
const FOLDS = "folds";

function leftOpen(key: string): boolean {
  try {
    return tabMemory()?.place(FOLDS, key)?.open === true;
  } catch {
    return false;
  }
}

function keepOpen(key: string, open: boolean): void {
  try {
    tabMemory()?.keepPlace(FOLDS, key, open ? { open: true } : {});
  } catch {
    /* the memory is lost, never the page */
  }
}

/** The member's own choice of open, read as the fold is drawn and kept as they choose; a null key remembers nothing. */
export function useRememberedOpen(key: string | null): [boolean, (open: boolean) => void] {
  const [chosen, setChosen] = useState(() => (key ? leftOpen(key) : false));
  const choose = (open: boolean) => {
    setChosen(open);
    if (key) keepOpen(key, open);
  };
  return [chosen, choose];
}
