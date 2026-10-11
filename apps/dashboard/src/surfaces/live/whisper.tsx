/**
 * A sentence only the receptionist hears, worked into its next answer (moved from legacy/pages/live-monitor.jsx,
 * decision 0015). The listen-in stayed in the demo: the provider streams the transcript, never the audio, so the words
 * in the panel are what you follow.
 */
import { useState } from "react";
import type { SyntheticEvent } from "react";
import type { LiveCallVM } from "@chanlytics/contracts";
import { whisperCall } from "@/legacy-bridge/inbox-verbs";
import { gate, useLegacyToast } from "../legacy-verbs";
import { Icon } from "../kit/icon/icon";
import { useHoldToTalk } from "../kit/talk/use-hold-to-talk";

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
          It keeps your whisper in mind and works it into its answers in its own words, when it fits. Its rules still
          hold: it says no price your settings rule out and confirms no booking because of one, and the caller never
          hears you.
        </div>
      )}
    </>
  );
}

export const LrWhisper = ({ c }: { c: LiveCallVM }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  // The one-line note says who hears it; a press opens what the receptionist does with it.
  const [explain, setExplain] = useState(false);
  const [toastNode, flash] = useLegacyToast();

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

  // Hold to talk (the kit's one recogniser): what was heard is sent on its own once it has finished, so a whisper said
  // aloud never waits for a click, and the words show in the box as they come, so the owner sees what will be sent.
  const talk = useHoldToTalk({
    onWords: setText,
    onHeard: (words, problem) => {
      if (words) void send(words);
      else if (problem === "not-allowed" || problem === "blocked")
        flash({ tone: "warn", msg: <>The browser needs microphone permission to whisper by voice.</> });
      else if (problem && problem !== "aborted" && problem !== "no-speech")
        flash({ tone: "warn", msg: <>Couldn&rsquo;t hear you — try again or type it.</> });
    },
    disabled: busy,
  });
  const { listening, canTalk } = talk;

  // One button at the field's end, as Ask's is: the microphone, held to talk, while nothing is typed; the arrow that sends
  // once there are words; where the browser cannot listen, the arrow alone, faint until there are words.
  const hasWords = !!text.trim();
  const talking = listening || (!hasWords && canTalk);
  return (
    <div className="lm-whisper" data-testid="live-whisper">
      <div className="lm-whisper-row capsule">
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
          talkButton({ listening, busy, startTalking: talk.start, stopTalking: talk.stop })
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
