/**
 * A proposal the assistant made, as a card, and cards side by side, one open at a time; a plan of Ask's as one card is
 * plan-card.tsx's. The parts are card-parts.tsx's; what a card may do is decided by its contract (askCalls(): the card's verb and
 * its undo), and this file holds what became of it.
 */
import { useState, type RefObject } from "react";
import {
  askCardHasWords,
  askTraitsOf,
  holdsAlike,
  openCardOf,
  searchCardView,
  type AskProposal,
  type AskProposalOutcome,
  type SearchCardView,
} from "@chanlytics/contracts";
import type { AskApi } from "@/bridge/ask";
import { Button } from "../kit/button/button";
import { LinePress } from "../kit/line/line";
import { AskPieceCard, usePieceCard } from "./card-piece";
import { AskPostCard, usePostCard } from "./card-post";
import {
  mayPressCard,
  AskCardActs,
  AskCardChange,
  AskCardHead,
  AskCardReceipt,
  AskRing,
  AskQuickChanges,
  AskSheet,
  type CardFold,
} from "./card-parts";
import { AT_NO_STEP, useCardPress, type CardStep, type OnOutcome } from "./card-press";
import { settingsVersion } from "./shell";
import type { LineWords } from "./words";

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
type PieceCard = NonNullable<ReturnType<typeof usePieceCard>>;

/**
 * What a press sends and says: a search's own, a post's own, a video's own, or the card itself. A card that draws a body of
 * its own (`own`) offers no Open beside its press: there is nothing to open before it.
 */
const whatGoes = (p: AskProposal, lead: SearchCardView | null, post: PostCard | null, piece: PieceCard | null) => {
  if (lead) return { press: lead.press, card: lead.commit, own: true };
  if (piece) return { press: piece.press, card: p, own: true };
  return post ? { press: post.press, card: post.card, own: true } : { press: null, card: p, own: false };
};

/**
 * How a card stands, from what became of it: still to be decided (`idle`), folded to its head in a group (`shut`), a record
 * kept as one line (`quiet`, the Keep shape, D14 of the answers canvas), or following the video it made (`follows`: a
 * video's card says where its video stands itself, once it has read it, in the receipt's place). Its body is drawn unless it
 * is folded or a kept line; a card decided in a group keeps its body only while it follows its video.
 */
const cardStandsAs = (
  state: AskProposalOutcome["state"] | "idle",
  proposal: AskProposal,
  fold: CardFold | null,
  piece: PieceCard | null,
) => {
  const idle = state === "idle";
  const shut = idle && !!fold && !fold.open;
  const quiet = state === "done" && askTraitsOf(proposal.kind).shape === "keep";
  const follows = state === "done" && !!piece?.stands;
  const decided = !idle && !!fold;
  return { idle, shut, quiet, follows, body: !(shut || quiet || (decided && !follows)) };
};

/** What the card shows of what it will do; a video's card, of where its video stands once pressed. */
const AskCardBody = ({
  p,
  lead,
  post,
  piece,
  t,
  onNav,
  idle,
  alike,
  more,
  busy,
  onAgain,
}: {
  p: AskProposal;
  lead: SearchCardView | null;
  post: PostCard | null;
  piece: PieceCard | null;
  t: LineWords;
  onNav: (to: string) => void;
  idle: boolean;
  alike: readonly string[];
  more: boolean;
  busy: boolean;
  /** The card's own press, again: what a video that was not made is tried anew by. Null where this person may not press. */
  onAgain: (() => void) | null;
}) => {
  if (lead) return <AskSearchCard lead={lead} t={t} alike={alike} />;
  if (post) return <AskPostCard p={p} card={post} t={t} onNav={onNav} />;
  if (piece) return <AskPieceCard p={p} card={piece} t={t} busy={busy} onNav={onNav} onRetry={onAgain} />;
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
  const piece = usePieceCard(p, t, pressed.made, pressed.madeAt);
  const { idle, shut, quiet, follows, body } = cardStandsAs(state, p, step.fold, piece);
  // A search's card (Ruben, 23 Oct 2026): what it finds as rows, read, never edited here -- a change is said to Ask, which
  // makes the card again -- its line under them, and one press, for what the month has room for (contracts
  // leads/search/card.ts).
  const lead = idle ? searchCardView(p) : null;
  const goes = whatGoes(p, lead, post, piece);
  return (
    <div
      className={`ask-card ${state}${shut ? " ask-shut" : ""}${quiet ? " ask-quiet" : ""}`}
      data-testid="ask-card"
      data-kind={p.kind}
    >
      {quiet ? null : <AskCardHead p={post ? post.card : p} fold={idle ? step.fold : null} />}
      {body ? (
        <AskCardBody
          p={p}
          lead={lead}
          post={post}
          piece={piece}
          t={t}
          onNav={onNav}
          idle={idle}
          alike={step.alike}
          more={more}
          busy={held}
          onAgain={mayPressCard(p) ? () => void approveWith(goes.card) : null}
        />
      ) : null}
      {idle && step.note ? (
        <p className="ask-card-foot" data-testid="ask-step-note">
          {step.note}
        </p>
      ) : null}
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
          hideOpen={hideOpen || goes.own}
          press={goes.press}
          onApprove={() => (askTraitsOf(p.kind).reach === "public" ? onClock() : approveWith(goes.card))}
          onDismiss={dismiss}
          onNav={onNav}
          more={more}
          onMore={() => setMore((m) => !m)}
          approveRef={approveRef}
        />
      ) : null}
      {/* The quick changes stand under the press, never between it and the facts it turns on (decision 0088: the first
          press is on a phone's first screen, straight after what it depends on). They stood over it from 9 November 2026
          (#2211), a row of 30 px that took the 25 the first screen had to spare: the nightly found the press 5 px under
          the field. Under the press they sit beside the field, which takes any other change. */}
      {idle && !shut && onQuick && askCardHasWords(p.kind) ? <AskQuickChanges t={t} onFollow={onQuick} /> : null}
      {/* Always drawn, so what fills it is announced; empty, it takes no room (ask.css). */}
      <div className="ask-told" role="status">
        {idle || follows ? null : (
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
