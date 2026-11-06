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
 *
 * The first sentence first (9 Oct 2026). The whole clip was read before a word of it played, and the vendor takes
 * longer to begin the longer the words are: a brief of 600 characters was a second and a half behind the press on a
 * desk and more on a phone, where its half a megabyte also had to arrive. Its first sentence alone is made in a third
 * of a second. So words of more than one sentence are asked for as two clips at once (`speechParts`): the first
 * sentence, played the moment it lands, and the rest, told what came before it so it carries on in the same breath,
 * played on the same element as the first ends. The clips of the last few words read are kept (`held`), so a second
 * listen asks nothing and plays at once, and a press that has begun may ask before it lands (`warmSpeech`).
 */
import { ASK_SPEECH_MAX_CHARS, type SpeechPurpose } from "@chanlytics/contracts";
import type { AskApiCalls } from "./api";

export type { SpeechPurpose };
export type SpeechState = "idle" | "loading" | "speaking";

interface SpeechWindow {
  Audio?: typeof Audio;
  URL?: typeof URL;
  Blob?: typeof Blob;
  /** WebKit's Audio Session API (Safari 16.4 on): what kind of audio the page makes, where a device takes the word. */
  navigator?: { audioSession?: { type: string } };
}
/** The device's three doors to audio, all present. */
type Device = Required<Pick<SpeechWindow, "Audio" | "URL" | "Blob">>;

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

/** The longest first sentence read by itself: a longer one is no sooner made than the whole. */
const FIRST_PART_MAX_CHARS = 240;
/** The shortest: a word and its full stop ("Dr.", "No.") is not a sentence to stop after. */
const FIRST_PART_MIN_CHARS = 12;
/** A full stop that ends a title, not a sentence. */
const TITLE = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs)\.$/;
/** A sentence's end with another behind it: its mark, a closing quote or bracket, a space, then a capital or a figure. */
const SENTENCE_END = /[.!?]["')\]]?\s+(?=["'([¿¡]?[\p{Lu}\p{N}])/gu;

/**
 * The words as the clips they are asked for: the first sentence by itself where more follows it, and the rest; the
 * whole as `first`, and no rest, where there is one sentence or the first runs long. Only ever cut at a sentence's
 * end, so the pause between the two clips is one a reader would make.
 */
export function speechParts(text: string): { first: string; rest: string | null } {
  const words = speechWords(text);
  for (const m of words.matchAll(SENTENCE_END)) {
    const [end = ""] = m;
    const first = words.slice(0, m.index + end.trimEnd().length);
    if (first.length > FIRST_PART_MAX_CHARS) break;
    if (first.length < FIRST_PART_MIN_CHARS || TITLE.test(first)) continue;
    const rest = words.slice(first.length).trim();
    return rest ? { first, rest } : { first: words, rest: null };
  }
  return { first: words, rest: null };
}

/** A reading's clips, each on its way or in hand: the one it opens on, and the one behind it where there is one. */
interface ReadingClips {
  opening: Promise<Blob>;
  behind: Promise<Blob> | null;
}

/** How many readings' clips are kept: the brief, an answer or two, and the waiting words said between them. */
const HELD_READINGS = 6;

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

type SessionType = "playback" | "play-and-record";
/**
 * The device told what the page's audio is, where it takes the word (6 Oct 2026): `play-and-record` as a hold listens,
 * `playback` before a read. A phone that has heard the microphone keeps a call's session, and a call plays through the
 * earpiece: the answer to a held question came out of it. Elsewhere nothing is told, and a device that refuses the word
 * plays as it would have.
 */
function tellDevice(w: SpeechWindow, type: SessionType): void {
  try {
    const session = w.navigator?.audioSession;
    if (session) session.type = type;
  } catch {
    /* the word refused */
  }
}

/**
 * The clips of the words last read, by their words, the latest last: asked for once, and kept whether or not they were
 * heard to the end, so Listen pressed again plays at once and a press that warmed them finds them on their way. A clip
 * that could not be made is never kept: the next press asks again.
 */
function heldClips(api: SpeechDeps["api"]) {
  const held = new Map<string, ReadingClips>();
  return (text: string, purpose: SpeechPurpose): ReadingClips => {
    const { first, rest } = speechParts(text);
    const key = rest === null ? first : `${first}\n${rest}`;
    const had = held.get(key);
    if (had) {
      // Read again: the latest once more.
      held.delete(key);
      held.set(key, had);
      return had;
    }
    // Both at once. The rest is told the sentence before it, so the vendor carries on from it and does not begin anew.
    const clips: ReadingClips = {
      opening: api.speech(first, purpose),
      behind: rest === null ? null : api.speech(rest, purpose, { before: first }),
    };
    held.set(key, clips);
    const forget = () => {
      if (held.get(key) === clips) held.delete(key);
    };
    clips.opening.catch(forget);
    clips.behind?.catch(forget);
    if (held.size > HELD_READINGS) held.delete(held.keys().next().value as string);
    return clips;
  };
}

/** The one element every reading plays on, and the object URL it holds: made in a press, cleared at an end or a Stop. */
function onePlayer(w: SpeechWindow) {
  let player: HTMLAudioElement | null = null;
  let unlocked = false;
  let url: string | null = null;
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
  return {
    release: () => {
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
    },
    /** Inside the press: the element made, and started once on silence, so a clip after the fetch may play on it. */
    unlock: (d: Device): HTMLAudioElement => {
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
    },
    /** A clip put on the element, with what follows its end and what a failure of it does. */
    put: (d: Device, a: HTMLAudioElement, blob: Blob, on: { ended: () => void; failed: () => void }) => {
      const src = d.URL.createObjectURL(blob);
      setUrl(src);
      a.onended = on.ended;
      a.onerror = on.failed;
      a.src = src;
    },
  };
}

/** Why a clip could not be made, in the server's words where it gave some. */
const clipRefusal = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : "Ask's voice could not be reached just now.";

export function askSpeech(win: Window, deps: SpeechDeps) {
  const w = win as unknown as SpeechWindow;
  /** The device's doors, or null where one is missing (a stand-in window, a browser without object URLs). */
  const device = (): Device | null =>
    typeof w.Audio === "function" && typeof w.URL?.createObjectURL === "function" && typeof w.Blob === "function"
      ? { Audio: w.Audio, URL: w.URL, Blob: w.Blob }
      : null;
  const canSpeak = () => device() !== null;
  const tellSession = (type: SessionType) => tellDevice(w, type);
  let state: SpeechState = "idle";
  const watchers = new Set<() => void>();
  const move = (next: SpeechState) => {
    if (next === state) return;
    state = next;
    for (const tell of watchers) tell();
  };
  /** Which press is the current one: a Stop, or a new read, moves it on, and a clip that lands late is let go of. */
  let generation = 0;
  const clipsOf = heldClips(deps.api);
  const { release, unlock, put } = onePlayer(w);

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
      tellSession("playback");
      const mine = ++generation;
      release();
      const a = unlock(d);
      move("loading");
      // The first clip, and the one behind it where the words are more than a sentence.
      const clips = clipsOf(text, purpose);
      let behind = clips.behind;
      let clip: Blob;
      try {
        clip = await clips.opening;
      } catch (e) {
        if (mine !== generation) return;
        move("idle");
        throw new Error(clipRefusal(e), { cause: e });
      }
      if (mine !== generation) return;
      const over = () => {
        if (mine !== generation) return;
        release();
        move("idle");
      };
      /**
       * The clip behind the one that just ended, on the same element: asked for with the first, so most often in hand
       * by now; where it is still on its way the voice waits for it, and where it could not be made, or would not
       * play, the reading ends there, quietly (the first sentence was heard, and `speak` has long answered).
       */
      const carryOn = () => {
        if (mine !== generation) return;
        const next = behind;
        behind = null;
        if (next === null) return over();
        next
          .then((blob) => {
            if (mine !== generation) return undefined;
            put(d, a, blob, { ended: carryOn, failed: over });
            return a.play();
          })
          .catch(over);
      };
      put(d, a, clip, { ended: carryOn, failed: over });
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
    /**
     * Inside a press whose answer is read later (a hold to talk): the device told the page listens, and the element made
     * and started on silence, as a read's own press starts it, so the clip read once the answer lands, after a fetch
     * and outside any gesture, may play on a phone. Nothing is read and nothing being read stops.
     */
    readySpeech: (): void => {
      tellSession("play-and-record");
      const d = device();
      if (d) unlock(d);
    },
    /**
     * A press on Listen that has begun (the pointer is down): the clips asked for now, before the press lands, and
     * found on their way, or in hand, by the `speak` that follows. Nothing is played and nothing changes; on a device
     * that cannot play, nothing is asked.
     */
    warmSpeech: (text: string, purpose: SpeechPurpose): void => {
      if (device() && text.trim()) void clipsOf(text, purpose);
    },
    /** Stop reading, or stop waiting for the clip; nothing if nothing was. */
    stopSpeaking: () => {
      generation++;
      release();
      move("idle");
    },
  };
}
