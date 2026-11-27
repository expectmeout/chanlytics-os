/**
 * The doors every surface's own `shell.ts` shares (decision 0015): the role gate and the toast, the frame's own, imported
 * (frame-verbs.ts). Nothing is read off the window (decision 0151).
 */
import type { ReactNode } from "react";
import { useFrameToast } from "./frame-verbs";

/* A role gate's props for a control: the frame's own (frame-verbs.ts gate, over frame/gate.ts). */
export { gate } from "./frame-verbs";

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
  return useFrameToast();
}
