/**
 * A draft's video whose copy stepped aside (the archive review of 28 Nov 2026, R1.6). New ad offers it as any other
 * picture, the server asks for its copy as the draft comes to show it (server/ads/draft.ts), and this follows it back:
 * one line under the ad says where it stands, in Files' own words for a video that is not at hand
 * (files/footage/copy-words.ts), and the screen goes on by itself the moment it is here. Nothing is asked of the owner
 * while it mends by itself; where it can't come back just now, the line says why.
 */
import { useEffect, useState } from "react";
import type { FileCopyState, FileCopyWhy } from "@chanlytics/contracts";
import { copySaidOf } from "../../../files/footage/copy-words";

/** Where a draft's video's copy stands, as the draft's answer says it (model.ts NewAdVM shown.picture.copy). */
export interface PictureCopy {
  /** The file, which its copy is asked after by. */
  id: string;
  state: Exclude<FileCopyState, "here">;
  why: FileCopyWhy | null;
  /** Whether AI made the video, and whether its owner added it themselves: Files says each in its own words. */
  made: boolean;
  uploaded: boolean;
}

/** Where a copy stands at an ask; null where the ask was not made or not answered, and is made again. */
export type CopyAsked = { state: FileCopyState; why: FileCopyWhy | null } | null;

/** How the screen asks after a copy: the source's own read, at the source's own pace (source.ts). */
type CopyAsk = (fileId: string) => Promise<CopyAsked>;

/**
 * The one line under the ad for a video whose copy is not at hand: Files' own head for where it stands. Null where
 * Files says nothing of it (a video made here, aside and not yet asked for, reads as any video).
 */
export function pictureCopyLine(copy: PictureCopy | null): string | null {
  if (copy === null) return null;
  const words = copySaidOf(copy.state, copy.why, {
    folder: null,
    account: null,
    leaves: null,
    connected: true,
    uploaded: copy.uploaded,
    made: copy.made,
  });
  return words?.head || null;
}

/** Whether a copy comes back by itself, so the screen asks after it: on its way out or back, or waiting for room. */
const mends = (copy: { state: FileCopyState; why: FileCopyWhy | null }): boolean =>
  copy.state === "returning" || copy.state === "going" || (copy.state === "away" && copy.why === "room");

/** What an ask after a copy heard, and of which file. */
interface CopyHeard {
  id: string;
  now: { state: FileCopyState; why: FileCopyWhy | null };
}

/**
 * Where the draft's video's copy stands now: as the draft's answer said it, then as the last ask after that same file
 * says. Null for a photo, and once the copy is here.
 */
function standingOf(copy: PictureCopy | null, heard: CopyHeard | null): PictureCopy | null {
  if (copy === null) return null;
  if (heard === null || heard.id !== copy.id) return copy;
  const { state, why } = heard.now;
  return state === "here" ? null : { ...copy, state, why };
}

/**
 * A copy asked after until it is here, or stands where it will not mend by itself: each answer is handed on as it
 * comes, and an ask that gave none is made again. Ends when the screen no longer wants it (`open` says).
 */
async function followCopy(
  ask: CopyAsk,
  id: string,
  screen: { open: () => boolean; hear: (heard: CopyHeard) => void },
): Promise<void> {
  while (screen.open()) {
    const now = await ask(id).catch(() => null);
    if (!screen.open()) return;
    if (now === null) continue;
    screen.hear({ id, now });
    if (!mends(now)) return;
  }
}

/**
 * The draft's video's copy while New ad is open: as the draft's answer said it, then as each ask after it says, until it
 * is here, when it is null and the line goes. `ask` is the source's: a source with none only says what the draft said.
 * A draft that comes to show another picture starts again from its own.
 */
export function usePictureCopy(copy: PictureCopy | null, ask: CopyAsk | undefined): PictureCopy | null {
  const [heard, setHeard] = useState<CopyHeard | null>(null);
  const now = standingOf(copy, heard);
  const follows = now !== null && mends(now) ? now.id : null;
  useEffect(() => {
    if (follows === null || ask === undefined) return undefined;
    let open = true;
    void followCopy(ask, follows, { open: () => open, hear: setHeard });
    return () => {
      open = false;
    };
  }, [follows, ask]);
  return now;
}
