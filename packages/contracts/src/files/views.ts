/** Files: views. */

import type { ContentSourcesDto } from "../content/sources";
import type { FileCopyState, FileCopyWhy } from "./copy";
import type { FileKind, FileMediaStatus } from "./kinds";
import type { PostPlan, PostShapeName } from "./post";
import type { FileSound } from "./sound";
import type { HandPostDto, InstagramPostable, PostDto } from "../content/posts";
import type { PiecePlan } from "../content/pieces";
import {
  FILE_NAME_MAX,
  FILE_SHOWS,
  type FileLooksLike,
  type FileLookStatus,
  type FileShows,
  type FileSource,
  type FileStatus,
} from "./limits";

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

/**
 * What the look found wrong with a file, as a person reads it: each note a sentence, its first letter capital and its end a
 * stop, so three notes never run together as one. The page's sheet and Ask's card both say them through here.
 */
export function issuesSaidOf(issues: readonly string[]): string {
  return issues
    .map((issue) => issue.trim().replace(/[,;:]+$/u, ""))
    .filter(Boolean)
    .map((issue) => {
      const [first = "", ...rest] = Array.from(issue);
      const sentence = first.toUpperCase() + rest.join("");
      return /[.!?]$/u.test(sentence) ? sentence : `${sentence}.`;
    })
    .join(" ");
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
  /**
   * Where a video's copy at the video platform stands (copy.ts): everything but a watched folder's clip is `here`. One
   * that is not plays only once it is back, and says why where it could not come (the dashboard's files/footage/copy-words.ts).
   */
  copy: FileCopyState;
  copy_why: FileCopyWhy | null;
  /**
   * A watched file whose original left its folder (00657): seen in its provider's bin (gone) or moved out (outside), and
   * when; null while its folder still holds it. Its row says the day it leaves (footage-numbers.ts graceDays).
   */
  origin_left?: "gone" | "outside" | null;
  origin_left_at?: string | null;
  /**
   * Its owner added this same file themselves (00654 files.owner_uploaded, read by a member since 00661): it is theirs, so
   * it never steps aside, its original leaving its folder takes nothing from the Library, and a copy on its way back comes
   * from what they added. Absent is no, as on a row read before it.
   */
  owner_uploaded?: boolean;
  shows: FileShows | null;
  /**
   * Who the look counted; null until it has, or where it could not say. It describes the picture, for choosing and
   * saying what is in it: footage a business provides is taken as cleared, so nobody in it is asked (22 Nov 2026).
   */
  people: FilePeople | null;
  look_status: FileLookStatus;
  /** What the look saw, in a sentence; null until it has. */
  line: string | null;
  /** What hurts its use, as the look said it. */
  issues: string[];
  looks_like_stock: boolean;
  /** What kind of picture it is, as the look said (edition 2); null before it has, on an earlier edition's row, and for a video. */
  looks_like: FileLooksLike | null;
  created_at: string;
}

/** How the whole library stands, whichever page of it a read holds: what the page says of itself, and the shelves it draws. */
export interface FilesTally {
  /** Every file still here, on any shelf. */
  total: number;
  /** What the business brought and keeps (Kept): not what Ask made, which its own shelf counts. */
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
  /** One kind alone (the Library's Photos or Videos), or both. */
  kind: FileKind | null;
  /** The words it was searched by, through what Ask's look saw in each file (00612 files_found); null where none were. */
  about: string | null;
  next: string | null;
  tally: FilesTally;
  /**
   * Where Ask looked for photos and videos and what came of it (content/sources.ts), read while the library holds nothing: the
   * empty Library's card, from its own read, since the Library reads nothing of Made. Absent where it holds something.
   */
  sources?: ContentSourcesDto | null;
}

/** How a post was made (00553): the photo it came from, while that is still here, and what it was asked to be. */
export interface FileMade {
  from: { id: string; name: string } | null;
  plan: PostPlan;
  /**
   * The caption as the owner wrote it where the post stands (Content's Details), over the words Ask wrote from the picture;
   * empty where they cleared it, null where they never changed it.
   */
  caption: string | null;
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
  /**
   * Whether it can go on the business's Facebook Page now (the content loop PRD's pass 5), and its posts there, newest
   * first. Null or absent where Facebook is not offered to the workspace (the Meta link off, or the place not switched on),
   * and from a server before it was answered.
   */
  facebook?: { can: InstagramPostable; posts: PostDto[] } | null;
  /**
   * A made post's posts at every place, newest first, whatever the Meta link: where a piece read on its own stands (a link, the
   * bell's row), as the page that lists it says. Absent on anything but a made post, and from a server before it was answered.
   */
  posts?: PostDto[];
  /** Where its owner said they posted a made piece themselves (00620), or none. Absent on anything Ask did not make. */
  by_hand?: HandPostDto | null;
  /** A video's: what was heard of it (sound.ts), each part named by who heard it. Absent on a picture. */
  sound?: FileSound;
  /**
   * A video Ask made: the plan it was drawn by, so its words can be made again (the content redesign's stage 2). Absent on
   * anything else, and on one whose plan is gone with the card that asked for it.
   */
  video?: { plan: PiecePlan };
  /**
   * A made video's versions (00708; the version board): the version it stands at, a new one being made or one that could
   * not be, and each version it was drawn as, newest first. Absent on anything else, and from a server before versions.
   */
  version?: PieceVersionsDto;
}

/** One version of a made video as its sheet lists it: its number, what moved, when, and its own file. */
export interface PieceVersionDto {
  n: number;
  changed: string[];
  at: string;
  file_id: string;
}

/** A made video's versions (00708). */
export interface PieceVersionsDto {
  /** The version it stands at now. */
  n: number;
  /** A new version being made (its stage), or null. */
  drawing: string | null;
  /** The newest new version could not be made; the one before still stands as approved. */
  failed: boolean;
  /** Each version drawn (its own file), newest first: one is no list. */
  list: PieceVersionDto[];
  /** Posts still set to go at an older version: each waits for this version's approval (the version board, cells 2 and 4). */
  waiting: string[];
}

/** The most words a post on Google may carry (localPosts.create). */
export const FILE_GOOGLE_WORDS_MAX = 1500;

/** What the look counted of the people in a picture: how many, and how many someone who knows them could recognize. */
export type FilePeople = { count: number; recognizable: number };

/**
 * What the Inbox's one press takes: a photo the look read, that doesn't look like stock, and isn't a logo or a design. Where
 * the look said what kind of picture it is (edition 2), only a camera's photo: one a computer rendered, a design or a
 * screenshot is left for a person to open. It only chooses what a person is shown first and what the press covers: the
 * press is their word, and nothing moves on the model's alone.
 */
export const inboxCleanOf = (
  file: Pick<FileDto, "look_status" | "looks_like_stock" | "looks_like" | "shows">,
): boolean =>
  file.look_status === "done" &&
  !file.looks_like_stock &&
  (file.looks_like ?? "photo") === "photo" &&
  file.shows !== "logo" &&
  file.shows !== "graphic";

/**
 * The shelves, each a filter over what a file says of itself. Kept ("all") is what the business brought, and what Ask made stands
 * on its own shelf (`made`), read where it is asked for (Ask's list, the Ads picker's Made by Ask) and never drawn among the
 * Library's: Content's Made holds those pieces, and the Library is what they are made from (the content canvas).
 */
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
  "made_aside",
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
} as const satisfies Record<FileShows, Exclude<FileShelf, "all" | "inbox" | "set_aside" | "made" | "made_aside">>;

/** The one shelf a file stands on: its place in the pile first, then what it shows. "all" is no file's own. */
export function shelfOf(
  file: Pick<FileDto, "status" | "shows"> & { source?: FileSource | undefined },
): Exclude<FileShelf, "all"> {
  if (file.status === "inbox") return "inbox";
  // What Ask made and was set aside is Made's to show again (Content's Set aside), never among the business's own.
  if (file.status === "set_aside") return file.source === "made" ? "made_aside" : "set_aside";
  if (file.source === "made") return "made";
  return file.shows ? SHELF_OF_SHOWS[file.shows] : "other";
}

/** What stands on a shelf, as a read asks the database for it: `shelfOf` turned round. A test holds the two equal over every file there can be. */
export interface FileShelfFilter {
  status: FileStatus;
  /** Posts alone where true, and anything but where false; where it is unsaid, both. */
  made?: boolean;
  /** One kind alone (the Library's Photos or Videos); where it is unsaid, both. */
  kind?: FileKind;
  shows?: readonly FileShows[];
  /** A file nothing has said anything of stands here too. */
  orUnsorted?: boolean;
}

export function shelfFilterOf(shelf: FileShelf): FileShelfFilter {
  switch (shelf) {
    case "all":
      return { status: "filed", made: false };
    case "inbox":
      return { status: shelf };
    case "set_aside":
      return { status: "set_aside", made: false };
    case "made_aside":
      return { status: "set_aside", made: true };
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

/** How the library stands, from what each file says of itself: what is kept is what the business brought, as Kept shows. */
export function filesTallyOf(
  files: readonly (Pick<FileDto, "status" | "shows" | "look_status"> & {
    source?: FileSource | undefined;
    kind?: FileKind | undefined;
    /** How many files the row stands for, where the database counted them grouped (00657); one where absent. */
    n?: number | undefined;
  })[],
): FilesTally {
  const shelves: FilesTally["shelves"] = {};
  for (const f of files) {
    const shelf = shelfOf(f);
    shelves[shelf] = (shelves[shelf] ?? 0) + (f.n ?? 1);
  }
  const kept = files.filter((f) => f.status === "filed" && f.source !== "made");
  return {
    total: filesCountedOf(files),
    kept: filesCountedOf(kept),
    videos: filesCountedOf(kept.filter((f) => f.kind === "video")),
    waiting: filesCountedOf(files.filter((f) => f.status === "inbox")),
    looking: filesCountedOf(files.filter((f) => f.look_status === "waiting")),
    shelves,
  };
}

/** How many files rows stand for: each its own `n` where the database counted them grouped, else one. */
export const filesCountedOf = (rows: readonly { n?: number | undefined }[]): number =>
  rows.reduce((sum, row) => sum + (row.n ?? 1), 0);
