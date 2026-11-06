/**
 * A business's files, for Settings › Files (decision 0099): `GET files`, read only where the pane is drawn, again when what
 * it holds has aged, and when the feed says a file changed, so a name the look just gave shows without a press. The
 * verbs are verbs.ts's, which only the pane loads: this module rides the route every page loads, so it holds the read alone.
 *
 * The value is the seam's (`useSurface("files")`): undefined until read, null when the read failed.
 */
import type { FilesPageDto } from "@chanlytics/contracts";
import { SECOND_MS } from "@chanlytics/contracts";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/legacy-bridge/surface-realtime";
import { read } from "@/legacy-bridge/api";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../surface-values";

/**
 * How quiet the feed must be before the whole list is read again. An import tells a notice a second or two, which beats the
 * usual 400 ms for minutes, one read a second per open tab, and tiles moving under a thumb.
 */
const FILES_QUIET_MS = 2 * SECOND_MS;

export interface FilesSurface {
  dto: FilesPageDto;
  fetchedAt: number;
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
    try {
      const d = await read("GET files");
      setSurfaceValue("files", { dto: d, fetchedAt: Date.now() });
    } catch (e) {
      // A read again that failed leaves what is on screen: the grid, and any sheet open over it, stand.
      if (!surfaceValue("files")) setSurfaceValue("files", null);
      throw e;
    }
  },
};
