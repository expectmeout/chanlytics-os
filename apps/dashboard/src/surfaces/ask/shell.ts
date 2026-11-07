/**
 * What Ask reads of the frame (decision 0015, step 12; the one-system plan's steps 4 and 5): by import, each from the module
 * that owns it, so nothing here asks the window. The Line's chunk shares these with the frame, which loads each anyway. The
 * surfaces it reads are the seam's values, what the page has drawn; a value not read yet is nothing, and the Line asks when
 * it draws, never when this loads.
 */
import type { ReactNode } from "react";
import { tabMemoryFor, type TabMemory } from "@/bridge/tab-memory";
import { CHANLY } from "../frame/constants";
import { usePPToast } from "../frame/flash";
import type { FrameFlash } from "../frame-verbs";
import { surfaceValue } from "../surface-values";

export { canDo, gate } from "../frame/gate";
export { navigate } from "../frame-doors";
export { leaving } from "../kit/motion/leaving";
export { touchSwipe } from "../kit/motion/swipe";
export { askCalls, mediaSays } from "../frame-verbs";

/** The route on screen, as the frame's address says it. */
export const routeNow = (): string => CHANLY.address.route();

/** The Inbox's threads, where it has read them: who a scope on one is with. */
export const inboxThreads = (): ReadonlyArray<{ id: string; who: string }> => surfaceValue("inbox")?.THREADS ?? [];

/** A call on Live, as far as a scope names it. */
interface LiveCall {
  callId: string;
  who: string;
}

/** Calls going on and the last few, where Live has read them. */
export const liveCalls = (): { now?: readonly LiveCall[]; recent?: readonly LiveCall[] } => surfaceValue("live") ?? {};

/** What the tab keeps (bridge/tab-memory.ts). */
export const tabMemory = (): TabMemory => tabMemoryFor(window);

/** The settings' version as they were read: whether a card's undo is still true depends on it. Null before a read. */
export const settingsVersion = (): number | null => surfaceValue("settings")?.settings?.version ?? null;

/** The Line's own place for the shell's one toast (frame/flash.tsx `usePPToast`). */
export const useAskToast = (): [ReactNode, (flash: FrameFlash) => void] => usePPToast("ask-flash");
