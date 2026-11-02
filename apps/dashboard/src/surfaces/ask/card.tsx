/**
 * A proposal the assistant made, as a card, and a plan of Ask's, its cards one group. The parts are card-parts.tsx's; what a
 * card may do is decided by its contract (askCalls(): the card's verb, its undo, the plan's group), and this file holds
 * what became of it.
 */
import { useState } from "react";
import { searchCardView, type AskProposal, type AskProposalOutcome, type SearchCardView } from "@chanlytics/contracts";
import type { AskApi, CommitResult } from "@/legacy-bridge/ask";
import { PROPOSAL_GATE } from "@chanlytics/contracts/page-specs";
import { AskCardActs, AskCardChange, AskCardHead, AskCardReceipt, AskSheet } from "./card-parts";
import { askCalls, canDo, gate, settingsVersion } from "./shell";
import type { LineWords } from "./words";

/** Kept where the Line draws the card again. */
type OnOutcome = (messageId: string, pid: string, o: AskProposalOutcome) => void;
/** A card's commit that took. */
type Committed = Extract<CommitResult, { ok: true }>;
/** What a card's plan hands it (AskPlan), or nothing of a card of no plan (AT_NO_STEP). */
interface CardStep {
  waits: string | null;
  note: string | null;
  cards: readonly AskProposal[] | undefined;
  held: boolean;
  ran: AskProposalOutcome | null;
  saw: (pid: string, o: AskProposalOutcome) => void;
  onBusy: (busy: boolean) => void;
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
  return A && messageId && /^[0-9a-f-]{36}$/.test(messageId) ? A.outcome(messageId, pid, o) : Promise.resolve(false);
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

// A search's card, read (contracts leads/search/search-card.ts, through the Line's LeadCards): what it finds as rows,
// the line under them, and where its people come from, folded, for a people search. A change is said to Ask; the press
// is the card's.
const AskSearchCard = ({ lead, t }: { lead: SearchCardView; t: LineWords }) => (
  <>
    <div className="ask-card-change">
      <AskSheet sheet={lead.sheet} />
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
const AT_NO_STEP: CardStep = {
  waits: null,
  note: null,
  cards: undefined,
  held: false,
  ran: null,
  saw: () => {},
  onBusy: () => {},
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
  const [state, setState] = useState<AskProposalOutcome["state"] | "idle">(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useState<AskProposalOutcome["undo"]>(p.outcome ? p.outcome.undo || null : null);
  // When the act happened: an undo is offered only while it is still true (contracts askUndoOpen).
  const [doneAt, setDoneAt] = useState(p.outcome ? p.outcome.atMs || 0 : 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // A step the group's press decided is drawn from the outcome that press recorded, once, as a reload would draw it.
  const [took, setTook] = useState<AskProposalOutcome | null>(null);
  const ran = step.ran;
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
    setState("dismissed");
    record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null });
  };
  const undo = async () => {
    if (held || !A) return;
    working(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: doneAt, undo: undoData });
    working(false);
    if (r.ok) {
      setState("undone");
      setReceipt(r.receipt);
      setUndoData(null);
      record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null });
    } else setErr(r.message);
  };
  const idle = state === "idle";
  // A search's card (Ruben, 23 Oct 2026): what it finds as rows, read, never edited here -- a change is said to Ask, which
  // makes the card again -- its line under them, and one press, for what the month has room for (contracts
  // leads/search/search-card.ts).
  const lead = idle ? searchCardView(p) : null;
  return (
    <div className={`ask-card ${state}`} data-testid="ask-card" data-kind={p.kind}>
      <AskCardHead p={p} t={t} />
      {lead ? <AskSearchCard lead={lead} t={t} /> : <AskCardChange p={p} t={t} idle={idle} />}
      {idle && step.note ? (
        <p className="ask-card-foot" data-testid="ask-step-note">
          {step.note}
        </p>
      ) : null}
      {idle ? (
        <AskCardActs
          p={p}
          t={t}
          busy={held}
          waits={step.waits}
          hideOpen={hideOpen || !!lead}
          press={lead ? lead.press : null}
          onApprove={() => approveWith(lead ? lead.commit : p)}
          onDismiss={dismiss}
          onNav={onNav}
        />
      ) : (
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
            setState("idle");
            setErr("");
          }}
        />
      )}
      {err && state === "done" ? <div className="ask-card-note">{err}</div> : null}
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
  const [seen, setSeen] = useState<Record<string, AskProposalOutcome>>({});
  const [ran, setRan] = useState<Record<string, AskProposalOutcome>>({});
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const now = cards.map((p) => (seen[p.id] ? { ...p, outcome: seen[p.id] } : p));
  const g = A.planGroupOf(now);
  const held = busy || Object.values(working).some(Boolean);
  const saw = (pid: string, o: AskProposalOutcome) => setSeen((prev) => ({ ...prev, [pid]: o }));
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
      setSeen((prev) => ({ ...prev, ...got }));
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
    <div className="ask-steps" data-testid="ask-plan">
      {g.left > 0 ? (
        <div className="ask-steps-press">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={press}
            disabled={held}
            data-testid="ask-plan-approve"
            {...gate(gateKey, "approve these steps")}
          >
            {busy ? t.working : t.approveSilent(g.left)}
          </button>
        </div>
      ) : null}
      {g.steps.map((s) => {
        const w = atStepWords(t, s);
        return (
          <div key={s.card.id} className="ask-step" data-testid="ask-step">
            <div className="ask-step-n">
              <span className="rec-hint">{w.head}</span>
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
                saw,
                onBusy: (b) => setWorking((prev) => ({ ...prev, [s.card.id]: b })),
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
