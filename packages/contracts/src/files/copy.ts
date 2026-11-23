/**
 * Files: where a video's copy at the video platform stands (the footage sources plan, "Availability"; 00654). A
 * watched folder brings more video than a workspace's sixty minutes hold, and its originals stay with their provider,
 * so a clip's copy can be let go and fetched again. An upload, a video made here and a found video are always `here`:
 * nothing can give one back.
 *
 * The closed sets a row holds, and nothing else: what a screen says of each is the screen's own.
 *
 * Below them, where a file's other copies are (the archive PRD 1.1, section 10; 00683). A video Chanlytics made, or
 * one added from a phone, has a checked copy on Chanlytics' own shelf, so its copy at the platform can be let go
 * and fetched again. A file the owner chose from their Google Drive keeps the Drive file it came from. A file the
 * owner pressed "Save to Google Drive" on has a copy in their Drive, which is theirs: nothing reads it back, and a
 * video comes back only from the shelf or from a picked file (the PRD's principle 11). Each set is held to its
 * column in shared/schema-sets.ts; a set's own type arrives with its first reader.
 */

/**
 * Where a video's copy stands (files.copy_state): at the video platform (`here`); being let go (`going`); let go, and
 * its folder can give it back (`away`); being brought back (`returning`); or its folder cannot give it back (`lost`).
 */
export const FILE_COPY_STATES = ["here", "going", "away", "returning", "lost"] as const;

export type FileCopyState = (typeof FILE_COPY_STATES)[number];

/** Why a copy that is away did not come back when it was last asked for: each ends by itself, or at the owner's next ask. */
export const FILE_COPY_WAITS = [
  /** The workspace's videos are full, and nothing could be let go for it. */
  "room",
  /** A day's budget of returns bound: it comes back tomorrow. */
  "budget",
  /**
   * Its folder's Google account does not read just now: signed out, or whoever connected it left (00674, which split
   * `folder` in two). A folder that was only stopped still gives its clips back.
   */
  "connection",
  /** Its folder itself can't be opened just now (frozen): it opens again by itself (00674). */
  "cant_open",
  /** The workspace takes no videos yet, or this deployment cannot fetch one. */
  "videos_off",
  /** The video platform is preparing as many videos as it takes at once. */
  "busy",
  /** The video platform's own storage is spent: nothing the business can change, and Chanlytics keeps trying (00657). */
  "stream_full",
  /** Its provider would not give it just now. */
  "unreadable",
  /** Its bytes are no longer the ones this file is of: its folder's next read says what became of it. */
  "changed",
  /** The video platform could not prepare the copy it fetched. */
  "failed",
  /** Its return's job ended before the video platform was asked. */
  "stopped",
] as const;

/** Why a copy is lost: what became of the original its folder held. */
export const FILE_COPY_LOSSES = [
  /** Its original is in its provider's bin. */
  "gone",
  /** Its original was moved out of the watched folder. */
  "outside",
  /** Its provider no longer shows its original at all. */
  "not_found",
  /** Its provider no longer lets its original be read. */
  "no_access",
  /** No watched folder holds it: its account was disconnected, its folder removed, or its bytes replaced. */
  "no_origin",
] as const;

/** Why a copy stands where it does (files.copy_why, held by 00654's check): first why it waits, then why it is lost. */
export const FILE_COPY_WHYS = [...FILE_COPY_WAITS, ...FILE_COPY_LOSSES] as const;

export type FileCopyWait = (typeof FILE_COPY_WAITS)[number];

export type FileCopyLoss = (typeof FILE_COPY_LOSSES)[number];

export type FileCopyWhy = (typeof FILE_COPY_WHYS)[number];

/* ------------------------------------------------------------------------ where a file's other copies are -- */

/** Whether the Chanlytics folder in an owner's Drive is where it was left (archive_folders.state). */
export const ARCHIVE_FOLDER_STATES = ["ready", "missing"] as const;

/**
 * What a copy of a file is (file_archives.origin): one the owner saved to their Google Drive on a press (`saved`), the
 * owner's own Drive file a pick brought in (`picked`), or Chanlytics' own copy on its shelf (`shelf`).
 */
export const FILE_ARCHIVE_ORIGINS = ["saved", "picked", "shelf"] as const;

/**
 * Where a copy stands (file_archives.state, and each part's): being sent; all of it in place; its size and checksum
 * found equal to what was sent; not sent, or not equal twice; or checked once and since found in a bin or missing.
 */
export const FILE_ARCHIVE_STATES = ["saving", "saved", "checked", "failed", "gone"] as const;

/** Why a copy failed or is gone (file_archives.why): the one list a file's sheet has words for. */
export const FILE_ARCHIVE_WHYS = [
  /** The owner's Google Drive has no room. */
  "drive_full",
  /** Google no longer takes the key: revoked, or unused too long. */
  "key_lost",
  /** Another Google account is connected than the one the copy is with. */
  "other_account",
  /** Its size or checksum is not what was sent. */
  "mismatch",
  /** It is in Google Drive's bin. */
  "in_bin",
  /** Its place no longer shows it at all. */
  "not_found",
  /** The Chanlytics folder is in the bin or gone. */
  "folder_missing",
  /** Its place would not take it or give it: no access, or an organisation's rule. */
  "refused",
] as const;

/**
 * One piece of a copy (file_archive_parts.part): a photo's or a picked file's own bytes, a post's four pictures, or a
 * video's file.
 */
export const FILE_ARCHIVE_PARTS = ["original", "portrait", "square", "story", "wide", "video"] as const;
