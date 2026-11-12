/**
 * A photo as the grid draws it (decision 0099): the picture where it can be drawn, a tile a person opens, and what is on its way,
 * with what can be done about one that failed. What is on its way is sending.ts's.
 *
 * A photo on its way is one tile from its turn to the list's: blank while it waits, its picture clearing as it goes, the server's coming
 * in over it as it arrives. It says nothing beneath itself, since the page's Add says how the whole batch stands; a screen reader is told
 * each by name. Every state is one size, so the grid never moves under it.
 *
 * While Ask looks at a photo its three stand in the corner of the tile, the colour they are whenever Ask is working, and go as the name
 * it gave arrives. Still, since a page of them moving at once would be a page that never settles: the head says how many are left.
 *
 * A video (stage B) is its poster, its length in a corner, once it is ready; until then its ground says it is being made ready,
 * and one Stream could not read says so, for its owner to delete. On its way it draws no picture of its own: an <img> cannot.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FILE_WORDS as W, clockOf, fileSaidOf, fileViewOf, uploadNameOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Meter } from "../kit/meter/meter";
import { useSwapMotion } from "../kit/motion/use-swap-motion";
import { Press } from "../kit/press";
import type { FrameFlash } from "../frame-verbs";
import { isVideoFile, serverPictureIn, takeAway, tryAgain, tryAll, type SendingPhoto } from "./sending";
import type { TileShape } from "../campaigns/content/model/tiles";

/** A photo's small picture on the grid. */
const smallPictureOf = (id: string): string => `${fileViewOf(id)}?w=480`;

/** What has come in on this visit: drawn again, as the list takes over from a tile or back on a shelf, it stands and never fades in twice. */
const cameIn = new Set<string>();

export /**
 * A picture where it can be drawn. One Storage can't draw keeps its ground and says its name, never a broken glyph, or says
 * `unseen` where the caller knows why it is not there yet.
 */
function Picture({
  src,
  alt,
  name,
  big = false,
  eager = false,
  onArrived,
  unseen,
}: {
  src: string;
  alt: string;
  name: string;
  big?: boolean;
  /** Loaded whether or not it is near the screen, since something waits on it. */
  eager?: boolean;
  onArrived?: () => void;
  /** What stands in its place when it does not come, in place of the name. */
  unseen?: ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  const [seenBefore] = useState(() => cameIn.has(src));
  const [arrived, setArrived] = useState(seenBefore);
  useEffect(() => {
    if (!arrived) return;
    if (!src.startsWith("blob:")) cameIn.add(src);
    onArrived?.();
  }, [arrived, src, onArrived]);
  if (broken && unseen) return unseen;
  if (broken)
    return (
      <span
        className={big ? "files-big files-unseen" : "files-pic files-unseen"}
        role="img"
        aria-label={alt}
        data-testid="fl-unseen"
      >
        {name}
      </span>
    );
  return (
    <img
      className={big ? "files-big" : "files-pic"}
      src={src}
      alt={alt}
      loading={big || eager || seenBefore ? undefined : "lazy"}
      decoding={seenBefore ? "sync" : "async"}
      data-arrived={arrived ? "true" : undefined}
      // One the browser already holds has loaded before this draw: the ref sees it, so it never waits for an event that came.
      ref={(img) => {
        if (img?.complete && img.naturalWidth > 0 && !arrived) setArrived(true);
      }}
      onLoad={() => setArrived(true)}
      onError={() => setBroken(true)}
    />
  );
}

/** Ask's three, while it looks at this photo. A tile that had them keeps them drawn as it finishes, so they fade, and one that never did draws nothing. */
export function AskLooking({ looking, coming = false }: { looking: boolean; coming?: boolean }) {
  const [drawn, setDrawn] = useState(looking);
  if (looking && !drawn) setDrawn(true);
  if (!drawn) return null;
  return (
    <span
      className="files-looking"
      data-on={looking || undefined}
      data-coming={coming || undefined}
      aria-hidden="true"
      data-testid="fl-looking"
    >
      <span />
      <span />
      <span />
    </span>
  );
}

/** A video's ground while it is not ready, in words: being made ready, or not to be. */
function VideoWaits({ failed, name }: { failed: boolean; name: string }) {
  const words = failed ? W.video.notPrepared : W.video.gettingReady;
  return (
    <span
      className="files-pic files-unseen"
      role="img"
      aria-label={`${name}: ${words}`}
      data-testid={failed ? "fl-video-failed" : "fl-video-waits"}
    >
      {words}
    </span>
  );
}

/**
 * A video on the grid: its poster and its length once it is ready, its state in words until then. The platform says a video
 * can be played a few seconds before its poster is cut (the digest's sheet, then the look's own frame): a tile drawn between
 * says it is getting ready, and asks again once Ask has looked at it, so it never stands blank.
 */
function VideoFrame({ file, name }: { file: FileDto; name: string }) {
  if (file.media_status !== "ready") return <VideoWaits failed={file.media_status === "failed"} name={name} />;
  return (
    <>
      <Picture
        key={file.look_status}
        src={smallPictureOf(file.id)}
        alt={file.line ?? name}
        name={name}
        unseen={<VideoWaits failed={false} name={name} />}
      />
      {file.seconds !== null && (
        <span className="files-length" data-testid="fl-length">
          {clockOf(file.seconds)}
        </span>
      )}
    </>
  );
}

export /**
 * One photo on the grid: the picture, and the name it goes by, which the look changes under the eye. A page that draws a
 * file at its own shape says which (Campaigns › Content); Files' own grid says none, and its tiles stay square.
 */
function Photo({ file, onOpen, shape }: { file: FileDto; onOpen: () => void; shape?: TileShape }) {
  const name = fileSaidOf(file.name);
  const nameFades = useSwapMotion<HTMLSpanElement>(name);
  return (
    <Press className="files-photo" onClick={onOpen} data-testid="fl-tile">
      <span className="files-frame" data-shape={shape}>
        {file.kind === "video" ? (
          <VideoFrame file={file} name={name} />
        ) : (
          <Picture src={smallPictureOf(file.id)} alt={file.line ?? name} name={name} />
        )}
        <AskLooking looking={file.look_status === "waiting" && file.media_status !== "failed"} />
      </span>
      <span ref={nameFades} className="files-name">
        {name}
      </span>
    </Press>
  );
}

/** One that failed: its picture, its words, and what can be done about it. */
function FailedPhoto({ photo, flash }: { photo: SendingPhoto; flash: (f: FrameFlash) => void }) {
  return (
    <div className="files-photo files-failed" data-testid="fl-failed">
      <span className="files-frame">
        {photo.picture ? (
          <Picture src={photo.picture} alt={photo.file.name} name={photo.file.name} />
        ) : (
          <span className="files-pic files-unseen">{photo.file.name}</span>
        )}
      </span>
      <span className="files-state">{photo.file.name}</span>
      <span className="files-why">{photo.message}</span>
      <span className="files-tries">
        <Button size="sm" onClick={() => tryAgain(photo.key, flash)} data-testid="fl-try-again">
          {W.retry}
        </Button>
        <Button size="sm" variant="quiet" onClick={() => takeAway(photo.key)} data-testid="fl-take-away">
          {W.takeAway}
        </Button>
      </span>
    </div>
  );
}

/** A photo on its way, as far as it has come. One that has arrived is a photo already, to open, until the list draws it. */
function OnItsWay({ photo, onOpen }: { photo: SendingPhoto; onOpen: (id: string) => void }) {
  const { key, id, file, picture, sent, state } = photo;
  const ownPictureDone = useCallback(() => serverPictureIn(key), [key]);
  const video = isVideoFile(file);
  const name = fileSaidOf(uploadNameOf(file.name, video ? "video" : "image"));
  const percent = Math.round((sent ?? 0) * 100);
  const progress = state === "waiting" ? W.waitingToSend : W.sentSoFar(percent);
  return (
    <div
      className="files-photo files-going"
      data-state={state}
      data-testid={id ? "fl-arrived" : "fl-sending"}
      // A value no class can hold, and not a prop of the kit's: how far along it is, which the picture clears by.
      ref={(tile) => tile?.style.setProperty("--sent", String(sent ?? 0))}
      {...(id ? {} : { role: "img", "aria-label": `${file.name}: ${progress}` })}
    >
      <span className="files-frame">
        {picture ? <Picture key="own" src={picture} alt="" name="" /> : !id && <span className="files-pic" />}
        {/* A video that has gone is being made ready: its poster is not there yet, so its ground says so. */}
        {id && video && <VideoWaits failed={false} name={name} />}
        {id && !video && (
          <Picture key="server" src={smallPictureOf(id)} alt="" name="" eager onArrived={ownPictureDone} />
        )}
        {sent !== null && (
          <Meter
            className="files-sent"
            size="sm"
            parts={[
              { share: sent, tone: "ink" },
              { share: 1 - sent, tone: "ground" },
            ]}
            aria-label={W.sentSoFar(percent)}
            aria-hidden={id ? true : undefined}
            data-testid="fl-sent"
          />
        )}
        {id && <AskLooking looking coming />}
        {id && <Press className="files-open" aria-label={name} onClick={() => onOpen(id)} data-testid="fl-tile" />}
      </span>
      <span className="files-name">{id ? name : " "}</span>
    </div>
  );
}

export /** The grid's head: what is on its way, and one press for all that failed. */
function PhotosOnTheirWay({
  photos,
  flash,
  onOpen,
}: {
  photos: readonly SendingPhoto[];
  flash: (f: FrameFlash) => void;
  onOpen: (id: string) => void;
}) {
  const failed = photos.filter((p) => p.state === "failed").length;
  return (
    <>
      {failed > 1 && (
        <div className="files-try-all">
          <Button size="sm" variant="quiet" onClick={() => tryAll(flash)} data-testid="fl-try-all">
            {W.tryAll(failed)}
          </Button>
        </div>
      )}
      {photos.map((p) =>
        p.state === "failed" ? (
          <FailedPhoto key={p.key} photo={p} flash={flash} />
        ) : (
          <OnItsWay key={p.key} photo={p} onOpen={onOpen} />
        ),
      )}
    </>
  );
}
