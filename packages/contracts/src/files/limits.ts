/** Files: limits. */

import { DAY_MS, SECOND_MS } from "../shared/time";
import { FILE_IMAGE_MIMES, FILE_VIDEO_MIMES } from "./kinds";

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

/**
 * What kind of picture a file is, by how it was made, as its look says (look.ts, since edition 2): a camera's photo, a
 * stock photo, one a computer made to pass for a photo (a 3D mockup, an AI image), a design (a flyer, a card, a logo, a
 * photo with words set over it), or a screen's capture. One word, "looks like stock", stood for the second and third.
 */
export const FILE_LOOKS_LIKE = ["photo", "stock", "rendered", "design", "screenshot"] as const;

export type FileLooksLike = (typeof FILE_LOOKS_LIKE)[number];

export const FILE_WHO_IN_IT = ["not_asked", "no_one", "agreed"] as const;

export type FileWhoInIt = (typeof FILE_WHO_IN_IT)[number];

export const FILE_LOOK_STATUSES = ["waiting", "done", "refused", "failed"] as const;

export type FileLookStatus = (typeof FILE_LOOK_STATUSES)[number];

/** What a member may add: a picture, or a video (kinds.ts). */
export const FILE_MIMES = [...FILE_IMAGE_MIMES, ...FILE_VIDEO_MIMES] as const;

export type FileMime = (typeof FILE_MIMES)[number];

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

/** Where a picture's bytes live: its own folder, which the purge empties whole. A video keeps none here. */
export const filePathOf = (tenantId: string, fileId: string, mime: FileMime): string =>
  `${tenantId}/${fileId}/original.${FILE_TYPES[mime]}`;
