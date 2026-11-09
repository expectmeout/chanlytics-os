/**
 * A proposal the assistant made, as a card, and cards side by side, one open at a time; a plan of Ask's as one card is
 * plan-card.tsx's. The parts are card-parts.tsx's; what a card may do is decided by its contract (askCalls(): the card's verb and
 * its undo), and this file holds what became of it.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ASK_PUBLIC_HOLD_MS,
  askCardHasWords,
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
import { Button } from "../kit/button/button";
import { LinePress } from "../kit/line/line";
import { AskPostCard, usePostCard } from "./card-post";
import {
  AskCardActs,
  AskCardChange,
  AskCardHead,
  AskCardReceipt,
  AskRing,
  AskQuickChanges,
  AskSheet,
  type CardFold,
} from "./card-parts";
import { askCalls, settingsVersion } from "./shell";
import type { LineWords } from "./words";

/** Kept where the Line draws the card again. */
export type OnOutcome = (messageId: string, pid: string, o: AskProposalOutcome) => void;
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
export const atDone = (r: Committed, at: number): AskProposalOutcome => ({
  state: "done",
  receipt: r.receipt,
  atMs: at,
  undo: r.undo || null,
  made: r.made || null,
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
export const atRecord = (
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
/**
 * What a card's press does, and what became of it. A public reply goes on a clock in this tab (D24 of the answers canvas): a
 * review's answer has no way back once it posts, so its press starts fifteen seconds, its end posts it and Undo clears it. A
 * tab that closes first posts nothing. Where what stopped it is fixed is kept where the door knew (D37).
 */
const useCardPress = (
  p: AskProposal,
  use: {
    messageId?: string | null;
    t: LineWords;
    onNav: (to: string) => void;
    onOutcome?: OnOutcome;
    step: CardStep;
  },
) => {
  const { messageId, t, onNav, onOutcome, step } = use;
  const A = askCalls();
  const outcome = useCardOutcome(p, step.ran);
  const { state, setState, receipt, setReceipt, undoData, setUndoData, doneAt, setDoneAt, setErr } = outcome;
  const landing = useCardLanding(state);
  const { land } = landing;
  const [busy, setBusy] = useState(false);
  const [posting, setPosting] = useState<{ from: number; until: number } | null>(null);
  const [forward, setForward] = useState<{ to: string } | null>(null);
  const held = busy || step.held;
  const working = (b: boolean) => {
    setBusy(b);
    step.onBusy(b);
  };
  const record = (o: AskProposalOutcome, kept = false) => {
    step.saw(p.id, o);
    void atRecord({ A, messageId, onOutcome }, p.id, o, kept);
  };
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
  return { A, ...outcome, ...landing, held, posting, setPosting, forward, approveWith, dismiss, undo, onClock };
};

/** A public reply on its clock: its end posts it, and Undo clears it. */
const AskPosting = ({
  posting,
  t,
  landRef,
  onEnd,
  onUndo,
}: {
  posting: { from: number; until: number };
  t: LineWords;
  landRef: RefObject<HTMLDivElement | null>;
  onEnd: () => void;
  onUndo: () => void;
}) => (
  <div className="ask-told" role="status">
    <div className="ask-card-receipt ask-landing" tabIndex={-1} ref={landRef} data-testid="ask-card-posting">
      <AskRing from={posting.from} until={posting.until} onDone={onEnd} />
      <span className="ask-card-said">{t.posting}</span>
      <Button variant="quiet" size="sm" className="ask-card-undo" onClick={onUndo}>
        {t.undo}
      </Button>
    </div>
  </div>
);

/** Under what became of a card: why it was allowed to go alone (D33), and where what stopped it is fixed (D37). */
const AskCardAfter = ({
  p,
  state,
  err,
  forward,
  t,
  onNav,
}: {
  p: AskProposal;
  state: AskProposalOutcome["state"] | "idle";
  err: string;
  forward: { to: string } | null;
  t: LineWords;
  onNav: (to: string) => void;
}) => {
  const why = p.outcome?.why ?? null;
  return (
    <>
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
    </>
  );
};

type PostCard = NonNullable<ReturnType<typeof usePostCard>>;

/** What a press sends and says: a search's own, a post's own, or the card itself. */
const whatGoes = (p: AskProposal, lead: SearchCardView | null, post: PostCard | null) => {
  if (lead) return { press: lead.press, card: lead.commit };
  return post ? { press: post.press, card: post.card } : { press: null, card: p };
};

/** What the card shows of what it will do. */
const AskCardBody = ({
  p,
  lead,
  post,
  t,
  onNav,
  idle,
  alike,
  more,
}: {
  p: AskProposal;
  lead: SearchCardView | null;
  post: PostCard | null;
  t: LineWords;
  onNav: (to: string) => void;
  idle: boolean;
  alike: readonly string[];
  more: boolean;
}) => {
  if (lead) return <AskSearchCard lead={lead} t={t} alike={alike} />;
  if (post) return <AskPostCard p={p} card={post} t={t} onNav={onNav} />;
  return <AskCardChange p={p} t={t} idle={idle} alike={alike} more={more} />;
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
  const pressed = useCardPress(p, { messageId, t, onNav, onOutcome, step });
  const { A, state, setState, receipt, undoData, doneAt, err, setErr, land, receiptRef, approveRef, held } = pressed;
  const { posting, setPosting, forward, approveWith, dismiss, undo, onClock } = pressed;
  const [more, setMore] = useState(false);
  const post = usePostCard(p);
  const idle = state === "idle";
  // A search's card (Ruben, 23 Oct 2026): what it finds as rows, read, never edited here -- a change is said to Ask, which
  // makes the card again -- its line under them, and one press, for what the month has room for (contracts
  // leads/search/card.ts).
  const lead = idle ? searchCardView(p) : null;
  const goes = whatGoes(p, lead, post);
  const shut = idle && !!step.fold && !step.fold.open;
  const decided = !idle && !!step.fold;
  // A record, once kept, is one line: no card (the Keep shape, D14 of the answers canvas).
  const quiet = state === "done" && askTraitsOf(p.kind).shape === "keep";
  return (
    <div
      className={`ask-card ${state}${shut ? " ask-shut" : ""}${quiet ? " ask-quiet" : ""}`}
      data-testid="ask-card"
      data-kind={p.kind}
    >
      {quiet ? null : <AskCardHead p={post ? post.card : p} fold={idle ? step.fold : null} />}
      {shut || decided || quiet ? null : (
        <AskCardBody p={p} lead={lead} post={post} t={t} onNav={onNav} idle={idle} alike={step.alike} more={more} />
      )}
      {idle && step.note ? (
        <p className="ask-card-foot" data-testid="ask-step-note">
          {step.note}
        </p>
      ) : null}
      {idle && !shut && onQuick && askCardHasWords(p.kind) ? <AskQuickChanges t={t} onFollow={onQuick} /> : null}
      {posting ? (
        <AskPosting
          posting={posting}
          t={t}
          landRef={receiptRef}
          onEnd={() => {
            setPosting(null);
            void approveWith(p);
          }}
          onUndo={() => {
            setPosting(null);
            land.current = "approve";
          }}
        />
      ) : null}
      {idle && !shut && !posting ? (
        <AskCardActs
          p={p}
          t={t}
          busy={held}
          waits={step.waits}
          hideOpen={hideOpen || !!lead || !!post}
          press={goes.press}
          onApprove={() => (askTraitsOf(p.kind).reach === "public" ? onClock() : approveWith(goes.card))}
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
      <AskCardAfter p={p} state={state} err={err} forward={forward} t={t} onNav={onNav} />
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
