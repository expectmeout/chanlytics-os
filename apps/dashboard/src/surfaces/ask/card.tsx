/**
 * A proposal the assistant made, as a card, and the cards of a turn as groups: a plan of Ask's, or cards side by side, one
 * open at a time. The parts are card-parts.tsx's; what a card may do is decided by its contract (askCalls(): the card's
 * verb, its undo, the plan's group), and this file holds what became of it.
 */
import { useEffect, useRef, useState } from "react";
import {
  holdsAlike,
  openCardOf,
  searchCardView,
  type AskProposal,
  type AskProposalOutcome,
  type SearchCardView,
  UUID,
} from "@chanlytics/contracts";
import type { AskApi, CommitResult } from "@/bridge/ask";
import { PROPOSAL_GATE } from "@chanlytics/contracts/page-specs";
import { Button } from "../kit/button/button";
import { AskPostCard, usePostCard } from "./card-post";
import { AskCardActs, AskCardChange, AskCardHead, AskCardReceipt, AskSheet, type CardFold } from "./card-parts";
import { askCalls, canDo, gate, settingsVersion } from "./shell";
import type { LineWords } from "./words";

/** Kept where the Line draws the card again. */
type OnOutcome = (messageId: string, pid: string, o: AskProposalOutcome) => void;
/** A card's commit that took. */
type Committed = Extract<CommitResult, { ok: true }>;
/** What a card's group hands it (AskPlan, AskCards), or nothing of a card on its own (AT_NO_STEP). */
interface CardStep {
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
const atDone = (r: Committed, at: number): AskProposalOutcome => ({
  state: "done",
  receipt: r.receipt,
  atMs: at,
  undo: r.undo || null,
  made: r.made || null,
});
const atFailed = (message: string, at: number): AskProposalOutcome => ({
  state: "failed",
  receipt: message,
  atMs: at,
  undo: null,
});
// Kept where the Line draws the card again (`onOutcome`) and on the turn (the outcome route); the route's answer is
// handed back, so a press of several cards records them one after another and never two over one turn at once.
const atRecord = (
  { A, messageId, onOutcome }: { A: AskApi | undefined; messageId?: string | null; onOutcome?: OnOutcome },
  pid: string,
  o: AskProposalOutcome,
): Promise<boolean> => {
  if (onOutcome && messageId) onOutcome(messageId, pid, o);
  return A && messageId && UUID.test(messageId) ? A.outcome(messageId, pid, o) : Promise.resolve(false);
};

/** Whether a card's undo is still true (contracts askUndoOpen): a reply until its cancel window closes, settings while nobody has saved since, anything else for ten minutes. */
const atUndoOpen = (
  A: AskApi | undefined,
  p: AskProposal,
  { state, undoData, doneAt }: { state: string; undoData: AskProposalOutcome["undo"]; doneAt: number },
) => {
  const version = settingsVersion();
  return (
    state === "done" &&
    !!undoData &&
    !!p.undo &&
    !!(A && A.undoOpen && A.undoOpen(p.kind, undoData, doneAt, Date.now(), version))
  );
};

// A search's card, read (contracts leads/search/card.ts, through the Line's LeadCards): what it finds as rows,
// the line under them, and where its people come from, folded, for a people search. A change is said to Ask; the press
// is the card's.
const AskSearchCard = ({ lead, t, alike }: { lead: SearchCardView; t: LineWords; alike: readonly string[] }) => (
  <>
    <div className="ask-card-change">
      <AskSheet sheet={lead.sheet} alike={alike} />
    </div>
    <p className="ask-card-foot" data-testid="ask-card-facts">
      {lead.foot}
    </p>
    {lead.source ? (
      <details className="ask-card-foot" data-testid="ask-card-source">
        <summary>{t.whereFrom}</summary>
        {lead.source}
      </details>
    ) : null}
  </>
);
// What became of a card another turn decided (a search card a newer one set aside), drawn as the card's own press would.
const atTold = (
  o: AskProposalOutcome | null,
  s: {
    setState: (state: AskProposalOutcome["state"]) => void;
    setReceipt: (receipt: string) => void;
    setUndoData: (undo: AskProposalOutcome["undo"]) => void;
    setDoneAt: (at: number) => void;
  },
) => {
  if (o) {
    s.setState(o.state);
    s.setReceipt(o.receipt);
    s.setUndoData(o.undo || null);
    s.setDoneAt(o.atMs || 0);
  }
};

// What became of a card, as its own press leaves it, or as it is told. When the act happened is kept because an undo is
// offered only while it is still true (contracts askUndoOpen).
const useCardOutcome = (p: AskProposal, ran: AskProposalOutcome | null) => {
  const [state, setState] = useState<AskProposalOutcome["state"] | "idle">(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useState<AskProposalOutcome["undo"]>(p.outcome ? p.outcome.undo || null : null);
  const [doneAt, setDoneAt] = useState(p.outcome ? p.outcome.atMs || 0 : 0);
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
  const told = p.outcome || null;
  const [saw, setSaw] = useState(told);
  if (told !== saw) {
    setSaw(told);
    atTold(told, { setState, setReceipt, setUndoData, setDoneAt });
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
const AT_NO_STEP: CardStep = {
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
export const AskCard = ({
  p,
  messageId,
  t,
  onNav,
  hideOpen = false,
  onOutcome,
  step = AT_NO_STEP,
}: {
  p: AskProposal;
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  hideOpen?: boolean;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  step?: CardStep;
}) => {
  const A = askCalls();
  const { state, setState, receipt, setReceipt, undoData, setUndoData, doneAt, setDoneAt, err, setErr } =
    useCardOutcome(p, step.ran);
  const { land, receiptRef, approveRef } = useCardLanding(state);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const post = usePostCard(p);
  const held = busy || step.held;
  const working = (b: boolean) => {
    setBusy(b);
    step.onBusy(b);
  };
  const record = (o: AskProposalOutcome) => {
    step.saw(p.id, o);
    void atRecord({ A, messageId, onOutcome }, p.id, o);
  };
  const approveWith = async (proposal: AskProposal) => {
    if (held || !A) return;
    working(true);
    setErr("");
    const r = await A.commit(proposal, step.cards);
    working(false);
    land.current = "receipt";
    if (r.ok) {
      const at = Date.now();
      setState("done");
      setReceipt(r.receipt);
      setUndoData(r.undo || null);
      setDoneAt(at);
      record(atDone(r, at));
      // A search approved is opened (spec F4), and a search answered likewise (G4): the receipt's "Leads shows it" is
      // kept true by going where the contract says the card opens.
      if ((p.kind === "lead_search" || p.kind === "people_search") && onNav && A && A.cardOpenRoute) {
        const to = A.cardOpenRoute({ ...p, outcome: { state: "done", receipt: r.receipt, atMs: at, undo: r.undo } });
        if (to) onNav(to);
      }
    } else {
      setState("failed");
      setErr(r.message);
      record(atFailed(r.message, Date.now()));
    }
  };
  const dismiss = () => {
    land.current = "receipt";
    setState("dismissed");
    record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null });
  };
  const undo = async () => {
    if (held || !A) return;
    working(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: doneAt, undo: undoData });
    working(false);
    if (r.ok) {
      land.current = "receipt";
      setState("undone");
      setReceipt(r.receipt);
      setUndoData(null);
      record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null });
    } else setErr(r.message);
  };
  const idle = state === "idle";
  // A search's card (Ruben, 23 Oct 2026): what it finds as rows, read, never edited here -- a change is said to Ask, which
  // makes the card again -- its line under them, and one press, for what the month has room for (contracts
  // leads/search/card.ts).
  const lead = idle ? searchCardView(p) : null;
  const shut = idle && !!step.fold && !step.fold.open;
  const decided = !idle && !!step.fold;
  return (
    <div className={`ask-card ${state}${shut ? " ask-shut" : ""}`} data-testid="ask-card" data-kind={p.kind}>
      <AskCardHead p={post ? post.card : p} t={t} fold={idle ? step.fold : null} />
      {shut || decided ? null : lead ? (
        <AskSearchCard lead={lead} t={t} alike={step.alike} />
      ) : post ? (
        <AskPostCard p={p} card={post} t={t} onNav={onNav} />
      ) : (
        <AskCardChange p={p} t={t} idle={idle} alike={step.alike} more={more} />
      )}
      {idle && step.note ? (
        <p className="ask-card-foot" data-testid="ask-step-note">
          {step.note}
        </p>
      ) : null}
      {idle && !shut ? (
        <AskCardActs
          p={p}
          t={t}
          busy={held}
          waits={step.waits}
          hideOpen={hideOpen || !!lead || !!post}
          press={lead ? lead.press : post ? post.press : null}
          onApprove={() => approveWith(lead ? lead.commit : post ? post.card : p)}
          onDismiss={dismiss}
          onNav={onNav}
          more={more}
          onMore={() => setMore((m) => !m)}
          approveRef={approveRef}
        />
      ) : null}
      {/* Always drawn, so what fills it is announced; empty, it takes no room (ask.css). */}
      <div className="ask-told" role="status">
        {idle ? null : (
          <AskCardReceipt
            p={p}
            t={t}
            state={state}
            receipt={receipt}
            err={err}
            open={atUndoOpen(A, p, { state, undoData, doneAt })}
            undoData={undoData}
            doneAt={doneAt}
            busy={held}
            onUndo={undo}
            onRetry={() => {
              land.current = "approve";
              setState("idle");
              setErr("");
              if (step.fold && !step.fold.open) step.fold.toggle();
            }}
            landRef={receiptRef}
          />
        )}
      </div>
      {err && state === "done" ? <div className="ask-card-note">{err}</div> : null}
    </div>
  );
};

/**
 * Which of a group's cards stands open: the first still waiting (contracts openCardOf), until a press on a head names
 * another or none (`picked`); what becomes of any card goes back to the first still waiting, so deciding one opens the
 * next. `now` is the cards as they stand, what the group saw become of them over what the turn holds.
 */
const useCardsTogether = (cards: AskProposal[]) => {
  const [seen, setSeen] = useState<Record<string, AskProposalOutcome>>({});
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const now = cards.map((p) => (seen[p.id] ? { ...p, outcome: seen[p.id] } : p));
  const open = picked === undefined ? openCardOf(now) : picked;
  const sawAll = (got: Record<string, AskProposalOutcome>) => {
    setSeen((prev) => ({ ...prev, ...got }));
    setPicked(undefined);
  };
  return {
    now,
    sawAll,
    saw: (pid: string, o: AskProposalOutcome) => sawAll({ [pid]: o }),
    foldOf: (pid: string): CardFold => ({ open: open === pid, toggle: () => setPicked(open === pid ? null : pid) }),
    alike: holdsAlike(now),
  };
};

// What holds every card of a group, said once over them in the sheet's warn tone: a press on any of them turns on it, so
// it stands above the one open whichever that is, and goes with the last that waits.
const AskHoldsAlike = ({ holds, of, t }: { holds: readonly string[]; of: number; t: LineWords }) =>
  holds.length ? (
    <div className="ask-alike" data-testid="ask-holds-alike">
      {holds.map((h, k) => (
        <p key={h} className="ask-spec-hold">
          {k === 0 ? <strong>{t.holdsAll(of)} </strong> : null}
          {h}
        </p>
      ))}
    </div>
  ) : null;

// The cards of no plan that stand side by side (contracts cardsTogether): one open, the rest folded, what they share said
// once over them. A card alone is drawn as it is.
export const AskCards = ({
  cards,
  messageId,
  t,
  onNav,
  onOutcome,
  onEdit,
  cardOpen,
}: {
  cards: AskProposal[];
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  cardOpen?: Record<string, boolean>;
}) => {
  const group = useCardsTogether(cards);
  const card = (p: AskProposal, step?: CardStep) => (
    <AskCard
      key={p.id}
      p={p}
      messageId={messageId}
      t={t}
      onNav={onNav}
      onOutcome={onOutcome}
      onEdit={onEdit}
      hideOpen={!!cardOpen && cardOpen[p.id] === false}
      step={step}
    />
  );
  const only = cards.length === 1 ? cards.at(0) : null;
  if (only) return card(only);
  return (
    <div className="ask-together" data-testid="ask-cards">
      <AskHoldsAlike holds={group.alike} of={cards.length} t={t} />
      {cards.map((p) => card(p, { ...AT_NO_STEP, saw: group.saw, fold: group.foldOf(p.id), alike: group.alike }))}
    </div>
  );
};

// A plan's step's own words in the Line's language (words.ts; contracts planGroupOf hands their numbers): its head,
// what it waits for in its Approve's place, and the line before its press: why it never goes (the refusal's own words,
// as every refusal is said) or WhatsApp's review of the message a step writes.
/** A plan's step as its group hands it (contracts planGroupOf). */
type PlanStepDrawn = ReturnType<AskApi["planGroupOf"]>["steps"][number];

const atStepWords = (t: LineWords, s: PlanStepDrawn) => ({
  head: t.stepOf(s.step, s.of),
  waits: !s.wait ? null : "undone" in s.wait ? t.stepUndone(s.wait.undone) : t.waitingFor(s.wait.waits),
  note: s.note || (s.review === null ? null : t.afterReview(s.review)),
});

// A plan of Ask's (the marketing manager's spec §5.4, §5.8): its cards one group in step order, each under its head
// ("Step 1 of 6"), with one press above them for the steps that send nothing (commit.ts commitPlan, through
// askCalls().commitPlan) and each send its own press once the steps it waits for are made. What the group is and what
// each card waits for are contracts' (planGroupOf), read again on every draw from the cards as they stand: their
// outcomes as the turn holds them, over what this group saw become of them since (`seen`); its words are the Line's own,
// in its language (`t`, atStepWords). The press is held while any
// of its cards is busy, records each step's outcome as that card's own press would (atDone, atFailed), one after another,
// holding every card of the plan until the last is kept, and hands each card it decided that outcome to draw (`ran`); a
// stop is the step it stopped at, failed in commitPlan's
// own words (PROPOSAL_WORDS.planStopped, never wrapped again), and the rest stay pressable one by one.
export const AskPlan = ({
  cards,
  messageId,
  t,
  onNav,
  onOutcome,
  onEdit,
  cardOpen,
}: {
  cards: AskProposal[];
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  cardOpen?: Record<string, boolean>;
}) => {
  const A = askCalls() as AskApi; // a plan is drawn only from a turn the bridge read
  const group = useCardsTogether(cards);
  const [ran, setRan] = useState<Record<string, AskProposalOutcome>>({});
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const { now } = group;
  const g = A.planGroupOf(now);
  const held = busy || Object.values(working).some(Boolean);
  // The press goes with the last step it decides, and focus lands on what became of the first it decided.
  const boxRef = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    boxRef.current?.querySelector<HTMLElement>(".ask-card-receipt")?.focus({ preventScroll: true });
  }, [ran]);
  // Every card of the plan is held from the press until the last outcome is recorded: the store writes a turn whole, so
  // a send or an Undo pressed while the group's outcomes are on their way would record over one of them.
  const press = async () => {
    if (held || !A.commitPlan) return;
    setBusy(true);
    try {
      const run = await A.commitPlan(now);
      const at = Date.now();
      const got: Record<string, AskProposalOutcome> = {};
      for (const { step, result } of run.results) {
        const p = now.find((c) => c.plan && c.plan.step === step);
        if (p) got[p.id] = result.ok ? atDone(result, at) : atFailed(result.message, at);
      }
      group.sawAll(got);
      pressed.current = true;
      setRan((prev) => ({ ...prev, ...got }));
      for (const pid of Object.keys(got)) await atRecord({ A, messageId, onOutcome }, pid, got[pid]);
    } finally {
      setBusy(false);
    }
  };
  // The press is gated as the steps it approves are: the first whose gate the member's role is refused, else Approve's.
  const gates = PROPOSAL_GATE;
  const gateKey =
    g.steps.map((s) => (s.card.plan?.silent ? gates[s.card.kind] || "approve" : null)).find((k) => k && !canDo(k)) ||
    "approve";
  return (
    <div className="ask-steps" ref={boxRef} data-testid="ask-plan">
      <AskHoldsAlike holds={group.alike} of={cards.length} t={t} />
      {g.left > 0 ? (
        <div className="ask-steps-press">
          <Button
            variant="primary"
            size="sm"
            className="ask-press"
            onClick={press}
            aria-disabled={held || undefined}
            aria-busy={held || undefined}
            data-testid="ask-plan-approve"
            {...gate(gateKey, "approve these steps")}
          >
            {busy ? t.working : t.approveSilent(g.left)}
          </Button>
        </div>
      ) : null}
      {g.steps.map((s) => {
        const w = atStepWords(t, s);
        const fold = cards.length > 1 ? group.foldOf(s.card.id) : null;
        return (
          <div key={s.card.id} className="ask-step" data-testid="ask-step">
            <div className="ask-step-n">
              <span className="rec-hint">{w.head}</span>
              {/* What it waits for stands in its Approve's place: on a step folded, beside its head. */}
              {w.waits && fold && !fold.open && !s.card.outcome ? (
                <span className="pill" data-testid="ask-card-waits">
                  {w.waits}
                </span>
              ) : null}
            </div>
            <AskCard
              p={s.card}
              messageId={messageId}
              t={t}
              onNav={onNav}
              onOutcome={onOutcome}
              onEdit={onEdit}
              hideOpen={!!cardOpen && cardOpen[s.card.id] === false}
              step={{
                waits: w.waits,
                note: w.note,
                cards: now,
                held: busy,
                ran: ran[s.card.id] || null,
                saw: group.saw,
                onBusy: (b) => setWorking((prev) => ({ ...prev, [s.card.id]: b })),
                fold,
                alike: group.alike,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
