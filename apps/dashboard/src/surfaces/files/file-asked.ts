/**
 * A file asked for from somewhere else (Ask's card, the bell's row, a link: decision 0099) opens in Campaigns › Content's
 * viewer, which shows Made or the Library as the file is one or the other. An old address that names Settings › Files' own
 * (`admin/files?do=file:<id>`) lands there too (contracts retiredRouteOf).
 */
import { CONTENT_ROUTE } from "@chanlytics/contracts";

/** Go to this file: a move of the route, so the frame hears it whether the page is on screen or not. */
export function openFile(id: string, go: (route: string) => void): void {
  go(`${CONTENT_ROUTE}:${id}`);
}
