/**
 * The build's list of the frame's stylesheet files, read once: which files a page links, which a part of a page links
 * for itself, and every file's place in the cascade's order (write-page-sheets.ts writes them and says them in
 * `NEXT_PUBLIC_SHEETS`).
 *
 * Nothing of React is here, so a part that links one stylesheet (sheet-of.tsx, the lead map's) reads the list without
 * bringing the pages' links and their context with it: a module a node test loads under the server's React, where
 * there is no context to create, must be able to load the map.
 */
import { publicEnv } from "@/lib/public-env";
import type { SheetManifest } from "./page-sheets";

const isManifest = (value: unknown): value is SheetManifest =>
  typeof value === "object" && value !== null && "files" in value && "pages" in value && "apart" in value;

/** The build's list, read once: nothing where there is none (a test, a page outside the frame). */
function sheetManifest(): SheetManifest {
  const none: SheetManifest = { files: [], pages: {}, apart: {} };
  const fromBuild = publicEnv.NEXT_PUBLIC_SHEETS;
  if (!fromBuild) return none;
  const parsed: unknown = JSON.parse(fromBuild);
  return isManifest(parsed) ? parsed : none;
}
const LIST = sheetManifest();

/** A file as it is linked: its precedence, and its address. */
interface LinkedSheet {
  slot: string;
  href: string;
}

const linkedAt = (places: readonly number[]): LinkedSheet[] =>
  places.flatMap((place) => {
    const file = LIST.files[place];
    return file ? [{ slot: file[0], href: file[1] }] : [];
  });

/**
 * The page an address is, as the build names it: the first word after the workspace where a page of that word has
 * files, the workspace's own catch-all otherwise (the home is Today's, and a route the frame draws has the frame's).
 */
function pageOfPath(pathname: string): string {
  const [, first = "", , word = ""] = pathname.split("/");
  if (first !== "w") return first && LIST.pages[first] ? first : "home";
  return LIST.pages[word] ? word : "route";
}

/** Every file's precedence, in the cascade's order. */
export const sheetSlots = (): string[] => LIST.files.map(([slot]) => slot);

/** The files a page links, by the page's name as the build has it. */
export const sheetsOfPage = (page: string): LinkedSheet[] => linkedAt(LIST.pages[page] ?? []);

/** The files of the page an address is. */
export const sheetsOfPath = (pathname: string): LinkedSheet[] => sheetsOfPage(pageOfPath(pathname));

/** The file a part of a page links for itself, by its name in the list, or none where the list has none. */
export function sheetApart(name: string): LinkedSheet | undefined {
  const place = LIST.apart[name];
  return place === undefined ? undefined : linkedAt([place])[0];
}
