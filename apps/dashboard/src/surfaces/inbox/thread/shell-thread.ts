/**
 * What the Inbox's thread still asks of the shell, beyond shell.ts (decision 0015, step 3): the reads only the thread
 * makes, each typed and made when the thread asks, never when this loads. Each is a line to delete on the day its owner
 * moves: People's rows and its courier with People, the reach-out readings with the reach-out surface, the route
 * builder with the client, the role store's absence with the role store.
 *
 * Nothing here is new behaviour: each reads the window name the JSX read, and says what the JSX said where it is not there.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { Params, RouteKey } from "@/client/api";
import { onSurfaceMoved, surfaceVersion } from "@/legacy-bridge/surface-status";
import type { replies } from "@/legacy-bridge/reach-out/replies";
import type { PeopleSurface } from "@/legacy-bridge/surfaces/people";
import { fn, object } from "../../shell-doors";
import { agentIdFor } from "../shell";

/* ------------------------------- what a page hands over ------------------------------- */

/** A field of something a page handed over, whatever it is: nothing where it is not an object. */
export const fieldOf = (thing: unknown, field: string): unknown =>
  thing && typeof thing === "object" ? Reflect.get(thing, field) : undefined;

/** What an event on the window carries in its detail, by field; nothing where it carries none. */
export const detailField = (e: Event | null | undefined, field: string): unknown =>
  fieldOf(e ? Reflect.get(e, "detail") : undefined, field);

/* --------------------------------- People --------------------------------- */

/**
 * People's rows land last on a cold boot (they are the heaviest read): a thread opened before them draws again once
 * they do (the legacy `useSurface("people")`, surface-status.ts). The number it answers is ignored, as the page ignored it.
 */
export function usePeopleMoved(): void {
  const key = "people";
  const subscribe = useCallback((moved: () => void) => onSurfaceMoved([key], moved), [key]);
  const snapshot = () => surfaceVersion([key]);
  useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The People surface, as far as the thread's header reads it: its rows, when they were read, and whether deals are on. */
export function peopleRead(): Partial<Pick<PeopleSurface, "rows" | "fetchedAt" | "dealsOn">> | undefined {
  return object("__PEOPLE");
}

/** A person's notes' courier (people-detail.ts `__personNotes`), when it is published and can say when a step is due. */
export function personNotes() {
  const notes = window.__personNotes;
  return notes && typeof notes.dueDay === "function" ? notes : null;
}

/** The deal's rules as the thread's Actions use them (people-detail.ts `__deal`), when the courier is published. */
export function dealKit() {
  const deal = window.__deal;
  return deal && typeof deal.menu === "function" ? deal : null;
}

/* ------------------------------- the address ------------------------------- */

/** Whether the client's link builder is there at all (`__href`). */
export function hasHref(): boolean {
  return !!window.__href;
}

/**
 * A link the browser follows rather than a request it makes (a download, a recording): the route's own address, named
 * for the workspace as every read is. Nothing without the builder.
 */
export function hrefOf<K extends RouteKey>(key: K, params?: Params<K>): string | null {
  return window.__href ? window.__href(key, params) : null;
}

/* ---------------------------- the reach-out readings ---------------------------- */

/** What the bridge's strip reads of a thread: its id and its timeline's bubbles (`replies.stripFor`). */
export type StripThread = Parameters<typeof replies.stripFor>[0];

/** The replies to a reach-out and the words they are drawn in (reach-out/replies.ts `__replies`), or nothing where they are not published. */
export function repliesDoor() {
  return window.__replies;
}

/* ---------------------------------- roles ---------------------------------- */

/**
 * Whether the role gate lets this member approve, where the role store is absent as much as where it says yes (the
 * standalone harness has none): the call back the header's dock draws is offered to everyone then.
 */
export function mayApproveOrNoRoles(): boolean {
  const can = fn<[string], boolean>("canDo");
  return !can || can("approve");
}

/* ------------------------------- the demo's trust ------------------------------- */

/** An agent's 30-day edit rate from the demo's trust digest (`TRUST`), as the veto bar says it; nothing where there is none. */
export function trustRateFor(agentName: string): number | null {
  const trust = object<{ agent?: (id: string) => unknown; rate?: (row: unknown) => number }>("TRUST");
  const row = trust && trust.agent ? trust.agent(agentIdFor(agentName)) : null;
  return row && trust && trust.rate ? trust.rate(row) : null;
}
