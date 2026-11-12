/**
 * A business's files, for Settings › Files (decision 0099): `GET files`, read only where the pane is drawn, again when what
 * it holds has aged, and when the feed says a file changed, so a name the look just gave shows without a press. A read answers one
 * page of one shelf and how the whole library stands, and reads the same again as it changes, so a shelf chosen and what a person has
 * scrolled through stay on screen. The presses are verbs.ts's, which only the pane loads: this module rides the route every page
 * loads, so it holds the read and the two moves that change what it asks.
 *
 * The value is the seam's (`useSurface("files")`): undefined until read, null when the read failed.
 */
import type { FileKind, FileShelf, FilesPageDto } from "@chanlytics/contracts";
import { SECOND_MS } from "@chanlytics/contracts";
import { readAged, type SurfaceOverride } from "@/bridge/surface-data";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/bridge/surface-realtime";
import { read } from "@/bridge/api";
import { declareReads } from "@/bridge/surface-registry";
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

/** What the Library shows: a shelf (all it keeps, or what waits, or what was set aside), one kind or both, and the words found by. */
export interface FilesView {
  shelf: FileShelf;
  kind: FileKind | null;
  about: string | null;
}

/**
 * What the page holds: the view a person chose, and how far down it they have read. Nothing chosen asks with no query at all, which
 * is the read the document's head started (contracts route-prefetch), so a first visit waits for no second one. A new object each
 * move, so a read that answers after a newer move is known by it.
 */
let onScreen: Partial<FilesView> & { limit?: number } = {};

const readAsked = ({ shelf, kind, about, limit }: typeof onScreen) =>
  shelf || kind || about
    ? read("GET files", {
        query: {
          ...(shelf ? { shelf } : {}),
          ...(kind ? { kind } : {}),
          ...(about ? { about } : {}),
          ...(limit ? { limit } : {}),
        },
      })
    : read("GET files");

/**
 * What the page holds, told to it at once: a value set outside the seam's own read moves nothing on screen until the surface
 * says it moved, as the seam says after a read (calendar/surface.ts does the same). Without it a shelf's press waited for
 * the next unrelated redraw, a second or more, while the tab it moved to slid back (Ruben, 12 Nov 2026).
 */
function show(value: FilesSurface): void {
  setSurfaceValue("files", value);
  window.dispatchEvent(new CustomEvent("surface:files"));
}

const viewKeyOf = (view: FilesView) => `${view.shelf}|${view.kind ?? ""}|${view.about ?? ""}`;
const viewOf = (dto: FilesPageDto): FilesView => ({ shelf: dto.shelf, kind: dto.kind, about: dto.about });

/** Each view as it was last shown this visit: one seen before shows at a press, and is read again behind it. */
const seen = new Map<string, FilesSurface>();

/**
 * What one kind holds of what all of it already shows: the newest of all are each kind's newest, so Photos or Videos from All
 * shows them at once, and the read fills in the rest. Nothing for words, which only the read can find.
 */
function shownOfKind(held: FilesSurface, view: FilesView): FilesSurface | null {
  const was = held.dto;
  if (view.about || was.about || view.shelf !== was.shelf || was.kind || !view.kind) return null;
  const files = was.files.filter((f) => f.kind === view.kind);
  return files.length ? { dto: { ...was, kind: view.kind, files, next: null }, fetchedAt: held.fetchedAt } : null;
}

/**
 * Another view, at the press: what it showed last, or what is already on screen of it, stands at once (Ruben, 12 Nov 2026: a
 * tab waited on the server before anything moved), and the read replaces it, unless something newer was asked for meanwhile.
 */
export async function showFiles(view: FilesView): Promise<void> {
  const ask = (onScreen = { ...view });
  const now = surfaceValue("files");
  if (now) seen.set(viewKeyOf(viewOf(now.dto)), now);
  const early = seen.get(viewKeyOf(view)) ?? (now ? shownOfKind(now, view) : null);
  if (early) show(early);
  const dto = await readAsked(ask);
  if (ask !== onScreen) return;
  const landed = { dto, fetchedAt: Date.now() };
  seen.set(viewKeyOf(viewOf(dto)), landed);
  show(landed);
}

/** The next page of the view on show, after what is there. A read again then asks for all of it at once, as long as it now is. */
export async function showMoreFiles(): Promise<void> {
  const held = surfaceValue("files")?.dto;
  if (!held?.next) return;
  const { shelf, kind, next } = held;
  const more = await read("GET files", { query: { shelf, ...(kind ? { kind } : {}), before: next } });
  const now = surfaceValue("files")?.dto;
  if (now?.shelf !== shelf || now.kind !== kind || now.next !== next) return;
  const files = [...now.files, ...more.files];
  onScreen = { shelf, kind, about: null, limit: files.length };
  show({ dto: { ...more, files }, fetchedAt: Date.now() });
}

/** The next read of the view on show asks for this many, where a batch that just arrived would run past a page. */
export function readFilesUpTo(limit: number): void {
  const dto = surfaceValue("files")?.dto;
  if (dto) onScreen = { ...viewOf(dto), limit };
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
