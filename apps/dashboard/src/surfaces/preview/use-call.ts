"use client";

/**
 * A lead's own preview, Call it (decision 0079, L3): a call in the browser to the business's own AI, as a caller would
 * make one. The rehearsal's own call (bridge/rehearse/call.ts, the vendor's web client loaded on the press), made by
 * the preview's door (POST previews/<token>/call), which counts it against the preview's minutes. Started from the
 * press itself, so the browser's question about the microphone follows a person's act.
 *
 * What the page hears of it: connecting, on the call, ended; why a call could not be made, in the page's own words;
 * how long it ran, as the page counted it; and what its minutes have left. The call tells the browser nothing of what
 * was said: its words are the rehearsal's, kept on the server as the call goes, so the page reads them from its own
 * door every two seconds while the call is live (previews/<token>/heard), and hands the last it read to the
 * conversation when the call ends.
 */
import { useEffect, useRef, useState } from "react";
import { LEAD_PREVIEW_WORDS as W, MIN_MS, SECOND_MS, type PreviewHeardLine } from "@chanlytics/contracts";
import { startCall, type CallSession } from "@/bridge/rehearse/call";
import { previewVerbs } from "./verbs";

type Phase = "idle" | "connecting" | "live";
/** The least a call can be (the provider's floor): less than this left, and no call starts. */
const CALL_FLOOR_MS = MIN_MS;
/** How often a live call's words are read: as often as the rehearsal's own page reads them. */
const HEARD_EVERY_MS = 2 * SECOND_MS;

/** A call that was answered, as the conversation is told of it: how long it ran, which it was, and its words so far. */
export interface CallEnded {
  seconds: number;
  /** The call's own name at the page's doors (its rehearsal), or null where the page never learned it. */
  id: string | null;
  lines: PreviewHeardLine[];
}

/** The call: where it stands, its presses, and what `onEnded` is told of one that was answered. */
export function useCall(token: string, leftMs: number, onEnded: (call: CallEnded) => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(leftMs);
  const [muted, setMuted] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<CallSession | null>(null);
  const liveSince = useRef<number | null>(null);
  const [heard, setHeard] = useState<PreviewHeardLine[]>([]);
  // The call the page is on, and the last of its words read: refs, since the call's end reads them from a callback.
  const callId = useRef<string | null>(null);
  const heardNow = useRef<PreviewHeardLine[]>([]);

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

  // The call's words, read while it is live. One read at a time: a slow one is not overtaken by the next.
  useEffect(() => {
    if (phase !== "live") return undefined;
    let stopped = false;
    let reading = false;
    const read = async () => {
      const id = callId.current;
      if (!id || reading) return;
      reading = true;
      const answer = await previewVerbs.heard(token, id);
      reading = false;
      if (stopped || !answer.ok || !answer.data.lines.length) return;
      heardNow.current = answer.data.lines;
      setHeard(answer.data.lines);
    };
    const tick = setInterval(() => void read(), HEARD_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(tick);
    };
  }, [phase, token]);

  /** The call is over: back to the page, with its line where it was answered. */
  const over = (why: string | null) => {
    session.current = null;
    const since = liveSince.current;
    liveSince.current = null;
    const id = callId.current;
    callId.current = null;
    const lines = heardNow.current;
    heardNow.current = [];
    setHeard([]);
    setPhase("idle");
    // What went wrong stays said until the next call starts: the provider tells an end after a failure too.
    if (why) setTrouble(why);
    if (since !== null) onEnded({ seconds: Math.max(1, Math.round((Date.now() - since) / SECOND_MS)), id, lines });
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
        onStarted: (started) => {
          callId.current = started.rehearsal_id;
        },
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
    /** What has been said on the call so far, as the page last read it. */
    heard,
    start,
    end: () => session.current?.end(),
    mute: () => {
      session.current?.mute(!muted);
      setMuted(!muted);
    },
  };
}

export type Call = ReturnType<typeof useCall>;
