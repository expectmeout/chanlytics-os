/**
 * What Ask is told of a business's files (decision 0099, step 2): one line every turn, so it always knows what exists, and one
 * line a file when it reads the catalog, so it can choose before it opens anything. Names go in and ids stay out: the owner and
 * Ask say the same word for the same file. Nothing here knows a provider.
 */
import {
  FILE_SHELVES,
  clockOf,
  keptSaidOf,
  shelfOf,
  whoStandsOf,
  type FileDto,
  type FileKind,
  type FileQuality,
  type FileShelf,
  type FileSound,
} from "@chanlytics/contracts";

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
export function fileShelfSaid(file: Pick<FileDto, "status" | "shows" | "source">): string {
  const shelf = shelfOf(file);
  if (shelf === "inbox") return "inbox";
  if (shelf === "set_aside") return "set aside";
  return SHELF_SAID[shelf];
}

/**
 * The line that rides every turn, as STATUS.md would: how many are in use and on which shelves, what waits, whether there is a
 * logo, and how fresh it is. About 40 tokens, and it changes only when the library does, so the cached prefix holds.
 */
export function filesLineOf(
  files: readonly (Pick<FileDto, "status" | "shows" | "source" | "created_at"> & { kind?: FileKind | undefined })[],
  timezone: string,
): string {
  if (files.length === 0) return "Files: no photos yet.";
  const kept = files.filter((f) => f.status === "filed");
  const videos = kept.filter((f) => f.kind === "video").length;
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
    `${keptSaidOf(kept.length, videos)}${shelves.length ? ` (${shelves.join(", ")})` : ""}`,
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
export function fileWhoSaid(file: Pick<FileDto, "who_in_it" | "look_status" | "people">): string {
  const stands = whoStandsOf(file);
  const count = file.people?.count ?? null;
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

/** A file as a later turn's history names it: a video says its length and whether its sound was read (stage B). */
type FileRecalled = Pick<FileDto, "name" | "line"> & {
  kind?: FileKind | undefined;
  seconds?: number | null | undefined;
  sound?: FileSound | undefined;
};

/**
 * A question's words as a later turn's history says them, once the pictures have left the request: the words, then the files it
 * came with, by the name that opens them now and what the look saw. None, the words as they were.
 */
export function withFilesAttached(words: string, files: readonly (FileRecalled | null)[]): string {
  return withFilesSaid(words, "Attached", files);
}

/**
 * An answer's words with the files Ask opened in that turn, the same way (Ask's eyes): a later cold turn knows what it looked at,
 * and that the pixels are not in front of it until it opens them again.
 */
export function withFilesOpened(words: string, files: readonly (FileRecalled | null)[]): string {
  return withFilesSaid(words, "Opened", files);
}

/** How a file is named in that history: its name and what the look saw; a video's length and its sound's state before that. */
function recalledOf(f: FileRecalled): string {
  if (f.kind !== "video") return f.line ? `${f.name} (${f.line})` : f.name;
  const heard = f.sound?.none ? ", no sound" : f.sound?.words || f.sound?.note ? ", words and sound read" : "";
  const length = typeof f.seconds === "number" ? ` ${clockOf(f.seconds)}` : "";
  return `${f.name} (video${length}${heard}${f.line ? `: ${f.line}` : ""})`;
}

function withFilesSaid(words: string, how: string, files: readonly (FileRecalled | null)[]): string {
  if (files.length === 0) return words;
  const recalled = files.map((f) => (!f ? "a file since removed" : recalledOf(f)));
  return [words, `[${how}: ${recalled.join("; ")}]`].filter(Boolean).join("\n");
}

/** A video as a line says it: its length, or that it is still being made ready, or that it could not be. */
function videoSaid(f: Pick<FileDto, "kind" | "seconds" | "media_status" | "sound_said">): string | null {
  if (f.kind !== "video") return null;
  if (f.media_status === "failed") return "video, could not be prepared";
  if (f.media_status !== "ready") return "video, still being prepared";
  const length = f.seconds !== null ? `video ${clockOf(f.seconds)}` : "video";
  return f.sound_said ? `${length} · ${f.sound_said}` : length;
}

/** One file on one line, to choose by: `storefront-dusk-street · place · sharp, well lit · no people: A shopfront at dusk.` */
export function fileIndexLineOf(fileForAsk: FileForAsk): string {
  const head = [
    fileForAsk.name,
    fileShelfSaid(fileForAsk),
    videoSaid(fileForAsk),
    qualitySaid(fileForAsk.quality),
    fileWhoSaid(fileForAsk),
    lookSaid(fileForAsk),
  ].filter(Boolean);
  return fileForAsk.line ? `${head.join(" · ")}: ${fileForAsk.line}` : head.join(" · ");
}
