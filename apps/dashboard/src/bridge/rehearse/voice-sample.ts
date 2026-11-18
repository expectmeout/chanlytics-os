/**
 * A phone voice heard in the browser: the provider's own recording of it (contracts voice/phone-voices.ts), played and
 * stopped, one at a time, none left playing once what plays it goes. The first run plays the eight an owner may choose
 * (surfaces/setup/first-run/receptionist/sounds.tsx); a lead's preview plays the one its AI speaks with, so it is heard
 * with no call and no microphone (surfaces/preview/head.tsx). Nothing is asked of a provider and nothing is spent: the
 * recording is a file on the provider's public bucket, which the page's policy admits (csp.ts).
 */
import { useEffect, useRef, useState } from "react";
import { phoneVoiceShown } from "@chanlytics/contracts";

/** One voice's sample, played and stopped: one at a time, none left playing once the panel goes. */
export function useVoiceSample(): { playing: string | null; toggle: (id: string) => void } {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  };
  useEffect(() => stop, []);
  const toggle = (id: string) => {
    const was = playing;
    stop();
    if (was === id) return;
    const a = new Audio(phoneVoiceShown(id).sample);
    audio.current = a;
    a.onended = () => setPlaying(null);
    setPlaying(id);
    void a.play().catch(() => setPlaying(null));
  };
  return { playing, toggle };
}
