/**
 * What Ask still asks of the shell (decision 0015, step 12).
 *
 * A TSX surface reads nothing off `window`, so each thing the bridge or the frame owns that the Line reads reaches it through
 * one function here or in legacy-verbs.ts, which asks the window's own where it is and does what the Line did where it is not
 * (a test's stand-in window). Reads are made when the Line asks, never when this loads. Each is a line to delete on the day
 * its owner moves; nothing here is new behaviour.
 */
import type { ReactNode } from "react";
import type { Mascot } from "@/legacy-bridge/mascot";
import type { TabMemory } from "@/legacy-bridge/tab-memory";
import type { GoOptions } from "@/legacy-bridge/workspace";
import { askCalls, canDo, gate, leaving, navigate, touchSwipe, type LegacyFlash } from "../legacy-verbs";
import { fn, object } from "../shell-doors";

export { askCalls, canDo, gate, leaving, navigate, touchSwipe };

/** The route on screen, as the frame's address says it (`CHANLY.address`). */
export function routeNow(): string {
  return object<{ address: { route(): string } }>("CHANLY")?.address.route() ?? "";
}

/** The frame's own move, which takes `replace` (`appNavigate`); nothing where the shell has none. */
export const frameMove = () => fn<[string, GoOptions?], void>("appNavigate");

/** The Inbox's threads, where it has read them: who a scope on one is with. */
export function inboxThreads(): ReadonlyArray<{ id: string; who: string }> {
  return object<{ THREADS?: ReadonlyArray<{ id: string; who: string }> }>("INBOX_DATA")?.THREADS ?? [];
}

/** A call on Live, as far as a scope names it. */
interface LiveCall {
  callId: string;
  who: string;
}

/** Calls going on and the last few, where Live has read them. */
export function liveCalls(): { now?: readonly LiveCall[]; recent?: readonly LiveCall[] } {
  return object<{ now?: readonly LiveCall[]; recent?: readonly LiveCall[] }>("__LIVE") ?? {};
}

/** The three, one mood for every face (legacy-bridge/mascot); null where the bridge did not publish them. */
export const mascotNow = (): Mascot | null => object<Mascot>("__mascot") ?? null;

/** What the tab keeps (legacy-bridge/tab-memory.ts); null where the bridge has none. */
export const tabMemory = (): TabMemory | null => object<TabMemory>("__tabMemory") ?? null;

/** The settings' version as they were read: whether a card's undo is still true depends on it. Null before a read. */
export function settingsVersion(): number | null {
  const settings = object<{ version?: unknown }>("__SETTINGS");
  return settings && typeof settings.version === "number" ? settings.version : null;
}

/** The Line's own place for the shell's one toast (frame/flash.tsx `usePPToast`). */
export function useAskToast(): [ReactNode, (flash: LegacyFlash) => void] {
  const toast = fn<[string], [ReactNode, (flash: LegacyFlash) => void]>("usePPToast");
  return toast ? toast("ask-flash") : [null, () => undefined];
}
