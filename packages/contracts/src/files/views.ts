/** Files: views. */

import type { FileKind, FileMediaStatus } from "./kinds";
import type { PostPlan, PostShapeName } from "./post";
import type { FileSound } from "./sound";
import type { InstagramPostable, PostDto } from "../content/posts";
import {
  FILE_NAME_MAX,
  FILE_SHOWS,
  type FileLookStatus,
  type FileShows,
  type FileSource,
  type FileStatus,
  type FileWhoInIt,
} from "./limits";

/** The Files page: where a card made of a file opens, and where any page sends a person to add one. */
export const FILES_ROUTE = "admin/files";

/** Where a page's <img> points: the route signs a fresh address, for the member's own session, each time it is asked. */
export const fileViewOf = (fileId: string): string => `/api/v1/files/${fileId}/view`;

/** Its folder, for what removes everything a file has. */
export const fileFolderOf = (tenantId: string, fileId: string): string => `${tenantId}/${fileId}`;

/**
 * Where a shape of a made post is kept: portrait is the file's original, the others stand beside it. The dashboard keeps
 * them, and the edge signs one for Instagram to fetch (decision 0121).
 */
export const postPathOf = (tenantId: string, fileId: string, shape: PostShapeName): string =>
  `${fileFolderOf(tenantId, fileId)}/${shape === "portrait" ? "original" : shape}.jpg`;

/**
 * A name from any words, in any language: lower case, hyphens, no extension, and an apostrophe no break in a word (año-nuevo,
 * sams-chair). A combining mark stays with its letter, since many scripts write their vowels with them, and a name is cut
 * by whole characters. Empty where nothing is left, which the door's own fallback then fills. `words` caps it for the look,
 * whose names run long.
 */
export function fileNameOf(text: string, words?: number): string {
  const parts = text
    .trim()
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  const sentence = (words ? parts.slice(0, words) : parts).join("-");
  return Array.from(sentence).slice(0, FILE_NAME_MAX).join("").replace(/-+$/, "");
}

/** What an upload goes by until the look names it: what the file was called, or a photo (a video) where that says nothing. */
export const uploadNameOf = (fileName: string, kind: FileKind = "image"): string =>
  fileNameOf(fileName) || (kind === "video" ? "video" : "photo");

/** What a post goes by: its line, shortened as a name. */
export const postNameOf = (line: string): string => fileNameOf(line, 5) || "post";

/** A name as a person reads it: "storefront-dusk-street" says Storefront dusk street. What they type goes back through fileNameOf. */
export function fileSaidOf(name: string): string {
  const [first = "", ...rest] = Array.from(name.replaceAll("-", " "));
  return first.toUpperCase() + rest.join("");
}

/** A file as the page and Ask read it. Nothing here is a provider's or a storage path. */
export interface FileDto {
  id: string;
  /** A picture, or a video. */
  kind: FileKind;
  status: FileStatus;
  source: FileSource;
  name: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** A video's length, once the video platform has it; null for a picture. */
  seconds: number | null;
  /** Where a video stands (FILE_MEDIA_STATUSES); null for a picture. */
  media_status: FileMediaStatus | null;
  /** What a video's sound is, in a few words (sound.ts soundSaidOf: "Spanish, 2 voices, music"); null until it was heard. */
  sound_said: string | null;
  shows: FileShows | null;
  who_in_it: FileWhoInIt;
  /** Who the look counted; null until it has, or where it could not say. */
  people: FilePeople | null;
  look_status: FileLookStatus;
  /** What the look saw, in a sentence; null until it has. */
  line: string | null;
  /** What hurts its use, as the look said it. */
  issues: string[];
  looks_like_stock: boolean;
  created_at: string;
}

/** How the whole library stands, whichever page of it a read holds: what the page says of itself, and the shelves it draws. */
export interface FilesTally {
  /** Every file still here, on any shelf. */
  total: number;
  kept: number;
  /** Of what is kept, how many are videos: the rest are pictures. */
  videos: number;
  waiting: number;
  looking: number;
  shelves: Partial<Record<Exclude<FileShelf, "all">, number>>;
}

/**
 * GET files: a page of one shelf, newest first, and the tally of them all. `shelf` is the one these are from: the shelf asked for, or
 * where the library opens when none was, or the one asked for was left empty. `next` asks for the page after this; null at the last.
 */
export interface FilesPageDto {
  files: FileDto[];
  shelf: FileShelf;
  next: string | null;
  tally: FilesTally;
}

/** How a post was made (00553): the photo it came from, while that is still here, and what it was asked to be. */
export interface FileMade {
  from: { id: string; name: string } | null;
  plan: PostPlan;
}

/** A post on the business's Google profile, as it went up: Google's own name for it, and where it can be seen once Google says. */
export interface FilePosted {
  name: string;
  search_url: string | null;
  at: string;
}

/** One file, as GET files/[id] answers it. `made` is null on everything but a post, and so is `google`. */
export interface FileRecordDto {
  file: FileDto;
  made: FileMade | null;
  /** Whether it can go on Google, and whether it is there. */
  google: { connected: boolean; posted: FilePosted | null } | null;
  /**
   * Whether it can go on Instagram now (decision 0121), and its posts there, newest first. Null where the Meta link is not
   * switched on for the workspace, and on anything but a post.
   */
  instagram: { can: InstagramPostable; posts: PostDto[] } | null;
  /** A video's: what was heard of it (sound.ts), each part named by who heard it. Absent on a picture. */
  sound?: FileSound;
}

/** The most words a post on Google may carry (localPosts.create). */
export const FILE_GOOGLE_WORDS_MAX = 1500;

/** What the look counted of the people in a picture: how many, and how many someone who knows them could recognize. */
export type FilePeople = { count: number; recognizable: number };

/**
 * Where who is in a picture stands, the one place that reads the two: a person's word first, and then what the look saw. Still
 * being looked at says nothing, so a question does not flash up and go. A look that saw no one who could be recognized leaves
 * nothing to ask; otherwise a person is asked, with how many were seen where that is known.
 */
export type FileWhoStands =
  | { is: "said"; who: Exclude<FileWhoInIt, "not_asked"> }
  | { is: "looking" }
  | { is: "clear" }
  | { is: "ask"; seen: number | null };

export function whoStandsOf(file: Pick<FileDto, "who_in_it" | "look_status" | "people">): FileWhoStands {
  if (file.who_in_it !== "not_asked") return { is: "said", who: file.who_in_it };
  if (file.look_status === "waiting") return { is: "looking" };
  if (file.look_status === "done" && file.people && (file.people.count === 0 || file.people.recognizable === 0))
    return { is: "clear" };
  return { is: "ask", seen: file.people?.count ?? null };
}

/**
 * What the Inbox's one press takes: a photo the look read, that doesn't look like stock, and isn't a logo or a design. It
 * only chooses what a person is shown first and what the press covers: the press is their word, and nothing moves on the
 * model's alone.
 */
export const inboxCleanOf = (file: Pick<FileDto, "look_status" | "looks_like_stock" | "shows">): boolean =>
  file.look_status === "done" && !file.looks_like_stock && file.shows !== "logo" && file.shows !== "graphic";

/** The shelves the page draws, each a filter over what a file says of itself. */
export const FILE_SHELVES = [
  "all",
  "inbox",
  "place",
  "work",
  "team",
  "products",
  "brand",
  "made",
  "other",
  "set_aside",
] as const;

export type FileShelf = (typeof FILE_SHELVES)[number];

/** The shelf a kept file stands on, by what it shows. */
const SHELF_OF_SHOWS = {
  storefront: "place",
  interior: "place",
  work: "work",
  team: "team",
  product: "products",
  menu: "products",
  logo: "brand",
  graphic: "brand",
  other: "other",
} as const satisfies Record<FileShows, Exclude<FileShelf, "all" | "inbox" | "set_aside" | "made">>;

/** The one shelf a file stands on: its place in the pile first, then what it shows. "all" is no file's own. */
export function shelfOf(
  file: Pick<FileDto, "status" | "shows"> & { source?: FileSource | undefined },
): Exclude<FileShelf, "all"> {
  if (file.status === "inbox") return "inbox";
  if (file.status === "set_aside") return "set_aside";
  if (file.source === "made") return "made";
  return file.shows ? SHELF_OF_SHOWS[file.shows] : "other";
}

/** What stands on a shelf, as a read asks the database for it: `shelfOf` turned round. A test holds the two equal over every file there can be. */
export interface FileShelfFilter {
  status: FileStatus;
  /** Posts alone where true, and anything but where false; where it is unsaid, both. */
  made?: boolean;
  shows?: readonly FileShows[];
  /** A file nothing has said anything of stands here too. */
  orUnsorted?: boolean;
}

export function shelfFilterOf(shelf: FileShelf): FileShelfFilter {
  switch (shelf) {
    case "all":
      return { status: "filed" };
    case "inbox":
    case "set_aside":
      return { status: shelf };
    case "made":
      return { status: "filed", made: true };
    default:
      return {
        status: "filed",
        made: false,
        shows: FILE_SHOWS.filter((s) => SHELF_OF_SHOWS[s] === shelf),
        ...(shelf === "other" ? { orUnsorted: true } : {}),
      };
  }
}

/** How the library stands, from what each file says of itself. */
export function filesTallyOf(
  files: readonly (Pick<FileDto, "status" | "shows" | "look_status"> & {
    source?: FileSource | undefined;
    kind?: FileKind | undefined;
  })[],
): FilesTally {
  const shelves: FilesTally["shelves"] = {};
  for (const f of files) {
    const shelf = shelfOf(f);
    shelves[shelf] = (shelves[shelf] ?? 0) + 1;
  }
  return {
    total: files.length,
    kept: files.filter((f) => f.status === "filed").length,
    videos: files.filter((f) => f.status === "filed" && f.kind === "video").length,
    waiting: files.filter((f) => f.status === "inbox").length,
    looking: files.filter((f) => f.look_status === "waiting").length,
    shelves,
  };
}

/** Where the library opens: the Inbox while anything waits on a person who can answer it, else Kept where something is, else the first that holds. */
export function fileShelfOpening(tally: FilesTally, mayAnswer: boolean): FileShelf {
  if (mayAnswer && tally.waiting > 0) return "inbox";
  if (tally.kept > 0) return "all";
  return FILE_SHELVES.find((s) => s !== "all" && tally.shelves[s]) ?? "all";
}
