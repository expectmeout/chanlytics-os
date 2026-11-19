/**
 * Files: where a video's copy at the video platform stands (the footage sources plan, "Availability"; 00654). A
 * watched folder brings more video than a workspace's sixty minutes hold, and its originals stay with their provider,
 * so a clip's copy can be let go and fetched again. An upload, a video made here and a found video are always `here`:
 * nothing can give one back.
 *
 * The closed sets a row holds, and nothing else: what a screen says of each is the screen's own.
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
  /** Its folder is not being read just now (paused, stopped, or its account needs to reconnect). */
  "folder",
  /** The workspace takes no videos yet, or this deployment cannot fetch one. */
  "videos_off",
  /** The video platform is preparing as many videos as it takes at once. */
  "busy",
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
