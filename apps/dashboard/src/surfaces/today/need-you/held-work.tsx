/**
 * Your receptionist's reply counting down its veto window (decision 0071, E5): Today had a count of these and no row.
 * The row says what it will send and when, with Stop (the Inbox's Hold: POST messages/[id]/cancel-send), after which the
 * words are the member's to send as a reply; or Change it with Ask, which rewrites the held draft by an instruction
 * (contracts steerSpec, POST messages/[id]/steer) and lets the new one wait its turn. Left alone, it sends itself.
 */
import { useRef, useState } from "react";
import { NEED_YOU_WORDS as W, sendCountdown } from "@chanlytics/contracts";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { cancelSend } from "../../inbox/verbs";
import { Button } from "../../kit";
import { appNavigate, gate } from "../shell";
import { Acts, Done, Going, Note, OpenedBox, Quote, useTick, type WorkProps } from "./parts";
import { ReplyWork } from "./reply-work";

/** How often the receptionist's countdown is drawn again. */
const HELD_TICK_MS = 250;

/** The receptionist's held reply as its row offers it: its words and countdown with Stop, or the words, held, to send. */
export function HeldWork(p: WorkProps) {
  const { row, may, flash, keep } = p;
  const held = row.held;
  const [stop, setStop] = useState<"no" | "busy" | "held" | "gone">("no");
  const [changing, setChanging] = useState(false);
  const [how, setHow] = useState("");
  const [rewrite, setRewrite] = useState<"no" | "busy" | "done">("no");
  const now = useTick(stop === "no" && rewrite !== "done", HELD_TICK_MS);
  // The grace as first seen, so the meter empties from here: the row may be drawn partway through it.
  const first = useRef(held ? Math.max(1, held.sends_at_ms - Date.now()) : 1);
  if (!held) return null;
  const wire = row.writes?.wire ?? row.channel;

  if (stop === "held") return <ReplyWork {...p} row={{ ...row, prepared: held.text }} by={W.held.heldReply} />;
  if (rewrite === "done") return <Done words={W.held.rewritten} />;
  const { seconds, share } = sendCountdown(held.sends_at_ms - first.current, held.sends_at_ms, now);
  if (stop === "gone" || seconds <= 0)
    return (
      <Done
        words={W.sent}
        detail={stop === "gone" ? W.held.gone : W.held.by(wire)}
        act={{ label: W.open, onPress: () => appNavigate(row.cta.to) }}
      />
    );

  const stopIt = async () => {
    setStop("busy");
    keep({ ...row, status: [W.held.held] });
    // The Inbox's own Hold of the receptionist's draft (inbox/verbs.ts): the one call that withdraws it.
    const r = await cancelSend(held.message_id);
    setStop(r.ok ? "held" : "gone");
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
  };
  // Not kept on the card: the rewrite is a new held reply with its own deadline, which the next read draws in this row's
  // place (keyed by its message, rows.tsx) with its own countdown and Stop. Kept, the old row stood over it unseen.
  const rewriteIt = async () => {
    if (!how.trim()) return;
    setRewrite("busy");
    const r = await commitVerb("steer", { message_id: held.message_id, instruction: how.trim(), who: row.who });
    if (!r.ok) {
      setRewrite("no");
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setRewrite("done");
  };

  return (
    <>
      <Quote by={W.held.title} text={held.text} />
      <Going
        line={W.held.sendsIn(seconds)}
        sub={W.sendingTo(row.who, wire)}
        share={share}
        act={{ label: W.held.stop, onPress: () => void stopIt(), busy: stop === "busy", disabled: !may }}
      />
      {changing ? (
        <>
          <OpenedBox
            label={W.held.changeLabel}
            rows={2}
            value={how}
            onChange={setHow}
            placeholder={W.held.changeHint}
          />
          <Acts
            start={
              <Button variant="quiet" onClick={() => setChanging(false)}>
                {W.cancel}
              </Button>
            }
            end={
              <Button
                variant="secondary"
                onClick={() => void rewriteIt()}
                disabled={!how.trim() || rewrite === "busy"}
                aria-busy={rewrite === "busy" || undefined}
                {...gate("approve", "rewrite the reply")}
              >
                {W.held.rewrite}
              </Button>
            }
          />
        </>
      ) : may ? (
        <Acts
          start={
            <Button variant="quiet" onClick={() => setChanging(true)}>
              {W.held.change}
            </Button>
          }
        />
      ) : (
        <Note>{W.viewer}</Note>
      )}
    </>
  );
}
