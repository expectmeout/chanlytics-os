/**
 * The doors every surface's own `shell.ts` shares (decision 0015): the role gate and the toast, the frame's own, imported
 * (frame-verbs.ts). Nothing is read off the window (decision 0151).
 */
import type { ReactNode } from "react";
import { gate as frameGate, useFrameToast } from "./frame-verbs";

/** A role gate's props, spread after a control's handlers: `{}` where the role may act (frame/gate.ts `gate`). */
export function gate(perm: string, doing?: string): Record<string, unknown> {
  return frameGate(perm, doing);
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
  return useFrameToast();
}
