/**
 * A clip's heard words as captions read them (content/making/captions.ts): kept apart from the captions themselves, so the
 * template, which reads the captions' shapes, never reaches what a row keeps of a clip's sound.
 */
import { fileSoundOf } from "../../files/sound";
import type { PieceCue } from "./captions";

/** What a clip's row keeps of its words (`files.sound`), as captions are made from them; null where nobody is heard in it. */
export function pieceCuesOf(sound: unknown): PieceCue[] | null {
  const words = fileSoundOf(sound).words;
  if (!words || "none" in words || words.cues.length === 0) return null;
  return words.cues.map(({ start, end, text }) => ({ start, end, text }));
}
