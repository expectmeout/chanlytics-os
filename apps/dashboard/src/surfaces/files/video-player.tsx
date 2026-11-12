/**
 * A video opened (decision 0099, stage B, D4 and §8): Stream's player in the picture's place, under a token the edge signs for
 * this member's session, an hour, asked once as the sheet opens; until it answers, the poster, which is ours. Captions come on
 * in the language spoken, where what is said was written down. Under it, what is said (folded past its first lines, each
 * stretch with its moment and, where there are several, its voice) and how it sounds, as other models heard them.
 *
 * Nothing here is a model's to say as fact: the words are what was heard, said as such, and a clip with no one speaking says so.
 */
import { useEffect, useState } from "react";
import { FILE_WORDS as W, clockOf, fileViewOf, noteSaidOf, type FileDto, type FileSound } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Notice } from "../kit/notice/notice";
import { Picture } from "./photo";
import { fileVerbs } from "./verbs";

/** How many stretches of what is said show before the rest is asked for. */
const CUES_SHOWN = 4;

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

export /** The video in the sheet: the player once its address is in, the poster before, its state in words until it is ready. */
function VideoOpened({ file, said, reel }: { file: FileDto; said: string; reel?: VideoReel }) {
  const [player, setPlayer] = useState<string | null>(null);
  // A big picture is drawn once it has arrived (files.css `.files-big[data-arrived]`): the player too, once its frame loads.
  // Kept as the address that came, so a reel asked for again (its sound on, VideoReel) is drawn once that one has come.
  const [arrived, setArrived] = useState<string | null>(null);
  const [unplayable, setUnplayable] = useState(false);
  const ready = file.media_status === "ready";
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    void fileVerbs.play(file.id).then((r) => {
      if (!live) return;
      if (r.ok) setPlayer(r.data.player_url);
      else setUnplayable(true);
    });
    return () => {
      live = false;
    };
  }, [file.id, ready]);
  if (!ready) {
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

/** What is said, folded past its first stretches. */
function WhatIsSaid({ sound }: { sound: FileSound }) {
  const [all, setAll] = useState(false);
  const words = sound.words;
  if (sound.none) return <p className="files-says">{W.video.noSound}</p>;
  if (!words) return <p className="files-says">{W.video.notHeardYet}</p>;
  if ("none" in words) return <p className="files-says">{W.video.noOneSpeaks}</p>;
  const voices = words.voices > 1;
  const shown = all ? words.cues : words.cues.slice(0, CUES_SHOWN);
  return (
    <>
      <ol className="files-cues" data-testid="fl-said">
        {shown.map((c) => (
          <li key={`${c.start}-${c.text.slice(0, 12)}`} className="files-cue">
            <span className="files-cue-at">{clockOf(c.start)}</span>
            <span className="files-cue-words">
              {voices && c.voice ? <span className="files-cue-voice">{W.video.voice(c.voice)} </span> : null}
              {c.text}
            </span>
          </li>
        ))}
      </ol>
      {words.cues.length > CUES_SHOWN && !all && (
        <Button size="sm" variant="quiet" onClick={() => setAll(true)} data-testid="fl-said-all">
          {W.video.showAll}
        </Button>
      )}
    </>
  );
}

export /** What was heard of the video: what is said, and how it sounds, under its own words. */
function VideoHeard({ sound }: { sound: FileSound | null }) {
  if (!sound) return null;
  const note = sound.none ? null : sound.note;
  return (
    <div className="files-heard" data-testid="fl-heard">
      <h3 className="files-heard-title">{W.video.whatIsSaid}</h3>
      <WhatIsSaid sound={sound} />
      {!sound.none && (
        <>
          <h3 className="files-heard-title">{W.video.howItSounds}</h3>
          <p className="files-says">{note ? noteSaidOf(note) : W.video.notHeardYet}</p>
        </>
      )}
    </div>
  );
}
