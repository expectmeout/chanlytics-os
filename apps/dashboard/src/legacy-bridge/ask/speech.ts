/**
 * Reading aloud in Ask's one voice (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct
 * 2026: the one-way speech). Today's Listen and an answer's Read aloud are not conversations: nobody speaks back, so
 * the words go to the speech route (ask/api.ts `speech`) and the clip comes back as MP3, played here through one
 * `<audio>` element the module owns, never a pane's. The module is the one holder of what is happening (`state`: idle,
 * loading, speaking) and tells everyone who watches (`watchSpeech`), so a pane drawn again while a clip plays, or a
 * pane that did not start it, says the same thing as the one that did; a pane that goes away mid-sentence leaves
 * the clip playing until Stop or its end (the lesson of #1377: Today redraws itself as its data moves, and a pane's
 * unmount hung up every conversation).
 *
 * A press on a phone: iOS Safari and a WebView play audio only from a gesture, and the clip arrives after a fetch,
 * outside it. So the element is made and started on a clip of silence inside the press, which unlocks it; the real
 * clip then plays after the await on the same element. The browser's own synthesis is gone: it read a brief in a
 * robotic voice whenever the agent could not start, which hid the failure (4 Oct 2026). Where the clip cannot be
 * made, `speak` rejects with the server's words and the caller says them; where the device would not play it, with
 * words that say to tap again; nothing else speaks.
 */
import { ASK_SPEECH_MAX_CHARS } from "@chanlytics/contracts";
import type { AskApiCalls } from "./api";

export type SpeechPurpose = "brief" | "answer";
export type SpeechState = "idle" | "loading" | "speaking";

interface SpeechWindow {
  Audio?: typeof Audio;
  URL?: typeof URL;
  Blob?: typeof Blob;
}
/** The device's three doors to audio, all present. */
type Device = Required<SpeechWindow>;

export interface SpeechDeps {
  api: Pick<AskApiCalls, "speech">;
}

/**
 * The words a clip is asked for: folded as the route folds them, and no longer than the route takes
 * (ASK_SPEECH_MAX_CHARS), cut after the last whole sentence that fits, else between two words. A long answer is read
 * as far as a clip goes; the route would refuse it whole, and nothing would be read.
 */
export function speechWords(text: string): string {
  const words = text.replace(/\s+/g, " ").trim();
  if (words.length <= ASK_SPEECH_MAX_CHARS) return words;
  const head = words.slice(0, ASK_SPEECH_MAX_CHARS);
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentence > 0) return head.slice(0, sentence + 1);
  const word = head.lastIndexOf(" ");
  return word > 0 ? head.slice(0, word) : head;
}

/** What a person is told when the device would not play the clip (no gesture, most often): a second tap is one. */
const HELD_BACK = "The sound was held back on this device. Tap again to hear it.";

/** A clip of silence, one sample of 16-bit mono at 8 kHz: 46 bytes, played inside the press to unlock the element. */
function silentWav(): ArrayBuffer {
  const buf = new ArrayBuffer(46);
  const b = new Uint8Array(buf);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  v.setUint32(4, 38, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, 2, true);
  return buf;
}

export function askSpeech(win: Window, deps: SpeechDeps) {
  const w = win as unknown as SpeechWindow;
  /** The device's doors, or null where one is missing (a stand-in window, a browser without object URLs). */
  const device = (): Device | null =>
    typeof w.Audio === "function" && typeof w.URL?.createObjectURL === "function" && typeof w.Blob === "function"
      ? { Audio: w.Audio, URL: w.URL, Blob: w.Blob }
      : null;
  const canSpeak = () => device() !== null;
  let state: SpeechState = "idle";
  const watchers = new Set<() => void>();
  const move = (next: SpeechState) => {
    if (next === state) return;
    state = next;
    for (const tell of watchers) tell();
  };
  let player: HTMLAudioElement | null = null;
  let unlocked = false;
  let url: string | null = null;
  /** Which press is the current one: a Stop, or a new read, moves it on, and a clip that lands late is let go of. */
  let generation = 0;

  /** The element's source replaced, the old URL let go of. */
  const setUrl = (next: string | null) => {
    if (url) {
      try {
        w.URL?.revokeObjectURL(url);
      } catch {
        /* fine */
      }
    }
    url = next;
  };
  const release = () => {
    if (player) {
      player.onended = null;
      player.onerror = null;
      try {
        player.pause();
        player.removeAttribute("src");
        player.load();
      } catch {
        /* already gone */
      }
    }
    setUrl(null);
  };
  /** Inside the press: the element made, and started once on silence, so a clip after the fetch may play on it. */
  const unlock = (d: Device): HTMLAudioElement => {
    const a = (player ??= new d.Audio());
    if (unlocked) return a;
    unlocked = true;
    try {
      const src = d.URL.createObjectURL(new d.Blob([silentWav()], { type: "audio/wav" }));
      setUrl(src);
      a.src = src;
      // A read that began outside a press (an answer read aloud by itself) is refused for want of a gesture: the
      // unlock is not spent on it, so the next press starts on silence again. Any other end of this play (our own
      // pause as the clip replaces it) was inside a gesture and stands.
      a.play().catch((e: unknown) => {
        if (e instanceof Error && e.name === "NotAllowedError") unlocked = false;
      });
    } catch {
      /* a browser with no gesture to honour: the real play says so */
    }
    return a;
  };
  const words = (e: unknown): string =>
    e instanceof Error && e.message ? e.message : "Ask's voice could not be reached just now.";

  return {
    canSpeak,
    /** What is happening now. */
    state: (): SpeechState => state,
    /** Hear every change of state; answers the stop. */
    watchSpeech(on: () => void): () => void {
      watchers.add(on);
      return () => {
        watchers.delete(on);
      };
    },
    /**
     * Read these words. Resolves once the clip plays, or once it was stopped or replaced before it could (nothing
     * to say then: the state already moved). Rejects, in the server's words, when the clip could not be made or
     * could not be played; the state is idle again by then.
     */
    speak: async (text: string, purpose: SpeechPurpose): Promise<void> => {
      const d = device();
      if (!d) throw new Error("This device cannot play audio.");
      const mine = ++generation;
      release();
      const a = unlock(d);
      move("loading");
      let clip: Blob;
      try {
        clip = await deps.api.speech(speechWords(text), purpose);
      } catch (e) {
        if (mine !== generation) return;
        move("idle");
        throw new Error(words(e), { cause: e });
      }
      if (mine !== generation) return;
      const src = d.URL.createObjectURL(clip);
      setUrl(src);
      const over = () => {
        if (mine !== generation) return;
        release();
        move("idle");
      };
      a.onended = over;
      a.onerror = over;
      a.src = src;
      try {
        await a.play();
      } catch (e) {
        // Our own stop pauses the element mid-start, which play() reports as an abort: not a failure.
        if (mine !== generation) return;
        release();
        move("idle");
        // The browser's own sentence is for a developer; a person is told what to do.
        throw new Error(HELD_BACK, { cause: e });
      }
      if (mine !== generation) return;
      move("speaking");
    },
    /** Stop reading, or stop waiting for the clip; nothing if nothing was. */
    stopSpeaking: () => {
      generation++;
      release();
      move("idle");
    },
  };
}
