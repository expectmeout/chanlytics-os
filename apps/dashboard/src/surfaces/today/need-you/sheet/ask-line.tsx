/**
 * Ask's line (his note, 9 Nov 2026: no preset options, say what you want): one field under what is on the screen. Type into it
 * and press the arrow, or hold the mic and say it; let go and it is sent, as Ask's own field does. What it does with the words
 * is the page's (`onSay`): changes a draft, a to-do's message, a review's answer, or keeps a note on the person. The words go
 * to the model as said; there is no list of asks made most, which is what the row of chips was.
 *
 * The lift is heard on the window, not on the button: the press redraws as it listens, and a button that redraws under the
 * finger never hears its own pointerup.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { NEED_YOU_WORDS as W } from "@chanlytics/contracts";
import { useGrowAsTyped } from "../../../kit/field/grow-as-typed";
import { Icon } from "../../../kit/icon/icon";
import { LineField, LinePress } from "../../../kit/line/line";
import { useHoldToTalk } from "../../../kit/talk/use-hold-to-talk";
import { AskMark, Note } from "../parts";

/** What can stop a microphone, said in the sheet: a browser told No stays silent otherwise. */
const micTrouble = (problem: string | null): string | null => {
  if (problem === "not-allowed" || problem === "blocked") return W.say.micBlocked;
  if (problem && problem !== "aborted" && problem !== "no-speech") return W.say.micFailed;
  return null;
};

/** The mic held to talk: what it heard goes to `say`, and a let-go anywhere ends it. */
function useHeldMic(say: (words: string) => void, setText: (words: string) => void, busy: boolean) {
  const [trouble, setTrouble] = useState<string | null>(null);
  const stopHeld = useRef<(() => void) | null>(null);
  useEffect(() => () => stopHeld.current?.(), []);
  const talk = useHoldToTalk({
    onWords: setText,
    onHeard: (words, problem) => {
      if (words) say(words);
      else setTrouble(micTrouble(problem));
    },
    disabled: busy,
  });
  const hold = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setTrouble(null);
    talk.start(e);
    const lifted = () => {
      window.removeEventListener("pointerup", lifted);
      window.removeEventListener("pointercancel", lifted);
      stopHeld.current = null;
      talk.stop();
    };
    window.addEventListener("pointerup", lifted);
    window.addEventListener("pointercancel", lifted);
    stopHeld.current = lifted;
  };
  return { talk, trouble, hold, clear: () => setTrouble(null) };
}

/** The press at the field's end: the arrow once there are words, the mic while there are none, where the browser can listen. */
function linePress(
  mic: ReturnType<typeof useHeldMic>,
  sending: { hasWords: boolean; busy: boolean; send: () => void },
) {
  const { talk } = mic;
  if (sending.hasWords && !talk.listening)
    return (
      <LinePress
        kind="send"
        on
        aria-label={W.say.send}
        disabled={sending.busy}
        onClick={sending.send}
        data-testid="ask-line-send"
      >
        <Icon name="arrow-up" size={14} />
      </LinePress>
    );
  if (!talk.canTalk) return null;
  return (
    <LinePress
      kind="talk"
      on={talk.listening}
      aria-pressed={talk.listening}
      aria-label={talk.listening ? W.say.letGo : W.say.hold}
      disabled={sending.busy}
      onPointerDown={mic.hold}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          mic.clear();
          talk.start(e);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") talk.stop();
      }}
      data-testid="ask-line-talk"
    >
      <Icon name="mic" size={15} />
    </LinePress>
  );
}

export function SayToAsk({
  placeholder,
  onSay,
  busy = false,
  why = null,
}: {
  /** What it asks for here: Tell Ask what to change, Say what to remember. */
  placeholder: string;
  /** The words said, whole. Answers whether they were taken: refused, they stay in the field to be said again. */
  onSay: (words: string) => Promise<boolean> | boolean;
  /** Ask is working on what was said. */
  busy?: boolean;
  /** Why the last thing said came to nothing, in a line under the field. */
  why?: string | null;
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useGrowAsTyped(box, text);
  const say = async (words: string) => {
    const said = words.trim();
    if (!said || busy) return;
    if (await onSay(said)) setText("");
  };
  const mic = useHeldMic((words) => void say(words), setText, busy);
  const { listening } = mic.talk;
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void say(text);
    }
    // Escape leaves the field and goes no further: in the walk's sheet it would have closed the sheet too.
    if (e.key === "Escape") {
      e.stopPropagation();
      box.current?.blur();
    }
  };
  const said = why ?? mic.trouble;
  return (
    <div className="ny-say">
      <div className="ny-say-line" data-state={listening ? "hold" : busy ? "busy" : undefined} data-own-drag>
        <AskMark live={listening || busy} />
        <LineField
          ref={box}
          className="ny-say-in"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keys}
          readOnly={busy || listening}
          placeholder={placeholder}
          aria-label={placeholder}
          listening={listening}
          data-testid="ask-line-words"
        />
        {linePress(mic, { hasWords: !!text.trim(), busy, send: () => void say(text) })}
      </div>
      {listening ? <span className="ny-say-hint">{W.say.letGo}</span> : null}
      {said ? <Note tone="danger">{said}</Note> : null}
    </div>
  );
}
