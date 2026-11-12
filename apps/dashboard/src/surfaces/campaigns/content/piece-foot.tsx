/**
 * Save, and what the presses on an open piece are handed (piece.tsx pieceActsOf). Save is the device's own share sheet where it
 * has one, as Files' post sheet hands a post over (files/post-share.ts): that is how a picture, and a video made here, reach
 * Photos on a phone, where Instagram finds them (a download lands in Files on an iPhone). Safari opens the sheet only inside
 * the tap, so the file is fetched as the piece opens, and the tap asks for nothing. Anywhere else Save is the download.
 */
import { useEffect, useState } from "react";
import { CONTENT_WORDS as W, POST_WORDS, fileViewOf, type FileDto, type PostShapeName } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { postFileOf, sharePostFile, sharesPictures, sharesVideos, videoFileOf } from "../../files/post-share";
import type { PieceNext } from "./model/piece-open";

/** Save: the share sheet's press where the device has one and the picture has come, the download's address everywhere. */
export function useSave(file: FileDto, shape: PostShapeName) {
  const video = file.kind === "video";
  // A made post's shape, or a video made here, is handed to the share sheet; the library's own files download as they are.
  const [canShare] = useState(
    () =>
      file.source === "made" &&
      typeof navigator !== "undefined" &&
      (video ? sharesVideos() && file.media_status === "ready" : sharesPictures()),
  );
  const [ready, setReady] = useState<{ shape: PostShapeName; file: File | null } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!canShare) return undefined;
    let live = true;
    void (video ? videoFileOf(file.id, file.name) : postFileOf(file.id, file.name, shape)).then((kept) => {
      if (live) setReady({ shape, file: kept });
    });
    return () => {
      live = false;
    };
  }, [canShare, video, file.id, file.name, shape]);
  const shared = ready?.shape === shape ? ready.file : null;
  const share = shared
    ? () => void sharePostFile(shared).then((outcome) => setSaid(outcome === "failed" ? POST_WORDS.shareFailed : null))
    : null;
  const href =
    video || file.source !== "made"
      ? `${fileViewOf(file.id)}?download`
      : `${fileViewOf(file.id)}?download&shape=${shape}`;
  return { href, share, said };
}

/**
 * Save, beside the open piece's other acts: a press where the device's sheet is ready, a link to the download otherwise (the
 * kit's Button is one or the other). Its glyph alone beside the coral act; `wide`, with its word and the room the coral act
 * would take, where nothing leads. On the glass over the picture in a phone's viewer; the pane's own on a desk.
 */
export function SaveButton({ save, glass, wide }: { save: ReturnType<typeof useSave>; glass: boolean; wide: boolean }) {
  const kind = glass ? ({ variant: "glass", size: "touch" } as const) : ({ variant: "secondary", size: "lg" } as const);
  const look = wide
    ? ({ ...kind, className: "cnv-viewer-lead" } as const)
    : ({ ...kind, iconOnly: true, "aria-label": W.piece.save } as const);
  const drawn = (
    <>
      <Icon name="download" size={15} />
      {wide ? W.piece.save : null}
    </>
  );
  return save.share ? (
    <Button {...look} onClick={save.share} data-testid="cnv-save">
      {drawn}
    </Button>
  ) : (
    <Button {...look} href={save.href} data-testid="cnv-save">
      {drawn}
    </Button>
  );
}

/** What the acts do: the next step, Ask, and Make a post from a video. Don't post is the sheet's (Post it), where a post is acted on. */
export interface PieceFootActs {
  onNext: (next: PieceNext) => void;
  onAsk: () => void;
  onMakePost: () => void;
}
