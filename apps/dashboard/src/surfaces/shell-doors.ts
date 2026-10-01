/**
 * The shell's doors, read the one way (decision 0015): what a TSX surface asks of a page of the shell it has no module for
 * is read off the window by name when the page asks, never when this loads, so a stand-in window a test builds later is
 * the one read. Each surface's own `shell.ts` says which names it reads and how each is typed; what they share is here:
 * the three readers, the role gate and the toast. Each door is a line to delete on the day its owner moves.
 */
import type { ReactNode } from "react";
import { useLegacyToast } from "./legacy-verbs";

/** A name off the window, whatever it holds. */
export const windowValue = (name: string): unknown => Reflect.get(window, name);

/** A function the shell published, or nothing where it has not. */
export function fn<A extends unknown[], R>(name: string): ((...args: A) => R) | undefined {
  const v = windowValue(name);
  return typeof v === "function" ? (v as (...args: A) => R) : undefined;
}

/** An object the shell published, or nothing where it has not. */
export function object<T extends object>(name: string): T | undefined {
  const v = windowValue(name);
  return typeof v === "object" && v !== null ? (v as T) : undefined;
}

/** A role gate's props, spread after a control's handlers: `{}` where the role may act (data-bits `gate`). */
export function gate(perm: string, doing?: string): Record<string, unknown> {
  const g = fn<[string, string | undefined], Record<string, unknown>>("gate");
  return g ? g(perm, doing) : {};
}

/** What the shell's one toast takes (data-bits `usePPToast`): a message, its tone, and what pressing does. */
export interface Flash {
  tone?: string;
  msg: ReactNode;
  undo?: (() => unknown) | null;
  ms?: number;
  links?: Array<{ label: string; to: string }>;
  action?: { label: string; onClick: () => void };
}

/** The toast's node, to be drawn by the page, and the flash that raises one. */
export function useToast(): [ReactNode, (flash: Flash) => void] {
  return useLegacyToast();
}
