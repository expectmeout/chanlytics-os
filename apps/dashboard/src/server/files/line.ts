/**
 * What Ask is told of a business's files (decision 0099, step 2): one line every turn, so it always knows what exists, and one
 * line a file when it reads the catalog, so it can choose before it opens anything. Names go in and ids stay out: the owner and
 * Ask say the same word for the same file. Nothing here knows a provider.
 */
import {
  FILE_SHELVES,
  clockOf,
  footageAsidesOf,
  footageStandingOf,
  keptSaidOf,
  filesCountedOf,
  shelfOf,
  type FileDto,
  type FileKind,
  type FileLook,
  type FileQuality,
  type FileShelf,
  type FileSound,
  type FootageDto,
  entryOf,
} from "@chanlytics/contracts";

/** A file as Ask reads it: what the page reads, and the rest of what the look saw. Never its provider's id. */
export interface FileForAsk extends FileDto {
  text_seen: string[];
  quality: { sharp: FileQuality | null; light: FileQuality | null };
  colors: string[];
  /** The main subject, as a share of the picture: [x1, y1, x2, y2]. */
  subject: [number, number, number, number] | null;
  /** What a post could use it for, as the look said in a few words; null where it named none, and before edition 2. */
  use: string | null;
  /** A video's: the moment the look chose to stand for the whole clip, in seconds; null for a picture, or before its look. */
  stands_at: number | null;
  /** A video's: the moments its look named as worth using on their own, best first; none for a picture, or before its look. */
  moments: NonNullable<FileLook["moments"]>;
}

/** The word Ask and a person use for a shelf: what is on it, in lower case. */
const SHELF_SAID: Readonly<Record<Exclude<FileShelf, "all" | "inbox" | "set_aside">, string>> = {
  place: "place",
  work: "work",
  team: "team",
  products: "products",
  brand: "logos and graphics",
  made: "made by AI",
  other: "other",
  made_aside: "made by AI, set aside",
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
  files: readonly (Pick<FileDto, "status" | "shows" | "source" | "created_at"> & {
    kind?: FileKind | undefined;
    n?: number | undefined;
  })[],
  timezone: string,
): string {
  if (filesCountedOf(files) === 0) return "Files: no photos yet.";
  // What the business keeps, as the Library counts it; what Ask made is said apart, as Made holds it.
  const kept = files.filter((f) => f.status === "filed" && f.source !== "made");
  const made = filesCountedOf(files.filter((f) => f.status === "filed" && f.source === "made"));
  const videos = filesCountedOf(kept.filter((f) => f.kind === "video"));
  const counts = new Map<string, number>();
  for (const f of kept) counts.set(shelfOf(f), (counts.get(shelfOf(f)) ?? 0) + (f.n ?? 1));
  const shelves = FILE_SHELVES.flatMap((s) => {
    const n = counts.get(s);
    const shelfWords = entryOf(SHELF_SAID, s);
    return n && shelfWords ? [`${shelfWords} ${n}`] : [];
  });
  const waiting = filesCountedOf(files.filter((f) => f.status === "inbox"));
  const newest = files.reduce((at, f) => (f.created_at > at ? f.created_at : at), "");
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: timezone }).format(
    new Date(newest),
  );
  const parts = [
    `${keptSaidOf(filesCountedOf(kept), videos)}${shelves.length ? ` (${shelves.join(", ")})` : ""}`,
    ...(made ? [`${SHELF_SAID.made} ${made}`] : []),
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
 * Who is in a picture, as a line says it, from what the look counted: to choose by and to say what it shows. Nobody in
 * it is asked: footage a business provides is taken as cleared (Ruben, 22 Nov 2026).
 */
export function fileWhoSaid(file: Pick<FileDto, "look_status" | "people">): string | null {
  if (file.look_status === "waiting") return "not looked at yet";
  const { people } = file;
  if (!people) return null;
  if (people.count === 0) return "no people";
  const counted = `${people.count} ${people.count === 1 ? "person" : "people"}`;
  return people.recognizable === 0 ? `${counted}, none recognizable` : counted;
}

/** What a look's state says, where it is not an ordinary one. */
function lookSaid(f: Pick<FileDto, "look_status" | "looks_like_stock" | "looks_like">): string | null {
  if (f.look_status === "failed") return "could not be read";
  if (f.look_status === "refused") return "would not be read";
  // What kind of picture it is, where it is not the business's own photo and its shelf does not already say so.
  if (f.looks_like === "rendered") return "looks rendered or AI-made";
  if (f.looks_like === "screenshot") return "a screenshot";
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

/**
 * What Ask is told of a watched Google Drive folder, in a line every turn (the canvas's Confirm 12: asked how the folder
 * is doing, AI says it, with no card and no tool): which folder, whose Drive, and where it stands in the words Settings
 * says. The time it was last read is left out, so the line changes only when the folder does. What it could not bring
 * in and what Drive is still processing follow, each with its one reason (the content loop PRD's F3 and F5), so AI
 * says them as the row does. None where no Google account is connected.
 */
export function folderLineOf(footage: FootageDto): string | null {
  const { account } = footage;
  if (!account) return null;
  const folder = footage.folder && footage.folder.state !== "stopped" ? { ...footage.folder, updated_at: null } : null;
  const standing = footageStandingOf({ ...footage, folder }, () => "");
  const holder = account.email ?? "the connected account";
  const subject = folder ? `Google Drive folder “${folder.name}” (${holder}), watched` : `Google Drive (${holder})`;
  const asides = folder ? footageAsidesOf(folder).map((aside) => `${aside.head}: ${aside.reasons.join("; ")}.`) : [];
  return [`${subject}: ${standing.badge}.`, standing.say.replace(/\.?$/, "."), ...asides].join(" ");
}
