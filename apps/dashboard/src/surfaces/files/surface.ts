/**
 * A business's files, for Settings › Files (decision 0099): `GET files`, read only where the pane is drawn, again when what
 * it holds has aged, and when the feed says a file changed, so a name the look just gave shows without a press. A read answers one
 * page of one shelf and how the whole library stands, and reads the same again as it changes, so a shelf chosen and what a person has
 * scrolled through stay on screen. The presses are verbs.ts's, which only the pane loads: this module rides the route every page
 * loads, so it holds the read and the two moves that change what it asks.
 *
 * The value is the seam's (`useSurface("files")`): undefined until read, null when the read failed.
 */
import type { FileShelf, FilesPageDto } from "@chanlytics/contracts";
import { SECOND_MS } from "@chanlytics/contracts";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/legacy-bridge/surface-realtime";
import { read } from "@/legacy-bridge/api";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../surface-values";

/**
 * How quiet the feed must be before the list is read again. An import tells a notice a second or two, which beats the
 * usual 400 ms for minutes, one read a second per open tab, and tiles moving under a thumb.
 */
const FILES_QUIET_MS = 2 * SECOND_MS;

export interface FilesSurface {
  dto: FilesPageDto;
  fetchedAt: number;
}

/**
 * What the page holds: a shelf a person chose, and how far down it they have read. Nothing chosen asks with no query at all, which is
 * the read the document's head started (contracts route-prefetch), so a first visit waits for no second one. A new object each move,
 * so a read that answers after a newer move is known by it.
 */
let onScreen: { shelf?: FileShelf; limit?: number } = {};

const readAsked = ({ shelf, limit }: typeof onScreen) =>
  shelf ? read("GET files", { query: { shelf, ...(limit ? { limit } : {}) } }) : read("GET files");

/** Another shelf. What it holds replaces what stood, unless something newer was asked for meanwhile. */
export async function showFilesShelf(shelf: FileShelf): Promise<void> {
  const ask = (onScreen = { shelf });
  const dto = await readAsked(ask);
  if (ask === onScreen) setSurfaceValue("files", { dto, fetchedAt: Date.now() });
}

/** The next page of the shelf on show, after what is there. A read again then asks for all of it at once, as long as it now is. */
export async function showMoreFiles(): Promise<void> {
  const held = surfaceValue("files")?.dto;
  if (!held?.next) return;
  const { shelf, next } = held;
  const more = await read("GET files", { query: { shelf, before: next } });
  const now = surfaceValue("files")?.dto;
  if (now?.shelf !== shelf || now.next !== next) return;
  const files = [...now.files, ...more.files];
  onScreen = { shelf, limit: files.length };
  setSurfaceValue("files", { dto: { ...more, files }, fetchedAt: Date.now() });
}

export const filesOverride: SurfaceOverride = {
  key: "files",
  value: "files",
  onDemand: true,
  isStale: () => readAged(surfaceValue("files")?.fetchedAt),
  events: ["surface:files"],
  debounceMs: FILES_QUIET_MS,
  maxWaitMs: DEAR_READ_LONGEST_WAIT_MS,
  ...declareReads("files", { reads: ["file"], fresh: "its-page" }),
  apply: async () => {
    const ask = onScreen;
    try {
      const dto = await readAsked(ask);
      if (ask === onScreen) setSurfaceValue("files", { dto, fetchedAt: Date.now() });
    } catch (e) {
      // A read again that failed leaves what is on screen: the grid, and any sheet open over it, stand.
      if (!surfaceValue("files")) setSurfaceValue("files", null);
      throw e;
    }
  },
};
