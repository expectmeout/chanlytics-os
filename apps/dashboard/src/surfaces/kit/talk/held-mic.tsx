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
export function useHeldMic(p: {
  say: (words: string) => void;
  onWords: (words: string) => void;
  busy: boolean;
  words: MicWords;
}) {
  const [trouble, setTrouble] = useState<string | null>(null);
  const stopHeld = useRef<(() => void) | null>(null);
  useEffect(() => () => stopHeld.current?.(), []);
  const talk = useHoldToTalk({
    onWords: p.onWords,
    onHeard: (heard, problem) => {
      if (heard) p.say(heard);
      else setTrouble(micTrouble(problem, p.words));
    },
    disabled: p.busy,
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

export type HeldMic = ReturnType<typeof useHeldMic>;

/** The mic at a line's end, where the browser can listen: held by a finger, or by Space or Enter. */
export function TalkPress(p: { mic: HeldMic; busy: boolean; words: MicWords; testid: string }) {
  const { talk } = p.mic;
  if (!talk.canTalk) return null;
  return (
    <LinePress
      kind="talk"
      on={talk.listening}
      aria-pressed={talk.listening}
      aria-label={talk.listening ? p.words.letGo : p.words.hold}
      disabled={p.busy}
      onPointerDown={p.mic.hold}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          p.mic.clear();
          talk.start(e);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") talk.stop();
      }}
      data-testid={p.testid}
    >
      <Icon name="mic" size={15} />
    </LinePress>
  );
}
