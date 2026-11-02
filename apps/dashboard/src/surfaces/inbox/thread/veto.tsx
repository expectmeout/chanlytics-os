/**
 * The controls on a draft counting down to send (moved from pages/inbox-thread.jsx, decision 0015): the veto bar, and
 * the one line that has the receptionist write the waiting draft again.
 */
import { useState } from "react";
import { countdownClock, THREAD_PANE_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { Meter } from "../../kit/meter/meter";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { gate, useToast } from "../shell";
import { trustRateFor } from "./shell-thread";
import { steerDraft } from "../verbs";
import type { Thread, Veto } from "../types";
import { Button } from "../../kit/button/button";

// =============== STEER — rewrite a held draft to the owner's instruction ===============
// The WhatsApp counterpart of the call whisper. One line, and the receptionist
// writes the waiting draft again with it in mind, under the same rules; the
// new draft waits its turn like the first one. Nothing is sent from here.
export const SteerBox = ({ messageId }: { messageId: string }) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastNode, flash] = useToast();
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const r = await steerDraft(messageId, t);
    setBusy(false);
    if (r.ok) {
      setText("");
      flash({ msg: <>Rewritten — the new draft waits its turn like the first one</> });
    } else {
      flash({ tone: "danger", msg: <>Not rewritten — {r.message}</> });
    }
  };
  return (
    <div className="ix-steer" data-testid="steer-box">
      <Icon name="spark" size={13} className="ix-steer-spark" />
      <input
        className="ix-steer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void send();
        }}
        placeholder={THREAD_PANE_WORDS.rewriteAsk}
        maxLength={500}
        disabled={busy}
        aria-label="Instruction for the rewrite"
      />
      <Button
        variant="soft"
        size="sm"
        className="ix-press"
        onClick={send}
        disabled={busy || !text.trim()}
        {...gate("approve")}
      >
        {busy ? THREAD_PANE_WORDS.rewriting : THREAD_PANE_WORDS.rewrite}
      </Button>
      {toastNode}
    </div>
  );
};

// =============== VETO BAR — countdown on a safe draft ===============
/** A thread with a draft counting down: the bar's own. */
type VetoThread = Thread & { veto: Veto };

/** Whether a thread has a draft counting down: the bar's guard, which the type follows. */
export const hasVeto = (thread: Thread): thread is VetoThread => !!thread.veto;

interface VetoBarProps {
  thread: VetoThread;
  remaining: number | null | undefined;
  paused?: boolean;
  onAct?: (threadId: string, act: string) => void;
  onTakeOver?: (threadId: string) => void;
}

/** What the countdown says: the seconds left, the pause while you are away, the send, or the hold. */
function vetoSays(thread: VetoThread, remaining: number | null | undefined, paused: boolean) {
  return remaining != null ? (
    paused ? (
      <>
        Paused at <b>{remaining}s</b> — you're away
      </>
    ) : thread.real && remaining === 0 ? (
      <b>Sending now…</b>
    ) : (
      <>
        <b>Auto-sends in {remaining}s</b>
      </>
    )
  ) : (
    <>Held — manual send</>
  );
}

/** The demo's edit rate for the agent, when the trust digest has one. */
function vetoTrust(thread: VetoThread) {
  const rate = trustRateFor(thread.agent.name);
  return rate !== null ? (
    <span className="ix-veto-trust" data-tip="30-day edit rate — under 5% is the earn-more-autonomy signal">
      {thread.agent.name} · {rate}% edit rate
    </span>
  ) : null;
}

export const VetoBar = ({
  thread,
  remaining,
  paused = false,
  onAct = () => {},
  onTakeOver = () => {},
}: VetoBarProps) => (
  <div className={`ix-veto ${remaining == null ? "held" : paused ? "paused" : remaining <= 10 ? "urgent" : ""}`}>
    <span className="ix-veto-dot"></span>
    <span
      className="ix-veto-msg"
      role="timer"
      data-tip={
        thread.real
          ? "This draft sends itself at zero. Edit, Hold or starting to type a reply stops it."
          : "This draft sends itself at zero — Edit, Hold, or typing a reply cancels it"
      }
    >
      {vetoSays(thread, remaining, paused)}
    </span>
    {/* What a screen reader hears: the hold and the send, not a number every second (I3). */}
    <span className="ix-veto-said" role="status">
      {remaining == null
        ? "Held — this draft will not send."
        : thread.real && remaining === 0 && !paused
          ? "Sending now."
          : ""}
    </span>
    {thread.veto.policyClass && <PolicyChip cls={thread.veto.policyClass} />}
    {thread.veto.why && (
      <span className="ix-veto-why" title={thread.veto.why.reason || ""}>
        {thread.veto.why.heldFor === "low_confidence" ? "Not sure enough to send alone · " : ""}
        {thread.veto.why.summary}
        {thread.veto.why.facts.length ? ` · used: ${thread.veto.why.facts.join(", ")}` : ""}
      </span>
    )}
    {vetoTrust(thread)}
    <span className="ix-veto-spacer"></span>
    {remaining != null && (
      <>
        <Button variant="quiet" size="sm" onClick={() => onAct(thread.id, "edit")} {...gate("approve")}>
          Edit
        </Button>
        <Button size="sm" onClick={() => onAct(thread.id, "hold")} {...gate("approve")}>
          Hold
        </Button>
      </>
    )}
    <Button variant="quiet" size="sm" onClick={() => onTakeOver(thread.id)} {...gate("approve")}>
      Take over
    </Button>
  </div>
);

/** What a real draft's own line says: when it sends, or that it is paused, going, or held. */
function heldSays(remaining: number | null | undefined, paused: boolean) {
  const W = THREAD_PANE_WORDS;
  if (remaining == null) return <>{W.heldStopped}</>;
  const clock = <span className="tabular">{countdownClock(remaining)}</span>;
  if (paused)
    return (
      <>
        {W.notSentYet} · {clock} · {W.heldPaused}
      </>
    );
  if (remaining === 0) return <>{W.sendingNow}</>;
  return (
    <>
      {W.notSentYet} · {W.sendsInLower} {clock}
    </>
  );
}

interface HeldDraftProps {
  thread: VetoThread;
  /** The draft's words, as its row holds them. */
  text: string;
  remaining: number | null | undefined;
  paused?: boolean;
  onAct?: (threadId: string, act: string) => void;
}

/**
 * A real draft counting down to send, drawn once, as the next bubble (the thread canvas, 1 Nov 2026): over it when it
 * sends, in the amber; the bubble dashed in the amber; a meter of the time left; then Edit, Hold and Send now at its
 * right, and the line that has the receptionist write it again. It was the bubble with "Not sent yet" under it, a box of
 * its own saying "Auto-sends in 48s" with Take over, and the line, three blocks for one draft.
 */
export function HeldDraft({ thread, text, remaining, paused = false, onAct = () => {} }: HeldDraftProps) {
  const W = THREAD_PANE_WORDS;
  const going = remaining != null;
  const whole = Math.max(1, thread.veto.window);
  const left = going ? Math.min(whole, Math.max(0, remaining)) : 0;
  return (
    <div
      className="ix-held-draft"
      data-mid={thread.veto.messageId}
      data-paused={paused || undefined}
      data-testid="ix-held-draft"
    >
      <div className="ix-held-says" role="timer" title={W.heldTip} data-testid="ix-held-says">
        <Icon name="spark" size={11} />
        {heldSays(remaining, paused)}
      </div>
      {/* What a screen reader hears: the hold and the send, not a number every second (I3). */}
      <span className="ix-veto-said" role="status">
        {remaining == null ? "Held — this draft will not send." : remaining === 0 && !paused ? "Sending now." : ""}
      </span>
      <div className="ix-held-words" data-testid="ix-held-words">
        {text}
      </div>
      {going && (
        <Meter
          size="sm"
          className="ix-held-time"
          parts={[
            { share: left, tone: "warn" },
            { share: whole - left, tone: "ground" },
          ]}
          aria-label={W.untilSends(countdownClock(left))}
        />
      )}
      {going && (
        <div className="ix-held-acts">
          <Button
            variant="quiet"
            size="lg"
            onClick={() => onAct(thread.id, "edit")}
            className="ix-press"
            data-testid="ix-held-edit"
            {...gate("approve")}
          >
            {W.edit}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => onAct(thread.id, "hold")}
            className="ix-press"
            data-testid="ix-held-hold"
            {...gate("approve")}
          >
            <Icon name="pause" size={13} />
            {W.hold}
          </Button>
          <Button
            variant="ink"
            size="lg"
            disabled={remaining === 0}
            onClick={() => onAct(thread.id, "send_now")}
            className="ix-press"
            data-testid="ix-held-send-now"
            {...gate("approve")}
          >
            {W.sendNow}
          </Button>
        </div>
      )}
      {going && thread.veto.messageId ? <SteerBox messageId={thread.veto.messageId} /> : null}
    </div>
  );
}
