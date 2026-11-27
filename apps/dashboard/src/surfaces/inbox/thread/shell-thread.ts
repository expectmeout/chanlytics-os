/**
 * What the Inbox's thread still asks of the shell, beyond shell.ts (decision 0015, step 3): the reads only the thread
 * makes, each typed and made when the thread asks, never when this loads. Each is a line to delete on the day its owner
 * moves: People's rows and its courier with People, the reach-out readings with the reach-out surface, the route
 * builder with the client, the role store's absence with the role store.
 *
 * Nothing here is new behaviour: each reads what the bridge installed (provided.ts) where the JSX read the window, and says
 * what the JSX said where it is not there.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { Params, RouteKey } from "@/client/api";
import { onSurfaceMoved, surfaceVersion } from "@/bridge/surface-status";
import { provided } from "@/bridge/provided";
import { canDo } from "../../frame-verbs";

/* ------------------------------- what a page hands over ------------------------------- */

/** A field of something a page handed over, whatever it is: nothing where it is not an object. */
const fieldOf = (thing: unknown, field: string): unknown =>
  thing && typeof thing === "object" ? Reflect.get(thing, field) : undefined;

/** What an event on the window carries in its detail, by field; nothing where it carries none. */
export const detailField = (e: Event | null | undefined, field: string): unknown =>
  fieldOf(e ? Reflect.get(e, "detail") : undefined, field);

/* --------------------------------- People --------------------------------- */

/**
 * People's rows land last on a cold boot (they are the heaviest read): a thread opened before them draws again once
 * they do (the shell's `useSurface("people")`, surface-status.ts). The number it answers is ignored, as the page ignored it.
 */
export function usePeopleMoved(): void {
  const key = "people";
  const subscribe = useCallback((moved: () => void) => onSurfaceMoved([key], moved), [key]);
  const snapshot = () => surfaceVersion([key]);
  useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** A person's notes' courier (people-detail.ts, provided as `personNotes`), when it is installed and can say when a step is due. */
export function personNotes() {
  const notes = provided("personNotes");
  return notes && typeof notes.dueDay === "function" ? notes : null;
}

/** The deal's rules as the thread's Actions use them (people-detail.ts, provided as `deal`), when the courier is installed. */
export function dealKit() {
  const deal = provided("deal");
  return deal && typeof deal.menu === "function" ? deal : null;
}

/* ------------------------------- the address ------------------------------- */

/** Whether the client's link builder is there at all (provided as `href`). */
export function hasHref(): boolean {
  return !!provided("href");
}

/**
 * A link the browser follows rather than a request it makes (a download, a recording): the route's own address, named
 * for the workspace as every read is. Nothing without the builder.
 */
export function hrefOf<K extends RouteKey>(key: K, params?: Params<K>): string | null {
  const href = provided("href");
  return href ? href(key, params) : null;
}

/* ---------------------------- the reach-out readings ---------------------------- */

/** The replies to a reach-out and the words they are drawn in (reach-out/replies.ts, provided as `replies`), or nothing where they are not installed. */
export function repliesDoor() {
  return provided("replies");
}

/* ---------------------------------- roles ---------------------------------- */

/**
 * Whether the role gate lets this member approve, where the role store is absent as much as where it says yes (frame/gate.ts
 * `canDo` lets anyone act where there is no store): the call back the header's dock draws is offered to everyone then.
 */
export function mayApproveOrNoRoles(): boolean {
  return canDo("approve");
}
