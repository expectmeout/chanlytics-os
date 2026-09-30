/**
 * What People asks of the shell that legacy-verbs.ts does not already carry: where the tab is, where it goes, where it
 * keeps a place, what the export of a list is called. Each is the module that owns the thing (the address is
 * workspace.ts, the place is tab-memory.ts, a route's link is the client's), imported where the JSX read the window,
 * and a line to delete with the frame's step.
 */
import type { ReactNode } from "react";
import { api } from "@/legacy-bridge/api";
import { tabMemoryFor } from "@/legacy-bridge/tab-memory";
import { goToRoute, routeOnScreen } from "@/legacy-bridge/workspace";
import { useLegacyToast } from "../legacy-verbs";
import type { Flash } from "./types";

/** The route on screen, `clients/seg:x`, as the address says it. */
export const addressRoute = (): string => routeOnScreen();

/** A page saying where it stands (`replace` and `quiet`), or a redirect: the address moves, no entry is pushed. */
export function addressReplace(route: string, opts: { quiet: boolean }): void {
  goToRoute(route, { replace: true, quiet: opts.quiet });
}

/** Where the member was in a view of a page: the words in the box, the row the cursor was on, how far it was scrolled. */
export type Place = Record<string, unknown>;
export const placeLoad = (page: string, view: string): Place | null => tabMemoryFor(window).place(page, view);
export const placeSave = (page: string, view: string, place: Place): void => {
  tabMemoryFor(window).keepPlace(page, view, place);
};

/** The link to a list's file: the route's export of everyone, or of the list open (`list` is `list:<id>` or `seg:<id>`). */
export const exportLink = (list: string | undefined): string =>
  api().url("GET contacts/export", { params: undefined, query: list ? { list } : undefined });

/** The shell's toast as People uses it: its node to draw, and the flash that raises one (with an Undo). */
export function usePeopleToast(): [ReactNode, Flash] {
  return useLegacyToast();
}
