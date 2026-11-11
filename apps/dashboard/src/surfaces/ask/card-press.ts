/**
 * What a card's press does, and what became of it (card.tsx draws the card): the press through the card's contract
 * (askCalls(): its verb and its undo), its outcome as the press leaves it or as another turn tells it, where focus lands after
 * it, and what a press made, which a card that follows what it made (a video's) reads. A plan's press (plan-card.tsx) records
 * what became of each of its steps the same way.
 */
import { useEffect, useRef, useState } from "react";
import { ASK_PUBLIC_HOLD_MS, type AskProposal, type AskProposalOutcome, UUID } from "@chanlytics/contracts";
import type { AskApi, CommitResult } from "@/bridge/ask";
import type { CardFold } from "./card-parts";
import { askCalls } from "./shell";
import type { LineWords } from "./words";

/** Kept where the Line draws the card again. */
export type OnOutcome = (messageId: string, pid: string, o: AskProposalOutcome) => void;
/** A card's commit that took. */
type Committed = Extract<CommitResult, { ok: true }>;
/** What a card's group hands it (AskPlan, AskCards), or nothing of a card on its own (AT_NO_STEP). */
export interface CardStep {
  waits: string | null;
  note: string | null;
  cards: readonly AskProposal[] | undefined;
  held: boolean;
  ran: AskProposalOutcome | null;
  saw: (pid: string, o: AskProposalOutcome) => void;
  onBusy: (busy: boolean) => void;
  fold: CardFold | null;
  alike: readonly string[];
}

// What became of a card, as an Approve records it: done with its receipt, its undo and what it made (a plan's later
// steps name it, contracts planMadeOf), or failed with the refusal's words. A card's own press and a plan's press
// (AskPlan) record it the one way, so a reload reads back what either made.
export const atDone = (result: Committed, at: number): AskProposalOutcome => ({
  state: "done",
  receipt: result.receipt,
  atMs: at,
  undo: result.undo || null,
  made: result.made || null,
});
export const atFailed = (message: string, at: number, moved?: boolean): AskProposalOutcome => ({
  state: "failed",
  receipt: message,
  atMs: at,
  undo: null,
  ...(moved ? { moved: true } : {}),
});
// Kept where the Line draws the card again (`onOutcome`) and on the turn (the outcome route); the route's answer is
// handed back, so a press of several cards records them one after another and never two over one turn at once.
export const recordCardOutcome = (
  { A, messageId, onOutcome }: { A: AskApi | undefined; messageId?: string | null; onOutcome?: OnOutcome },
  pid: string,
  outcome: AskProposalOutcome,
  kept = false,
): Promise<boolean> => {
  if (onOutcome && messageId) onOutcome(messageId, pid, outcome);
  // The act door already kept it on the turn; only what it did not see is written from here.
  if (kept) return Promise.resolve(true);
  return A && messageId && UUID.test(messageId) ? A.outcome(messageId, pid, outcome) : Promise.resolve(false);
};

// What became of a card another turn decided (a search card a newer one set aside), drawn as the card's own press would.
const atTold = (
  outcome: AskProposalOutcome | null,
  setters: {
    setState: (state: AskProposalOutcome["state"]) => void;
    setReceipt: (receipt: string) => void;
    setUndoData: (undo: AskProposalOutcome["undo"]) => void;
    setDoneAt: (at: number) => void;
  },
) => {
  if (outcome) {
    setters.setState(outcome.state);
    setters.setReceipt(outcome.receipt);
    setters.setUndoData(outcome.undo || null);
    setters.setDoneAt(outcome.atMs || 0);
  }
};

// What became of a card, as its own press leaves it, or as it is decided. When the act happened is kept because an undo is
// offered only while it is still true (contracts askUndoOpen).
const useCardOutcome = (proposal: AskProposal, ran: AskProposalOutcome | null) => {
  const [state, setState] = useState<AskProposalOutcome["state"] | "idle">(
    proposal.outcome ? proposal.outcome.state : "idle",
  );
  const [receipt, setReceipt] = useState(proposal.outcome ? proposal.outcome.receipt : "");
  const [undoData, setUndoData] = useState<AskProposalOutcome["undo"]>(
    proposal.outcome ? proposal.outcome.undo || null : null,
  );
  const [doneAt, setDoneAt] = useState(proposal.outcome ? proposal.outcome.atMs || 0 : 0);
  const [err, setErr] = useState("");
  // A step the group's press decided is drawn from the outcome that press recorded, once, as a reload would draw it.
  const [took, setTook] = useState<AskProposalOutcome | null>(null);
  if (ran && ran !== took) {
    setTook(ran);
    setState(ran.state);
    setReceipt(ran.receipt);
    setUndoData(ran.undo || null);
    setDoneAt(ran.atMs || 0);
    setErr(ran.state === "failed" ? ran.receipt : "");
  }
  // A card another turn set aside (a search card a newer one replaced, contracts withAnswerLanded) is drawn as it now is.
  const decided = proposal.outcome || null;
  const [saw, setSaw] = useState(decided);
  if (decided !== saw) {
    setSaw(decided);
    atTold(decided, { setState, setReceipt, setUndoData, setDoneAt });
  }
  return { state, setState, receipt, setReceipt, undoData, setUndoData, doneAt, setDoneAt, err, setErr };
};

// What was pressed goes as the card changes, and focus with it: it lands on what became of the card, or on Approve again
// after Try again, which the next draw has to make first.
const useCardLanding = (state: AskProposalOutcome["state"] | "idle") => {
  const land = useRef<"receipt" | "approve" | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const to = land.current === "receipt" ? receiptRef.current : land.current === "approve" ? approveRef.current : null;
    land.current = null;
    if (to) to.focus({ preventScroll: true });
  }, [state]);
  return { land, receiptRef, approveRef };
};

// A proposal the assistant made, as a card: its head, the change, Approve (or Edit in the composer), Open and Not now,
// and after the act its line with the undo the verb has. The commit runs through the verb's own route, which checks the
// role and the state again; what happened is kept on the turn, so a thread reads back with "Sent" rather than a fresh
// Approve. The Line draws a card again whenever its answer comes back under the line or opens in a fold, so what
// happened is also written into the conversation it holds (`onOutcome`): a card drawn again from a stale outcome
// offered Send a second time. A search's card is read, never edited: a change is said to Ask, whose next card replaces
// it (Ruben, 23 Oct 2026); the reply editor is for replies. A plan's step is drawn by its group (AskPlan), which hands it `step`:
// what it waits for and the line said before its press (contracts planGroupOf), the turn's cards as they stand (its
// press is judged by what they became, AskApi.commit), whether the group's press holds it, what that press recorded for
// it (`ran`), and where it tells the group what became of it and that it is busy. A card of no plan is a step of nothing.
// In a group of two or more a card not reached is folded to its head, and one decided is its head and what became of it
// (`fold`), so the group is as long as the one card that waits, and what they all share is said over them (`alike`).
export const AT_NO_STEP: CardStep = {
  waits: null,
  note: null,
  cards: undefined,
  held: false,
  ran: null,
  saw: () => {},
  onBusy: () => {},
  fold: null,
  alike: [],
};
/**
 * A search approved is opened (spec F4), and a search answered likewise (G4): the receipt's "Leads shows it" is kept true by
 * going where the contract says the card opens.
 */
const openSearchCard = (
  { ask, proposal, onNav }: { ask: AskApi | undefined; proposal: AskProposal; onNav: (to: string) => void },
  outcome: AskProposalOutcome,
): void => {
  if (proposal.kind !== "lead_search" && proposal.kind !== "people_search") return;
  const to = ask?.cardOpenRoute?.({ ...proposal, outcome });
  if (to) onNav(to);
};

/** What a done card's press made, and when it was pressed: this press's, else what its outcome kept (a reload, another tab). */
const pressMadeOf = (
  proposal: AskProposal,
  state: AskProposalOutcome["state"] | "idle",
  pressed: { made: string | null; at: number } | null,
) => {
  const kept = proposal.outcome?.state === "done" ? proposal.outcome : null;
  return {
    made: state === "done" ? (pressed?.made ?? kept?.made?.id ?? null) : null,
    madeAt: pressed?.at ?? kept?.atMs ?? 0,
  };
};

/**
 * What a card's press does, and what became of it. A public reply goes on a clock in this tab (D24 of the answers canvas): a
 * review's answer has no way back once it posts, so its press starts fifteen seconds, its end posts it and Undo clears it. A
 * tab that closes first posts nothing. Where what stopped it is fixed is kept where the door knew (D37).
 */
export const useCardPress = (
  proposal: AskProposal,
  use: {
    messageId?: string | null;
    t: LineWords;
    onNav: (to: string) => void;
    onOutcome?: OnOutcome;
    step: CardStep;
  },
) => {
  const { messageId, t, onNav, onOutcome, step } = use;
  const ask = askCalls();
  const outcome = useCardOutcome(proposal, step.ran);
  const { state, setState, receipt, setReceipt, undoData, setUndoData, doneAt, setDoneAt, setErr } = outcome;
  const landing = useCardLanding(state);
  const { land } = landing;
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState<{ from: number; until: number } | null>(null);
  const [forward, setForward] = useState<{ to: string } | null>(null);
  // What this card's press made, and when it was last pressed: a card that follows what it made (a video's) reads it by
  // these, and a second press of the same thing is read afresh.
  const [pressed, setPressed] = useState<{ made: string | null; at: number } | null>(null);
  const held = busy || step.held;
  const working = (b: boolean) => {
    setBusy(b);
    step.onBusy(b);
  };
  const record = (o: AskProposalOutcome, kept = false) => {
    step.saw(proposal.id, o);
    void recordCardOutcome({ A: ask, messageId, onOutcome }, proposal.id, o, kept);
  };
  const approveWith = async (proposal: AskProposal) => {
    if (held || !ask) return;
    working(true);
    setErr("");
    const result = await ask.commit(proposal, step.cards, messageId);
    working(false);
    land.current = "receipt";
    if (result.ok) {
      const at = Date.now();
      setState("done");
      setReceipt(result.receipt);
      setUndoData(result.undo || null);
      setDoneAt(at);
      setPressed({ made: result.made?.id ?? null, at });
      record(atDone(result, at), result.kept === true);
      openSearchCard({ ask, proposal, onNav }, { state: "done", receipt: result.receipt, atMs: at, undo: result.undo });
    } else {
      setState("failed");
      setErr(result.message);
      setForward(result.forward ?? null);
      record(atFailed(result.message, Date.now(), result.moved), result.kept === true);
    }
  };
  const dismiss = () => {
    land.current = "receipt";
    setState("dismissed");
    record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null });
  };
  const undo = async () => {
    if (held || !ask) return;
    working(true);
    const result = await ask.undo(proposal, { state: "done", receipt, atMs: doneAt, undo: undoData }, messageId);
    working(false);
    if (result.ok) {
      land.current = "receipt";
      setState("undone");
      setReceipt(result.receipt);
      setUndoData(null);
      record({ state: "undone", receipt: result.receipt, atMs: Date.now(), undo: null }, result.kept === true);
    } else setErr(result.message);
  };
  const onClock = () => {
    if (held) return;
    const from = Date.now();
    land.current = "receipt";
    setPosting({ from, until: from + ASK_PUBLIC_HOLD_MS });
  };
  return {
    A: ask,
    ...outcome,
    ...landing,
    held,
    posting,
    setPosting,
    forward,
    ...pressMadeOf(proposal, state, pressed),
    approveWith,
    dismiss,
    undo,
    onClock,
  };
};
