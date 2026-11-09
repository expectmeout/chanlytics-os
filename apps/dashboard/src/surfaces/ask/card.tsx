/**
 * A proposal the assistant made, as a card, and the cards of a turn as groups: a plan of Ask's as one card, or cards side by
 * side, one open at a time. The parts are card-parts.tsx's; what a card may do is decided by its contract (askCalls(): the card's
 * verb, its undo, the plan's group), and this file holds what became of it.
 */
import { useEffect, useRef, useState } from "react";
import {
  ASK_PUBLIC_HOLD_MS,
  askCardHasWords,
  askPressCount,
  askPressOf,
  askTraitsOf,
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
import { Icon } from "../kit/icon/icon";
import { LinePress } from "../kit/line/line";
import { AskPostCard, usePostCard } from "./card-post";
import {
  AskCardActs,
  AskCardChange,
  AskCardHead,
  AskCardReceipt,
  AskNotNow,
  AskRing,
  AskQuickChanges,
  AskSheet,
  type CardFold,
} from "./card-parts";
import { askCalls, canDo, gate, gateTitle, settingsVersion } from "./shell";
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
const atFailed = (message: string, at: number, moved?: boolean): AskProposalOutcome => ({
  state: "failed",
  receipt: message,
  atMs: at,
  undo: null,
  ...(moved ? { moved: true } : {}),
});
// Kept where the Line draws the card again (`onOutcome`) and on the turn (the outcome route); the route's answer is
// handed back, so a press of several cards records them one after another and never two over one turn at once.
const atRecord = (
  { A, messageId, onOutcome }: { A: AskApi | undefined; messageId?: string | null; onOutcome?: OnOutcome },
  pid: string,
  o: AskProposalOutcome,
  kept = false,
): Promise<boolean> => {
  if (onOutcome && messageId) onOutcome(messageId, pid, o);
  // The act door already kept it on the turn; only what it did not see is written from here.
  if (kept) return Promise.resolve(true);
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
  onQuick,
  step = AT_NO_STEP,
}: {
  p: AskProposal;
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  hideOpen?: boolean;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  onQuick?: (q: string) => unknown;
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
  const record = (o: AskProposalOutcome, kept = false) => {
    step.saw(p.id, o);
    void atRecord({ A, messageId, onOutcome }, p.id, o, kept);
  };
  // A public reply goes on a clock in this tab (D24 of the answers canvas): a review's answer has no way back once it posts,
  // so its press starts fifteen seconds, its end posts it and Undo clears it. A tab that closes first posts nothing.
  const [posting, setPosting] = useState<{ from: number; until: number } | null>(null);
  // Where what stopped it is fixed, where the door knew (D37 of the answers canvas).
  const [forward, setForward] = useState<{ to: string } | null>(null);
  const approveWith = async (proposal: AskProposal) => {
    if (held || !A) return;
    working(true);
    setErr("");
    const r = await A.commit(proposal, step.cards, messageId);
    working(false);
    land.current = "receipt";
    if (r.ok) {
      const at = Date.now();
      setState("done");
      setReceipt(r.receipt);
      setUndoData(r.undo || null);
      setDoneAt(at);
      record(atDone(r, at), r.kept === true);
      // A search approved is opened (spec F4), and a search answered likewise (G4): the receipt's "Leads shows it" is
      // kept true by going where the contract says the card opens.
      if ((p.kind === "lead_search" || p.kind === "people_search") && onNav && A && A.cardOpenRoute) {
        const to = A.cardOpenRoute({ ...p, outcome: { state: "done", receipt: r.receipt, atMs: at, undo: r.undo } });
        if (to) onNav(to);
      }
    } else {
      setState("failed");
      setErr(r.message);
      setForward(r.forward ?? null);
      record(atFailed(r.message, Date.now(), r.moved), r.kept === true);
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
    const r = await A.undo(p, { state: "done", receipt, atMs: doneAt, undo: undoData }, messageId);
    working(false);
    if (r.ok) {
      land.current = "receipt";
      setState("undone");
      setReceipt(r.receipt);
      setUndoData(null);
      record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null }, r.kept === true);
    } else setErr(r.message);
  };
  const onClock = () => {
    if (held) return;
    const from = Date.now();
    land.current = "receipt";
    setPosting({ from, until: from + ASK_PUBLIC_HOLD_MS });
  };
  const idle = state === "idle";
  // A search's card (Ruben, 23 Oct 2026): what it finds as rows, read, never edited here -- a change is said to Ask, which
  // makes the card again -- its line under them, and one press, for what the month has room for (contracts
  // leads/search/card.ts).
  const lead = idle ? searchCardView(p) : null;
  const shut = idle && !!step.fold && !step.fold.open;
  const decided = !idle && !!step.fold;
  // A record, once kept, is one line: no card (the Keep shape, D14 of the answers canvas).
  const quiet = state === "done" && askTraitsOf(p.kind).shape === "keep";
  const why = p.outcome?.why ?? null;
  return (
    <div
      className={`ask-card ${state}${shut ? " ask-shut" : ""}${quiet ? " ask-quiet" : ""}`}
      data-testid="ask-card"
      data-kind={p.kind}
    >
      {quiet ? null : <AskCardHead p={post ? post.card : p} fold={idle ? step.fold : null} />}
      {shut || decided || quiet ? null : lead ? (
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
      {idle && !shut && onQuick && askCardHasWords(p.kind) ? <AskQuickChanges t={t} onFollow={onQuick} /> : null}
      {posting ? (
        <div className="ask-told" role="status">
          <div className="ask-card-receipt ask-landing" tabIndex={-1} ref={receiptRef} data-testid="ask-card-posting">
            <AskRing
              from={posting.from}
              until={posting.until}
              onDone={() => {
                setPosting(null);
                void approveWith(p);
              }}
            />
            <span className="ask-card-said">{t.posting}</span>
            <Button
              variant="quiet"
              size="sm"
              className="ask-card-undo"
              onClick={() => {
                setPosting(null);
                land.current = "approve";
              }}
            >
              {t.undo}
            </Button>
          </div>
        </div>
      ) : null}
      {idle && !shut && !posting ? (
        <AskCardActs
          p={p}
          t={t}
          busy={held}
          waits={step.waits}
          hideOpen={hideOpen || !!lead || !!post}
          press={lead ? lead.press : post ? post.press : null}
          onApprove={() =>
            askTraitsOf(p.kind).reach === "public" ? onClock() : approveWith(lead ? lead.commit : post ? post.card : p)
          }
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
      {why && state === "done" ? (
        <p className="ask-card-foot" data-testid="ask-card-why">
          {t.whyAlone(why.reason, why.row)}{" "}
          <LinePress kind="words" onClick={() => onNav("admin/autonomy")}>
            {t.whyChange}
          </LinePress>
        </p>
      ) : null}
      {forward && state === "failed" ? (
        <div className="ask-card-actions">
          <Button variant="quiet" size="sm" onClick={() => onNav(forward.to)} data-testid="ask-card-forward">
            {t.fixIt}
          </Button>
        </div>
      ) : null}
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
  onQuick,
  cardOpen,
}: {
  cards: AskProposal[];
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  onQuick?: (q: string) => unknown;
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
      onQuick={onQuick}
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

/** A plan's cards as they stand, what its press and its Undo left them, each kept as a card's own press would keep it. */
const usePlanCards = (
  cards: AskProposal[],
  record: (pid: string, o: AskProposalOutcome, kept: boolean) => Promise<boolean>,
) => {
  const [seen, setSeen] = useState<Record<string, AskProposalOutcome>>({});
  const now = cards.map((p) => (seen[p.id] ? { ...p, outcome: seen[p.id] } : p));
  return {
    now,
    /** Shown at once, and kept one after another: the store writes a turn whole, so two at once would lose one. */
    keep: async (got: Record<string, AskProposalOutcome>, kept = false) => {
      setSeen((prev) => ({ ...prev, ...got }));
      for (const [pid, outcome] of Object.entries(got)) await record(pid, outcome, kept);
    },
  };
};

/** What a plan's one card says after a press, read from what became of its steps. */
function planSaid(now: readonly AskProposal[], t: LineWords, inReview: boolean): { line: string; ok: boolean } | null {
  const failed = now.find((p) => p.outcome?.state === "failed");
  if (failed?.outcome) return { line: failed.outcome.receipt, ok: false };
  const doneSends = now.filter((p) => !p.plan?.silent && p.outcome?.state === "done");
  const send = doneSends.at(-1)?.outcome;
  if (send) return { line: send.paused ? t.planPaused : send.receipt, ok: true };
  // Its send taken back is what matters: a setting somebody saved over since stays as it is, and nothing goes out either way.
  if (now.some((p) => p.outcome?.state === "undone")) return { line: t.planUndone, ok: true };
  if (inReview) return { line: t.planFiled, ok: true };
  if (now.every((p) => p.outcome?.state === "done")) return { line: t.planDone, ok: true };
  return null;
}

/**
 * A plan of Ask's as one card (D2 of the answers canvas, which reverses the marketing manager's spec §5.4 on purpose): what it
 * is and how, the message as a person reads it, what holds it, how it runs folded away, and one press that names what it
 * does, the send included (contracts planPressOf says which steps it takes; a plan with a later send presses again for it).
 * Under it, once pressed, what became of it and one way back: Undo while its steps can still be taken back (commit.ts
 * undoPlan), Pause and Resume on a send that keeps running. A stop says why and nothing went out; the same press carries on
 * from there, since a step made is never made twice (the step's own key, commit.ts).
 */
export const AskPlan = ({
  cards,
  messageId,
  t,
  onNav,
  onOutcome,
  onQuick,
}: {
  cards: AskProposal[];
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  onQuick?: (q: string) => unknown;
  cardOpen?: Record<string, boolean>;
}) => {
  const A = askCalls() as AskApi; // a plan is drawn only from a turn the bridge read
  const { now, keep } = usePlanCards(cards, (pid, o, kept) => atRecord({ A, messageId, onOutcome }, pid, o, kept));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forward, setForward] = useState<{ to: string } | null>(null);
  const landRef = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const ordered = [...now].sort((a, b) => (a.plan?.step ?? 0) - (b.plan?.step ?? 0));
  const first = ordered.at(0);
  const head = ordered.find((p) => p.plan?.head)?.plan?.head ?? null;
  const press = A.planPressOf(now);
  const inReview = A.planInReview(now) && now.some((p) => p.outcome?.state === "done");
  const said = planSaid(now, t, inReview);
  const pressedOnce = now.some((p) => p.outcome);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    landRef.current?.querySelector<HTMLElement>(".ask-card-receipt")?.focus({ preventScroll: true });
  });
  const sendCard = press.send === null ? null : (now.find((p) => p.plan?.step === press.send) ?? null);
  const holds = [...new Set(now.filter((p) => !p.outcome).flatMap((p) => p.sheet?.holds ?? []))];
  const says = head?.says ?? [];
  const word = (() => {
    if (press.review !== null) return t.pressReview;
    if (head?.press === "offer" && sendCard) return t.pressOffer;
    if (sendCard) return t.press(askPressOf(sendCard), askPressCount(sendCard));
    return t.pressPlan;
  })();
  const gates = PROPOSAL_GATE;
  const stepCards = press.steps.flatMap((n) => now.find((p) => p.plan?.step === n) ?? []);
  const gateKey = stepCards.map((p) => gates[p.kind] || "approve").find((k) => !canDo(k)) ?? "approve";
  const version = settingsVersion();
  // Settings not read in this tab are read again by the undo itself, which refuses if anyone saved since (commit.ts).
  const undoable = (p: AskProposal, o: AskProposalOutcome) =>
    !!p.undo &&
    !!o.undo &&
    A.undoOpen(
      p.kind,
      o.undo,
      o.atMs || 0,
      Date.now(),
      version ?? (o.undo.version_after as number | undefined) ?? null,
    );
  const canUndo = now.some((p) => p.outcome?.state === "done" && undoable(p, p.outcome));
  const running = now.find((p) => p.kind === "playbook" && p.outcome?.state === "done" && p.outcome.undo?.playbook_id);
  const goPress = async () => {
    if (busy || !A.commitPlan) return;
    setBusy(true);
    setErr("");
    try {
      const run = await A.commitPlan(now, messageId);
      const at = Date.now();
      const got: Record<string, AskProposalOutcome> = {};
      let kept = false;
      for (const { step, result } of run.results) {
        const p = now.find((c) => c.plan && c.plan.step === step);
        if (p) got[p.id] = result.ok ? atDone(result, at) : atFailed(result.message, at);
        kept = kept || result.kept === true;
        if (!result.ok && result.forward) setForward(result.forward);
      }
      pressed.current = true;
      await keep(got, kept);
    } finally {
      setBusy(false);
    }
  };
  const goUndo = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const run = await A.undoPlan(now, undoable, messageId);
      const at = Date.now();
      const got: Record<string, AskProposalOutcome> = {};
      let kept = false;
      for (const { step, result } of run.results) {
        const p = now.find((c) => c.plan && c.plan.step === step);
        if (p && result.ok) got[p.id] = { state: "undone", receipt: result.receipt, atMs: at, undo: null };
        else if (!result.ok) setErr(result.message);
        kept = kept || (result.ok && result.kept === true);
      }
      pressed.current = true;
      await keep(got, kept);
    } finally {
      setBusy(false);
    }
  };
  const goPause = async (paused: boolean) => {
    if (busy || !running?.outcome) return;
    setBusy(true);
    setErr("");
    try {
      const r = await A.pauseSend(running, paused);
      if (r.ok) await keep({ [running.id]: { ...running.outcome, paused } });
      else setErr(r.message);
    } finally {
      setBusy(false);
    }
  };
  const dismiss = () =>
    void keep(
      Object.fromEntries(
        now
          .filter((p) => !p.outcome)
          .map((p): [string, AskProposalOutcome] => [
            p.id,
            { state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null },
          ]),
      ),
    );
  const openTo = running ? A.cardOpenRoute(running) : null;
  const lines = ordered.map((p) => ({
    id: p.id,
    line: p.plan?.does || p.line || p.title,
    done: p.outcome?.state === "done",
  }));
  const dismissed = now.every((p) => p.outcome?.state === "dismissed");
  return (
    <div className={`ask-card ask-plan${dismissed ? " dismissed" : ""}`} ref={landRef} data-testid="ask-plan">
      <div className="ask-card-head">
        <span className="ask-card-name">
          <span className="ask-card-title">{head?.title || first?.title}</span>
          {head?.sub ? <span className="ask-card-sub">{head.sub}</span> : null}
        </span>
      </div>
      {says.length && !pressedOnce ? (
        <div className="ask-card-change" data-testid="ask-plan-says">
          <div className="ask-card-said">
            {says.map((v) => (
              <p key={v.channel} className="ask-card-summary">
                {says.length > 1 && v.label ? (
                  <>
                    <span className="ask-card-channel">{v.label}</span>
                    {"\n"}
                  </>
                ) : null}
                {v.words}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {holds.map((h) => (
        <p key={h} className="ask-spec-hold">
          {h}
        </p>
      ))}
      {head?.hear && !pressedOnce ? (
        <p className="ask-card-foot" data-testid="ask-plan-hear">
          {head.hear}
        </p>
      ) : null}
      {lines.length > 1 ? (
        <details className="ask-card-how" data-testid="ask-plan-how">
          <summary>{t.howItRuns}</summary>
          <ul>
            {lines.map((l) => (
              <li key={l.id}>
                {l.done ? <Icon name="check" size={11} className="ok" /> : null}
                {l.line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {press.steps.length && !pressedOnce && onQuick && says.length ? (
        <AskQuickChanges t={t} onFollow={onQuick} />
      ) : null}
      {press.review !== null ? (
        <p className="ask-card-foot" data-testid="ask-step-note">
          {t.reviewFirst}
        </p>
      ) : null}
      {press.steps.length ? (
        <div className="ask-card-actions">
          {canDo(gateKey) ? (
            <Button
              variant="primary"
              size="sm"
              className="ask-press"
              onClick={goPress}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              data-testid="ask-plan-approve"
              {...gate(gateKey, "press this card")}
            >
              {busy ? t.working : word}
            </Button>
          ) : (
            <p className="ask-card-foot" data-testid="ask-card-cant">
              {gateTitle(gateKey, head?.title || first?.title)}
            </p>
          )}
          {first?.origin?.by === "idea" && !pressedOnce ? <AskNotNow t={t} busy={busy} onDismiss={dismiss} /> : null}
        </div>
      ) : null}
      <div className="ask-told" role="status">
        {said ? (
          <div className="ask-card-receipt ask-landing" tabIndex={-1} data-testid="ask-plan-receipt">
            <Icon name={said.ok ? "check" : "alert"} size={11} className={said.ok ? "ok" : ""} />
            <span className="ask-card-said">{said.line}</span>
            {canUndo ? (
              <Button
                variant="quiet"
                size="sm"
                className="ask-card-undo"
                onClick={goUndo}
                aria-disabled={busy || undefined}
                data-testid="ask-plan-undo"
              >
                {t.undo}
              </Button>
            ) : null}
            {!canUndo && running?.outcome && running.outcome.state === "done" ? (
              <Button
                variant="quiet"
                size="sm"
                className="ask-card-undo"
                onClick={() => goPause(!running.outcome?.paused)}
                aria-disabled={busy || undefined}
                data-testid="ask-plan-pause"
              >
                {running.outcome.paused ? t.resume : t.pause}
              </Button>
            ) : null}
            {openTo && !canUndo ? (
              <Button variant="quiet" size="sm" onClick={() => onNav(openTo)}>
                {t.openIt}
              </Button>
            ) : null}
            {forward && !said.ok ? (
              <Button variant="quiet" size="sm" onClick={() => onNav(forward.to)} data-testid="ask-card-forward">
                {t.fixIt}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {err ? <div className="ask-card-note">{err}</div> : null}
    </div>
  );
};
