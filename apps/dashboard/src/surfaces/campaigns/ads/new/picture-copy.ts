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

/**
 * The one line under the ad for a video whose copy is not at hand: Files' own head for where it stands. Null where
 * Files says nothing of it (a video made here, aside and not yet asked for, reads as any video).
 */
export function pictureCopyLine(copy: PictureCopy | null): string | null {
  if (copy === null) return null;
  const said = copySaidOf(copy.state, copy.why, {
    folder: null,
    account: null,
    leaves: null,
    connected: true,
    uploaded: copy.uploaded,
    made: copy.made,
  });
  return said?.head || null;
}

/** Whether a copy comes back by itself, so the screen asks after it: on its way out or back, or waiting for room. */
const mends = (copy: { state: FileCopyState; why: FileCopyWhy | null }): boolean =>
  copy.state === "returning" || copy.state === "going" || (copy.state === "away" && copy.why === "room");

/**
 * The draft's video's copy while New ad is open: as the draft's answer said it, then as each ask after it says, until it
 * is here, when it is null and the line goes. `ask` is the source's (source.ts): it waits its own pace and asks once; a
 * source with none only says what the draft said. A draft that comes to show another picture starts again from its own.
 */
export function usePictureCopy(
  copy: PictureCopy | null,
  ask: ((fileId: string) => Promise<CopyAsked>) | undefined,
): PictureCopy | null {
  const [heard, setHeard] = useState<{ id: string; at: CopyAsked } | null>(null);
  const said = heard !== null && copy !== null && heard.id === copy.id ? heard.at : null;
  const here = said?.state === "here";
  const now: PictureCopy | null =
    copy === null || here ? null : said && said.state !== "here" ? { ...copy, state: said.state, why: said.why } : copy;
  const waits = now !== null && mends(now) && ask !== undefined;
  const id = now?.id ?? null;
  useEffect(() => {
    if (!waits || id === null || ask === undefined) return undefined;
    let open = true;
    const follow = async (): Promise<void> => {
      while (open) {
        const at = await ask(id).catch(() => null);
        if (!open) return;
        if (at === null) continue;
        setHeard({ id, at });
        // Here, or where it can't come back just now: nothing more is asked. Still on its way: asked after again.
        if (!mends(at)) return;
      }
    };
    void follow();
    return () => {
      open = false;
    };
  }, [waits, id, ask]);
  return now;
}
