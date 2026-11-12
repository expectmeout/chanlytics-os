/**
 * The viewer's picture, full bleed on the dark (the content canvas, board PhView): a video filling the screen, Files' Stream
 * player playing at once, muted and looping (files/video-player.tsx VideoReel), with a line under it that runs the reel's
 * length; a picture post, or a photo of the Library, fitted over its own copy blurred to the screen's edges. On a desk's
 * stage, wider than a reel, a reel Ask made stands in the middle over its own poster blurred to the edges, as a post does
 * (board Desk, content.css); on a phone the reel covers the poster.
 */
import { useCallback, useEffect, useState } from "react";
import { CONTENT_WORDS as W, fileViewOf, type FileDto } from "@chanlytics/contracts";
import { Press } from "../../../kit/press";
import { VideoOpened } from "../../../files/video-player";
import { postShapeAddress } from "../../../files/post-shapes";
import { fileVerbs } from "../../../files/verbs";

/**
 * The picture or the reel, opened full size in a tab of its own where it is pressed (Ruben, 12 Nov 2026: a person reaches
 * for it): a picture's own file at its full size, a reel's player with its controls. Over the picture, under the controls.
 */
function OpenFull({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <Press
      className="cnv-viewer-open"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={W.viewer.openFull}
      data-testid="cnv-open-full"
    />
  );
}

/** A reel's player, as its own address: asked once the reel is ready (the read the player itself makes, shared). */
function usePlayerAddress(file: FileDto): string | null {
  const [player, setPlayer] = useState<string | null>(null);
  const ready = file.kind === "video" && file.media_status === "ready";
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    void fileVerbs.play(file.id).then((r) => {
      if (live && r.ok) setPlayer(r.data.player_url);
    });
    return () => {
      live = false;
    };
  }, [file.id, ready]);
  return ready ? player : null;
}

/**
 * The line that runs under a playing reel: the reel's length said on it (`--reel-length`, content.css), run from the moment
 * the player's frame has come and again each time it is asked for again (sound on starts the reel over). Stream's own clock is
 * not read (no script of Stream's is loaded: C1), so it runs the reel's length rather than following the frame.
 */
function ReelRun({ seconds }: { seconds: number | null }) {
  const lengthOn = useCallback(
    (el: HTMLElement | null) => {
      if (el && seconds) el.style.setProperty("--reel-length", `${seconds}s`);
    },
    [seconds],
  );
  if (!seconds) return null;
  return (
    <span className="cnv-reel" ref={lengthOn} aria-hidden="true">
      <span />
    </span>
  );
}

export function ViewerPicture({ file, name, sound }: { file: FileDto; name: string; sound: boolean }) {
  const player = usePlayerAddress(file);
  if (file.kind === "video")
    return (
      // A reel Ask made is drawn 9:16 (contracts' PIECE_FRAME) and fills the screen, its sides cut where the screen is
      // narrower (`data-fill`, content.css), as the canvas's does; a clip of the Library is shown whole, at its own shape.
      <div
        className="cnv-viewer-picture"
        data-kind="video"
        data-fill={file.source === "made" || undefined}
        data-testid="cnv-stage"
      >
        {file.source === "made" && file.media_status === "ready" ? (
          <img className="cnv-viewer-blur" src={`${fileViewOf(file.id)}?w=480`} alt="" aria-hidden="true" />
        ) : null}
        <VideoOpened file={file} said={name} reel={{ sound }} />
        {/* Drawn again with the sound, as the reel starts again with it. */}
        <ReelRun key={sound ? "sound" : "muted"} seconds={file.seconds} />
        <OpenFull href={player} />
      </div>
    );
  // A post Ask made, at the shape it is drawn in; a photo of the Library as it is.
  const src = file.source === "made" ? postShapeAddress(file.id, "portrait") : `${fileViewOf(file.id)}?w=1280`;
  return (
    <div className="cnv-viewer-picture" data-kind="picture" data-testid="cnv-stage">
      <img className="cnv-viewer-blur" src={src} alt="" aria-hidden="true" />
      <img className="cnv-viewer-fit" src={src} alt={file.line ?? name} />
      <OpenFull href={file.source === "made" ? postShapeAddress(file.id, "portrait") : fileViewOf(file.id)} />
    </div>
  );
}
