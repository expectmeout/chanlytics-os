/**
 * A photo as the grid draws it (decision 0099): the picture where it can be drawn, a tile a person opens, and what is on its way,
 * with what can be done about one that failed. What is on its way is sending.ts's.
 */
import { useState } from "react";
import { FILE_WORDS as W, fileSaidOf, fileViewOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Meter } from "../kit/meter/meter";
import { Press } from "../kit/press";
import type { LegacyFlash } from "../legacy-verbs";
import { takeAway, tryAgain, tryAll, type SendingPhoto } from "./sending";

export /** A picture where it can be drawn. One Storage can't draw keeps its ground and says its name, never a broken glyph. */
function Picture({ src, alt, name, big = false }: { src: string; alt: string; name: string; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [arrived, setArrived] = useState(false);
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
      loading={big ? undefined : "lazy"}
      decoding="async"
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

export /** One photo on the grid: the picture, and the name it goes by. */
function Photo({ file, onOpen }: { file: FileDto; onOpen: () => void }) {
  const said = fileSaidOf(file.name);
  return (
    <Press className="files-photo" onClick={onOpen} data-testid="fl-tile">
      <Picture src={`${fileViewOf(file.id)}?w=480`} alt={file.line ?? said} name={said} />
      <span className="files-name">{said}</span>
    </Press>
  );
}

/** A photo on its way: dim while it goes, and where it failed, its picture, its words, and what can be done about it. */
function OnItsWay({ photo, flash }: { photo: SendingPhoto; flash: (f: LegacyFlash) => void }) {
  const failed = photo.state === "failed";
  return (
    <div
      className={failed ? "files-photo files-failed" : "files-photo files-going"}
      data-testid={failed ? "fl-failed" : "fl-sending"}
    >
      {photo.picture ? (
        <Picture src={photo.picture} alt={photo.file.name} name={photo.file.name} />
      ) : (
        <span className="files-pic files-unseen">{photo.file.name}</span>
      )}
      <span className="files-state">
        {failed ? photo.file.name : photo.state === "sending" ? W.sending : W.waitingToSend}
      </span>
      {photo.sent !== null && !failed ? (
        <Meter
          className="files-sent"
          size="sm"
          parts={[
            { share: photo.sent, tone: "ink" },
            { share: 1 - photo.sent, tone: "ground" },
          ]}
          aria-label={W.sentSoFar(Math.round(photo.sent * 100))}
          data-testid="fl-sent"
        />
      ) : null}
      {failed && (
        <>
          <span className="files-why">{photo.message}</span>
          <span className="files-tries">
            <Button size="sm" onClick={() => tryAgain(photo.key, flash)} data-testid="fl-try-again">
              {W.retry}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => takeAway(photo.key)} data-testid="fl-take-away">
              {W.takeAway}
            </Button>
          </span>
        </>
      )}
    </div>
  );
}

export /** The grid's head: what is on its way, and one press for all that failed. */
function PhotosOnTheirWay({ photos, flash }: { photos: readonly SendingPhoto[]; flash: (f: LegacyFlash) => void }) {
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
      {photos.map((p) => (
        <OnItsWay key={p.key} photo={p} flash={flash} />
      ))}
    </>
  );
}
