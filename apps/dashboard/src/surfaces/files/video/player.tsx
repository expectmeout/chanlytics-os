/**
 * A video opened (decision 0099, stage B, D4 and §8): Stream's player in the picture's place, under a token the edge signs for
 * this member's session, an hour, asked once as the sheet opens; until it answers, the poster, which is ours. Captions come on
 * in the language spoken, where what is said was written down.
 */
import { useEffect, useState } from "react";
import { FILE_WORDS as W, fileViewOf, type FileDto } from "@chanlytics/contracts";
import { Notice } from "../../kit/notice/notice";
import { VideoKept, useCopyStanding } from "../footage/video-kept";
import { Picture } from "../photo";
import { fileVerbs } from "../verbs";

/** What Stream's player is let do inside its frame, as Cloudflare's own embed asks. */
const PLAYER_ALLOWS = "accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen";

/**
 * How a reel plays in Content's viewer (the canvas's C1, Ruben's call of 12 Nov 2026): at once, looping, with no controls of
 * the player's own, muted until the viewer's glass sound press. Said in the player's own address, which the edge's `play`
 * door signs and Stream reads (`autoplay`, `muted`, `loop`, `controls`), its own query kept: no script of Stream's is loaded
 * (its SDK is served only unpinned, which decision 0054 refuses). Sound on is the same reel asked for again unmuted, so it
 * starts again from its first frame, a loop of a few seconds.
 */
interface VideoReel {
  sound: boolean;
}

/** The signed address, asked to play as a reel: muted or not, at once, looping, with no controls over the picture. */
function reelAddressOf(player: string, reel: VideoReel): string {
  const url = new URL(player, window.location.href);
  url.searchParams.set("autoplay", "true");
  url.searchParams.set("muted", reel.sound ? "false" : "true");
  url.searchParams.set("loop", "true");
  url.searchParams.set("controls", "false");
  return url.toString();
}

/** A video still being made ready, or one that could not be: said where it will play. */
function VideoNotReady({ file, said }: { file: FileDto; said: string }) {
  const failed = file.media_status === "failed";
  return (
    <>
      <span
        className="files-big files-unseen"
        role="img"
        aria-label={`${said}: ${failed ? W.video.notPrepared : W.video.gettingReady}`}
        data-testid={failed ? "fl-video-failed" : "fl-video-waits"}
      >
        {failed ? W.video.notPrepared : W.video.gettingReady}
      </span>
      {failed && <p className="files-says files-issues">{W.video.notPreparedNote}</p>}
    </>
  );
}

/** The video in the sheet: the player once its address is in, the poster before, its state in words until it is ready. */
export function VideoOpened({ file, said, reel }: { file: FileDto; said: string; reel?: VideoReel }) {
  const [player, setPlayer] = useState<string | null>(null);
  // A big picture is drawn once it has arrived (files.css `.files-big[data-arrived]`): the player too, once its frame loads.
  // Kept as the address that came, so a reel asked for again (its sound on, VideoReel) is drawn once that one has come.
  const [arrived, setArrived] = useState<string | null>(null);
  const [unplayable, setUnplayable] = useState(false);
  const ready = file.media_status === "ready";
  // A watched folder's clip may be kept with its provider (footage/copy-words.ts): it is asked for on a press of
  // Play, never as the clip opens, and the page goes on by itself the moment it is back.
  const [back, setBack] = useState(0);
  const copy = useCopyStanding(file, () => setBack((turn) => turn + 1));
  const here = copy.copy === "here";
  const { hear } = copy;
  useEffect(() => {
    if (!ready || !here) return undefined;
    let live = true;
    void fileVerbs.play(file.id).then((r) => {
      if (!live) return;
      if (!r.ok) return setUnplayable(true);
      // The Library said it was at hand and the door says it is not: believe the door, which has just asked for it.
      if (r.data.player_url === null) return hear(r.data.copy, r.data.copy_why);
      return setPlayer(r.data.player_url);
    });
    return () => {
      live = false;
    };
    // `back` asks again once a clip that was away is here.
  }, [file.id, ready, here, back, hear]);
  if (!ready) return <VideoNotReady file={file} said={said} />;
  if (!here)
    return (
      <VideoKept
        file={file}
        said={said}
        standing={copy}
        asking={copy.asking}
        onPlay={() => void copy.ask()}
        onComing={() => hear("returning", null)}
      />
    );
  const src = player && reel ? reelAddressOf(player, reel) : player;
  return (
    <>
      {src ? (
        <iframe
          className="files-big files-player"
          src={src}
          title={said}
          allow={PLAYER_ALLOWS}
          allowFullScreen
          data-arrived={arrived === src ? "true" : undefined}
          onLoad={() => setArrived(src)}
          data-testid="fl-player"
        />
      ) : (
        <Picture src={`${fileViewOf(file.id)}?w=1280`} alt={file.line ?? said} name={said} big />
      )}
      {unplayable && <Notice label={W.video.cantPlay} fact={W.video.cantPlay} line testid="fl-cant-play" />}
    </>
  );
}
