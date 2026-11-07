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

export /** The video in the sheet: the player once its address is in, the poster before, its state in words until it is ready. */
function VideoOpened({ file, said }: { file: FileDto; said: string }) {
  const [player, setPlayer] = useState<string | null>(null);
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
  return (
    <>
      {player ? (
        <iframe
          className="files-big files-player"
          src={player}
          title={said}
          allow={PLAYER_ALLOWS}
          allowFullScreen
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
