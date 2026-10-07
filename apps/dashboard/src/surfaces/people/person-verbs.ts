/**
 * What a person's page and the two sheets it opens still ask of the shell (decision 0015, step 5): the Inbox's reply
 * courier, the frame's Back to People, a list's address, the window's own events, and the shell's toast as these draw it.
 * Each calls the shell's own where it is; the page reads no `window` name itself, it imports these (and legacy-verbs.ts, for
 * what every surface asks). A line here is deleted on the day its owner moves: `threadVerbs` with the Inbox,
 * `backToPeople` and the toast with the frame.
 */
import type { ReactNode } from "react";
import { navigate, useLegacyToast } from "../legacy-verbs";

/** What the shell's one flash takes, as a person's page raises it: words, a tone, an Undo or a door in the toast. */
export interface PersonFlash {
  tone?: string;
  msg: ReactNode;
  ms?: number;
  undo?: (() => void) | null;
  action?: { label: string; onClick: () => void };
}
export type FlashFn = (flash: PersonFlash) => void;

/** The thread a reply is sent in, as the Inbox's verbs name it. */
interface ThreadRef {
  id: string;
  conversationId: string;
  escalationId: null;
  who: string;
}

/** The Inbox's verbs on a real thread (thread-pane.jsx): what a person's sheet asks of them. */
interface ThreadVerbs {
  verb(
    thread: ThreadRef,
    name: string,
    payload: { text: string },
    okMessage: string,
    undoable: boolean,
  ): Promise<boolean>;
}

declare global {
  interface Window {
    /** The frame's own Back to People: the People view this page was opened from, with its place (app-shell.jsx). */
    appBackToPeople?: () => void;
    /** The Inbox's verbs on a real thread (thread-pane.jsx), spoken through the given flash. */
    threadVerbs?: (flash: FlashFn) => ThreadVerbs;
  }
}

/** What a rejected read says, if it said anything: its message, else nothing. */
export function saidBy(e: unknown): string {
  const m = typeof e === "object" && e !== null ? (e as { message?: unknown }).message : undefined;
  return typeof m === "string" ? m : "";
}

/** The shell's toast as a person's page and its sheets use it: its node to draw, and the flash that raises one. */
export function usePersonToast(): [ReactNode, FlashFn] {
  return useLegacyToast();
}

/** The person's own Back: the People view they were opened from (the frame's rule), else People itself. */
export function backToPeople(): void {
  if (window.appBackToPeople) window.appBackToPeople();
  else navigate("clients");
}

/** Where a smart list of the workspace is on People: `clients/seg:<id>`, the spelling the route table's `clientSeg` gives. */
export function clientSegRoute(id: string): string {
  return `clients/seg:${id}`;
}

/** What the shell's workspace list names of one workspace: its id and its words. */
interface WorkspaceRow {
  id?: unknown;
  name?: unknown;
}

/** The name of the workspace being looked at (the workspace surface's rows, `__WORKSPACES`, at `__ACTIVE_WORKSPACE`); nothing where the shell has none. */
export function workspaceName(): string {
  const list: unknown = Reflect.get(window, "__WORKSPACES");
  const active: unknown = Reflect.get(window, "__ACTIVE_WORKSPACE");
  const found = (Array.isArray(list) ? (list as WorkspaceRow[]) : []).find((w) => w.id === active);
  return typeof found?.name === "string" ? found.name : "";
}

/** Whether the Inbox's reply courier is drawn in this shell. */
export function hasThreadVerbs(): boolean {
  return !!window.threadVerbs;
}

/** The Inbox's verbs, speaking through `flash`; asked only once `hasThreadVerbs` says they are there. */
export function threadVerbs(flash: FlashFn): ThreadVerbs {
  const own = window.threadVerbs;
  if (!own) throw new Error("The Inbox's reply courier is not in this shell.");
  return own(flash);
}

/** Hear one of the window's own events (`deal:sheet`, `note:saved`, `surface:clients`); the answer lets go. */
export function hear(type: string, fn: (detail: Record<string, unknown>) => void): () => void {
  const on = (e: Event) => fn((e as CustomEvent<Record<string, unknown> | null>).detail ?? {});
  window.addEventListener(type, on);
  return () => window.removeEventListener(type, on);
}

/** Say one of them; false where the window cannot dispatch (a test's stand-in). */
export function announce(type: string, detail: unknown): boolean {
  if (typeof window.dispatchEvent !== "function") return false;
  window.dispatchEvent(new CustomEvent(type, { detail }));
  return true;
}
