/**
 * What Ask is told of a business's files (decision 0099, step 2): one line every turn, so it always knows what exists, and one
 * line a file when it reads the catalog, so it can choose before it opens anything. Names go in and ids stay out: the owner and
 * Ask say the same word for the same file. Nothing here knows a provider.
 */
import { FILE_SHELVES, shelfOf, whoStandsOf, type FileDto, type FileShelf } from "./files";
import type { FileQuality } from "./look";

/** A file as Ask reads it: what the page reads, and the rest of what the look saw. Never its provider's id. */
export interface FileForAsk extends FileDto {
  text_seen: string[];
  quality: { sharp: FileQuality | null; light: FileQuality | null };
  colors: string[];
  /** The main subject, as a share of the picture: [x1, y1, x2, y2]. */
  subject: [number, number, number, number] | null;
}

/** The word Ask and a person use for a shelf: what is on it, in lower case. */
const SHELF_SAID: Readonly<Record<Exclude<FileShelf, "all" | "inbox" | "set_aside">, string>> = {
  place: "place",
  work: "work",
  team: "team",
  products: "products",
  brand: "logos and graphics",
  made: "made by Ask",
  other: "other",
};

/** A shelf as a line says it. A file in the Inbox or set aside says that first. */
export function fileShelfSaid(f: Pick<FileDto, "status" | "shows" | "source">): string {
  const shelf = shelfOf(f);
  if (shelf === "inbox") return "inbox";
  if (shelf === "set_aside") return "set aside";
  return SHELF_SAID[shelf];
}

/**
 * The line that rides every turn, as STATUS.md would: how many are in use and on which shelves, what waits, whether there is a
 * logo, and how fresh it is. About 40 tokens, and it changes only when the library does, so the cached prefix holds.
 */
export function filesLineOf(
  files: readonly Pick<FileDto, "status" | "shows" | "source" | "created_at">[],
  timezone: string,
): string {
  if (files.length === 0) return "Files: no photos yet.";
  const kept = files.filter((f) => f.status === "filed");
  const counts = new Map<string, number>();
  for (const f of kept) counts.set(shelfOf(f), (counts.get(shelfOf(f)) ?? 0) + 1);
  const shelves = FILE_SHELVES.flatMap((s) => {
    const n = counts.get(s);
    return n && s in SHELF_SAID ? [`${SHELF_SAID[s as keyof typeof SHELF_SAID]} ${n}`] : [];
  });
  const waiting = files.filter((f) => f.status === "inbox").length;
  const newest = files.reduce((at, f) => (f.created_at > at ? f.created_at : at), "");
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: timezone }).format(
    new Date(newest),
  );
  const parts = [
    `${kept.length} ${kept.length === 1 ? "photo" : "photos"}${shelves.length ? ` (${shelves.join(", ")})` : ""}`,
    ...(waiting ? [`${waiting} in Inbox`] : []),
    `logo ${kept.some((f) => f.shows === "logo") ? "yes" : "no"}`,
    `last added ${day}`,
  ];
  return `Files: ${parts.join("; ")}.`;
}

/** What a picture's quality says, only where it says something. */
function qualitySaid(q: FileForAsk["quality"]): string | null {
  const words = [
    q.sharp === "good" ? "sharp" : q.sharp === "poor" ? "blurred" : null,
    q.light === "good" ? "well lit" : q.light === "poor" ? "poorly lit" : null,
  ].filter(Boolean);
  return words.length ? words.join(", ") : null;
}

/**
 * Who is in a picture, as a line says it, from the one place that reads a person's word beside the look's. "Not asked" is what
 * keeps a recognizable person out of what Ask suggests: it is the owner's to say, not Ask's to assume.
 */
export function fileWhoSaid(f: Pick<FileDto, "who_in_it" | "look_status" | "people">): string {
  const stands = whoStandsOf(f);
  const count = f.people?.count ?? null;
  const people = count === null ? "people" : `${count} ${count === 1 ? "person" : "people"}`;
  switch (stands.is) {
    case "said":
      return stands.who === "agreed" ? `${people}, agreed to be shown` : "no one in it";
    case "looking":
      return "not looked at yet";
    case "clear":
      return count === 0 ? "no people" : `${people}, none recognizable`;
    case "ask":
      return `${people}, not asked`;
  }
}

/** What a look's state says, where it is not an ordinary one. */
function lookSaid(f: Pick<FileDto, "look_status" | "looks_like_stock">): string | null {
  if (f.look_status === "failed") return "could not be read";
  if (f.look_status === "refused") return "would not be read";
  return f.looks_like_stock ? "may be stock" : null;
}

/**
 * A question's words as a later turn's history says them, once the pictures have left the request: the words, then the files it
 * came with, by the name that opens them now and what the look saw. None, the words as they were.
 */
export function withFilesAttached(words: string, files: readonly (Pick<FileDto, "name" | "line"> | null)[]): string {
  if (files.length === 0) return words;
  const said = files.map((f) => (!f ? "a file since removed" : f.line ? `${f.name} (${f.line})` : f.name));
  return [words, `[Attached: ${said.join("; ")}]`].filter(Boolean).join("\n");
}

/** One file on one line, to choose by: `storefront-dusk-street · place · sharp, well lit · no people: A shopfront at dusk.` */
export function fileIndexLineOf(f: FileForAsk): string {
  const head = [f.name, fileShelfSaid(f), qualitySaid(f.quality), fileWhoSaid(f), lookSaid(f)].filter(Boolean);
  return f.line ? `${head.join(" · ")}: ${f.line}` : head.join(" · ");
}
