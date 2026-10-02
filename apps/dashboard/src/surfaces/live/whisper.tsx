/**
 * A sentence only the receptionist hears, worked into its next answer (moved from legacy/pages/live-monitor.jsx,
 * decision 0015). The listen-in stayed in the demo: the provider streams the transcript, never the audio, so the words
 * in the panel are what you follow.
 */
import { useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { LiveCallVM } from "@chanlytics/contracts";
import { whisperCall } from "@/legacy-bridge/inbox-verbs";
import { gate, useLegacyToast } from "../legacy-verbs";
import { Icon } from "../kit/icon/icon";

/** One phrase the browser's recogniser heard: whether it is settled, and its best guess (the Web Speech API's result). */
interface Heard {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

/** The browser's recogniser, as far as the whisper uses it (lib.dom has the events, not the recogniser itself). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<Heard> }) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type Recognizer = new () => Recognition;

// Speech recognition in the browser, where it exists (Chrome, Edge, Safari;
// not Firefox). The owner is usually listening to the call, not typing:
// hold the button, say the whisper, let go — the words are transcribed on
// the device and sent as text like any other whisper. Nothing is recorded
// or uploaded; the browser's own recogniser does the work.
const lrRecognizer = (): Recognizer | null => {
  const w: Window & { SpeechRecognition?: Recognizer; webkitSpeechRecognition?: Recognizer } = window;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

interface TalkProps {
  listening: boolean;
  busy: boolean;
  startTalking: (e?: SyntheticEvent) => void;
  stopTalking: () => void;
}

/**
 * Hold to talk, as Ask's field has it (S12): the microphone while nothing is typed. A press starts the recogniser,
 * letting go (or leaving the button) stops it, and what was heard is sent. Its words are the label and the tooltip: the
 * button is the glyph alone, coral while it listens.
 */
function talkButton({ listening, busy, startTalking, stopTalking }: TalkProps) {
  return (
    <button
      type="button"
      className={`ask-send talk lm-talk ${listening ? "on" : ""}`}
      data-testid="live-whisper-talk"
      data-own-drag
      aria-pressed={listening}
      aria-label={listening ? "Listening… let go to send" : "Hold to talk"}
      title="Hold and say the whisper; it is sent when you let go"
      onPointerDown={startTalking}
      onPointerUp={stopTalking}
      onPointerLeave={stopTalking}
      onPointerCancel={stopTalking}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) startTalking(e);
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stopTalking();
      }}
      onContextMenu={(e) => e.preventDefault()}
      disabled={busy}
      {...gate("approve")}
    >
      <Icon key="mic" name="mic" size={15} />
    </button>
  );
}

interface NoteProps {
  last: string | null;
  explain: boolean;
  toggle: () => void;
}

/**
 * Who hears the whisper, in a line; a press says what the receptionist does with it. What was last whispered stands here
 * until the next one, as the transcript's own line says it landed.
 */
function whisperNote({ last, explain, toggle }: NoteProps) {
  return (
    <>
      <button
        type="button"
        className="lm-whisper-note"
        data-testid="live-whisper-note"
        aria-expanded={explain}
        onClick={toggle}
      >
        <Icon name="lock" size={11} />
        <span className="lm-whisper-note-text">
          {last ? <>Whispered: &ldquo;{last}&rdquo;</> : "Only the receptionist hears this"}
        </span>
        <Icon name="info" size={11} />
      </button>
      {explain && (
        <div className="lm-whisper-more" data-testid="live-whisper-more">
          It keeps your whisper in mind and works it into its answers in its own words, when it fits. It will not quote
          a price or confirm a booking because of one, and the caller never hears you.
        </div>
      )}
    </>
  );
}

export const LrWhisper = ({ c }: { c: LiveCallVM }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // The one-line note says who hears it; a press opens what the receptionist does with it.
  const [explain, setExplain] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const heardRef = useRef("");
  const [toastNode, flash] = useLegacyToast();
  const canTalk = !!lrRecognizer();

  const send = async (words?: string) => {
    const t = String(words ?? text).trim();
    if (!t || busy) return;
    setBusy(true);
    // No nudge to speak: a whisper is kept in mind and used when it fits,
    // which may be the next answer or a later one. Forcing a response now
    // would make a conditional whisper ("if they mention X…") come out early.
    const r = await whisperCall(c.callId, t, false);
    setBusy(false);
    if (r.ok) {
      setLast(t);
      setText("");
      flash({ msg: <>Whispered — the receptionist works it into its next answer</> });
    } else {
      flash({ tone: "danger", msg: <>Not whispered — {r.message}</> });
    }
  };

  // Hold to talk. Press starts the recogniser; release stops it; what was
  // heard is sent on its own once the recogniser has finished, so a whisper
  // said aloud never waits for a click. Interim words show in the box as
  // they come, so the owner sees what will be sent.
  const startTalking = (e?: SyntheticEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    const SR = lrRecognizer();
    if (!SR || listening || busy) return;
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    heardRef.current = "";
    rec.onresult = (ev) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r) continue;
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      heardRef.current = finals.trim();
      setText((finals + interim).trim());
    };
    rec.onerror = (ev) => {
      setListening(false);
      recRef.current = null;
      if (ev && ev.error === "not-allowed")
        flash({ tone: "warn", msg: <>The browser needs microphone permission to whisper by voice.</> });
      else if (ev && ev.error !== "aborted" && ev.error !== "no-speech")
        flash({ tone: "warn", msg: <>Couldn&rsquo;t hear you — try again or type it.</> });
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const heard = heardRef.current;
      heardRef.current = "";
      if (heard) void send(heard);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
      recRef.current = null;
    }
  };
  const stopTalking = () => {
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  // One button at the field's end, as Ask's is: the microphone, held to talk, while nothing is typed; the arrow that sends
  // once there are words; where the browser cannot listen, the arrow alone, faint until there are words.
  const hasWords = !!text.trim();
  const talking = listening || (!hasWords && canTalk);
  return (
    <div className="lm-whisper" data-testid="live-whisper">
      <div className="lm-whisper-row">
        <input
          className="set-input"
          value={text}
          maxLength={500}
          placeholder={listening ? "Listening…" : "Whisper to the receptionist…"}
          aria-label="Whisper to the receptionist"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          disabled={busy}
        />
        {talking ? (
          talkButton({ listening, busy, startTalking, stopTalking })
        ) : (
          <button
            type="button"
            className="ask-send"
            data-testid="live-whisper-send"
            aria-label="Send whisper"
            title="Send whisper"
            onClick={() => send()}
            disabled={busy || !hasWords}
            {...gate("approve")}
          >
            <Icon key="arrow-up" name="arrow-up" size={15} />
          </button>
        )}
      </div>
      {whisperNote({ last, explain, toggle: () => setExplain((v) => !v) })}
      {toastNode}
    </div>
  );
};
