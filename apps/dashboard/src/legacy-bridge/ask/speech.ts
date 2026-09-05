/**
 * Reading aloud with the browser's own synthesis. Nothing leaves the device,
 * nothing costs anything; where the browser has no voice, the palette knows
 * and says so.
 */
import type { AskLanguage } from "@chanlytics/contracts";

interface SpeechWindow {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
}

export function askSpeech(win: Window) {
  const w = win as unknown as SpeechWindow;
  const canSpeak = () => typeof w.speechSynthesis !== "undefined" && typeof w.SpeechSynthesisUtterance !== "undefined";
  return {
    canSpeak,
    /** Start reading; `onEnd` fires when it finishes or is cut off. False when the browser cannot. */
    speak: (text: string, lang?: AskLanguage, onEnd?: () => void): boolean => {
      if (!canSpeak()) return false;
      try {
        const u = new w.SpeechSynthesisUtterance!(text);
        u.lang = lang === "es" ? "es-ES" : "en-US";
        u.rate = 1.02;
        if (onEnd) {
          u.onend = () => onEnd();
          u.onerror = () => onEnd();
        }
        w.speechSynthesis!.cancel();
        w.speechSynthesis!.speak(u);
        return true;
      } catch {
        return false;
      }
    },
    stopSpeaking: () => {
      try { w.speechSynthesis?.cancel(); } catch { /* fine */ }
    },
  };
}
