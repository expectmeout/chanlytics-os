// Chanlytics — Rehearse, Talk (decision 0069, R2): a call to the receptionist in the browser, as a customer would make
// one, before any number is bought.
//
// Call it asks the edge for a call (POST receptionist/rehearsals, through the client's seam in
// legacy-bridge/rehearse/call.ts, which loads the vendor's client on this press so the microphone's prompt comes from
// it). The words come from our own webhook's writes: the rehearsal is read every two seconds while its call runs, and
// once at its end (GET receptionist/rehearsals/[id]). What a real call would do and a rehearsal does not is said where it
// happens: the booking link it would have sent, and who a caller asking for a person is put through to.
//
// End and see how it did ends the call and asks for the review in one press; a call that ended by itself (its three
// minutes, or the receptionist hanging up) offers See how it did. The minutes left are said under the press once the
// edge has counted them. Closing the fold ends a call still running.

import { useEffect, useRef, useState } from "react";
import { MIN_MS, REHEARSE_WORDS as W, SECOND_MS, type RehearsalTurn } from "@chanlytics/contracts";
import { startCall, type CallSession } from "@/legacy-bridge/rehearse/call";
import { Button } from "../../../kit/button/button";
import { LinkButton } from "../../../kit/link-button/link-button";
import { RecordRow } from "../../../kit/record/row";
import { rehearseVerbs, type RehearsalStarted } from "./verbs";

/** How often the words are read while the call runs: our webhook writes them as they come. */
const READ_EVERY_MS = 2_000;
/** Past a call's own length, the reads stop: its end is read once more, whatever was heard. */
const READ_MARGIN_MS = MIN_MS;

type Phase = "idle" | "connecting" | "live" | "ended";
/** Why a call could not go on, in the page's words: the microphone, the route's refusal, or anything else. */
type Trouble = { kind: "mic" | "refused" | "failed" | "dropped"; words: string };

/** One turn heard: the customer (the owner), the receptionist, or the link it would have sent. Hookless. */
function BtHeard({ t, at, bookingLink }: { t: RehearsalTurn; at: number; bookingLink: string | null }) {
  const id = `bt-rh-heard-${at}`;
  if (t.role === "tool")
    return bookingLink ? (
      <p className="rec-hint" data-testid={id}>
        {W.linkShown(bookingLink)}
      </p>
    ) : null;
  return <RecordRow id={id} label={t.role === "user" ? W.talk.you : W.talk.it(null)} value={t.content} />;
}

export function BtTalk({
  bookingLink,
  onReview,
  reviewing,
}: {
  bookingLink: string | null;
  /** Ask for how it did, of this rehearsal. */
  onReview: (rehearsalId: string) => void;
  reviewing: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [started, setStarted] = useState<RehearsalStarted | null>(null);
  const [turns, setTurns] = useState<RehearsalTurn[]>([]);
  // The provider's seconds for this call, once it has said them: what is left is counted after them.
  const [seconds, setSeconds] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const session = useRef<CallSession | null>(null);
  // Whether the end was the owner's press, which asks for the review with it.
  const reviewOnEnd = useRef(false);

  const id = started?.rehearsal_id ?? null;
  useRehearsalWords(id, phase, started?.max_ms ?? 0, (r) => {
    setTurns(r.transcript);
    setSeconds(r.seconds);
  });

  // A fold closed mid-call ends the call.
  useEffect(() => () => session.current?.end(), []);

  const call = async () => {
    if (phase === "connecting" || phase === "live") return;
    setTrouble(null);
    setTurns([]);
    setSeconds(null);
    setStarted(null);
    setMuted(false);
    reviewOnEnd.current = false;
    setPhase("connecting");
    session.current = await startCall(
      async () => {
        const r = await rehearseVerbs.start();
        return r.ok ? { ok: true, started: r.data } : { ok: false, message: r.message };
      },
      {
        onStarted: (s) => setStarted(s as RehearsalStarted),
        onStatus: (s) => setPhase(s),
        onEnd: (reason) => {
          session.current = null;
          setPhase("ended");
          if (reason?.startsWith("error_")) setTrouble({ kind: "dropped", words: W.talk.dropped });
        },
        onError: (kind, words) => {
          session.current = null;
          setPhase((was) => (was === "live" ? "ended" : "idle"));
          setTrouble({ kind, words: troubleWords(kind, words) });
        },
      },
    );
  };
  const end = () => {
    reviewOnEnd.current = true;
    session.current?.end();
  };
  const mute = () => {
    session.current?.mute(!muted);
    setMuted(!muted);
  };

  // The review the owner's End asked for, once the call has ended.
  useEffect(() => {
    if (phase === "ended" && reviewOnEnd.current && id) {
      reviewOnEnd.current = false;
      onReview(id);
    }
  }, [phase, id, onReview]);

  const status = talkStatus(phase, turns.length > 0);
  // What is left once this call is counted: said after it, never during it.
  const allowance = started && phase === "ended" && seconds !== null ? started.allowance : null;
  const leftMs = allowance && seconds !== null ? Math.max(0, allowance.left_ms - seconds * SECOND_MS) : 0;
  return (
    <div
      className="bt-rh-talk"
      aria-busy={phase === "connecting" || undefined}
      data-phase={phase}
      data-testid="bt-rh-talk"
    >
      {status ? (
        <p className="bt-rh-status" role="status" data-testid="bt-rh-status">
          {status}
        </p>
      ) : null}
      {turns.map((t, i) => (
        <BtHeard key={i} t={t} at={i} bookingLink={bookingLink} />
      ))}
      <BtTalkActs
        phase={phase}
        muted={muted}
        reviewing={reviewing}
        seeId={phase === "ended" && turns.length ? id : null}
        onEnd={end}
        onMute={mute}
        onReview={onReview}
        onCall={() => void call()}
      />
      {trouble ? (
        <p className="rec-hint" role="alert" data-trouble={trouble.kind} data-testid="bt-rh-trouble">
          {trouble.words}
        </p>
      ) : phase === "idle" ? (
        <p className="rec-hint">{W.talk.mic}</p>
      ) : null}
      {allowance ? (
        <p className="rec-hint" data-testid="bt-rh-left">
          {leftMs >= MIN_MS ? W.left(leftMs, allowance.window) : W.used(allowance.window)}
        </p>
      ) : null}
      {started && phase === "live" ? <p className="rec-hint">{W.transferred(started.handoff)}</p> : null}
    </div>
  );
}

/** What the line under Talk says: connecting, listening until it has heard something, on the call, ended. */
function talkStatus(phase: Phase, heard: boolean): string | null {
  if (phase === "connecting") return W.talk.starting;
  if (phase === "live") return heard ? W.talk.live : W.talk.listening;
  return phase === "ended" ? W.talk.ended : null;
}

/** The words for a call that could not go on: the microphone refused, the door's own words, or that it failed. */
function troubleWords(kind: Trouble["kind"], words: string | null): string {
  if (kind === "mic") return W.talk.micBlocked;
  return kind === "refused" ? (words ?? W.talk.failed) : W.talk.failed;
}

/**
 * The words while the call runs, read every READ_EVERY_MS until its length and a margin are past, then at its end and
 * once more: the provider's last words can arrive a moment after the call ends.
 */
function useRehearsalWords(
  id: string | null,
  phase: Phase,
  maxMs: number,
  heard: (r: { transcript: RehearsalTurn[]; seconds: number | null }) => void,
) {
  const keep = useRef(heard);
  keep.current = heard;
  useEffect(() => {
    if (!id || phase === "idle") return;
    let gone = false;
    const read = async () => {
      const r = await rehearseVerbs.read(id);
      if (!gone && r.ok) keep.current(r.data);
    };
    if (phase === "ended") {
      void read();
      const again = setTimeout(() => void read(), 2 * READ_EVERY_MS);
      return () => {
        gone = true;
        clearTimeout(again);
      };
    }
    const until = Date.now() + maxMs + READ_MARGIN_MS;
    const timer = setInterval(() => {
      if (Date.now() > until) clearInterval(timer);
      else void read();
    }, READ_EVERY_MS);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [id, phase, maxMs]);
}

/** Talk's acts: End and Mute on the call, Connecting while it starts, then How it did and Call it (again). */
function BtTalkActs(p: {
  phase: Phase;
  muted: boolean;
  reviewing: boolean;
  /** The rehearsal How it did asks about: an ended call that heard something. */
  seeId: string | null;
  onEnd: () => void;
  onMute: () => void;
  onReview: (rehearsalId: string) => void;
  onCall: () => void;
}) {
  const { phase, seeId } = p;
  if (phase === "live")
    return (
      <span className="bt-try-acts">
        <Button size="sm" variant="primary" onClick={p.onEnd} data-testid="bt-rh-end">
          {W.talk.end}
        </Button>
        <Button size="sm" onClick={p.onMute} aria-pressed={p.muted} data-testid="bt-rh-mute">
          {p.muted ? W.talk.unmute : W.talk.mute}
        </Button>
      </span>
    );
  if (phase === "connecting")
    return (
      <span className="bt-try-acts">
        <Button size="sm" variant="primary" disabled data-testid="bt-rh-call">
          {W.talk.starting}
        </Button>
      </span>
    );
  return (
    <span className="bt-try-acts">
      {seeId ? (
        <Button
          size="sm"
          variant="primary"
          disabled={p.reviewing}
          onClick={() => p.onReview(seeId)}
          data-testid="bt-rh-see"
        >
          {p.reviewing ? W.reviewing : W.review}
        </Button>
      ) : null}
      {phase === "ended" ? (
        <LinkButton onClick={p.onCall} disabled={p.reviewing} data-testid="bt-rh-call">
          {W.talk.start}
        </LinkButton>
      ) : (
        <Button size="sm" variant="primary" onClick={p.onCall} data-testid="bt-rh-call">
          {W.talk.start}
        </Button>
      )}
    </span>
  );
}
