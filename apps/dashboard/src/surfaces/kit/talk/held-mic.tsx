/**
 * A mic held to talk, for any line (Today's sheet had it first; New's line is the second): the press starts the house's one
 * recogniser (use-hold-to-talk.ts) and a let-go anywhere ends it. The lift is heard on the window, not on the button:
 * the press redraws as it listens, and a button that redraws under the finger never hears its own pointerup. What the
 * words are for is the page's (`say`); what the mic is called and what it says when it cannot hear are the page's too.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../icon/icon";
import { LinePress } from "../line/line";
import { useHoldToTalk } from "./use-hold-to-talk";

/** What a page calls its mic, and what it says where the mic cannot listen. */
export interface MicWords {
  hold: string;
  letGo: string;
  blocked: string;
  failed: string;
}

/** What can stop a microphone, in the page's words: a browser told No stays silent otherwise. */
const micTrouble = (problem: string | null, words: MicWords): string | null => {
  if (problem === "not-allowed" || problem === "blocked") return words.blocked;
  if (problem && problem !== "aborted" && problem !== "no-speech") return words.failed;
  return null;
};

/** The mic held to talk: words as they come go to `onWords`, what it heard to `say`, and a let-go anywhere ends it. */
export function useHeldMic(props: {
  say: (words: string) => void;
  onWords: (words: string) => void;
  busy: boolean;
  words: MicWords;
}) {
  const [trouble, setTrouble] = useState<string | null>(null);
  const stopHeld = useRef<(() => void) | null>(null);
  useEffect(() => () => stopHeld.current?.(), []);
  const talk = useHoldToTalk({
    onWords: props.onWords,
    onHeard: (heard, problem) => {
      if (heard) props.say(heard);
      else setTrouble(micTrouble(problem, props.words));
    },
    disabled: props.busy,
  });
  const hold = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setTrouble(null);
    talk.start(event);
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

export type HeldMic = ReturnType<typeof useHeldMic>;

/** The mic at a line's end, where the browser can listen: held by a finger, or by Space or Enter. */
export function TalkPress(props: { mic: HeldMic; busy: boolean; words: MicWords; testid: string }) {
  const { talk } = props.mic;
  if (!talk.canTalk) return null;
  return (
    <LinePress
      kind="talk"
      on={talk.listening}
      aria-pressed={talk.listening}
      aria-label={talk.listening ? props.words.letGo : props.words.hold}
      disabled={props.busy}
      onPointerDown={props.mic.hold}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          props.mic.clear();
          talk.start(event);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") talk.stop();
      }}
      data-testid={props.testid}
    >
      <Icon name="mic" size={15} />
    </LinePress>
  );
}
