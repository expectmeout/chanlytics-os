/**
 * Hold to talk: the one speech recogniser of the house (docs/2026-10-02-inbox-and-phone-threads-on-the-kit.md, slice 5).
 * It was written twice, once for Ask's field and once for the live whisper, and the second had fewer cares than the first.
 *
 * A press starts the browser's own recogniser (Chrome, Edge, Safari; not Firefox), letting go stops it, and what was heard
 * is handed back on its own, so words said aloud never wait for a click. Interim words are handed back as they come
 * (`onWords`), so the field shows what will be sent. Nothing is recorded or uploaded; the device does the work.
 *
 * A browser told No once never asks again: it blocks in silence. Where the Permissions API says so (Chrome, Android), a
 * press is told before the recogniser is started (`onHeard(null, "blocked")`), so the page can say where to allow it;
 * browsers without the API (Safari, Firefox) answer "not blocked" and prompt on their own. A press let go before that
 * answer comes starts nothing (`want`).
 *
 * What the words are for is the element that had focus as listening began: a field, or the mic. A page that closes and
 * takes it off the document stopped only the reading aloud, so the recogniser went on, and its end asked what it had
 * heard of a page that was gone. Words heard for an element that is gone are dropped, and a word arriving after it stops
 * the recogniser.
 *
 * `onHeard(words, problem)`: what was heard, once the recogniser has finished (never empty), or what went wrong, in the
 * recogniser's own word for it (`not-allowed`, `no-speech`, `aborted`, `network`), `blocked` before it started, or `error`.
 */
import { useRef, useState } from "react";

/** One phrase the recogniser heard: whether it is settled, and its best guess (the Web Speech API's result). */
interface Heard {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

/** The browser's recogniser, as far as the house uses it (lib.dom has the events, not the recogniser itself). */
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

const recognizer = (): Recognizer | null => {
  const w: Window & { SpeechRecognition?: Recognizer; webkitSpeechRecognition?: Recognizer } = window;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const micBlocked = async (): Promise<boolean> => {
  try {
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") return false;
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state === "denied";
  } catch {
    return false;
  }
};

const gone = (el: Element | null): boolean => !!el && el.isConnected === false;

/** What a page hands it: the language, what it does with words as they come and as they end, and whether it is off. */
interface HoldToTalkOptions {
  /** The recogniser's language ("es-ES"); the browser's own where none is given. */
  lang?: string;
  /** The words so far, interim and settled, as they come. */
  onWords: (words: string) => void;
  /** The words once the recogniser has finished, or what went wrong. */
  onHeard: (words: string | null, problem: string | null) => void;
  disabled?: boolean;
}

/** What it gives back: whether this browser can listen, whether it is, and the press and the let-go. */
interface HoldToTalk {
  canTalk: boolean;
  listening: boolean;
  start: (e?: { preventDefault?: () => void }) => void;
  stop: () => void;
}

/** A recogniser held by a press: `start` on the press, `stop` on the let-go. */
export function useHoldToTalk({ lang, onWords, onHeard, disabled }: HoldToTalkOptions): HoldToTalk {
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const heard = useRef("");
  const want = useRef(false);
  const forEl = useRef<Element | null>(null);
  const canTalk = !!recognizer();

  const begin = (SR: Recognizer) => {
    if (!want.current || rec.current) return;
    want.current = false;
    const next = new SR();
    next.lang = lang || navigator.language || "en-US";
    next.interimResults = true;
    next.continuous = true;
    heard.current = "";
    forEl.current = typeof document !== "undefined" ? document.activeElement || null : null;
    next.onresult = (ev) => {
      if (gone(forEl.current)) {
        heard.current = "";
        try {
          next.stop();
        } catch {
          /* already stopped */
        }
        return;
      }
      let finals = "";
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (!r) continue;
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      heard.current = finals.trim();
      onWords((finals + interim).trim());
    };
    next.onerror = (ev) => {
      setListening(false);
      rec.current = null;
      onHeard(null, ev && ev.error ? ev.error : "error");
    };
    next.onend = () => {
      setListening(false);
      rec.current = null;
      const words = heard.current;
      heard.current = "";
      if (words && !gone(forEl.current)) onHeard(words, null);
    };
    rec.current = next;
    setListening(true);
    try {
      next.start();
    } catch {
      setListening(false);
      rec.current = null;
    }
  };

  const start = (e?: { preventDefault?: () => void }) => {
    if (e && e.preventDefault) e.preventDefault();
    const SR = recognizer();
    if (!SR || listening || disabled) return;
    want.current = true;
    const perms = typeof navigator !== "undefined" ? navigator.permissions : null;
    if (perms && typeof perms.query === "function") {
      void micBlocked().then((blocked) => {
        if (blocked) {
          want.current = false;
          onHeard(null, "blocked");
        } else begin(SR);
      });
    } else begin(SR);
  };

  const stop = () => {
    want.current = false;
    const live = rec.current;
    if (live) {
      try {
        live.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  return { canTalk, listening, start, stop };
}
