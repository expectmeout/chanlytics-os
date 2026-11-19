"use client";

/**
 * A lead's own preview, Hear its voice (decision 0079, their greeting heard with no microphone): one press, and AI says
 * the greeting a caller hears, with their business's name, in the voice their calls are answered in. It is a call the
 * page only listens to (bridge/rehearse/call.ts startListen), made by the preview's own door (POST
 * previews/<token>/listen), which counts its seconds against the preview's minutes; the browser is asked for no
 * microphone, and the page leaves the call once the greeting is said.
 *
 * Where it cannot be played (its minutes used, a call running, the provider away, a browser that will not play it), the
 * press plays the provider's own recording of the voice instead, as it did before this: nothing is said to have failed.
 *
 * The press itself begins a sound: a quarter of a second of silence, over and over, on an element of its own. A browser
 * that lets a page play only what a press began (a phone's above all) then lets the call's voice through, since the page
 * is playing already; and the sample, where it is needed, plays on that same element, which the press began. Proven in
 * a desktop browser (18 November 2026); not yet tried on a phone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { phoneVoiceShown } from "@chanlytics/contracts";
import { startListen, type ListenSession, type StartCall } from "@/bridge/rehearse/call";
import { previewVerbs } from "./verbs";

/** The quiet sound's length in samples: a quarter of a second at its rate. */
const QUIET_SAMPLES = 2_000;
/** Its rate: the lowest a browser plays, since nothing is in it to hear. */
const QUIET_RATE_HZ = 8_000;
/** A WAV's header, in bytes, and the level its one-byte samples rest at. */
const WAV_HEAD_BYTES = 44;
const WAV_REST = 128;

let quiet: string | null = null;

/** The quiet sound, as a file the page makes for itself once (its media rule admits a blob, never a data address). */
function quietSound(): string {
  if (quiet) return quiet;
  const bytes = new Uint8Array(WAV_HEAD_BYTES + QUIET_SAMPLES).fill(WAV_REST, WAV_HEAD_BYTES);
  const view = new DataView(bytes.buffer);
  const word = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  word(8, "WAVEfmt ");
  view.setUint32(16, 16, true); // the format's own length
  view.setUint16(20, 1, true); // plain samples
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, QUIET_RATE_HZ, true);
  view.setUint32(28, QUIET_RATE_HZ, true); // bytes a second: one a sample
  view.setUint16(32, 1, true); // bytes a sample
  view.setUint16(34, 8, true); // bits a sample
  word(36, "data");
  view.setUint32(40, QUIET_SAMPLES, true);
  quiet = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return quiet;
}

/** The listen's door, as the client's one request asks it: the call to join, or that there is none. */
const doorFor =
  (token: string): StartCall =>
  async () => {
    const answer = await previewVerbs.listen(token);
    return answer.ok
      ? { ok: true, started: { rehearsal_id: answer.data.rehearsal_id, call: answer.data.call } }
      : { ok: false, message: answer.message ?? "" };
  };

/** A sound the browser will not play is one nobody hears: nothing is said of it. */
const unheard = (): void => undefined;

/** Their greeting, heard: whether it is playing, and the press that plays it and stops it. */
export function useHear(token: string, voice: string) {
  const [playing, setPlaying] = useState(false);
  // The sound the press began (quiet under the listen, then the sample where the listen could not be played), and the
  // listen itself once the client holds it.
  const sound = useRef<HTMLAudioElement | null>(null);
  const listen = useRef<ListenSession | null>(null);

  const stop = useCallback(() => {
    const held = listen.current;
    listen.current = null;
    sound.current?.pause();
    sound.current = null;
    held?.end();
    setPlaying(false);
  }, []);
  // A page left while it plays leaves the call.
  useEffect(() => stop, [stop]);

  const toggle = () => {
    if (sound.current) {
      stop();
      return;
    }
    const el = new Audio(quietSound());
    el.loop = true;
    sound.current = el;
    setPlaying(true);
    void el.play().catch(unheard);
    // Whether this press is still the one playing: a press that stopped it is told nothing more.
    const mine = () => sound.current === el;
    void startListen(doorFor(token), (played) => {
      if (!mine()) return;
      listen.current = null;
      if (played) {
        stop();
        return;
      }
      // Not played: the provider's recording of the voice, on the element this press began.
      el.loop = false;
      el.src = phoneVoiceShown(voice).sample;
      el.onended = () => {
        if (mine()) stop();
      };
      void el.play().catch(() => {
        if (mine()) stop();
      });
    }).then((session) => {
      if (mine()) listen.current = session;
      else session?.end();
    });
  };

  return { playing, toggle, stop };
}

export type Hear = ReturnType<typeof useHear>;
