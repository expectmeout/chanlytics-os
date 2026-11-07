/**
 * A business's files (decision 0099): every picture and every video it has, one row and one folder, whichever road brought
 * it. A member's upload, its Google profile, its public listing, or its website; each is looked at once (look.ts), which names
 * it for what it shows and writes down what it saw, so the page and Ask say the same word for the same file. A video (decision
 * 0099, stage B) is kept by the video platform, and its folder holds only what was made of it: its sheet of frames, its poster
 * and its sound (video.ts, sound.ts).
 *
 * The closed sets are declared here and held equal to the database's CHECKs through SCHEMA_SETS. The words the page says
 * are here too, and nothing here knows a provider.
 */

import { DAY_MS, SECOND_MS } from "../shared/time";
import type { PostPlan } from "./post";
import type { FileSound } from "./sound";

/** The private bucket (00551): `<tenant>/<file>/original.<ext>`, written only by a signed upload or the service role. */
export const FILES_BUCKET = "files";
/** The most files a workspace keeps, and file_start's and file_found's own number (00551). */
export const FILES_MAX = 1000;
/** How many of a shelf one read answers: a screen or two of tiles, and a person who scrolls reads the next. */
export const FILES_PAGE = 60;
/** The most one upload weighs: the bucket's own limit, and the most a signed resize takes as its source ("25MB", on Storage's page). */
export const FILE_BYTES_MAX = 25_000_000;
/** The largest picture Storage will resize. Past it no copy can be made, to draw or to look at, so it is not kept. */
export const FILE_PIXELS_MAX = 50_000_000;
/** The shortest side an upload may have: a smaller picture reads badly, to a person and to the look. */
export const FILE_SIDE_MIN = 200;
/** How long a file's bytes may be cached: its folder is its own uuid's and its bytes never change. */
export const FILE_CACHE_S = (365 * DAY_MS) / SECOND_MS;
/** The most files one press of Add takes, so a phone's whole roll is not sent by accident. Past it the first are taken. */
export const FILE_UPLOADS_AT_ONCE = 100;
/** The most one video weighs (decision 0099, stage B, D7): what a phone makes of ten minutes, and some. */
export const FILE_VIDEO_BYTES_MAX = 500_000_000;
/** The longest video, in seconds: a business's clips are short, and this keeps one workspace from filling the account. */
export const FILE_VIDEO_SECONDS_MAX = 600;
/** How many minutes of video a workspace keeps, its videos and its uploads still on their way together. */
const FILE_VIDEO_MINUTES_MAX = 60;
/** The most words the look gives a name. A person may give it as many as fit. */
export const FILE_NAME_WORDS = 4;
/** The longest name: file_name_shape's own number (00551). */
export const FILE_NAME_MAX = 60;

export const FILE_STATUSES = ["inbox", "filed", "set_aside"] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const FILE_SOURCES = ["upload", "google_profile", "google_listing", "website", "made"] as const;
export type FileSource = (typeof FILE_SOURCES)[number];

export const FILE_SHOWS = [
  "storefront",
  "interior",
  "work",
  "team",
  "product",
  "menu",
  "logo",
  "graphic",
  "other",
] as const;
export type FileShows = (typeof FILE_SHOWS)[number];

export const FILE_WHO_IN_IT = ["not_asked", "no_one", "agreed"] as const;
export type FileWhoInIt = (typeof FILE_WHO_IN_IT)[number];

export const FILE_LOOK_STATUSES = ["waiting", "done", "refused", "failed"] as const;
export type FileLookStatus = (typeof FILE_LOOK_STATUSES)[number];

/** A picture, or a video (stage B): what the row is, which decides where its bytes live and how it is seen. */
export const FILE_KINDS = ["image", "video"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/**
 * Where a video stands with the video platform: its bytes on their way (`uploading`, which no page or Ask counts yet),
 * arrived and being prepared (`processing`), playable (`ready`), or refused (`failed`). Null for a picture.
 */
export const FILE_MEDIA_STATUSES = ["uploading", "processing", "ready", "failed"] as const;
export type FileMediaStatus = (typeof FILE_MEDIA_STATUSES)[number];

const FILE_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const FILE_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const FILE_MIMES = [...FILE_IMAGE_MIMES, ...FILE_VIDEO_MIMES] as const;
export type FileMime = (typeof FILE_MIMES)[number];
export type FileImageMime = (typeof FILE_IMAGE_MIMES)[number];
export type FileVideoMime = (typeof FILE_VIDEO_MIMES)[number];

/** The kinds of file a member may add, each with the extension its folder (or the video platform) keeps it under. */
export const FILE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
} as const satisfies Record<FileMime, string>;

/** Whether a type is one a member may add, a picture or a video. */
export const isFileMime = (value: unknown): value is FileMime =>
  typeof value === "string" && Object.hasOwn(FILE_TYPES, value);
/** Whether a type is a video's: what the video platform keeps. */
export const isVideoMime = (value: unknown): value is FileVideoMime =>
  typeof value === "string" && (FILE_VIDEO_MIMES as readonly string[]).includes(value);
/** A type's kind. */
export const fileKindOf = (mime: FileMime): FileKind => (isVideoMime(mime) ? "video" : "image");

/** Where a picture's bytes live: its own folder, which the purge empties whole. A video keeps none here. */
export const filePathOf = (tenantId: string, fileId: string, mime: FileMime): string =>
  `${tenantId}/${fileId}/original.${FILE_TYPES[mime]}`;

/**
 * What is made of a video and kept in its folder (stage B): its sheet of frames (what a model is shown of it), its poster (what a
 * tile draws) and its sound (what the ears are sent, and sent again on a question). Each goes with the folder.
 */
export const FILE_MADE_OF_VIDEO = { sheet: "sheet.jpg", poster: "poster.jpg", audio: "audio.m4a" } as const;
export type FileMadeOfVideo = keyof typeof FILE_MADE_OF_VIDEO;
/** The type each is kept under: Storage holds a folder's types to the bucket's list. */
export const FILE_MADE_OF_VIDEO_MIMES = {
  sheet: "image/jpeg",
  poster: "image/jpeg",
  audio: "audio/mp4",
} as const satisfies Record<FileMadeOfVideo, string>;
export const fileMadePathOf = (tenantId: string, fileId: string, which: FileMadeOfVideo): string =>
  `${tenantId}/${fileId}/${FILE_MADE_OF_VIDEO[which]}`;

/** Where a page's <img> points: the route signs a fresh address, for the member's own session, each time it is asked. */
export const fileViewOf = (fileId: string): string => `/api/v1/files/${fileId}/view`;

/** Its folder, for what removes everything a file has. */
export const fileFolderOf = (tenantId: string, fileId: string): string => `${tenantId}/${fileId}`;

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
  const slug = (words ? parts.slice(0, words) : parts).join("-");
  return Array.from(slug).slice(0, FILE_NAME_MAX).join("").replace(/-+$/, "");
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

/** The place in a shelf's order a page ends at, for the next to start from. */
export const fileCursorOf = (file: Pick<FileDto, "created_at" | "id">): string => `${file.created_at}|${file.id}`;

/** "6 photos", "1 video", "6 photos and 2 videos": what is kept, by kind, a kind with none left unsaid unless all are none. */
export function keptSaidOf(keptCount: number, videos: number): string {
  const photos = Math.max(0, keptCount - videos);
  const p = `${photos} ${photos === 1 ? "photo" : "photos"}`;
  const v = `${videos} ${videos === 1 ? "video" : "videos"}`;
  if (videos === 0) return p;
  return photos === 0 ? v : `${p} and ${v}`;
}

/** What the page says of the workspace's files, as STATUS.md would: how many, how many wait for a person, how many for the look. */
export function filesSayOf(tally: Pick<FilesTally, "kept" | "waiting" | "looking"> & { videos?: number }): string {
  const { kept, waiting, looking } = tally;
  return [
    keptSaidOf(kept, tally.videos ?? 0),
    ...(waiting ? [`${waiting} waiting for you`] : []),
    ...(looking ? [`Ask is still looking at ${looking}`] : []),
  ].join(", ");
}

export const FILE_WORDS = {
  askAbout: "Ask about this photo",
  makePost: "Make a post",
  showMore: "Show more",
  newVersion: "New version",
  google: {
    post: "Post to Google",
    words: "What it says on Google",
    wordsNeeded: "Say something to go with it.",
    tooLong: "Google takes up to 1,500 characters.",
    cancel: "Cancel",
    posted: "Sent to Google. It can take a few minutes to show.",
    on: "On your Google profile",
    see: "See it",
    down: "Take it down",
    downAsk: "Take this post off your Google profile?",
    downNote: "It leaves your profile. The post stays here.",
    downKeep: "Keep it up",
    downed: "Taken off your Google profile.",
    notConnected: "Connect your Business Profile first: posts go through it.",
    noToken: "The connection to Google was lost. Connect again from Connections.",
    refused: "Google did not take the post.",
    noPhoto: "The photo this came from was deleted, so it can't be drawn for Google.",
    notAPost: "Only a post can go on Google.",
    notSent: "The post did not go through. Try again.",
  },
  madeFrom: "Made from",
  madeFromGone: "Made with Ask, from a photo since deleted",
  title: "Files",
  add: "Add photos",
  dropToAdd: "Drop to add",
  orDrop: "or drop them here",
  adding: (done: number, of: number) => `Adding ${done} of ${of}`,
  emptyTitle: "No photos yet",
  emptyBody: "Add the ones that show your place and your work. Ask looks at each one and names it for what it shows.",
  retry: "Try again",
  reading: "Reading your files…",
  failedRead: "Your files could not be read.",
  added: (n: number) => (n === 1 ? "Photo added." : `${n} photos added.`),
  notAdded: (n: number) => (n === 1 ? "1 photo wasn't added." : `${n} photos weren't added.`),
  tookFirst: (n: number, of: number) => `Took the first ${n} of ${of}. Add the rest after these.`,
  sentSoFar: (percent: number) => `${percent}% sent`,
  waitingToSend: "Waiting to send",
  tryAll: (n: number) => `Try all ${n}`,
  takeAway: "Remove",
  noneFiled: "Nothing is kept yet. Your photos are on the other shelves.",
  mayChange: "change a photo",
  saving: "Saving…",
  removed: "Photo deleted.",
  dontDelete: "Don't delete",
  inboxSays: (clean: number, left: number) =>
    [
      clean === 1 ? "1 looks like yours." : `${clean} look like yours.`,
      ...(left === 0 ? [] : [left === 1 ? "1 is left for you to open." : `${left} are left for you to open.`]),
    ].join(" "),
  keepMany: (n: number) => `Keep ${n}`,
  kept: (n: number) => (n === 1 ? "1 photo kept." : `${n} photos kept.`),
  bell: {
    title: "Photos are waiting for you",
    body: "Some photos we found for your business are in Files. Keep the ones that are yours.",
  },
  shelves: {
    all: "Kept",
    inbox: "Inbox",
    place: "Place",
    work: "Work",
    team: "Team",
    products: "Products & menus",
    brand: "Logos & graphics",
    made: "Made by Ask",
    other: "Other",
    set_aside: "Set aside",
  } satisfies Record<FileShelf, string>,
  shows: {
    storefront: "Storefront",
    interior: "Inside",
    work: "Work",
    team: "Team",
    product: "Product",
    menu: "Menu or prices",
    logo: "Logo",
    graphic: "Flyer or graphic",
    other: "Something else",
  } satisfies Record<FileShows, string>,
  who: {
    not_asked: "Not asked",
    no_one: "No one's in it",
    agreed: "They agreed",
  } satisfies Record<FileWhoInIt, string>,
  whoClear: "No one you could recognize",
  whoAsk: (seen: number | null) =>
    seen === null
      ? "Did everyone in this photo agree to be shown?"
      : `Ask saw ${seen} ${seen === 1 ? "person" : "people"}. Did they agree to be shown?`,
  whoChange: "Change",
  sources: {
    upload: "Added by you",
    google_profile: "From your Google profile",
    google_listing: "From your Google listing",
    website: "From your website",
    made: "Made with Ask",
  } satisfies Record<FileSource, string>,
  looking: "Ask is looking at it",
  notRead: "Ask couldn't read this one yet. It's still yours to use.",
  refused: "Ask wouldn't read this one, so it's waiting for you.",
  stock: "This may be a stock photo.",
  name: "Name",
  save: "Save",
  shelf: "Shows",
  shelfNone: "Not sorted yet",
  who_label: "Who's in it",
  keep: "Keep it",
  setAside: "Set aside",
  putBack: "Put back",
  download: "Download",
  remove: "Delete",
  removeAsk: "Delete this photo?",
  removeNote: "It can't be brought back.",
  close: "Close",
  nameEmpty: "Give it a name.",
  full: "This workspace holds as many files as it can. Remove some first.",
  wrongType: "That isn't a photo we can keep. Use a JPEG, PNG, WebP or HEIC.",
  tooBig: "That photo is over 25 MB.",
  tooSmall: "That photo is too small to use.",
  tooManyPixels: "That photo is too large to work with. Use a copy under 50 megapixels.",
  unreadable: "We couldn't read that photo. Try a JPEG or PNG copy.",
  notSaved: "That photo could not be saved. Try again.",
  twin: "Already here",
  alreadyHere: (n: number) => (n === 1 ? "1 was already here." : `${n} were already here.`),
  gone: "That file is gone.",
  /** A video's words (decision 0099, stage B): drawn only where the workspace takes videos (video.ts videoPreviewOf). */
  video: {
    askAbout: "Ask about this video",
    add: "Add photos or videos",
    emptyTitle: "No photos or videos yet",
    emptyBody:
      "Add the ones that show your place and your work. Ask looks at each one, and listens to each video, and names it for what it shows.",
    added: (n: number) =>
      n === 1 ? "Video added. It's being prepared." : `${n} videos added. They're being prepared.`,
    gettingReady: "Getting it ready",
    notPrepared: "Couldn't be prepared",
    notPreparedNote: "The video couldn't be read. Delete it, and add another copy.",
    whatIsSaid: "What is said",
    howItSounds: "How it sounds",
    noOneSpeaks: "No one speaks in it.",
    noSound: "It has no sound.",
    notHeardYet: "Not heard yet.",
    voice: (n: number) => `Voice ${n}`,
    showAll: "Show all of it",
    play: "Play",
    cantPlay: "This video can't play just now. Try again in a minute.",
    removeAsk: "Delete this video?",
    removed: "Video deleted.",
    wrongType: "That video isn't one we can keep. Use an MP4, MOV or WebM.",
    tooLong: "Up to 10 minutes a video.",
    tooBig: "Up to 500 MB a video.",
    full: `Your videos are full: ${FILE_VIDEO_MINUTES_MAX} minutes at most. Delete one to add another.`,
    off: "Videos can't be added just now.",
    notSaved: "That video could not be sent. Try again.",
    noDownload: "A video is kept here to play and to show Ask. Its own file stays with you.",
    notAVideo: "That file is a photo, not a video.",
    sending: (sent: number) => `Sending ${Math.round(sent * 100)}%`,
  },
} as const;
