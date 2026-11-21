/**
 * What a clip says when its video is kept in Google Drive (the footage sources plan, P5, gate 1; the canvas's board "A
 * clip kept in Drive"). A watched folder brings more video than a workspace's minutes hold, so a clip nobody used
 * lately gives up its place and its original stays in Drive. Its picture, its sound and what AI wrote never leave, so
 * every state here is said over the clip's own still, with listening beside it.
 *
 * One sentence for each word of the closed sets (contracts files/copy.ts): what is happening, whether it ends by itself, and the one
 * thing to do. Never a code and never the provider's wording. Pure.
 */
import {
  DAY_MS,
  FILE_VIDEO_MINUTES_MAX,
  FOOTAGE_NUMBERS,
  VIDEO_TILE_WORDS,
  type FileCopyState,
  type FileCopyWhy,
  type FileDto,
} from "@chanlytics/contracts";

/** The one thing to do about a clip that is not playing; listening is offered beside it wherever the clip has sound. */
export type CopyAct = "play" | "connect" | "open_drive" | "add_again";

interface CopySaid {
  /** What the still wears: a play mark (one press brings it back), a ring (on its way by itself), or nothing. */
  mark: "play" | "ring" | "none";
  head: string;
  body: string;
  act: CopyAct | null;
  /** Whether it ends by itself: the page then waits and goes on, and asks nothing of the owner. */
  mends: boolean;
}

/** What the page knows beside the row, each null where it does not: the folder's name, its account, the day a removed file leaves. */
export interface CopyFacts {
  folder: string | null;
  account: string | null;
  leaves: string | null;
  /** Whether a Google Drive is connected to the workspace at all. */
  connected: boolean;
  /** Whether its owner added the clip themselves (FileDto owner_uploaded): on its way back, it comes from what they added. */
  uploaded: boolean;
}

export const COPY_WORDS = {
  acts: {
    play: "Play",
    connect: "Connect again",
    open_drive: "Open Google Drive",
    add_again: "Add the video again",
  } satisfies Record<CopyAct, string>,
  listen: "Listen now",
  playVideo: "Play the video",
  soundOnly: "Sound only",
  pause: "Pause",
  remove: "Remove",
  /** "Add the video again", and the video picked was another one: it is in the Library, and this clip is as it was. */
  otherVideo: "That was a different video, so it was added to your Library. This clip needs its own file.",
  /** A row's one line, where a clip is coming back or can't: every other clip kept in Drive looks like any other. */
  row: {
    returning: "Getting it from Google Drive…",
    /** Coming back from what its owner added: the Library's own words for a video it is making ready. */
    fromUpload: VIDEO_TILE_WORDS.gettingReady,
    lost: "Original is not in Drive",
    binned: (leaves: string | null) => (leaves ? `Deleted in Drive · leaves ${leaves}` : "Deleted in Drive"),
    moved: (folder: string | null, leaves: string | null) =>
      `Moved out of ${folder ? `“${folder}”` : "its folder"}${leaves ? ` · leaves ${leaves}` : ""}`,
    notFound: "Can't be found in Drive",
  },
} as const;

const RETURNING: CopySaid = {
  mark: "ring",
  head: "Getting it from Google Drive…",
  body: "About 2 minutes. It plays by itself, here or when you come back.",
  act: null,
  mends: true,
};

const KEPT_IN_DRIVE: CopySaid = {
  mark: "play",
  head: "This clip is kept in Google Drive",
  body: "Play brings it back in about 2 minutes.",
  act: "play",
  mends: false,
};

/** Coming back from what its owner added (an upload that met the clip): their video is being made ready, not fetched. */
const FROM_UPLOAD: CopySaid = {
  mark: "ring",
  head: VIDEO_TILE_WORDS.gettingReady,
  body: "From the video you added. It plays by itself, here or when you come back.",
  act: null,
  mends: true,
};

const SLOW: CopySaid = {
  mark: "ring",
  head: "Still getting it from Google Drive…",
  body: "Taking longer than usual. Chanlytics keeps trying.",
  act: null,
  mends: true,
};

const leavesNote = (leaves: string | null): string =>
  leaves ? ` It leaves your Library on ${leaves} unless a post used it.` : "";

/** Why a copy that is away did not come back when it was last asked for. */
function waitSaidOf(reason: FileCopyWhy, facts: CopyFacts): CopySaid {
  switch (reason) {
    case "room":
      return {
        mark: "ring",
        head: "Waiting for room",
        // Never "within the hour": where the owner's own videos fill the minutes, nothing steps aside by itself (the
        // review's finding 2; the folder's line says "Videos are full" then, call 3).
        body: `Videos hold ${FILE_VIDEO_MINUTES_MAX} minutes at a time. This one plays as soon as there is room.`,
        act: null,
        mends: true,
      };
    case "budget":
      return {
        mark: "none",
        head: "It comes back tomorrow",
        body: `${FOOTAGE_NUMBERS.returnsADay} clips a day come back from Drive, and today's are used.`,
        act: null,
        mends: false,
      };
    case "folder":
      return {
        mark: "none",
        head: "Google Drive needs to be connected again",
        body: "Then this clip plays.",
        act: "connect",
        mends: false,
      };
    case "videos_off":
      return {
        mark: "none",
        head: "Videos aren't on for this workspace yet",
        body: "Its picture and its sound are here.",
        act: null,
        mends: false,
      };
    case "changed":
      return {
        mark: "none",
        head: "This clip was replaced in Drive",
        body: `The new version comes in by itself.${facts.leaves ? ` This one leaves on ${facts.leaves} unless a post used it.` : ""}`,
        act: null,
        mends: false,
      };
    default:
      return SLOW;
  }
}

/** Why a copy is lost: what became of the original its folder held. */
function lossSaidOf(reason: FileCopyWhy | null, facts: CopyFacts): CopySaid {
  switch (reason) {
    case "gone":
      return {
        mark: "none",
        head: "Its original is in Google Drive's bin",
        body: `Put it back there and it plays here again.${leavesNote(facts.leaves)}`,
        act: "open_drive",
        mends: false,
      };
    case "outside":
      return {
        mark: "none",
        head: `Its original was moved out of ${facts.folder ? `“${facts.folder}”` : "its folder"}`,
        body: "Move it back and it plays here again. Its pictures, sound and AI's notes stay.",
        act: "open_drive",
        mends: false,
      };
    case "no_access":
      return {
        mark: "none",
        head: `${facts.account ?? "The connected account"} can no longer open its original`,
        body: "Ask whoever owns it to share it again. Then it plays here.",
        act: null,
        mends: false,
      };
    case "not_found":
      return {
        mark: "none",
        head: "Google Drive no longer has its original",
        body: "The pictures, the sound and what AI wrote stay, so it can still be a post. To play it again, add the video from your phone.",
        act: "add_again",
        mends: false,
      };
    default:
      return facts.connected
        ? {
            mark: "none",
            head: "Its folder isn't watched any more",
            body: "Watch its folder again and this clip plays. Its pictures, sound and AI's notes stay.",
            act: "connect",
            mends: false,
          }
        : {
            mark: "none",
            head: "Google Drive isn't connected",
            body: "Connect it again and this clip plays.",
            act: "connect",
            mends: false,
          };
  }
}

/**
 * What a clip says where its video is not at hand; null for one that plays. A copy caught as it steps aside reads as
 * one coming back, which it is, a few seconds later. One that is away and was never asked for waits for its one
 * press: flicking through clips never spends the day's returns.
 */
export function copySaidOf(copy: FileCopyState, reason: FileCopyWhy | null, facts: CopyFacts): CopySaid | null {
  if (copy === "here") return null;
  if (copy === "returning" || copy === "going") return facts.uploaded ? FROM_UPLOAD : RETURNING;
  if (copy === "lost") return lossSaidOf(reason, facts);
  return reason ? waitSaidOf(reason, facts) : KEPT_IN_DRIVE;
}

/**
 * The day a file whose original left its folder leaves the Library, as a row says it ("Nov 26") in the workspace's own
 * zone; null while it stays, and for one its owner added themselves, which the cleanup never takes.
 */
export function leavesOn(file: Pick<FileDto, "origin_left_at" | "owner_uploaded">, zone: string): string | null {
  if (!file.origin_left_at || file.owner_uploaded) return null;
  const at = Date.parse(file.origin_left_at) + FOOTAGE_NUMBERS.graceDays * DAY_MS;
  return Number.isFinite(at)
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: zone }).format(new Date(at))
    : null;
}

/**
 * Why a row speaks of its original: the copy's own loss, or, for a file still here, its original having left. A file its
 * owner added themselves is theirs, so its original leaving is nothing to say.
 */
export const rowReasonOf = (file: Pick<FileDto, "copy_why" | "origin_left" | "owner_uploaded">): FileCopyWhy | null =>
  file.copy_why ?? (file.owner_uploaded ? null : file.origin_left) ?? null;

/**
 * A row's one line for a clip that is coming back or can't, or a file whose original left its folder ("Deleted in Drive
 * · leaves Nov 26", the canvas's Removed board); null for every other, which reads as any file does.
 * `alone` says the line stands for the whole row's line; otherwise it follows what the clip is ("Clip · 0:32 · …").
 */
export function copyRowLineOf(
  copy: FileCopyState,
  reason: FileCopyWhy | null,
  facts: Pick<CopyFacts, "folder" | "leaves" | "uploaded">,
): { line: string; tone: "live" | "you"; alone: boolean } | null {
  if (copy === "returning" || copy === "going")
    return { line: facts.uploaded ? COPY_WORDS.row.fromUpload : COPY_WORDS.row.returning, tone: "live", alone: true };
  if (copy !== "lost" && reason !== "gone" && reason !== "outside") return null;
  if (reason === "gone") return { line: COPY_WORDS.row.binned(facts.leaves), tone: "you", alone: true };
  if (reason === "outside") return { line: COPY_WORDS.row.moved(facts.folder, facts.leaves), tone: "you", alone: true };
  if (reason === "not_found") return { line: COPY_WORDS.row.notFound, tone: "you", alone: false };
  return { line: COPY_WORDS.row.lost, tone: "you", alone: false };
}
