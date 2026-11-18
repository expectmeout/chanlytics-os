"use client";

/**
 * A lead's own preview, Call it (decision 0079, L3): a call in the browser to the business's own AI, as a caller would
 * make one. The rehearsal's own call (bridge/rehearse/call.ts, the vendor's web client loaded on the press), made by
 * the preview's door (POST previews/<token>/call), which counts it against the preview's minutes. Started from the
 * press itself, so the browser's question about the microphone follows a person's act.
 *
 * What the page hears of it: connecting, on the call, ended; why a call could not be made, in the page's own words;
 * how long it ran, as the page counted it; and what its minutes have left. The call tells the browser nothing of what
 * was said (its words are the rehearsal's, kept on the server).
 */
import { useEffect, useRef, useState } from "react";
import { LEAD_PREVIEW_WORDS as W, MIN_MS, SECOND_MS } from "@chanlytics/contracts";
import { startCall, type CallSession } from "@/bridge/rehearse/call";
import { previewVerbs } from "./verbs";

type Phase = "idle" | "connecting" | "live";
/** The least a call can be (the provider's floor): less than this left, and no call starts. */
const CALL_FLOOR_MS = MIN_MS;

/** The call: where it stands, its presses, and what `onEnded` is told of one that was answered. */
export function useCall(token: string, leftMs: number, onEnded: (seconds: number) => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(leftMs);
  const [muted, setMuted] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<CallSession | null>(null);
  const liveSince = useRef<number | null>(null);

  // A page left mid-call ends the call.
  useEffect(() => () => session.current?.end(), []);

  // The call's length, counted while it is live.
  useEffect(() => {
    if (phase !== "live") return undefined;
    const tick = setInterval(() => {
      if (liveSince.current !== null) setSeconds(Math.round((Date.now() - liveSince.current) / SECOND_MS));
    }, SECOND_MS);
    return () => clearInterval(tick);
  }, [phase]);

  /** The call is over: back to the page, with its line where it was answered. */
  const over = (why: string | null) => {
    session.current = null;
    const since = liveSince.current;
    liveSince.current = null;
    setPhase("idle");
    // What went wrong stays said until the next call starts: the provider tells an end after a failure too.
    if (why) setTrouble(why);
    if (since !== null) onEnded(Math.max(1, Math.round((Date.now() - since) / SECOND_MS)));
  };

  const start = async () => {
    if (phase !== "idle") return;
    setTrouble(null);
    setMuted(false);
    setSeconds(0);
    setPhase("connecting");
    session.current = await startCall(
      async () => {
        const answer = await previewVerbs.call(token);
        if (!answer.ok) return { ok: false, message: answer.message ?? W.callFailed };
        setLeft(answer.data.left_ms);
        return { ok: true, started: { rehearsal_id: answer.data.rehearsal_id, call: answer.data.call } };
      },
      {
        onStarted: () => undefined,
        onStatus: (status) => {
          if (status !== "live") return;
          liveSince.current ??= Date.now();
          setPhase("live");
        },
        onEnd: (reason) => over(reason?.startsWith("error_") ? W.dropped : null),
        onError: (kind, words) =>
          over(kind === "mic" ? W.micBlocked : kind === "refused" ? (words ?? W.callFailed) : W.callFailed),
      },
    );
  };

  return {
    phase,
    seconds,
    muted,
    trouble,
    /** Its minutes are used: no call starts. */
    used: left < CALL_FLOOR_MS,
    /** What is left of its minutes, in the page's words. */
    leftWords: left < CALL_FLOOR_MS ? W.callUsed : W.callLeft(left),
    left,
    start,
    end: () => session.current?.end(),
    mute: () => {
      session.current?.mute(!muted);
      setMuted(!muted);
    },
  };
}

export type Call = ReturnType<typeof useCall>;
