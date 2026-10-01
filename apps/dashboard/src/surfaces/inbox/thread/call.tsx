/**
 * A call, in its conversation (moved from pages/inbox-thread.jsx, decision 0015).
 *
 * A call is part of the thread, not a card on it (docs/plans/2026-09-21-calls-you-can-follow.md): a quiet line where it
 * began, what was said as the thread's own bubbles -- the caller's on the left, the receptionist's on the right -- and a
 * quiet line where it ended. Pressing play, or a line, plays it: a slim player floats at the top of the thread while the
 * lines pass under it, and the line being said is outlined and kept in view. It was a 420px card with its transcript
 * behind a tap and a strip of a player, and before that a second screen in Conversations (#775).
 *
 * The card is a function per part, called by `ThreadCall` and not drawn as a component of its own, so the tree is the
 * tree it was; its hooks stay in `ThreadCall`, in the order they were.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject, type SyntheticEvent } from "react";
import { Icon } from "../../kit/icon/icon";
import { demoSession } from "../shell";
import { hasHref, hrefOf } from "./shell-thread";
import { conversationsData } from "../store";
import type { CallLine, ConversationRow } from "../types";

// The call a note stands for, from the calls Conversations reads: one GET calls page, which every surface boots with.
// A call older than that page is drawn from its note alone.
export const tlCallFor = (messageId: string | null | undefined): ConversationRow | null => {
  if (!messageId) return null;
  const rows = conversationsData().CONVERSATIONS || [];
  return rows.find((c) => c.callId && c.messageId === messageId) || null;
};

// A note as the call wrote it (voice-retell.ts callSummaryLine): "Inbound call · 3 min — what they wanted (outcome)".
// A short call's note can say its seconds instead ("Inbound call · 23 s — …"): three of the salon's 34 do.
const tlNoteOf = (body: string | null | undefined) => {
  const text = String(body || "").trim();
  const m = /^(Inbound|Outbound) call(?: · (\d+) (min|s|sec))? — ([\s\S]*)$/.exec(text);
  if (!m) return { direction: "inbound", length: null, about: text || null };
  const about = m[4].trim();
  return {
    direction: m[1] === "Outbound" ? "outbound" : "inbound",
    length: m[2] ? `${m[2]} ${m[3] === "min" ? "min" : "sec"}` : null,
    about: /^No summary available\.?$/.test(about) ? null : about,
  };
};

const tlClock = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const TL_SPEEDS = [1, 1.5, 2];
// The line being said at `pos` seconds: the last one that had begun by then. A line with no moment (a whisper) never is.
const tlLineAt = (lines: Array<{ start?: number | null }>, pos: number) => {
  let at = -1;
  lines.forEach((l, i) => {
    if (typeof l.start === "number" && l.start <= pos + 0.05) at = i;
  });
  return at;
};
// One call plays at a time: the one playing, which the next to play pauses.
const TL_PLAYING: { el: HTMLAudioElement | null } = { el: null };
// How far the thread moves to keep the line being said in view, or 0. `view.top` is where reading starts, below the
// player. A line under the player comes out just below it: pressing ▶ puts the player above the call's first line, the
// browser's scroll anchoring slides it over that line, and bringing the line to a quarter of the pane moved the call's
// lines under the reader's finger: 150px on a real thread in a 567px pane, where this moves them 8. A line below the fold
// comes up with some of what follows it in view, and one that starts in view is never pulled back up.
export const tlFollowBy = (
  line: { top: number; bottom: number },
  view: { top: number; bottom: number; height: number },
) => {
  if (line.top >= view.top && line.bottom <= view.bottom - 24) return 0;
  if (line.top < view.top) return line.top - view.top;
  return Math.max(0, line.top - view.top - view.height * 0.25);
};

/** The audio element an event came from: its target, which a handler reads its moment, its length and its pause from. */
const audioOf = (e: SyntheticEvent<HTMLAudioElement>): HTMLAudioElement => e.target as HTMLAudioElement;

/** What the call is called and how it went. */
interface CallWords {
  direction: string;
  missed: boolean;
  about: string | null | undefined;
  length: string | null;
  kind: string;
  facts: string[];
  them: string;
}

/** What the call is called and how it went, from the call itself where it has been read, else from the note it left. */
function callWords(call: ConversationRow | null, note: string | null): CallWords {
  if (!call) {
    const said = tlNoteOf(note);
    return {
      direction: said.direction,
      missed: false,
      about: said.about,
      length: said.length,
      kind: said.direction === "outbound" ? "Outbound call" : "Inbound call",
      facts: [],
      them: "Caller",
    };
  }
  const direction = call.direction || "inbound";
  const missed = !!call.missed;
  return {
    direction,
    missed,
    // A seeded call carries its words as the old card's headline.
    about: "about" in call ? call.about : call.summary ? call.summary.headline : null,
    length: missed ? null : call.duration || null,
    kind: missed
      ? direction === "outbound"
        ? "Call didn't connect"
        : "Missed call"
      : direction === "outbound"
        ? "Outbound call"
        : "Inbound call",
    facts: call.facts || [],
    them: call.whoShort || call.who || "Caller",
  };
}

/** The recording and the transcript's file, which are the routes' own addresses. */
function callLinks(call: ConversationRow | null, lines: CallLine[] | null) {
  // The recording is the route's own address: it redirects to a link signed for each request, so a seek or a play after a
  // long pause is signed afresh (calls/[id]/recording). The route names the workspace as every read does.
  const real = !!(call && call.real && !demoSession() && hasHref());
  const src =
    real && call.recordingState === "ready" ? hrefOf("GET calls/[id]/recording", { id: call.callId ?? "" }) : null;
  const file = real && lines ? hrefOf("GET calls/[id]/export", { id: call.callId ?? "" }) : null;
  return { src, file };
}

// Keep the line being said in view -- unless you have scrolled away from the one before it: then you are reading
// something else, and the thread does not pull you back.
function keepLineInView(list: HTMLElement | null, followed: RefObject<number>, active: number) {
  if (!list || active < 0 || !list.closest) return;
  const scroller = list.closest(".ix-th-scroll");
  const now = list.children[active];
  const before = followed.current >= 0 ? list.children[followed.current] : null;
  followed.current = active;
  if (!scroller || !now) return;
  const box = scroller.getBoundingClientRect();
  const bar = list.parentElement ? list.parentElement.querySelector<HTMLElement>(".tl-listen") : null;
  const top = box.top + (bar ? bar.offsetHeight + 12 : 0);
  const seen = (n: Element | null) => {
    if (!n) return true;
    const r = n.getBoundingClientRect();
    return r.bottom > top && r.top < box.bottom;
  };
  if (!seen(before)) return;
  const by = tlFollowBy(now.getBoundingClientRect(), { top, bottom: box.bottom, height: box.height });
  if (!by) return;
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollBy({ top: by, behavior: still ? "auto" : "smooth" });
}

interface PlayerHold {
  audioRef: RefObject<HTMLAudioElement | null>;
  failed: string | null;
  speed: number;
  setOpen: (v: boolean) => void;
  setListening: (v: boolean) => void;
  setFailed: (v: string | null) => void;
  setPos: (v: number) => void;
  setSpeed: (v: number) => void;
}

/** What pressing does to the recording: play, listen, pause, seek, follow a line, change the speed, stop. */
function callPlayer(h: PlayerHold) {
  const el = () => h.audioRef.current;
  const play = () => {
    const a = el();
    if (!a) return;
    h.setListening(true);
    h.setFailed(null);
    const p = a.play();
    if (p != null && typeof p.catch === "function") p.catch(() => h.setFailed("Couldn't play the recording."));
  };
  const listen = () => {
    h.setOpen(true);
    play();
  };
  const toggle = () => {
    const a = el();
    if (!a) return;
    // Asked again: the route signs a new link for the new request.
    if (h.failed) {
      a.load();
      play();
      return;
    }
    if (a.paused) play();
    else a.pause();
  };
  const seek = (sec: number) => {
    const a = el();
    if (!a) return;
    a.currentTime = sec;
    h.setPos(sec);
  };
  const playFrom = (sec: number | null | undefined) => {
    const a = el();
    if (!a || typeof sec !== "number") return;
    seek(sec);
    if (a.paused) play();
    else h.setListening(true);
  };
  const cycle = () => {
    const next = TL_SPEEDS[(TL_SPEEDS.indexOf(h.speed) + 1) % TL_SPEEDS.length];
    h.setSpeed(next);
    const a = el();
    if (a) a.playbackRate = next;
  };
  const stop = () => {
    const a = el();
    if (a) a.pause();
    h.setListening(false);
  };
  return { play, listen, toggle, seek, playFrom, cycle, stop };
}

/** Everything the card's parts draw from: the state `ThreadCall` holds, what the call says, and what pressing does. */
interface CallDraw extends CallWords {
  call: ConversationRow | null;
  at: string;
  src: string | null;
  file: string | null;
  lines: CallLine[] | null;
  active: number;
  open: boolean;
  listening: boolean;
  playing: boolean;
  pos: number;
  dur: number;
  speed: number;
  failed: string | null;
  pct: number;
  audioRef: RefObject<HTMLAudioElement | null>;
  turnsRef: RefObject<HTMLDivElement | null>;
  setOpen: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  setPos: (v: number) => void;
  setDur: (v: number) => void;
  setFailed: (v: string | null) => void;
  player: ReturnType<typeof callPlayer>;
}

/** The recording itself, which only a call with a ready recording has. */
function callAudio(c: CallDraw) {
  const { call, src, audioRef } = c;
  return (
    src && (
      // eslint-disable-next-line jsx-a11y-x/media-has-caption -- kept as the JSX drew it: the recording is the call itself, and what was said is drawn line by line beside it
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={(e) => {
          // One call at a time: this one playing pauses the one that was.
          const target = audioOf(e);
          if (TL_PLAYING.el && TL_PLAYING.el !== target && TL_PLAYING.el.pause) TL_PLAYING.el.pause();
          TL_PLAYING.el = target;
          c.setPlaying(true);
        }}
        onPause={() => c.setPlaying(false)}
        onEnded={() => c.setPlaying(false)}
        onTimeUpdate={(e) => c.setPos(audioOf(e).currentTime)}
        onLoadedMetadata={(e) => c.setDur(audioOf(e).duration || (call && call.durationSec) || 0)}
        onError={() => {
          c.setPlaying(false);
          c.setFailed("Couldn't play the recording.");
        }}
      />
    )
  );
}

/** The slim player that floats at the top of the thread while the call is being listened to. */
function callListenBar(c: CallDraw) {
  const { src, listening, them, failed, playing, dur, pos, pct, speed, player } = c;
  return (
    src &&
    listening && (
      <div className="tl-listen" role="group" aria-label={`The call with ${them}`} data-testid="tl-listen">
        <button
          type="button"
          className="tl-listen-play"
          onClick={player.toggle}
          aria-label={failed ? "Try the recording again" : playing ? "Pause" : "Play"}
          data-testid="tl-listen-play"
        >
          <Icon name={playing ? "pause" : "play"} size={12} />
        </button>
        <span className="tl-listen-who">{them}</span>
        <input
          type="range"
          className="tl-listen-track"
          min="0"
          max={dur || 0}
          step="0.1"
          value={Math.min(pos, dur || 0)}
          onChange={(e) => player.seek(Number(e.target.value))}
          aria-label="Position in the call"
          aria-valuetext={`${tlClock(pos)} of ${tlClock(dur)}`}
          style={{ "--fill": `${pct}%` } as CSSProperties}
          data-testid="tl-listen-track"
        />
        {failed ? (
          <span className="tl-listen-failed" role="status" data-testid="tl-listen-failed">
            {failed}
          </span>
        ) : (
          <span className="tl-listen-clock tabular">
            {tlClock(pos)} / {tlClock(dur)}
          </span>
        )}
        <button
          type="button"
          className="tl-listen-speed tabular"
          onClick={player.cycle}
          aria-label={`Speed ${speed}×. Change it`}
          data-testid="tl-listen-speed"
        >
          {speed}×
        </button>
        <button
          type="button"
          className="tl-listen-close"
          onClick={player.stop}
          aria-label="Stop listening"
          data-testid="tl-listen-close"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
    )
  );
}

/** The quiet line where the call began: its play button or its glyph, what it was, how long, and when. */
function callMark(c: CallDraw) {
  const { src, listening, length, kind, lines, facts, at, player } = c;
  return (
    <div className="tl-call-mark" data-testid="tl-call-start">
      {src && !listening ? (
        <button
          type="button"
          className="tl-call-play"
          onClick={player.listen}
          aria-label={`Listen to the call${length ? `, ${length}` : ""}`}
          data-testid="tl-call-play"
        >
          <Icon name="play" size={10} />
        </button>
      ) : (
        <span className="tl-call-glyph" aria-hidden="true">
          <Icon name="phone" size={11} />
        </span>
      )}
      {/* What it was, then when, set apart by space rather than a dot: on a narrow phone the when takes its own line,
            and a dot began it. */}
      <span className="tl-call-words">
        <span className="tl-call-what">
          <span className="tl-call-kind">{kind}</span>
          {length && <span className="tl-call-length tabular">{length}</span>}
          {/* A call with no lines says how it went on its one line: "Missed call · No answer". */}
          {!lines && facts.length > 0 && <span className="tl-call-facts">{facts.join(" · ")}</span>}
        </span>
        <span className="tl-call-at tabular">{at}</span>
      </span>
    </div>
  );
}

/** One thing said in the call, as the thread's own bubble; a line plays from itself where the recording can. */
function callLine(c: CallDraw, line: CallLine, i: number) {
  const { src, them, active, player } = c;
  const whisper = line.speaker === "whisper";
  const playable = !!src && !whisper && typeof line.start === "number";
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- kept as the JSX drew it: a line plays from itself under a pointer, and its timestamp is the button a keyboard reaches
    <div
      key={i}
      className={`tl-msg ${line.speaker === "client" ? "client" : "agent"} tl-spoken${whisper ? " whisper" : ""}${i === active ? " now" : ""}${playable ? " playable" : ""}`}
      aria-current={i === active ? "true" : undefined}
      // A line plays from itself -- unless you were selecting its words to copy them.
      onClick={
        playable
          ? () => {
              const sel = window.getSelection ? window.getSelection() : null;
              if (!sel || sel.isCollapsed) player.playFrom(line.start);
            }
          : undefined
      }
      data-testid="tl-spoken"
    >
      <div className="tl-msg-bubble">
        <div className="tl-msg-meta">
          {/* Who spoke, for a screen reader: the side says it to the eye. */}
          {!whisper && <span className="tl-spoken-who">{line.speaker === "agent" ? "Receptionist" : them}</span>}
          {whisper && <span className="tl-spoken-whisper">You whispered</span>}
          {playable ? (
            <button
              type="button"
              className="tl-spoken-t tabular"
              onClick={(e) => {
                e.stopPropagation();
                player.playFrom(line.start);
              }}
              aria-label={`Play from ${tlClock(line.start)}`}
            >
              {tlClock(line.start)}
            </button>
          ) : !whisper && typeof line.start === "number" ? (
            <span className="tl-msg-time tabular">{tlClock(line.start)}</span>
          ) : null}
        </div>
        <div className="tl-msg-body">{line.text}</div>
      </div>
    </div>
  );
}

/** The call's lines, and the quiet line where it ended, once it is opened. */
function callOpened(c: CallDraw) {
  const { lines, open, turnsRef, facts, file } = c;
  return (
    lines &&
    open && (
      <>
        <div className="tl-call-turns" ref={turnsRef} data-testid="tl-call-lines">
          {lines.map((line, i) => callLine(c, line, i))}
        </div>
        <div className="tl-call-mark end" data-testid="tl-call-end">
          <span className="tl-call-ended">{["Call ended", ...facts].join(" · ")}</span>
          {file && (
            <a
              className="tl-call-file"
              href={file}
              download
              aria-label="Download the transcript"
              title="Download the transcript"
            >
              <Icon name="download" size={11} />
            </a>
          )}
        </div>
      </>
    )
  );
}

/** A call with lines, folded: what it was about, and the press that shows them. */
function callFolded(c: CallDraw) {
  const { lines, open, about, setOpen } = c;
  return (
    lines &&
    !open && (
      <div className="tl-call-folded">
        {about && <span className="tl-call-about">{about}</span>}
        <button
          type="button"
          className="tl-call-open"
          aria-expanded="false"
          onClick={() => setOpen(true)}
          data-testid="tl-call-open"
        >
          Show the call · {lines.length} {lines.length === 1 ? "line" : "lines"}
        </button>
      </div>
    )
  );
}

interface ThreadCallProps {
  call?: ConversationRow | null;
  note?: string | null;
  at: string;
  mid?: string;
  open?: boolean;
  focus?: boolean;
}

// `call`: the call itself, when it has been read; `note`: the words it left on the thread, which are all an older call
// has. `open`: its lines shown -- the thread's newest spoken entry, or the call Conversations opened it at. On the side
// it came from, for its direction; drawn across the thread, for it is neither side's words.
export const ThreadCall = ({
  call = null,
  note = null,
  at,
  mid,
  open: openFirst = false,
  focus = false,
}: ThreadCallProps) => {
  const [open, setOpen] = useState(!!openFirst);
  const [listening, setListening] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState((call && call.durationSec) || 0);
  const [speed, setSpeed] = useState(1);
  const [failed, setFailed] = useState<string | null>(null); // the sentence, while the recording can't be played
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turnsRef = useRef<HTMLDivElement | null>(null);
  const followed = useRef(-1);
  const lines = call && call.transcript && call.transcript.length ? call.transcript : null;
  const active = listening && lines ? tlLineAt(lines, pos) : -1;

  useEffect(() => keepLineInView(turnsRef.current, followed, active), [active]);

  const words = callWords(call, note);
  const player = callPlayer({ audioRef, failed, speed, setOpen, setListening, setFailed, setPos, setSpeed });
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
  const c: CallDraw = {
    ...words,
    ...callLinks(call, lines),
    call,
    at,
    lines,
    active,
    open,
    listening,
    playing,
    pos,
    dur,
    speed,
    failed,
    pct,
    audioRef,
    turnsRef,
    setOpen,
    setPlaying,
    setPos,
    setDur,
    setFailed,
    player,
  };

  return (
    <div
      className={`tl-call ${words.direction}${listening ? " listening" : ""}${focus ? " focus" : ""}`}
      data-mid={mid}
      data-testid="tl-call"
    >
      {callAudio(c)}
      {callListenBar(c)}
      {callMark(c)}
      {callOpened(c)}
      {callFolded(c)}
      {!lines && words.about && <div className="tl-call-about">{words.about}</div>}
    </div>
  );
};
