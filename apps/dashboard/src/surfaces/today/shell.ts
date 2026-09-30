/**
 * What Today still asks of the shell (decision 0015, step 4).
 *
 * A TSX surface reads nothing off `window`, so each thing a page of the shell owns that Today draws reaches it through
 * one function here, which calls the window's own where it is and does what the page did where it is not (the
 * standalone harness, a test's stand-in window). Today reads more of the shell than any surface: the nine it draws
 * from (`ROUTE_DRAWS.today`), the frame's doors, the toast, the role gate, and the pages of the shell that draw the
 * rows it borrows (the agenda, Setup's card rows). Each is a line to delete on the day its owner moves; nothing here
 * is new behaviour.
 *
 * Reads are made when the page asks, never when this loads: a stand-in window a test builds later is the one read.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import type { GoogleSurface } from "@/legacy-bridge/google";
import type { BellApi } from "@/legacy-bridge/notifications";
import type { PageClock } from "@/legacy-bridge/zone";
import type { FirstRunApi, SetupApi, SetupSurface } from "@/legacy-bridge/setup";
import { surfaceHook } from "@/legacy-bridge/surface-status";
import type { SurfaceNames } from "@/legacy-bridge/surface-status";
import { askAbout, canDo, holdStill } from "../legacy-verbs";
import { fn, windowValue, object, type Flash } from "../shell-doors";

export { askAbout, canDo, holdStill };

/* The role gate and the toast are the doors every surface shares (shell-doors.ts). */
export { gate, useToast } from "../shell-doors";
export type { Flash } from "../shell-doors";

/* -------------------------------- the toast -------------------------------- */

/** The toast a refused verb raises, in the shell's words (`window.refusalToast`): its lead, then the server's reason. */
export function refusalFlash(res: unknown, lead: string): Flash {
  const say = fn<[unknown, string], Flash>("refusalToast");
  return say ? say(res, lead) : { msg: lead };
}

/* ------------------------------- the address ------------------------------- */

/** Move to a route; nothing without the frame (`appNavigate`). */
export function appNavigate(route: string): void {
  fn<[string], void>("appNavigate")?.(route);
}

/* ------------------------------ the surfaces ------------------------------ */

/**
 * A surface the bridge published, by its global's name (`__REPORTS`, `__PEOPLE`, `__BROADCASTS`, ...): what the page
 * borrowed through `todaySurface(name)`. Nothing before its first read.
 */
export function borrowed<T extends object>(name: string): T | undefined {
  return object<T>(name);
}

/** Whether a surface's last read failed (`window.__surfaceFailed`): the borrowed read that says so where its rows would be. */
export function surfaceFailed(key: string): boolean {
  return !!fn<[string], boolean>("__surfaceFailed")?.(key);
}

/**
 * The surfaces a page draws from, so it draws again when any of them moves: their rows landed, their status changed (the
 * legacy `useSurface(names)` of the shell, over the same hook: surface-status.ts `surfaceHook`). Answers how often they have
 * moved, a number the pages ignore.
 */
export const useMoved: (names: SurfaceNames) => number = surfaceHook({ useCallback, useSyncExternalStore });

/** The playbooks surface read again after a run's verb (`window.__refreshPlaybooks`): nothing in a stand-in window. */
export function refreshPlaybooks(): void {
  fn<[], void>("__refreshPlaybooks")?.();
}

/* ---------------------------- what Today borrows ---------------------------- */

/** The workspace's clock as the pages read it (`window.__clock`): the zone, and a day or a time said in it. */
export function workspaceClock(): PageClock | undefined {
  return object<PageClock>("__clock");
}

/** The bell as the top bar holds it (`window.__notifs`): its feed, and the verbs on a row. */
export function bell(): BellApi | undefined {
  return object<BellApi>("__notifs");
}

/** The lists this member pinned to Today (`window.__lists`, people-lists.ts). */
export function pinnedLists(): Array<{ token: string; label: string; count: number | null; to: string }> | null {
  const lists = object<{ pinned?: () => Array<{ token: string; label: string; count: number | null; to: string }> }>(
    "__lists",
  );
  return lists && lists.pinned ? lists.pinned() : null;
}

/** The broadcasts surface's verbs (`window.__broadcasts`): stop a run, approve one. */
export function broadcastVerbs(): BroadcastVerbs | undefined {
  return object<BroadcastVerbs>("__broadcasts");
}

/** What a run's verbs answer: `ok`, the server's data, or a refusal to say in the shell's words. */
export interface VerbAnswer {
  ok: boolean;
  data?: { recipient_count?: number } & Record<string, unknown>;
  [key: string]: unknown;
}

/** The broadcasts surface's verbs, as far as Today draws them. */
interface BroadcastVerbs {
  cancel(id: string, opts?: { onAccepted?: () => void }): Promise<VerbAnswer>;
  approve(id: string, opts?: { onAccepted?: (data: NonNullable<VerbAnswer["data"]>) => void }): Promise<VerbAnswer>;
}

/** When a run really goes, in words (`window.bcWhenWords`, broadcasts-real.jsx): "sending now" where the shell has none. */
export function bcWhenWords(data: unknown): string {
  const words = fn<[unknown], string>("bcWhenWords");
  return words ? words(data) : "sending now";
}

/** The first run's helpers (`window.__firstRun`) and Setup's payload and verbs, as the Today card draws them. */
export function firstRun(): FirstRunApi | undefined {
  return object<FirstRunApi>("__firstRun");
}
export function setupRead(): SetupSurface | null | undefined {
  const v = windowValue("__SETUP");
  return v === null ? null : object<SetupSurface>("__SETUP");
}
export function setupVerbs(): SetupApi | undefined {
  return object<SetupApi>("__setup");
}

/** The Google surface as the bridge published it (`window.__GOOGLE`) and its view-model helper (`window.__google`). */
export function googleRead(): GoogleSurface | undefined {
  return object<GoogleSurface>("__GOOGLE");
}
export function googleVm():
  { vm(dto: GoogleSurface["dto"], days: number): { todayLine: { text: string; to: string } | null } } | undefined {
  return object("__google");
}

/* -------------------------- what the pages of the shell draw -------------------------- */

/** A component a page of the shell published, drawn by name where Today borrows its rows; none where it is not loaded. */
function component<P>(name: string): ComponentType<P> | undefined {
  const v = windowValue(name);
  return typeof v === "function" ? (v as ComponentType<P>) : undefined;
}

/** Setup's card rows (setup.jsx `SetupCardRow`, `SetupRows`), which Today's card of what is left to set up draws. */
export const setupCardRow = <P>(): ComponentType<P> | undefined => component<P>("SetupCardRow");
export const setupRows = <P>(): ComponentType<P> | undefined => component<P>("SetupRows");

/** The one row every list of appointments wears (components/day-agenda.jsx), which the day's card draws. */
export const agendaItem = <P>(): ComponentType<P> | undefined => component<P>("AgendaItem");
export const agendaItems = <P>(): ComponentType<P> | undefined => component<P>("AgendaItems");
export const agendaOpen = <P>(): ComponentType<P> | undefined => component<P>("AgendaOpen");
