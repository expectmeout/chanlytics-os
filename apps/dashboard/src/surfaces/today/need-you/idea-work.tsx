/**
 * Ask's cards as Today presses them (decisions 0070, 0071 and 0087; Ask found draws them, zones/found.tsx): the morning's
 * ideas, and what Ask noticed that a press changes. A card is approved through its own verb walk, as Ask's Line approves
 * it (frame-verbs.ts askCalls), and what became of it is kept on its turn one outcome after another, never two over one
 * turn at once, so the Line reads it back too. A plan's step, which is pressed with its plan, opens in Ask. A new
 * campaign's rules are its sheet (CardSheet), opened on a press of its line.
 */
import { useState } from "react";
import {
  ASK_MORNING_WORDS,
  NEED_YOU_WORDS as W,
  type AskMorningCard,
  type AskProposalOutcome,
} from "@chanlytics/contracts";
import { undoVerb } from "@/bridge/verbs/commit";
import { askAbout, askCards, canDo } from "../shell";
import type { WorkProps } from "./parts";
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
 * An idea set aside, Not today, kept on its turn for everyone (none where no turn holds the card): tomorrow's morning and
 * every member's Today leave it out (contracts settledTitles). Its act a door or its own, the same word.
 */
export function dismissedOnTurn(messageId: string | null, card: AskMorningCard): Promise<boolean> {
  return keptOnTurn(messageId, card, {
    state: "dismissed",
    receipt: ASK_MORNING_WORDS.dismissed,
    atMs: Date.now(),
    undo: null,
  });
}

/** What an idea's presses are handed: the card, the turn it came on, and how the row keeps its place and says things. */
interface IdeaPorts {
  card: AskMorningCard;
  messageId: string | null;
  threadId: string | null;
  keep: () => void;
  flash: WorkProps["flash"];
  /**
   * Rests the card for the member a week (views.ask_found, every Ask found row); where a turn holds it (an idea), Not today
   * is kept on that turn besides, so tomorrow's morning and every member's Today leave it out (contracts settledTitles).
   */
  rest: () => Promise<void>;
}

/**
 * An idea's presses, as every place that draws one presses them (Need you's row work below, Ask found's row on Today,
 * zones/found.tsx): Approve through the card's own verb walk, its Undo, Not today, and Open in Ask for a plan's step.
 * What became of it is said at once and kept on its turn behind it; `said` is kept by the idea, not by the part drawing it.
 */
export function useIdeaActs(p: IdeaPorts) {
  const { card, messageId, threadId, flash } = p;
  // Kept by the card, not by this part: the row drawn again after the morning's next read says what became of it.
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
      void keptOnTurn(messageId, card, {
        state: "failed",
        receipt: r.message,
        atMs,
        undo: null,
        ...(r.moved ? { moved: true } : {}),
      });
      flash({ tone: "danger", msg: <>{r.message}</> });
      // What it was about has moved on, so no second press could do it: the row says so and takes no more.
      if (r.moved) setSaid({ words: W.idea.moved, tone: "rest", undo: null });
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
    // The member's rest, then the turn's word (none where no turn holds the card), whatever the rest came to.
    await p.rest().catch(() => undefined);
    await dismissedOnTurn(messageId, card);
  };
  return { said, busy, open, approve, undo, notToday };
}

/**
 * A new campaign's rules (the 30 Oct 2026 review, item 6: Today drew them as one run-on paragraph), as Ask found opens
 * them under its one line: what holds it from sending first, then a row a fact, as Ask's own card draws its sheet.
 */
export function CardSheet({ card }: { card: AskMorningCard }) {
  if (!card.sheet?.rows.length) return null;
  return (
    <span className="ny-idea-spec" data-testid="today-found-sheet">
      {card.sheet.holds.map((h) => (
        <small key={h} className="ny-idea-hold">
          {h}
        </small>
      ))}
      <dl className="ny-idea-rows">
        {card.sheet.rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </span>
  );
}
