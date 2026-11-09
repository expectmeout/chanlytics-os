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
import { useGrowAsTyped } from "../../kit/field/grow-as-typed";
import { Icon } from "../../kit/icon/icon";
import { LineField, LinePress } from "../../kit/line/line";
import { useHoldToTalk } from "../../kit/talk/use-hold-to-talk";
import { AskMark, Note } from "./parts";

/** What can stop a microphone, said in the sheet: a browser told No stays silent otherwise. */
const micTrouble = (problem: string | null): string | null => {
  if (problem === "not-allowed" || problem === "blocked") return W.say.micBlocked;
  if (problem && problem !== "aborted" && problem !== "no-speech") return W.say.micFailed;
  return null;
};

export function AskLine({
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
  const [trouble, setTrouble] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useGrowAsTyped(box, text);
  const stopHeld = useRef<(() => void) | null>(null);
  useEffect(() => () => stopHeld.current?.(), []);

  const say = async (words: string) => {
    const said = words.trim();
    if (!said || busy) return;
    if (await onSay(said)) setText("");
  };
  const talk = useHoldToTalk({
    onWords: setText,
    onHeard: (words, problem) => {
      if (words) void say(words);
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
  const hasWords = !!text.trim();
  return (
    <div className="ny-say">
      <div className="ny-say-line" data-state={talk.listening ? "hold" : busy ? "busy" : undefined} data-own-drag>
        <AskMark live={talk.listening || busy} />
        <LineField
          ref={box}
          className="ny-say-in"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keys}
          readOnly={busy || talk.listening}
          placeholder={placeholder}
          aria-label={placeholder}
          listening={talk.listening}
          data-testid="ask-line-words"
        />
        {hasWords && !talk.listening ? (
          <LinePress
            kind="send"
            on
            aria-label={W.say.send}
            disabled={busy}
            onClick={() => void say(text)}
            data-testid="ask-line-send"
          >
            <Icon name="arrow-up" size={14} />
          </LinePress>
        ) : talk.canTalk ? (
          <LinePress
            kind="talk"
            on={talk.listening}
            aria-pressed={talk.listening}
            aria-label={talk.listening ? W.say.letGo : W.say.hold}
            disabled={busy}
            onPointerDown={hold}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                setTrouble(null);
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
        ) : null}
      </div>
      {talk.listening ? <span className="ny-say-hint">{W.say.letGo}</span> : null}
      {why || trouble ? <Note tone="danger">{why ?? trouble}</Note> : null}
    </div>
  );
}
