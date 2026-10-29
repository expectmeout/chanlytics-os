/**
 * Ask's ideas in Need you (decisions 0070 and 0071): the morning's cards that are not about someone waiting (the morning
 * makes none of those now; they are rows with their own drafts), each a row after the people, with its act and Not
 * today. A card is approved through its own verb walk, as Ask's Line approves it (window.__ask), and what became of it is
 * kept on its turn one outcome after another, never two over one turn at once, so the Line reads it back too. A plan's
 * step, which is pressed with its plan, opens in Ask. This was Ask for you, a section of its own under the queue.
 */
import { useState } from "react";
import {
  ASK_MORNING_WORDS,
  NEED_YOU_WORDS as W,
  type AskMorningCard,
  type AskProposalOutcome,
} from "@chanlytics/contracts";
import { undoVerb } from "@/legacy-bridge/verbs/commit";
import { Button } from "../../kit";
import { askAbout, askCards, canDo, gate } from "../shell";
import { Acts, Done, type WorkProps } from "./parts";
import { useRowState } from "./row-state";

/** The last outcome on its way for each turn: the next is kept after it, since the store writes a turn whole. */
const turnWrites = new Map<string, Promise<unknown>>();

/** One outcome kept on its turn once the one before it has landed, whatever that one came to. */
function afterTheLast<T>(messageId: string, write: () => Promise<T>): Promise<T> {
  const next = (turnWrites.get(messageId) ?? Promise.resolve()).then(write, write);
  turnWrites.set(
    messageId,
    next.catch(() => undefined),
  );
  return next;
}

/** What became of a card, kept on the turn that made it, as the Line keeps it. */
function keptOnTurn(messageId: string | null, p: AskMorningCard, o: AskProposalOutcome): Promise<boolean> {
  const door = askCards();
  return messageId && door ? afterTheLast(messageId, () => door.outcome(messageId, p.id, o)) : Promise.resolve(false);
}

/**
 * One of Ask's ideas as a row's work: its act (Approve, or Open in Ask for a plan's step) and Not today. What became of
 * it is said in the row at once and kept on its turn behind it; an approval whose verb has an undo offers it there.
 * `keep` holds the row in its place for the visit: a card with an outcome leaves the morning's next read.
 */
export function IdeaWork(
  p: Pick<WorkProps, "main" | "flash" | "foot"> & {
    card: AskMorningCard;
    messageId: string | null;
    threadId: string | null;
    keep: () => void;
  },
) {
  const { card, messageId, threadId, main, flash } = p;
  // Kept by the idea, not by this part: Ask found on a phone draws it in a sheet, and its card says what became of it.
  const [said, setSaid] = useRowState<{
    words: string;
    tone: "ok" | "rest";
    undo: Record<string, unknown> | null;
  } | null>(card.id, "said", null);
  const [busy, setBusy] = useState(false);
  const open = () => askAbout(threadId ? { thread: threadId } : {});
  const approve = async () => {
    const door = askCards();
    if (!door || !canDo("approve")) return;
    setBusy(true);
    p.keep();
    const r = await door.commit(card);
    const atMs = Date.now();
    setBusy(false);
    if (!r.ok) {
      void keptOnTurn(messageId, card, { state: "failed", receipt: r.message, atMs, undo: null });
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setSaid({ words: r.receipt, tone: "ok", undo: r.undo ?? null });
    void keptOnTurn(messageId, card, {
      state: "done",
      receipt: r.receipt,
      atMs,
      undo: r.undo ?? null,
      made: r.made ?? null,
    });
  };
  const undo = async () => {
    if (!said?.undo) return;
    const r = await undoVerb(card.kind, said.undo);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setSaid(null);
    void keptOnTurn(messageId, card, { state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null });
  };
  const notToday = async () => {
    if (busy) return;
    p.keep();
    setSaid({ words: W.idea.gone, tone: "rest", undo: null });
    await keptOnTurn(messageId, card, {
      state: "dismissed",
      receipt: ASK_MORNING_WORDS.dismissed,
      atMs: Date.now(),
      undo: null,
    });
  };
  if (said)
    return (
      <Done
        tone={said.tone}
        words={said.words}
        act={said.undo ? { label: W.undo, onPress: () => void undo() } : null}
      />
    );
  return (
    <Acts
      foot={p.foot}
      start={
        <Button variant="quiet" onClick={() => void notToday()} disabled={busy}>
          {W.idea.notToday}
        </Button>
      }
      end={
        card.plan ? (
          <Button variant={main} onClick={open}>
            {W.idea.openInAsk}
          </Button>
        ) : (
          <Button
            variant={main}
            onClick={() => void approve()}
            disabled={busy}
            aria-busy={busy || undefined}
            {...gate("approve", "approve Ask's card")}
          >
            {W.idea.approve}
          </Button>
        )
      }
    />
  );
}
