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
 * conversation when the call ends. The reads stop a little past the longest a call may run, so a call whose end the
 * browser was never told of is not read for ever.
 *
 * End, pressed before the call is joined (the vendor's client still loading, or the call still being made), leaves at
 * once: the page is back, the call's door is not asked where it has not been, and a call already made is ended the
 * moment the client holds it, so no minute is spent on a call nobody is on.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  LEAD_PREVIEW_WORDS as W,
  MIN_MS,
  PREVIEW_LIMITS,
  SECOND_MS,
  type PreviewHeardLine,
} from "@chanlytics/contracts";
import { startCall, type CallHooks, type CallSession, type StartCall } from "@/bridge/rehearse/call";
import { previewVerbs } from "./verbs";

type Phase = "idle" | "connecting" | "live";
/** The least a call can be (the provider's floor): less than this left, and no call starts. */
const CALL_FLOOR_MS = MIN_MS;
/** How often a live call's words are read: as often as the rehearsal's own page reads them. */
const HEARD_EVERY_MS = 2 * SECOND_MS;
/** How long past a call's longest its words are still read: the provider ends it then, and its last words follow. */
const HEARD_MARGIN_MS = 30 * SECOND_MS;

/** A call that was answered, as the conversation is told of it: how long it ran, which it was, and its words so far. */
export interface CallEnded {
  seconds: number;
  /** The call's own name at the page's doors (its rehearsal), or null where the page never learned it. */
  id: string | null;
  lines: PreviewHeardLine[];
}

/** What a failure of the call says: the microphone kept off, the door's own words, or that it could not start. */
const troubleOf = (kind: Parameters<CallHooks["onError"]>[0], words: string | null): string =>
  kind === "mic" ? W.micBlocked : kind === "refused" ? (words ?? W.callFailed) : W.callFailed;

/** Seconds between two moments, at least one: a call that was answered ran for some. */
const secondsSince = (since: number): number => Math.max(1, Math.round((Date.now() - since) / SECOND_MS));

/**
 * The call's door, as the client's one request asks it: the call, with what its minutes have left, or the door's own
 * words. Nothing is asked for a call they left before it was made.
 */
function doorFor(token: string, leaving: RefObject<boolean>, onLeft: (ms: number) => void): StartCall {
  return async () => {
    if (leaving.current) return { ok: false, message: W.callFailed };
    const answer = await previewVerbs.call(token);
    if (!answer.ok) return { ok: false, message: answer.message ?? W.callFailed };
    onLeft(answer.data.left_ms);
    return { ok: true, started: { rehearsal_id: answer.data.rehearsal_id, call: answer.data.call } };
  };
}

/** The call's clock: counted from the moment it is live, and stopped with how long it ran. */
function useLiveClock(phase: Phase) {
  const since = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (phase !== "live") return undefined;
    const timer = setInterval(() => {
      if (since.current !== null) setSeconds(Math.round((Date.now() - since.current) / SECOND_MS));
    }, SECOND_MS);
    return () => clearInterval(timer);
  }, [phase]);
  return {
    seconds,
    /** The call is live: the clock runs from now, once. */
    begin: () => {
      since.current ??= Date.now();
    },
    /** The clock stopped: how long the call ran, or null for one that was never live. */
    stop: (): number | null => {
      const at = since.current;
      since.current = null;
      setSeconds(0);
      return at === null ? null : secondsSince(at);
    },
  };
}

/** One read of a live call's words: kept where there are any. One at a time, so a slow read is not overtaken. */
async function readLiveWords(token: string, id: string, keep: (lines: PreviewHeardLine[]) => void): Promise<void> {
  const answer = await previewVerbs.heard(token, id);
  if (answer.ok && answer.data.lines.length) keep(answer.data.lines);
}

/** The call's words while it is live, read every two seconds until a little past the longest a call runs. */
function useLiveWords(token: string, phase: Phase, callId: RefObject<string | null>) {
  const [heard, setHeard] = useState<PreviewHeardLine[]>([]);
  const last = useRef<PreviewHeardLine[]>([]);
  useEffect(() => {
    if (phase !== "live") return undefined;
    let stopped = false;
    let reading = false;
    const until = Date.now() + PREVIEW_LIMITS.aCallMs + HEARD_MARGIN_MS;
    const keep = (lines: PreviewHeardLine[]) => {
      if (stopped) return;
      last.current = lines;
      setHeard(lines);
    };
    const timer = setInterval(() => {
      const id = callId.current;
      if (!id || reading || Date.now() > until) return;
      reading = true;
      void readLiveWords(token, id, keep).finally(() => (reading = false));
    }, HEARD_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [phase, token, callId]);
  return {
    heard,
    /** The words last read, handed over as the call ends, and forgotten here. */
    take: (): PreviewHeardLine[] => {
      const lines = last.current;
      last.current = [];
      setHeard([]);
      return lines;
    },
  };
}

/** The call: where it stands, its presses, and what `onEnded` is told of one that was answered. */
export function useCall(token: string, leftMs: number, onEnded: (call: CallEnded) => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(leftMs);
  const [muted, setMuted] = useState(false);
  const [talking, setTalking] = useState(false);
  // How loud its voice is, as last heard: read by the call's mark at each frame, so no redraw is asked for it.
  const level = useRef(0);
  const [trouble, setTrouble] = useState<string | null>(null);
  const session = useRef<CallSession | null>(null);
  // The call the page is on, a start under way (until the client holds the call, or failed to), and End pressed
  // before it does.
  const callId = useRef<string | null>(null);
  const starting = useRef(false);
  const leaving = useRef(false);
  const clock = useLiveClock(phase);
  const live = useLiveWords(token, phase, callId);

  // A page left mid-call ends the call.
  useEffect(() => () => session.current?.end(), []);

  /** The call is over: back to the page, with its line where it was answered. */
  const over = (problem: string | null) => {
    session.current = null;
    const id = callId.current;
    callId.current = null;
    const seconds = clock.stop();
    const lines = live.take();
    level.current = 0;
    setTalking(false);
    setPhase("idle");
    // What went wrong stays said until the next call starts: the provider tells an end after a failure too. A call
    // they left before it was joined went wrong in no way, whatever the client says of the start it was refused.
    if (problem && !leaving.current) setTrouble(problem);
    if (seconds !== null) onEnded({ seconds, id, lines });
  };

  const start = async () => {
    // One start at a time: a call left before it was joined is still being wound up.
    if (phase !== "idle" || starting.current) return;
    starting.current = true;
    leaving.current = false;
    setTrouble(null);
    setMuted(false);
    setPhase("connecting");
    const joined = await startCall(doorFor(token, leaving, setLeft), {
      onStarted: (started) => {
        callId.current = started.rehearsal_id;
      },
      onStatus: (status) => {
        if (status !== "live") return;
        clock.begin();
        setPhase("live");
      },
      onEnd: (reason) => over(reason?.startsWith("error_") ? W.dropped : null),
      onError: (kind, words) => over(troubleOf(kind, words)),
      onTalking: setTalking,
      onLevel: (loud) => {
        level.current = loud;
      },
    });
    starting.current = false;
    // Left while it was being joined: the call the client now holds is ended, and nothing of it is kept.
    if (leaving.current) joined?.end();
    else session.current = joined;
  };

  /** End: the call the client holds, or, before it holds one, the start itself. */
  const end = () => {
    if (session.current) session.current.end();
    else if (starting.current) {
      leaving.current = true;
      setPhase("idle");
    }
  };

  return {
    phase,
    seconds: clock.seconds,
    muted,
    /** AI is speaking on the call (else it is listening). */
    talking,
    level,
    trouble,
    /** Its minutes are used: no call starts. */
    used: left < CALL_FLOOR_MS,
    /** What is left of its minutes, in the page's words. */
    leftWords: left < CALL_FLOOR_MS ? W.callUsed : W.callLeft(left),
    left,
    /** What has been said on the call so far, as the page last read it. */
    heard: live.heard,
    start,
    end,
    mute: () => {
      session.current?.mute(!muted);
      setMuted(!muted);
    },
  };
}

export type Call = ReturnType<typeof useCall>;
