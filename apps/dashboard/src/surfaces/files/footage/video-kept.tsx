/**
 * A clip whose video is kept in Google Drive, opened (the footage sources plan, P5, gate 1; the canvas's board "A clip
 * kept in Drive"). Its picture, its sound and what AI wrote never left, so its still is drawn at once, with one line
 * that says where its video stands and the one thing to do, and its sound to listen to meanwhile.
 *
 * Play is a press, never the opening of the clip: flicking through clips must not spend the day's returns (the
 * canvas's call 5). After the press the page waits and goes on by itself: it asks where the copy stands every few
 * seconds, which asks for nothing, and plays the clip the moment it is back. Every wait says that it ends by itself;
 * only a clip whose original is truly gone asks anything of its owner.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  SECOND_MS,
  clockOf,
  fileViewOf,
  type FileCopyState,
  type FileCopyWhy,
  type FileDto,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LineFiles } from "../../kit/line/line";
import { FILE_PICKS_WITH_VIDEO, fileVerbs } from "../verbs";
import { knownZone } from "@/bridge/zone";
import { COPY_WORDS as W, copySaidOf, leavesOn, type CopyAct, type CopyFacts } from "./copy-words";
import { DRIVE_SETTINGS_ROUTE, heldFootage } from "./use-footage";
import "./footage.css";

/** How often a clip on its way back is asked after: a return takes about two minutes. */
const ASK_EVERY_MS = 10 * SECOND_MS;
/** Google Drive's own page, where a file is put back or moved back. */
const DRIVE_PAGE = "https://drive.google.com/drive/";

/** Where a clip's copy stands, as the page last heard it. */
interface CopyStanding {
  copy: FileCopyState;
  why: FileCopyWhy | null;
}

/** What the page knows beside the clip's own row: its folder and account, where a watched folder was read, and its day to leave. */
function factsHere(file: Pick<FileDto, "origin_left_at">): CopyFacts {
  const footage = heldFootage();
  return {
    folder: footage?.folder?.name ?? null,
    account: footage?.account?.email ?? null,
    leaves: leavesOn(file, knownZone() ?? "UTC"),
    connected: !!footage?.account,
  };
}

/**
 * Where a clip's copy stands while its page is open. It starts from what the Library said of it; a press of Play
 * asks for it; and while it is on its way the page asks after it, until it is back. `onBack` is told the moment it is.
 */
export function useCopyStanding(
  file: FileDto,
  onBack: () => void,
): CopyStanding & {
  /** Asks for the clip: a press of Play. */
  ask: () => Promise<void>;
  asking: boolean;
  /** What a door said of the copy, where it knows better than the Library's last read. */
  hear: (copy: FileCopyState, why: FileCopyWhy | null) => void;
} {
  const [standing, setStanding] = useState<CopyStanding>({ copy: file.copy, why: file.copy_why });
  const [asking, setAsking] = useState(false);
  // What the Library hears of the clip since (its row is told to open pages as it changes) is believed over the last ask.
  const [seen, setSeen] = useState(`${file.id}:${file.copy}:${file.copy_why ?? ""}`);
  const now = `${file.id}:${file.copy}:${file.copy_why ?? ""}`;
  if (now !== seen) {
    setSeen(now);
    setStanding({ copy: file.copy, why: file.copy_why });
  }
  const back = useRef(onBack);
  back.current = onBack;

  const waits =
    standing.copy === "returning" || standing.copy === "going" || (standing.copy === "away" && standing.why === "room");
  useEffect(() => {
    if (!waits) return undefined;
    const every = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api()("GET files/[id]/copy", { params: { id: file.id } }).then(
        (answer) => {
          if (!answer.ok) return;
          setStanding({ copy: answer.data.copy, why: answer.data.copy_why });
          if (answer.data.copy === "here") back.current();
        },
        // A look that did not answer is made again at the next turn.
        () => undefined,
      );
    }, ASK_EVERY_MS);
    return () => window.clearInterval(every);
  }, [waits, file.id]);

  const ask = async () => {
    setAsking(true);
    const answer = await fileVerbs.play(file.id).catch(() => null);
    setAsking(false);
    if (!answer?.ok) return;
    if (answer.data.player_url !== null) {
      setStanding({ copy: "here", why: null });
      back.current();
      return;
    }
    setStanding({ copy: answer.data.copy, why: answer.data.copy_why });
  };

  const hear = useCallback((copy: FileCopyState, reason: FileCopyWhy | null) => setStanding({ copy, why: reason }), []);
  return { ...standing, ask, asking, hear };
}

/**
 * The clip's sound alone, over its still: what was heard of it is kept with its pictures, so it plays whatever the
 * video does. The player is the browser's own, made here and never drawn: the still is what is looked at.
 */
function SoundOnly({ file, onVideo }: { file: FileDto; onVideo: (() => void) | null }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const sound = new Audio(`${fileViewOf(file.id)}?sound=1`);
    player.current = sound;
    const tick = () => setAt(sound.currentTime);
    const stopped = () => setPaused(true);
    const started = () => setPaused(false);
    sound.addEventListener("timeupdate", tick);
    sound.addEventListener("pause", stopped);
    sound.addEventListener("play", started);
    // A browser that will not start sound by itself leaves it paused, and the press starts it.
    void sound.play().catch(stopped);
    return () => {
      sound.pause();
      sound.removeEventListener("timeupdate", tick);
      sound.removeEventListener("pause", stopped);
      sound.removeEventListener("play", started);
      player.current = null;
    };
  }, [file.id]);
  const toggle = () => {
    const sound = player.current;
    if (!sound) return;
    if (sound.paused) void sound.play().catch(() => undefined);
    else sound.pause();
  };
  return (
    <div className="fo-kept-words" data-testid="fo-kept-sound">
      <Button iconOnly aria-label={paused ? W.listen : W.pause} onClick={toggle} data-testid="fo-kept-sound-toggle">
        <Icon name={paused ? "play" : "pause"} size={16} />
      </Button>
      <b>{W.soundOnly}</b>
      <p>{file.seconds ? `${clockOf(at)} of ${clockOf(file.seconds)}` : clockOf(at)}</p>
      {onVideo ? (
        <div className="fo-kept-acts">
          <Button size="sm" onClick={onVideo} data-testid="fo-kept-video">
            <Icon name="play" size={12} /> {W.playVideo}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** What each act is, as a press: Play asks for the clip; the rest are doors. */
function actButton(act: CopyAct, press: { play: () => void; again: () => void; busy: boolean }): ReactNode {
  if (act === "play")
    return (
      <Button variant="primary" size="sm" disabled={press.busy} onClick={press.play} data-testid="fo-kept-play">
        {W.acts.play}
      </Button>
    );
  if (act === "open_drive")
    return (
      <Button
        variant="primary"
        size="sm"
        href={DRIVE_PAGE}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="fo-kept-drive"
      >
        {W.acts.open_drive}
      </Button>
    );
  if (act === "connect")
    return (
      <Button variant="primary" size="sm" onClick={() => navigate(DRIVE_SETTINGS_ROUTE)} data-testid="fo-kept-connect">
        {W.acts.connect}
      </Button>
    );
  return (
    <Button variant="primary" size="sm" disabled={press.busy} onClick={press.again} data-testid="fo-kept-again">
      {W.acts.add_again}
    </Button>
  );
}

interface VideoKeptProps {
  file: FileDto;
  said: string;
  standing: CopyStanding;
  asking: boolean;
  onPlay: () => void;
  /** The same clip was added again, and its bytes are bringing it back: it is on its way from now. */
  onComing: () => void;
}

/** The clip's still, with where its video stands said over it, its one act, and its sound to listen to. */
export function VideoKept({ file, said, standing, asking, onPlay, onComing }: VideoKeptProps) {
  const [listening, setListening] = useState(false);
  // "Add the video again": the device's own picker, then the upload. The same clip's bytes bring it back (the server
  // hands its upload to the clip already kept); another video is simply added to the Library, and this one says so.
  const picker = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const again = async (picked: File | undefined) => {
    if (!picked) return;
    setAdding(true);
    setRefused(null);
    const added = await fileVerbs.add(picked);
    setAdding(false);
    if (!added.kept) return setRefused(added.message);
    if (added.id === file.id) return onComing();
    return setRefused(W.otherVideo);
  };
  const words = copySaidOf(standing.copy, standing.why, factsHere(file));
  if (!words) return null;
  const hasSound = !!file.sound_said && file.sound_said !== "no sound";
  return (
    <div className="fo-kept" data-copy={standing.copy} data-testid="fo-kept">
      <LineFiles
        ref={picker}
        accept={FILE_PICKS_WITH_VIDEO}
        onChange={(event) => {
          void again(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
        data-testid="fo-kept-picker"
      />
      <img className="fo-kept-still" src={`${fileViewOf(file.id)}?w=1280`} alt={file.line ?? said} />
      {listening ? (
        <SoundOnly file={file} onVideo={words.act === "play" ? onPlay : null} />
      ) : (
        <div className="fo-kept-words" role="status">
          {words.mark === "ring" ? <span className="fo-kept-ring" aria-hidden="true" /> : null}
          <b>{words.head}</b>
          <p>{refused ?? words.body}</p>
          <div className="fo-kept-acts">
            {words.act
              ? actButton(words.act, { play: onPlay, again: () => picker.current?.click(), busy: asking || adding })
              : null}
            {hasSound ? (
              <Button size="sm" onClick={() => setListening(true)} data-testid="fo-kept-listen">
                <Icon name="headphones" size={12} /> {W.listen}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
