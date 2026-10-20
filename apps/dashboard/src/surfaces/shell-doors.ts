/**
 * The shell's doors, read the one way (decision 0015): what a TSX surface asks of a page of the shell it has no module for
 * is read off the window by name when the page asks, never when this loads, so a stand-in window a test builds later is
 * the one read. Each surface's own `shell.ts` says which names it reads and how each is typed; what they share is here:
 * the three readers, the role gate and the toast. Each door is a line to delete on the day its owner moves.
 */
import type { ReactNode } from "react";
import { useLegacyToast, windowFn, windowObject, windowValue } from "./legacy-verbs";

/*
 * The three readers are legacy-verbs' (OW6: the one set of them, with no copy beside it), named as the surfaces' `shell.ts`
 * files use them: a name off the window whatever it holds, a function the shell published, an object it published.
 */
export { windowValue };
export const fn = windowFn;
export const object = windowObject;

/** A role gate's props, spread after a control's handlers: `{}` where the role may act (frame/gate.ts `gate`). */
export function gate(perm: string, doing?: string): Record<string, unknown> {
  const g = fn<[string, string | undefined], Record<string, unknown>>("gate");
  return g ? g(perm, doing) : {};
}

/** What the shell's one toast takes (frame/flash.tsx `usePPToast`): a message, its tone, and what pressing does. */
export interface Flash {
  tone?: string;
  msg: ReactNode;
  undo?: (() => unknown) | null;
  ms?: number;
  /** A send's cancel window: a tap besides does not take it (contracts `toastShape`). */
  stays?: boolean;
  links?: Array<{ label: string; to: string }>;
  action?: { label: string; onClick: () => unknown } | null;
}

/** The toast's node, to be drawn by the page, and the flash that raises one. */
export function useToast(): [ReactNode, (flash: Flash) => void] {
  return useLegacyToast();
}
